#!/usr/bin/env python3
"""記帳道場 v2 — 場面絵（マンガ風1コマ）を Codex 内蔵の image2（gpt-image-2）で量産する。

ChatGPT サブスク枠（codex login = ChatGPT）だけで動かす。OPENAI_API_KEY / .env は使わない。

使い方：
  python3 scripts/gen_images.py --from-curriculum --only c1          # 1枚だけ試す
  python3 scripts/gen_images.py --from-curriculum --parallel 3 --skip-existing   # 37枚
  python3 scripts/gen_images.py --input prompts.json                 # [{"id":"c1","prompt":"…"}]
  python3 scripts/gen_images.py --from-curriculum --dry-run          # プロンプトを見るだけ

出力：
  img/_raw/<id>.png   image2 の原寸（1536×1024）。Git に入れない
  img/<id>.jpg        横 960px・JPEG 品質 80（Web 配信用）
  img/_log.jsonl      1行1件 {id, ok, model, seconds, error, ...}
  _stock/<id>/        codex exec の作業ディレクトリ（prompt.txt / last.txt / codex.log）
"""
from __future__ import annotations

import argparse
import concurrent.futures as cf
import datetime as dt
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CURRICULUM = ROOT / "data" / "curriculum.js"
IMG_DIR = ROOT / "img"
RAW_DIR = IMG_DIR / "_raw"
STOCK_DIR = ROOT / "_stock"
LOG_FILE = IMG_DIR / "_log.jsonl"
GEN_DIR = Path.home() / ".codex" / "generated_images"

DEFAULT_MODEL = "gpt-6-astra"   # codex exec を動かすエージェントのモデル（画像は image2 固定）
IMAGE_MODEL = "gpt-image-2"
WIDTH, HEIGHT = 1536, 1024      # image2 の横長 3:2
JPG_WIDTH = 960
JPG_QUALITY = 80

# ---------------------------------------------------------------- プロンプト

CHARACTERS = (
    "登場人物の見た目（固有名は絵に出さない）：\n"
    "- 経理担当のミナ：30代の女性。黒縁の眼鏡、黒髪のポニーテール、薄い黄色のカーディガンに白いシャツ。真面目で前向きな表情\n"
    "- 社長：50代の男性。恰幅がよく、ワイシャツにネクタイ。人のよい笑顔\n"
    "- 取引先の担当：若い男性。作業着\n"
    "- 税理士：60代の女性。スーツ\n"
    "- 個人のデザイナー：若い女性。ラフな服\n"
)

RULES = (
    "厳守：\n"
    "- 絵の中に文字・数字・記号・ロゴ・吹き出し・擬音・看板の文字を一切入れない。書類やモニターの中身は無地か意味のない線で表す\n"
    "- 場面説明にある『』内のセリフや『資産』『負債』などのラベルは、人物の表情・身ぶり・無地の箱やカードで表現し、文字としては描かない\n"
    "- マンガの1コマ。1枚絵で、コマ割りにしない。縁取りの枠線は不要\n"
    f"- 横長 3:2（{WIDTH}×{HEIGHT}px）で生成する。縦長や正方形にしない\n"
    "- 太めの線画に淡い色（白・薄い青・薄い黄）を少しだけ。スクリーントーン風の影は可。写実やCGにしない\n"
    "- 背景はシンプルな事務所。余計な小物は入れない\n"
)


def build_prompt(item_id: str, scene: str, style: str, dest: Path) -> str:
    return (
        "次の指定で画像を1枚だけ生成してください。\n\n"
        "【画像生成の経路】必ず Codex 内蔵の画像生成 image2（gpt-image-2 / $imagegen）を使う。"
        "他のモデル・OpenAI API・外部サービス・curl・Python の HTTP 呼び出しは禁止。"
        "API キーは絶対に読まない・使わない。\n\n"
        f"【共通スタイル】{style}\n\n"
        f"{CHARACTERS}\n"
        f"{RULES}\n"
        f"【この1コマの場面】{scene}\n\n"
        "【生成後にやること】\n"
        f"1. 生成されたファイルを {dest} にコピーする（ディレクトリは作成済み。上書き可）\n"
        "2. 結果の最後の行に、次の1行だけを出力する（ほかの文は前の行に書く）：\n"
        f"SAVED: {dest}  MODEL: {IMAGE_MODEL}\n"
        "3. image2 以外で生成した場合や生成できなかった場合は、最後の行を "
        "`FAILED: <理由>` にする（MODEL 行を偽らない）\n"
    )


# ---------------------------------------------------------------- 入力

def load_from_curriculum() -> tuple[str, list[dict]]:
    js = (
        "global.window={};"
        f"require({json.dumps(str(CURRICULUM))});"
        "const c=window.CURRICULUM;const out=[];"
        "out.push({id:c.diagnostic.img||c.diagnostic.id,scene:c.diagnostic.scene,kind:'diag',name:c.diagnostic.name});"
        "for(const ch of c.chapters){out.push({id:ch.img||ch.id,scene:ch.scene,kind:'chapter',name:ch.name});"
        "for(const s of ch.stages){out.push({id:s.img||s.id,scene:s.scene,kind:'stage',name:s.name});}}"
        "console.log(JSON.stringify({style:c.imageStyle,items:out}));"
    )
    res = subprocess.run(["node", "-e", js], capture_output=True, text=True, check=True)
    data = json.loads(res.stdout)
    return data["style"], data["items"]


def load_from_json(path: Path) -> list[dict]:
    items = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(items, list):
        raise SystemExit("入力 JSON は配列 [{id, prompt} …] の形にしてください")
    for it in items:
        if "id" not in it or ("prompt" not in it and "scene" not in it):
            raise SystemExit(f"id と prompt（または scene）が必要です: {it}")
    return items


# ---------------------------------------------------------------- 実行

_print_lock = threading.Lock()
_log_lock = threading.Lock()


def say(msg: str) -> None:
    with _print_lock:
        print(msg, flush=True)


def append_log(rec: dict) -> None:
    IMG_DIR.mkdir(parents=True, exist_ok=True)
    with _log_lock, LOG_FILE.open("a", encoding="utf-8") as f:
        f.write(json.dumps(rec, ensure_ascii=False) + "\n")


def codex_env() -> dict:
    """サブスク枠で動かすため、API キー系の環境変数を外した環境を渡す。"""
    env = {k: v for k, v in os.environ.items() if not k.startswith("OPENAI_")}
    return env


def run_codex(item_id: str, prompt: str, model: str, timeout: int, attempt: int) -> tuple[bool, str, str]:
    """1件を codex exec で生成。戻り (ok, model_seen, error)。"""
    work = STOCK_DIR / item_id
    work.mkdir(parents=True, exist_ok=True)
    prompt_file = work / "prompt.txt"
    last_file = work / f"last_{attempt}.txt"
    log_file = work / f"codex_{attempt}.log"
    prompt_file.write_text(prompt, encoding="utf-8")
    dest = RAW_DIR / f"{item_id}.png"
    if dest.exists():
        dest.unlink()

    cmd = [
        "codex", "exec", "-m", model, "-s", "workspace-write", "--skip-git-repo-check",
        "-C", str(work),
        "--add-dir", str(GEN_DIR),
        "--add-dir", str(RAW_DIR),
        "-o", str(last_file),
        "-",
    ]
    try:
        with prompt_file.open("rb") as pin, log_file.open("wb") as lout:
            subprocess.run(cmd, stdin=pin, stdout=lout, stderr=subprocess.STDOUT,
                           env=codex_env(), timeout=timeout, check=False)
    except subprocess.TimeoutExpired:
        return False, "", f"timeout {timeout}s"
    except FileNotFoundError:
        return False, "", "codex コマンドが見つかりません"

    last = last_file.read_text(encoding="utf-8", errors="replace") if last_file.exists() else ""
    m = re.search(r"MODEL:\s*([\w.\-]+)", last)
    model_seen = m.group(1) if m else ""
    if not last.strip():
        return False, model_seen, "codex の最終メッセージが空（codex.log を確認）"
    if model_seen != IMAGE_MODEL:
        tail = last.strip().splitlines()[-1][:160] if last.strip() else ""
        return False, model_seen, f"MODEL が {IMAGE_MODEL} ではない: {tail}"
    if not dest.exists():
        # SAVED 行のパスが別名だった場合だけ救済（最後の手段。generated_images は漁らない）
        s = re.search(r"SAVED:\s*(\S+\.png)", last)
        if s and Path(s.group(1)).exists():
            shutil.copy2(s.group(1), dest)
        else:
            return False, model_seen, f"{dest} が存在しない"
    return True, model_seen, ""


def image_size(path: Path) -> tuple[int, int]:
    res = subprocess.run(["sips", "-g", "pixelWidth", "-g", "pixelHeight", str(path)],
                         capture_output=True, text=True)
    w = re.search(r"pixelWidth:\s*(\d+)", res.stdout)
    h = re.search(r"pixelHeight:\s*(\d+)", res.stdout)
    return (int(w.group(1)) if w else 0, int(h.group(1)) if h else 0)


def to_jpg(src: Path, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run([
        "sips", "-s", "format", "jpeg", "-s", "formatOptions", str(JPG_QUALITY),
        "--resampleWidth", str(JPG_WIDTH), str(src), "--out", str(dst),
    ], check=True, capture_output=True)


def process(idx: int, total: int, item: dict, style: str, args) -> dict:
    item_id = item["id"]
    dest_raw = RAW_DIR / f"{item_id}.png"
    dest_jpg = IMG_DIR / f"{item_id}.jpg"
    prompt = item.get("prompt") or build_prompt(item_id, item["scene"], style, dest_raw)
    t0 = time.time()
    ok, model_seen, err = False, "", ""
    attempts = 0
    for attempt in (1, 2):
        attempts = attempt
        ok, model_seen, err = run_codex(item_id, prompt, args.model, args.timeout, attempt)
        if ok:
            break
        say(f"{idx}/{total} {item_id} retry ({err})")
    w = h = 0
    if ok:
        w, h = image_size(dest_raw)
        if w < h:
            err = f"縦長で生成された ({w}x{h})"
        try:
            to_jpg(dest_raw, dest_jpg)
        except subprocess.CalledProcessError as e:
            ok, err = False, f"sips 失敗: {e.stderr.decode(errors='replace')[:200]}"
    secs = round(time.time() - t0, 1)
    rec = {
        "id": item_id, "ok": ok, "model": model_seen, "seconds": secs, "error": err,
        "attempts": attempts, "raw_size": f"{w}x{h}" if w else "",
        "at": dt.datetime.now().isoformat(timespec="seconds"),
    }
    append_log(rec)
    status = "OK" if ok else "FAIL"
    extra = f" ({err})" if err else ""
    say(f"{idx}/{total} {item_id} {status} {secs:.0f}s{extra}")
    return rec


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--from-curriculum", action="store_true", help="data/curriculum.js から 37 件を組む")
    src.add_argument("--input", type=Path, help='JSON [{"id":"c1","prompt":"…"} …]（prompt の代わりに scene でも可）')
    ap.add_argument("--only", help="id をカンマ区切りで絞る（例: c1,s1-1）")
    ap.add_argument("--skip-existing", action="store_true", help="img/<id>.jpg があれば飛ばす")
    ap.add_argument("--parallel", type=int, default=3, help="同時に走らせる codex exec の数（既定 3）")
    ap.add_argument("--model", default=DEFAULT_MODEL, help=f"codex のエージェントモデル（既定 {DEFAULT_MODEL}）")
    ap.add_argument("--timeout", type=int, default=600, help="1回の codex exec の上限秒（既定 600）")
    ap.add_argument("--dry-run", action="store_true", help="プロンプトを表示して終わる")
    args = ap.parse_args()

    if args.from_curriculum:
        style, items = load_from_curriculum()
    else:
        style, items = "", load_from_json(args.input)
        for it in items:
            if "prompt" not in it:
                it["prompt"] = build_prompt(it["id"], it["scene"], it.get("style", ""), RAW_DIR / f"{it['id']}.png")

    if args.only:
        wanted = [s.strip() for s in args.only.split(",") if s.strip()]
        items = [it for it in items if it["id"] in wanted]
        missing = set(wanted) - {it["id"] for it in items}
        if missing:
            say(f"見つからない id: {', '.join(sorted(missing))}")
    if args.skip_existing:
        before = len(items)
        items = [it for it in items if not (IMG_DIR / f"{it['id']}.jpg").exists()]
        say(f"skip-existing: {before - len(items)} 件を飛ばす")
    if not items:
        say("対象なし")
        return 0

    if args.dry_run:
        for it in items:
            print(f"===== {it['id']} =====")
            print(it.get("prompt") or build_prompt(it["id"], it["scene"], style, RAW_DIR / f"{it['id']}.png"))
        return 0

    st = subprocess.run(["codex", "login", "status"], capture_output=True, text=True)
    if "ChatGPT" not in (st.stdout + st.stderr):
        say("codex login status が ChatGPT ログインではありません。`codex login` で ChatGPT アカウントにログインしてください")
        return 2

    RAW_DIR.mkdir(parents=True, exist_ok=True)
    STOCK_DIR.mkdir(parents=True, exist_ok=True)
    total = len(items)
    say(f"{total} 件を parallel={args.parallel} で生成（model={args.model} / image={IMAGE_MODEL}）")
    t0 = time.time()
    results: list[dict] = []
    with cf.ThreadPoolExecutor(max_workers=max(1, args.parallel)) as ex:
        futs = [ex.submit(process, i + 1, total, it, style, args) for i, it in enumerate(items)]
        for f in cf.as_completed(futs):
            results.append(f.result())

    oks = [r for r in results if r["ok"]]
    fails = [r for r in results if not r["ok"]]
    avg = sum(r["seconds"] for r in oks) / len(oks) if oks else 0
    say(f"--- 完了 {len(oks)}/{total} OK・失敗 {len(fails)}・平均 {avg:.0f}s/枚・合計 {(time.time()-t0)/60:.1f}分")
    for r in sorted(fails, key=lambda r: r["id"]):
        say(f"  FAIL {r['id']}: {r['error']}")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
