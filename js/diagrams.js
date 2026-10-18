/* 記帳道場 図解モジュール（S1, S2, S5〜S9, S11, S13, S14）
 * 対象：簿記の基本は分かる現場の経理担当。文言は一般的な会計の言葉で書く（運用ルールのIDは使わない）
 * 形：window.DIAGRAMS[id] = { title, caption, hint, svg, controls?, init(root) }
 * - 連動：data-link="キー" を持つ要素はアプリ側の共通JSが .lit を付ける（ここでは書かない）
 * - 図固有の状態クラス（.on/.off/.ok/.ng など）は svg 内 <style> で id 限定して定義する
 * - 色は CSS 変数だけ（--d-ink/--d-muted/--d-bg/--d-accent/--d-ok/--d-ng/--d-warn/--d-lit）
 * - 実名・実金額は入れない（A社・B口座など）
 */
(function () {
  "use strict";

  const INK = "var(--d-ink)", MU = "var(--d-muted)", BG = "var(--d-bg)", A = "var(--d-accent)";
  const OK = "var(--d-ok)", NG = "var(--d-ng)", WN = "var(--d-warn)", LIT = "var(--d-lit)";

  // ---------- 共通部品 ----------
  const yen = (n) => (n < 0 ? "−" : "") + Math.abs(n).toLocaleString("ja-JP");
  const T = (x, y, s, o = {}) =>
    `<text x="${x}" y="${y}" font-size="${o.fs || 13}" fill="${o.fill || INK}" text-anchor="${o.anchor || "middle"}" dominant-baseline="middle"` +
    `${o.w ? ` font-weight="${o.w}"` : ""}${o.cls ? ` class="${o.cls}"` : ""}${o.attrs ? " " + o.attrs : ""}>${s}</text>`;
  const R = (x, y, w, h, o = {}) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${o.rx ?? 8}" fill="${o.fill || BG}" stroke="${o.stroke || MU}" stroke-width="${o.sw || 1.5}"` +
    `${o.cls ? ` class="${o.cls}"` : ""}${o.attrs ? " " + o.attrs : ""}/>`;
  // 枠＋中央文字（lines は文字列か配列）
  function box(x, y, w, h, lines, o = {}) {
    lines = [].concat(lines);
    const fs = o.fs || 13, lh = fs + 5, y0 = y + h / 2 - ((lines.length - 1) * lh) / 2;
    const txt = lines.map((s, i) => T(x + w / 2, y0 + i * lh, s, { fs, fill: o.color, w: o.w })).join("");
    const attrs = [o.link ? `data-link="${o.link}"` : "", o.cls ? `class="${o.cls}"` : "", o.attrs || ""].filter(Boolean).join(" ");
    return `<g ${attrs}>${R(x, y, w, h, { fill: o.fill, stroke: o.stroke, sw: o.sw, rx: o.rx })}${txt}</g>`;
  }
  const arrow = (id, x1, y1, x2, y2, o = {}) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${o.stroke || MU}" stroke-width="${o.sw || 1.5}" marker-end="url(#${id}-ar)"` +
    `${o.cls ? ` class="${o.cls}"` : ""}${o.attrs ? " " + o.attrs : ""}/>`;
  const svg = (id, h, label, body, style) =>
    `<svg id="${id}" viewBox="0 0 720 ${h}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${label}">` +
    `${style ? `<style>${style}</style>` : ""}` +
    `<defs><marker id="${id}-ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${MU}"/></marker></defs>` +
    `${body}</svg>`;
  const setText = (root, sel, s) => { const el = root.querySelector(sel); if (el) el.textContent = s; };
  const clearCls = (root, sel, ...cls) => root.querySelectorAll(sel).forEach((el) => el.classList.remove(...cls));
  // 残高バー（基準線から上が＋、下が−）。max=100% の高さ
  function setBar(rect, v, base, maxH, maxV, posColor) {
    const h = Math.min(maxH, (Math.abs(v) / maxV) * maxH);
    rect.setAttribute("height", h);
    rect.setAttribute("y", v >= 0 ? base - h : base);
    rect.setAttribute("fill", v < 0 ? NG : posColor || A);
  }

  const D = {};

  // ---------- S1 帳簿の流れ4段 ----------
  (() => {
    const rows = [
      { k: "s1-r1", m: ["A社から入金", "110,000"], j: ["借) 普通預金 110,000", "貸) 売掛金 110,000"], b: "売掛金 ▼110,000", t: "BS 売掛金 ▼110,000" },
      { k: "s1-r2", m: ["通信費（電話）", "5,500"], j: ["借) 通信費 5,500", "貸) 普通預金 5,500"], b: "通信費 ▲5,500", t: "PL 通信費 5,500" },
      { k: "s1-r3", m: ["事務用品", "3,300"], j: ["借) 消耗品費 3,300", "貸) 普通預金 3,300"], b: "消耗品費 ▲3,300", t: "PL 消耗品費 3,300" },
    ];
    const cx = [10, 190, 370, 550], W = 160;
    let b = ["① 連携明細", "② 仕訳帳", "③ 科目残高", "④ 試算表（BS/PL）"].map((s, i) => T(cx[i] + W / 2, 24, s, { w: 700, fs: 14 })).join("");
    b += arrow("S1", 170, 24, 188, 24) + arrow("S1", 350, 24, 368, 24) + arrow("S1", 530, 24, 548, 24);
    rows.forEach((r, i) => {
      const y = 50 + i * 80;
      b += box(cx[0], y, W, 60, r.m, { link: r.k }) + box(cx[1], y, W, 60, r.j, { link: r.k, fs: 12 });
      b += box(cx[2], y, W, 60, r.b, { link: r.k }) + box(cx[3], y, W, 60, r.t, { link: r.k });
      b += arrow("S1", cx[0] + W, y + 30, cx[1] - 2, y + 30) + arrow("S1", cx[1] + W, y + 30, cx[2] - 2, y + 30) + arrow("S1", cx[2] + W, y + 30, cx[3] - 2, y + 30);
    });
    // 普通預金は3行すべてが動かす → 3つのチップに分けて連動
    const chips = [["+110,000", "s1-r1"], ["−5,500", "s1-r2"], ["−3,300", "s1-r3"]];
    [2, 3].forEach((c) => {
      b += T(cx[c] + W / 2, 302, c === 2 ? "普通預金（3行の合計）" : "BS 普通預金 101,200", { fs: 12, fill: MU });
      chips.forEach(([s, k], j) => (b += box(cx[c] + j * 54, 316, 52, 34, s, { link: k, fs: 11, rx: 6 })));
    });
    b += T(cx[1] + W / 2, 333, "仕訳に登録 → 残高が動く", { fs: 12, fill: MU });
    b += T(360, 378, "残高の正本は④試算表。①に明細があるだけでは残高は動かない", { fs: 13, w: 700 });
    D.S1 = {
      title: "帳簿の流れ4段",
      caption: "連携明細は仕訳に登録して初めて残高が動き、その集計が試算表になる。",
      hint: "明細の行をタップすると、対応する仕訳・残高・試算表のセルが光ります",
      svg: svg("S1", 400, "連携明細から仕訳帳、科目残高、試算表への流れ", b),
      init() {},
    };
  })();

  // ---------- S2 貸方マップ ----------
  (() => {
    const pays = [
      { id: "bank", name: "銀行振込", acc: ["普通預金", "（口座ごとの補助科目）"], ocr: "現金", fix: "普通預金" },
      { id: "card", name: "クレジットカード", acc: ["未払金", "（カードごとの補助科目）"], ocr: "現金", fix: "未払金" },
      { id: "exec", name: "役員の個人カード・立替", acc: ["役員借入金など", "会社で決めた受け皿科目"], ocr: "現金", fix: "会社で決めた受け皿科目" },
      { id: "inv", name: "請求書払い（後日）", acc: ["買掛金（仕入）・未払金（経費）", "支払時に消し込む"], ocr: "買掛金", fix: "外注費・経費なら未払金" },
      { id: "emoney", name: "電子マネー", acc: ["チャージ元に応じて", "（預金・カード・現金）"], ocr: "現金", fix: "チャージ元の科目" },
    ];
    let b = T(120, 30, "支払手段（どこから払ったか）", { w: 700, fs: 14 }) + T(570, 30, "貸方科目（受け皿）", { w: 700, fs: 14 });
    pays.forEach((p, i) => {
      const y = 56 + i * 58;
      b += box(20, y, 200, 44, p.name, { cls: "pay", attrs: `data-pay="${p.id}" tabindex="0"` });
      b += `<line x1="220" y1="${y + 22}" x2="438" y2="${y + 22}" stroke="${MU}" stroke-width="1.5" data-acc="${p.id}"/>`;
      b += box(440, y, 260, 44, p.acc, { cls: "acc", attrs: `data-acc="${p.id}"`, fs: 12 });
    });
    b += R(20, 352, 680, 56, { stroke: NG, attrs: 'stroke-dasharray="5 3"' });
    b += T(120, 370, "読み取りは貸方を間違えやすい", { fs: 12, fill: NG, w: 700 });
    b += box(230, 358, 60, 24, "現金", { color: NG, stroke: NG, fs: 12, rx: 12 }) + box(300, 358, 70, 24, "買掛金", { color: NG, stroke: NG, fs: 12, rx: 12 });
    b += T(420, 370, "→ 直す", { fs: 13, fill: NG, w: 700 });
    b += T(360, 396, "手段をタップすると正しい科目が出ます", { fs: 12, fill: MU, cls: "note" });
    const style = `#S2 .pay{cursor:pointer}#S2 .pay.on rect,#S2 .acc.on rect{fill:${LIT};stroke:${A};stroke-width:3}#S2 line.on{stroke:${A};stroke-width:3}`;
    D.S2 = {
      title: "貸方マップ",
      caption: "貸方は「何を買ったか」ではなく「どこから払ったか」で決まる。手段ごとに受け皿科目が1つ決まっている。",
      hint: "支払手段をタップすると、対応する貸方科目が点灯します",
      svg: svg("S2", 420, "支払手段ごとに決まる貸方科目の対応図", b, style),
      init(root) {
        const pick = (id) => {
          clearCls(root, "#S2 .on", "on");
          root.querySelectorAll(`#S2 [data-pay="${id}"], #S2 [data-acc="${id}"]`).forEach((el) => el.classList.add("on"));
          const p = pays.find((x) => x.id === id);
          setText(root, "#S2 .note", `${p.name} → 読み取りが「${p.ocr}」と推定したら「${p.fix}」に直す`);
        };
        root.querySelectorAll("#S2 .pay").forEach((el) => {
          el.addEventListener("click", () => pick(el.dataset.pay));
          el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(el.dataset.pay); } });
        });
      },
    };
  })();

  // ---------- S5 立替金4本立て ----------
  (() => {
    const je = [["① A社へ請求", "売掛金 100,000", "／ 立替金 100,000"], ["② A社から着金", "普通預金 100,000", "／ 売掛金 100,000"],
      ["③ 外注先から請求", "立替金 100,000", "／ 未払金 100,000"], ["④ 外注先へ支払", "未払金 100,000", "／ 普通預金 100,000"]];
    const bal = [[0, 0, 0], [-100000, 100000, 0], [-100000, 0, 0], [0, 0, 100000], [0, 0, 0]];
    const memo = ["まだ何も起きていない。3つの残高は0", "請求を立てた：売掛金＋、立替金は貸方に立つ（いったんマイナス）", "着金：売掛金が消える。立替金はまだマイナスのまま",
      "外注先の請求：立替金の借方で相殺 → 立替金が0に戻る。未払金が立つ", "支払：未払金が消える。3つとも0。PLは最初から最後まで動かない"];
    let b = "";
    je.forEach((l, i) => { b += box(15 + i * 175, 16, 165, 72, l, { cls: "je", attrs: `data-step="${i + 1}"`, fs: 12 }); if (i < 3) b += arrow("S5", 180 + i * 175, 52, 188 + i * 175, 52); });
    const names = ["立替金", "売掛金", "未払金"], base = 250, cxs = [110, 260, 410];
    b += `<line x1="40" y1="${base}" x2="480" y2="${base}" stroke="${MU}"/>` + T(40, base - 8, "＋", { fs: 11, fill: MU }) + T(40, base + 10, "−", { fs: 11, fill: MU });
    names.forEach((n, i) => {
      b += `<rect x="${cxs[i] - 30}" y="${base}" width="60" height="0" fill="${A}" data-bar="${i}"/>`;
      b += T(cxs[i], 350, n, { w: 700 }) + T(cxs[i], 370, "0", { fs: 12, attrs: `data-val="${i}"` });
    });
    b += box(520, 150, 180, 200, ["PL（損益）", "", "売上高 0", "外注費 0", "", "最後まで動かない", "（立替はPLに載らない）"], { fs: 12, stroke: OK });
    b += T(360, 120, "残高の動き（各ステップ後）", { fs: 12, fill: MU });
    const style = `#S5 .je.on rect{fill:${LIT};stroke:${A};stroke-width:3}#S5 .je.done rect{stroke:${OK}}`;
    D.S5 = {
      title: "立替金4本立て",
      caption: "受託して外注へ流す取引は立替金・未払金で通す。4本の仕訳が終わると立替金は0、PLは動かない。",
      hint: "「次へ」でステップを進めると、該当の仕訳が光り、残高バーが動きます",
      svg: svg("S5", 400, "立替金・売掛金・未払金の4本の仕訳と残高の推移", b, style),
      controls: `<div class="d-controls"><button type="button" class="d-btn" data-act="prev">戻る</button><span class="d-note" data-role="step">ステップ 0／4</span><button type="button" class="d-btn" data-act="next">次へ</button><span class="d-note" data-role="memo"></span></div>`,
      init(root) {
        let step = 0;
        const render = () => {
          clearCls(root, "#S5 .je", "on", "done");
          root.querySelectorAll("#S5 .je").forEach((el) => { const s = +el.dataset.step; if (s === step) el.classList.add("on"); else if (s < step) el.classList.add("done"); });
          bal[step].forEach((v, i) => { setBar(root.querySelector(`#S5 [data-bar="${i}"]`), v, base, 70, 100000); setText(root, `#S5 [data-val="${i}"]`, yen(v)); });
          setText(root, '[data-role="step"]', `ステップ ${step}／4`);
          setText(root, '[data-role="memo"]', memo[step]);
        };
        root.querySelector('[data-act="prev"]').addEventListener("click", () => { step = Math.max(0, step - 1); render(); });
        root.querySelector('[data-act="next"]').addEventListener("click", () => { step = Math.min(4, step + 1); render(); });
        render();
      },
    };
  })();

  // ---------- S6 給与仕訳の形 ----------
  (() => {
    const line = (x, y, l, r) => T(x, y, l, { fs: 12, anchor: "start" }) + T(x + 190, y, r, { fs: 12, anchor: "start" });
    let b = `<g class="je" data-je="before">${R(15, 16, 460, 170, {})}` + T(245, 34, "給与計上（月末）", { w: 700 }) +
      T(40, 56, "借方", { fs: 11, fill: MU, anchor: "start" }) + T(230, 56, "貸方", { fs: 11, fill: MU, anchor: "start" }) +
      line(40, 78, "給料手当 300,000", "法定福利費 45,000（本人負担の社保）") + line(40, 100, "", "預り金〝所得税〟 7,000") +
      line(40, 122, "", "預り金〝雇用保険〟 1,800") + line(40, 144, "", "未払金〝給与〟 246,200") +
      T(245, 170, "会社負担の法定福利費（借方）はここでは立てない", { fs: 11, fill: MU }) + "</g>";
    b += `<g class="je" data-je="after">${R(15, 204, 460, 86, {})}` + T(245, 222, "社会保険料の引落（翌月）", { w: 700 }) +
      line(40, 248, "法定福利費 90,000", "普通預金 90,000") + T(245, 272, "引落の全額を法定福利費1行で受ける（本人45,000＋会社45,000）", { fs: 11, fill: MU }) + "</g>";
    const base = 160;
    b += T(585, 34, "法定福利費の残高", { w: 700 }) + `<line x1="500" y1="${base}" x2="670" y2="${base}" stroke="${MU}"/>`;
    b += T(500, base - 8, "＋", { fs: 11, fill: MU }) + T(500, base + 10, "−", { fs: 11, fill: MU });
    b += `<rect x="555" y="${base}" width="60" height="0" fill="${NG}" data-bar="lf"/>` + T(585, 262, "0", { fs: 16, w: 700, attrs: 'data-val="lf"' }) + T(585, 284, "", { fs: 12, fill: MU, attrs: 'data-sub="lf"' });
    b += R(15, 312, 690, 60, { stroke: OK, attrs: 'stroke-dasharray="5 3"' }) + T(360, 332, "このマイナスは異常ではない（給与の仕組み上そうなる）", { fs: 13, fill: OK, w: 700 });
    b += T(360, 354, "引落で会社負担分だけが残る途中経過。「マイナスだ」と慌てず、引落後の残高で見る", { fs: 12 });
    const style = `#S6 .je{opacity:.45}#S6 .je.on{opacity:1}#S6 .je.on rect{stroke:${A};stroke-width:3}`;
    D.S6 = {
      title: "給与仕訳の形",
      caption: "本人負担の社保を法定福利費の貸方で受け、引落の全額を法定福利費で受けると、会社負担分だけが残る。",
      hint: "「引落前／引落後」で法定福利費の残高がマイナスからプラスに変わります",
      svg: svg("S6", 390, "給与計上と社会保険料引落の仕訳と法定福利費の残高", b, style),
      controls: `<div class="d-controls"><button type="button" class="d-btn" data-on="before">引落前</button><button type="button" class="d-btn" data-on="after">引落後</button></div>`,
      init(root) {
        const show = (k) => {
          root.querySelectorAll("[data-on]").forEach((bt) => bt.classList.toggle("on", bt.dataset.on === k));
          clearCls(root, "#S6 .je", "on"); root.querySelector(`#S6 [data-je="${k}"]`).classList.add("on");
          const v = k === "before" ? -45000 : 45000;
          setBar(root.querySelector('#S6 [data-bar="lf"]'), v, base, 90, 45000, OK);
          setText(root, '#S6 [data-val="lf"]', yen(v));
          setText(root, '#S6 [data-sub="lf"]', k === "before" ? "本人負担分が貸方に立った状態" : "会社負担分だけが残った（正しい形）");
        };
        root.querySelectorAll("[data-on]").forEach((bt) => bt.addEventListener("click", () => show(bt.dataset.on)));
        show("before");
      },
    };
  })();

  // ---------- S7 売掛金の3者突合 ----------
  (() => {
    let b = box(20, 16, 200, 60, ["① 売上計上（請求書）", "売掛金 100,000／売上高 100,000"], { fs: 12, link: "s7-sale" });
    b += box(260, 16, 200, 60, ["② 入金（通帳）", "A社から 100,000"], { fs: 12, link: "s7-cash" });
    b += box(500, 16, 200, 60, ["③ 売掛金残高", "請求 − 回収 ＝ 残り"], { fs: 12, link: "s7-ar" });
    b += T(360, 100, "②の入金をどこに置くかで、①と③が変わる", { fs: 12, fill: MU });
    b += `<g data-res="je">${R(20, 120, 680, 50, {})}` + T(360, 145, "", { fs: 13, w: 700, attrs: 'data-text="je"' }) + "</g>";
    b += `<g data-res="sale">${R(20, 190, 330, 70, {})}` + T(185, 210, "売上高（PL）", { fs: 12, fill: MU }) + T(185, 238, "100,000", { fs: 18, w: 700, attrs: 'data-text="sale"' }) + "</g>";
    b += `<g data-res="ar">${R(370, 190, 330, 70, {})}` + T(535, 210, "売掛金残高（BS）", { fs: 12, fill: MU }) + T(535, 238, "100,000", { fs: 18, w: 700, attrs: 'data-text="ar"' }) + "</g>";
    b += `<foreignObject x="20" y="276" width="680" height="70"><div xmlns="http://www.w3.org/1999/xhtml" style="font-size:13px;line-height:1.5;color:${INK}" data-text="memo">置き先を選んでください</div></foreignObject>`;
    const style = `#S7 .ng rect{stroke:${NG};stroke-width:3}#S7 .ng text{fill:${NG}}#S7 .ok rect{stroke:${OK};stroke-width:3}#S7 .ok text{fill:${OK}}`;
    D.S7 = {
      title: "売掛金の3者突合",
      caption: "請求・入金・売掛金残高の3点で見る。入金を「売上」で受けると売上が二重に立ち、売掛金が消えない。",
      hint: "入金の置き先を選ぶと、売上高と売掛金残高の結果が切り替わります",
      svg: svg("S7", 350, "売上計上・入金・売掛金残高の3点突合", b, style),
      controls: `<div class="d-controls"><button type="button" class="d-btn" data-on="sales">売上で登録</button><button type="button" class="d-btn" data-on="ar">売掛金の回収で登録</button></div>`,
      init(root) {
        const show = (k) => {
          root.querySelectorAll("[data-on]").forEach((bt) => bt.classList.toggle("on", bt.dataset.on === k));
          clearCls(root, "#S7 [data-res]", "ok", "ng");
          const ng = k === "sales";
          setText(root, '#S7 [data-text="je"]', ng ? "普通預金 100,000 ／ 売上高 100,000" : "普通預金 100,000 ／ 売掛金 100,000");
          setText(root, '#S7 [data-text="sale"]', ng ? "200,000（二重）" : "100,000");
          setText(root, '#S7 [data-text="ar"]', ng ? "100,000（残ったまま）" : "0");
          root.querySelectorAll("#S7 [data-res]").forEach((el) => el.classList.add(ng ? "ng" : "ok"));
          setText(root, '#S7 [data-text="memo"]', ng ? "× 売上が二重に立つ。売掛金も消えないので、次の月も残高が増え続ける。入金は「売掛金の回収」で消し込む" : "◯ 売上は請求時の1回だけ。入金で売掛金が0になり、3点が合う");
        };
        root.querySelectorAll("[data-on]").forEach((bt) => bt.addEventListener("click", () => show(bt.dataset.on)));
        show("ar");
      },
    };
  })();

  // ---------- S8 インボイス控除区分の時系列 ----------
  (() => {
    const X0 = 40, PX = 660 / 75, N = 74; // 2023-10 〜 2029-12（75ヶ月）
    const ym = (m) => `${2023 + Math.floor((9 + m) / 12)}-${String(((9 + m) % 12) + 1).padStart(2, "0")}`;
    const rate = (has, m) => (has ? 100 : m <= 35 ? 80 : m <= 59 ? 70 : 0);
    const label = (has, r) => (has ? "適格（100%控除）" : r === 80 ? "経過措置 80%" : r === 70 ? "経過措置 70%" : "控除なし（経過措置終了）");
    const seg = (y, m0, m1, color, s) => R(X0 + m0 * PX, y, (m1 - m0 + 1) * PX, 34, { fill: color, stroke: "none", rx: 4, attrs: 'fill-opacity=".35"' }) + T(X0 + ((m0 + m1 + 1) / 2) * PX, y + 17, s, { fs: 12, w: 700 });
    let b = T(X0, 30, "登録番号あり", { fs: 12, anchor: "start", fill: MU }) + seg(42, 0, N, OK, "100%（適格請求書）");
    b += T(X0, 102, "登録番号なし", { fs: 12, anchor: "start", fill: MU }) + seg(114, 0, 35, A, "80%") + seg(114, 36, 59, WN, "70%") + seg(114, 60, N, NG, "0%");
    [3, 15, 27, 39, 51, 63].forEach((m, i) => (b += `<line x1="${X0 + m * PX}" y1="42" x2="${X0 + m * PX}" y2="160" stroke="${MU}" stroke-dasharray="2 3"/>` + T(X0 + m * PX, 170, `${2024 + i}年`, { fs: 11, fill: MU })));
    b += T(X0 + 36 * PX, 188, "2026-10-01〜", { fs: 11, fill: WN }) + T(X0 + 60 * PX, 188, "2028-10-01〜", { fs: 11, fill: NG });
    b += `<line x1="${X0}" y1="36" x2="${X0}" y2="158" stroke="${A}" stroke-width="3" data-marker/>`;
    b += R(20, 206, 680, 100, { stroke: A }) + T(360, 230, "", { fs: 14, attrs: 'data-text="date"' }) + T(360, 258, "", { fs: 20, w: 700, attrs: 'data-text="rate"' }) + T(360, 288, "", { fs: 12, fill: MU, attrs: 'data-text="book"' });
    b += T(360, 326, "登録番号があるか、取引日はいつかで控除できる割合が決まる", { fs: 12 });
    D.S8 = {
      title: "インボイス控除区分の時系列",
      caption: "登録番号があれば100%。なければ取引日で80%→70%→控除なしと変わる。区分は取引日で決まり、処理日ではない。",
      hint: "スライダーで取引日を動かし、「登録番号あり／なし」を切り替えると控除区分が出ます",
      svg: svg("S8", 340, "インボイス登録番号の有無と取引日による控除区分の時系列", b),
      controls: `<div class="d-controls"><button type="button" class="d-btn" data-on="yes">登録番号あり</button><button type="button" class="d-btn" data-on="no">登録番号なし</button><input type="range" min="0" max="${N}" value="36" aria-label="取引日"></div>`,
      init(root) {
        let has = false; const rg = root.querySelector('input[type="range"]');
        const render = () => {
          const m = +rg.value, r = rate(has, m);
          root.querySelectorAll("[data-on]").forEach((bt) => bt.classList.toggle("on", (bt.dataset.on === "yes") === has));
          const mk = root.querySelector("#S8 [data-marker]"); mk.setAttribute("x1", X0 + m * PX); mk.setAttribute("x2", X0 + m * PX);
          setText(root, '#S8 [data-text="date"]', `取引日 ${ym(m)}・登録番号${has ? "あり" : "なし"}`);
          const rt = root.querySelector('#S8 [data-text="rate"]'); rt.textContent = `控除 ${r}% ＝ ${label(has, r)}`; rt.setAttribute("fill", has || r === 80 ? OK : r === 70 ? WN : NG);
          setText(root, '#S8 [data-text="book"]', has ? "帳簿の表示例：課税仕入 10%（適格）" : r ? `帳簿の表示例：課税仕入 10%（控除${r}%・経過措置）` : "帳簿の表示例：課税仕入 10%（控除対象外）");
        };
        root.querySelectorAll("[data-on]").forEach((bt) => bt.addEventListener("click", () => { has = bt.dataset.on === "yes"; render(); }));
        rg.addEventListener("input", render);
        render();
      },
    };
  })();

  // ---------- S9 税区分マトリクス ----------
  (() => {
    const cols = ["対象外", "課税10%", "課税8%"];
    const rows = [
      ["BS｜預金", ["◯", "預金や売掛金などBS科目には消費税の区分を付けない"], ["×", "預金の増減に消費税は関係ない。課税は誤り"], ["×", "預金の増減に消費税は関係ない。8%も誤り"]],
      ["BS｜売掛金", ["◯", "売掛金の発生・回収には区分を付けない"], ["×", "税区分は売上側に付く。売掛金に課税は誤り"], ["×", "税区分は売上側に付く。売掛金に8%は誤り"]],
      ["BS｜固定資産の取得", ["△", "土地は非課税、建物・機械・車は課税。中身で判断"], ["◯", "建物・機械・車などの購入は課税仕入れが正しい"], ["×", "固定資産に8%はない（飲食料品ではない）"]],
      ["対象外｜租税公課", ["◯", "税金の支払いに消費税はかからない"], ["×", "税金の支払いに課税を付けるのは誤り"], ["×", "税金の支払いに8%を付けるのは誤り"]],
      ["対象外｜減価償却費", ["◯", "減価償却は帳簿上の配分。消費税は購入時に済んでいる"], ["×", "減価償却費に課税を付けるのは誤り"], ["×", "減価償却費に8%を付けるのは誤り"]],
      ["対象外｜棚卸高", ["◯", "棚卸高は在庫の振替。消費税は仕入時に済んでいる"], ["×", "棚卸高に課税を付けるのは誤り"], ["×", "棚卸高に8%を付けるのは誤り"]],
      ["費用｜通信費", ["△", "国際通話など不課税のことがある。中身で判断"], ["◯", "通常は課税10%"], ["×", "通信費に8%はない（飲食料品ではない）"]],
      ["費用｜広告宣伝費", ["△", "海外向けの広告は不課税のことがある。中身で判断"], ["◯", "通常は課税10%"], ["×", "広告費に8%はない（飲食料品ではない）"]],
      ["費用｜会議費", ["△", "中身で判断"], ["◯", "外食・会場費は10%"], ["△", "持ち帰りの弁当・飲み物は8%、外食は10%"]],
      ["飲食料品の仕入", ["×", "仕入は課税。対象外は誤り"], ["△", "酒・外食は10%"], ["◯", "飲食料品（酒・外食を除く）は8%が正しい"]],
      ["新聞（定期購読）", ["×", "新聞の購読料は課税。対象外は誤り"], ["△", "電子版・駅売りは10%"], ["◯", "週2回以上発行の定期購読の新聞は8%が正しい"]],
    ];
    const col = { "◯": OK, "×": NG, "△": WN };
    const CX = [206, 376, 546], CW = 164, RH = 27, Y0 = 44;
    let b = `<g class="hd" data-col="r">${R(10, 14, 190, 24, { stroke: "none", fill: "none" })}${T(105, 26, "科目グループ｜科目", { fs: 12, fill: MU })}</g>`;
    cols.forEach((c, j) => (b += `<g class="hd" data-col="${j}">${R(CX[j], 12, CW, 26, {})}${T(CX[j] + CW / 2, 25, c, { fs: 13, w: 700 })}</g>`));
    rows.forEach((r, i) => {
      const y = Y0 + i * RH, k = `s9-r${i}`;
      b += `<g class="rl" data-row="${i}" data-link="${k}">${R(10, y, 190, RH - 3, { stroke: "none", fill: "none" })}${T(16, y + RH / 2 - 1, r[0], { fs: 12, anchor: "start" })}</g>`;
      r.slice(1).forEach(([m, note], j) => {
        b += `<g class="cell" data-row="${i}" data-col="${j}" data-link="${k}" data-note="${note}" tabindex="0"><title>${note}</title>${R(CX[j], y, CW, RH - 3, { rx: 5 })}${T(CX[j] + CW / 2, y + RH / 2 - 1, m, { fs: 14, w: 700, fill: col[m] })}</g>`;
      });
    });
    b += T(360, 362, "◯＝正しい　×＝誤り　△＝中身で判断", { fs: 12, fill: MU });
    b += T(360, 386, "セルをタップすると理由が出ます", { fs: 13, attrs: "data-note-out" });
    const style = `#S9 .cell{cursor:pointer}#S9 .hl rect{stroke:${A};stroke-width:2.5;fill:${LIT}}#S9 .cell.hl rect{fill:${LIT}}`;
    D.S9 = {
      title: "税区分マトリクス",
      caption: "税区分は科目でほぼ決まる。預金・売掛金や税金・減価償却・棚卸には区分なし。8%は飲食料品と定期購読の新聞だけ。",
      hint: "セルをタップすると同じ行が光り、理由が出ます",
      svg: svg("S9", 400, "科目グループと税区分の正誤マトリクス", b, style),
      init(root) {
        const show = (el) => {
          clearCls(root, "#S9 .hl", "hl");
          root.querySelector(`#S9 .hd[data-col="${el.dataset.col}"]`).classList.add("hl");
          root.querySelector(`#S9 .rl[data-row="${el.dataset.row}"]`).classList.add("hl");
          el.classList.add("hl");
          setText(root, "#S9 [data-note-out]", `${rows[+el.dataset.row][0]} × ${cols[+el.dataset.col]}：${el.dataset.note}`);
        };
        root.querySelectorAll("#S9 .cell").forEach((el) => {
          el.addEventListener("click", () => show(el)); el.addEventListener("mouseenter", () => show(el));
          el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); show(el); } });
        });
      },
    };
  })();

  // ---------- S11 資金移動の補助科目 ----------
  (() => {
    let b = box(20, 50, 180, 60, ["A口座", "普通預金〝A〟"], { link: "s11-a" }) + arrow("S11", 200, 80, 268, 80);
    b += box(270, 30, 180, 100, ["普通預金〝資金移動〟", "", "残高", ""], { link: "s11-mv", stroke: A }) + T(360, 110, "0", { fs: 18, w: 700, attrs: 'data-text="bal"' });
    b += arrow("S11", 450, 80, 518, 80) + box(520, 50, 180, 60, ["B口座", "普通預金〝B〟"], { link: "s11-b" });
    b += `<g class="je" data-je="out">${R(20, 160, 680, 34, {})}${T(30, 177, "出金側：資金移動 100,000 ／ 普通預金〝A〟 100,000", { fs: 13, anchor: "start" })}${T(690, 177, "", { fs: 12, fill: MU, anchor: "end", attrs: 'data-text="d1"' })}</g>`;
    b += `<g class="je" data-je="in">${R(20, 204, 680, 34, {})}${T(30, 221, "入金側：普通預金〝B〟 100,000 ／ 資金移動 100,000", { fs: 13, anchor: "start" })}${T(690, 221, "", { fs: 12, fill: MU, anchor: "end", attrs: 'data-text="d2"' })}</g>`;
    b += `<g data-res>${R(20, 258, 680, 44, {})}${T(360, 280, "", { fs: 13, w: 700, attrs: 'data-text="res"' })}</g>`;
    b += T(360, 322, "口座間の振替は両側が〝資金移動〟を通り、月末に残高が0に戻るのが正しい形", { fs: 12, fill: MU });
    const style = `#S11 .je{opacity:.3}#S11 .je.on{opacity:1}#S11 .ng rect{stroke:${NG};stroke-width:3}#S11 .ng text{fill:${NG}}#S11 .ok rect{stroke:${OK};stroke-width:3}#S11 .ok text{fill:${OK}}`;
    D.S11 = {
      title: "資金移動の補助科目",
      caption: "自社口座間の振替は普通預金〝資金移動〟を通す。両側を登録すると残高は0に戻る。片側だけだと残る。",
      hint: "ボタンで出金側だけ／両側／月またぎを切り替えると、残高と結果が変わります",
      svg: svg("S11", 340, "口座間の資金移動と補助科目の残高", b, style),
      controls: `<div class="d-controls"><button type="button" class="d-btn" data-on="out">出金側を登録</button><button type="button" class="d-btn" data-on="both">入金側も登録</button><button type="button" class="d-btn" data-on="cross">月またぎにする</button></div>`,
      init(root) {
        const st = {
          out: { d1: "3/15", d2: "", bal: 100000, cls: "ng", res: "× 月末に 100,000 が残る → 入金側の登録漏れ" },
          both: { d1: "3/15", d2: "3/15", bal: 0, cls: "ok", res: "◯ 両側を通って 0 に戻った" },
          cross: { d1: "3/31", d2: "4/1", bal: 100000, cls: "ok", res: "◯ 月末に出して翌月初に入る振替。4/1 に解消するので問題ない" },
        };
        const show = (k) => {
          const s = st[k];
          root.querySelectorAll("[data-on]").forEach((bt) => bt.classList.toggle("on", bt.dataset.on === k));
          clearCls(root, "#S11 .je, #S11 [data-res]", "on", "ok", "ng");
          root.querySelector('#S11 [data-je="out"]').classList.add("on");
          if (k !== "out") root.querySelector('#S11 [data-je="in"]').classList.add("on");
          setText(root, '#S11 [data-text="d1"]', s.d1); setText(root, '#S11 [data-text="d2"]', s.d2);
          const bal = root.querySelector('#S11 [data-text="bal"]'); bal.textContent = yen(s.bal); bal.setAttribute("fill", s.bal ? (k === "cross" ? WN : NG) : OK);
          const res = root.querySelector("#S11 [data-res]"); res.classList.add(s.cls); setText(root, '#S11 [data-text="res"]', s.res);
        };
        root.querySelectorAll("[data-on]").forEach((bt) => bt.addEventListener("click", () => show(bt.dataset.on)));
        show("out");
      },
    };
  })();

  // ---------- S13 推移表ヒートマップ ----------
  (() => {
    const months = ["4月", "5月", "6月", "7月", "8月", "9月", "10月（当月）"];
    const rows = [["売上高", [1200, 1150, 1250, 1180, 1220, 1200, 2100]], ["外注費", [300, 320, 310, 290, 300, 310, 0]], ["地代家賃", [100, 100, 100, 100, 100, 100, 100]],
      ["広告宣伝費", [80, 85, 90, 80, 82, 85, 30]], ["通信費", [12, 12, 13, 12, 12, 12, 18]], ["消耗品費", [30, 28, 35, 30, 31, 29, -15]]];
    // 当月の判定（単位：千円）
    const judge = (v) => {
      const prev = v.slice(0, 6), cur = v[6], avg = prev.reduce((a, c) => a + c, 0) / 6;
      if (cur < 0) return { c: NG, why: "マイナス残高（本来と逆向き）。費用がマイナスなら、戻入・科目の逆・入金との紐付け誤りを疑う" };
      if (cur === 0 && prev.every((p) => p > 0)) return { c: NG, why: "毎月あった費用が今月だけない。計上漏れ・引落明細の未登録かも（年払い・解約済みなら問題ない）" };
      if (cur <= 20 && avg <= 20) return { c: MU, why: "少額（2万円以下）は見ない。当月もここ半年の平均も2万円以下（灰色）" };
      const d = Math.round(((cur - avg) / avg) * 100);
      if (Math.abs(d) > 50) return { c: WN, why: `ここ半年の平均 ${yen(Math.round(avg))} 千円と比べて ${d > 0 ? "+" : ""}${d}%。大きく動いている。理由が説明できるか（大型案件・季節変動なら問題ない）` };
      return { c: null, why: `問題なし：ここ半年の平均 ${yen(Math.round(avg))} 千円と比べて ${d > 0 ? "+" : ""}${d}%（±50%以内）` };
    };
    const LX = 10, LW = 120, CW = 82, RH = 36, Y0 = 44;
    let b = T(LX, 24, "単位：千円", { fs: 11, fill: MU, anchor: "start" });
    months.forEach((m, j) => (b += T(LX + LW + j * CW + CW / 2, 24, m, { fs: 11, w: 700 })));
    rows.forEach(([n, v], i) => {
      const y = Y0 + i * RH, j7 = judge(v);
      b += T(LX, y + RH / 2, n, { fs: 12, anchor: "start" });
      v.forEach((x, j) => {
        const cur = j === 6, fill = cur && j7.c ? j7.c : BG;
        b += `<g class="cell" data-row="${i}" tabindex="0">${R(LX + LW + j * CW, y, CW - 4, RH - 4, { fill, rx: 5, attrs: cur && j7.c ? 'fill-opacity=".35"' : "" })}${T(LX + LW + j * CW + CW / 2, y + RH / 2 - 2, yen(x), { fs: 12, fill: x < 0 ? NG : INK, w: cur ? 700 : 400 })}</g>`;
      });
    });
    b += T(360, 274, "橙＝ここ半年の平均から±50%外れ　赤＝毎月あった費用が0／マイナス残高　灰＝少額（2万円以下）は見ない", { fs: 11, fill: MU });
    b += `<foreignObject x="10" y="290" width="700" height="60"><div xmlns="http://www.w3.org/1999/xhtml" style="font-size:13px;line-height:1.5;color:${INK}" data-why>セルをタップすると、なぜ色が付いたかが出ます</div></foreignObject>`;
    const style = `#S13 .cell{cursor:pointer}#S13 .cell.on rect{stroke:${A};stroke-width:2.5}`;
    D.S13 = {
      title: "推移表ヒートマップ",
      caption: "月次推移は当月をここ半年の平均と比べる。±50%外れは橙、毎月あった費用の0とマイナスは赤、少額（2万円以下）は見ない。",
      hint: "セルをタップすると、その行に色が付いた理由が出ます",
      svg: svg("S13", 350, "科目別月次推移のヒートマップ", b, style),
      init(root) {
        const show = (i) => {
          clearCls(root, "#S13 .cell", "on");
          root.querySelectorAll(`#S13 .cell[data-row="${i}"]`).forEach((el) => el.classList.add("on"));
          setText(root, "#S13 [data-why]", `${rows[i][0]}：${judge(rows[i][1]).why}`);
        };
        root.querySelectorAll("#S13 .cell").forEach((el) => {
          el.addEventListener("click", () => show(+el.dataset.row));
          el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); show(+el.dataset.row); } });
        });
      },
    };
  })();

  // ---------- S14 決算前タイムライン ----------
  (() => {
    const months = ["2月", "3月", "4月", "5月"];
    const cards = [
      { name: "3月分の外注費", sub: "請求書は4月に到着", ans: 2, ok: "◯ 役務を受けた3月の費用（未払金で計上）", ng: "× 請求書の到着月ではなく、役務を受けた月に計上する" },
      { name: "4月分の家賃", sub: "3月に前払い", ans: 3, ok: "◯ 4月分なので翌期の費用。3月の支払時は前払費用", ng: "× 支払った月ではなく、対象の月に計上する" },
    ];
    let b = "";
    months.forEach((m, j) => (b += R(40 + j * 160, 30, 156, 44, { fill: j < 2 ? LIT : BG, rx: 6 }) + T(118 + j * 160, 52, m, { fs: 13, w: 700 })));
    b += `<line x1="360" y1="22" x2="360" y2="86" stroke="${NG}" stroke-width="2" stroke-dasharray="5 3"/>` + T(360, 98, "期末 3/31", { fs: 12, fill: NG, w: 700 });
    b += T(200, 14, "当期", { fs: 11, fill: MU }) + T(520, 14, "翌期", { fs: 11, fill: MU });
    cards.forEach((c, i) => {
      const y = 118 + i * 84;
      b += box(20, y, 260, 56, [c.name, c.sub], { fs: 12, attrs: `data-cardbox="${i}"` });
      b += T(290, y + 14, "置く月 →", { fs: 11, fill: MU, anchor: "start" });
      months.forEach((m, j) => (b += box(360 + j * 86, y + 2, 80, 32, m, { cls: "mb", attrs: `data-card="${i}" data-m="${j + 1}" tabindex="0"`, fs: 12, rx: 16 })));
      b += T(20, y + 70, "", { fs: 12, anchor: "start", attrs: `data-res="${i}"` });
    });
    b += `<line x1="20" y1="290" x2="700" y2="290" stroke="${MU}"/>`;
    b += T(20, 312, "固定資産の金額の線（取得価額・1点あたり）", { fs: 13, w: 700, anchor: "start" });
    const SX = 40, SW = 640, vmin = 50000, vmax = 350000, vx = (v) => SX + ((v - vmin) / (vmax - vmin)) * SW;
    b += `<line x1="${SX}" y1="350" x2="${SX + SW}" y2="350" stroke="${MU}" stroke-width="3"/>`;
    [[100000, "10万"], [200000, "20万"], [300000, "30万"]].forEach(([v, s]) => (b += `<line x1="${vx(v)}" y1="340" x2="${vx(v)}" y2="360" stroke="${INK}" stroke-width="2"/>` + T(vx(v), 374, s, { fs: 11, fill: MU })));
    [[75000, "費用"], [150000, "一括償却"], [250000, "少額特例"], [325000, "資産"]].forEach(([v, s]) => (b += T(vx(v), 332, s, { fs: 11, fill: MU })));
    b += `<path d="M-7 -12 L7 -12 L0 0 Z" fill="${A}" transform="translate(${vx(180000)},350)" data-marker/>`;
    b += T(360, 400, "", { fs: 14, w: 700, attrs: 'data-text="asset"' }) + T(360, 424, "1点10万円以上は費用ではなく資産。20万未満＝一括償却資産、30万未満＝少額特例（青色・年300万円まで）", { fs: 11, fill: MU });
    const style = `#S14 .mb{cursor:pointer}#S14 .mb.ok rect{stroke:${OK};stroke-width:3;fill:${LIT}}#S14 .mb.ng rect{stroke:${NG};stroke-width:3}#S14 .mb.ng text{fill:${NG}}`;
    const judgeAsset = (v) => (v < 100000 ? ["費用（消耗品費など）：10万円未満", OK] : v < 200000 ? ["一括償却資産：10万円以上20万円未満（3年で均等償却）", WN]
      : v < 300000 ? ["少額減価償却資産の特例：30万円未満（青色申告・年300万円まで）", WN] : ["固定資産：資産計上して固定資産台帳へ（減価償却）", NG]);
    D.S14 = {
      title: "決算前タイムライン",
      caption: "期末前後は「いつ払ったか」ではなく「いつの分か」で月を決める。固定資産は金額の線で扱いが変わる。",
      hint: "各カードの「置く月」を選ぶと正誤が出ます。スライダーで固定資産の扱いが変わります",
      svg: svg("S14", 440, "期末前後の計上月と固定資産の金額の線", b, style),
      controls: `<div class="d-controls"><label for="s14-range">取得価額</label><input id="s14-range" type="range" min="${vmin}" max="${vmax}" step="10000" value="180000" aria-label="取得価額"><span class="d-note" data-role="amt"></span></div>`,
      init(root) {
        root.querySelectorAll("#S14 .mb").forEach((el) => {
          const pick = () => {
            const i = +el.dataset.card, m = +el.dataset.m, c = cards[i], ok = m === c.ans;
            clearCls(root, `#S14 .mb[data-card="${i}"]`, "ok", "ng"); el.classList.add(ok ? "ok" : "ng");
            const t = root.querySelector(`#S14 [data-res="${i}"]`); t.textContent = ok ? c.ok : c.ng; t.setAttribute("fill", ok ? OK : NG);
          };
          el.addEventListener("click", pick); el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
        });
        const rg = root.querySelector("#s14-range");
        const render = () => {
          const v = +rg.value, [s, c] = judgeAsset(v);
          root.querySelector("#S14 [data-marker]").setAttribute("transform", `translate(${vx(v)},350)`);
          const t = root.querySelector('#S14 [data-text="asset"]'); t.textContent = `${yen(v)}円 → ${s}`; t.setAttribute("fill", c);
          setText(root, '[data-role="amt"]', `${yen(v)}円`);
        };
        rg.addEventListener("input", render); render();
      },
    };
  })();

  window.DIAGRAMS = D;
})();
