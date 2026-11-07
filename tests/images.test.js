/* 絵の検査：画面が読みにいく絵が全部あり、Git に入っていて（＝公開される）、配信に向いた大きさか */
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("fs"), path = require("path"), vm = require("vm"), { execFileSync } = require("child_process");
const { required, ROOT } = require("./support/images");

const need = required();
const tracked = new Set(execFileSync("git", ["ls-files", "img"], { cwd: ROOT, encoding: "utf8" }).split("\n"));
const list = (a, msg) => assert.equal(a.length, 0, `${msg}（${a.length}枚）\n  ${a.slice(0, 30).join("\n  ")}${a.length > 30 ? "\n  …" : ""}`);

test("画面が使う絵が全部ある", () => {
  list([...need].filter(([id]) => !fs.existsSync(path.join(ROOT, "img", id + ".jpg"))).map(([id, why]) => `${id}.jpg（${why}）`), "絵がない");
});

test("ある絵は全部 Git に入っている（入っていないと公開サイトで出ない）", () => {
  list([...need.keys()].filter(id => fs.existsSync(path.join(ROOT, "img", id + ".jpg")) && !tracked.has(`img/${id}.jpg`)).map(id => id + ".jpg"), "Git に未登録");
});

test("配信用の絵は 400KB 以下・横 960px 以下", () => {
  const out = [];
  for (const id of need.keys()) {
    const f = path.join(ROOT, "img", id + ".jpg"); if (!fs.existsSync(f)) continue;
    const b = fs.readFileSync(f); if (b.length > 400 * 1024) out.push(`${id}.jpg ${(b.length / 1024 | 0)}KB`);
    for (let i = 2; i < b.length - 9;) { // JPEG の SOF から幅を読む
      if (b[i] !== 0xff) { i++; continue; } const m = b[i + 1], len = b.readUInt16BE(i + 2);
      if (m >= 0xc0 && m <= 0xc3) { const w = b.readUInt16BE(i + 7); if (w > 960) out.push(`${id}.jpg 横${w}px`); break; }
      i += 2 + len;
    }
  }
  list(out, "大きすぎる絵");
});
