/* 問題データの検査：形が正しいか・答えが成り立つか・「微妙な問題」の典型を機械で拾う */
const test = require("node:test"), assert = require("node:assert/strict");
const { load } = require("./support/load");
const D = load();
const { Q, stages, fields } = D;
const stageIds = new Set(stages.map(s => s.id).concat(["diag", "exam"]));
const fieldIds = new Set(fields.map(f => f.id));
const bad = (list, msg) => assert.equal(list.length, 0, `${msg}\n  ${list.slice(0, 40).join("\n  ")}${list.length > 40 ? `\n  …ほか${list.length - 40}件` : ""}`);
const norm = s => String(s).replace(/\s+/g, "").replace(/[（）()]/g, "");

test("ID が重複していない", () => {
  const seen = {}, dup = [];
  for (const q of Q) { if (seen[q.id]) dup.push(`${q.id}（${seen[q.id]} と ${q._file}）`); seen[q.id] = q._file; }
  bad(dup, "重複ID");
});

test("どの問題もステージと分野につながっている", () => {
  bad(Q.filter(q => !stageIds.has(q.stage)).map(q => `${q.id} stage=${q.stage}`), "存在しないステージ");
  bad(Q.filter(q => !fieldIds.has(q.field)).map(q => `${q.id} field=${q.field}`), "存在しない分野");
});

test("どのステージにも十分な数の問題がある（5問以上）", () => {
  const n = {}; Q.forEach(q => n[q.stage] = (n[q.stage] || 0) + 1);
  bad(stages.filter(s => (n[s.id] || 0) < 5).map(s => `${s.id} ${s.name}: ${n[s.id] || 0}問`), "問題が少ないステージ");
});

test("問題文・解説・場面がそろっている", () => {
  bad(Q.filter(q => !String(q.stem || "").trim()).map(q => q.id), "問題文なし");
  bad(Q.filter(q => String(q.explanation || "").length < 60).map(q => `${q.id}（${String(q.explanation || "").length}字）`), "解説が短すぎる");
  bad(Q.filter(q => !q.scene || !q.explainScene).map(q => q.id), "絵の場面説明なし");
});

test("選択式：選択肢と正解の番号が正しい", () => {
  const out = [];
  for (const q of Q.filter(q => ["mc", "case", "sort2"].includes(q.type))) {
    if (!Array.isArray(q.choices) || q.choices.length < 2) { out.push(`${q.id} 選択肢が2つ未満`); continue; }
    if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.choices.length) out.push(`${q.id} answer=${q.answer}`);
    const ns = q.choices.map(norm); if (new Set(ns).size !== ns.length) out.push(`${q.id} 同じ選択肢がある`);
    if (q.type !== "sort2" && q.choices.length < 3) out.push(`${q.id} 4択のはずが${q.choices.length}択`);
    if (q.type === "case" && !String(q.situation || "").trim()) out.push(`${q.id} 状況説明なし`);
  }
  bad(out, "選択式の不備");
});

test("解説の『正解は』が、別の選択肢を指していない", () => {
  const out = [];
  for (const q of Q.filter(q => ["mc", "case", "sort2"].includes(q.type))) {
    const m = String(q.explanation).match(/^正解は『([^』]+)』/); if (!m) continue;
    const said = norm(m[1]), right = norm(q.choices[q.answer]);
    const hit = i => { const c = norm(q.choices[i]); return c === said || c.includes(said) || said.includes(c); };
    const others = q.choices.map((_, i) => i).filter(i => i !== q.answer && hit(i));
    if (others.length && !(right.includes(said) || said.includes(right))) out.push(`${q.id} 解説「${m[1]}」が ${others.map(i => `「${q.choices[i]}」`).join("")} を指している（正解は「${q.choices[q.answer]}」）`);
  }
  bad(out, "解説と正解の食い違い");
});

test("選択肢は画面で毎回シャッフルされる（正解の位置で当てられない）", () => {
  const src = require("fs").readFileSync(require("path").join(D.ROOT, "js/app.js"), "utf8");
  assert.match(src, /const order = shuffle\(q\.choices\.map/);
});

test("正解だけが目立って長い『見ればわかる』問題がない", () => {
  const out = [];
  for (const q of Q.filter(q => ["mc", "case"].includes(q.type) && q.choices.length >= 3)) {
    const L = q.choices.map(c => String(c).length), r = L[q.answer], others = L.filter((_, i) => i !== q.answer);
    if (r >= 14 && r > Math.max(...others) * 1.5) out.push(`${q.id} 正解${r}字／他の最長${Math.max(...others)}字`);
  }
  bad(out, "正解だけ長い");
});

test("並べ替え・仕訳・誤り探しの形が正しい", () => {
  const out = [];
  for (const q of Q) {
    if (q.type === "order" && !(Array.isArray(q.items) && q.items.length >= 3)) out.push(`${q.id} order items`);
    if (q.type === "journal") {
      const s = q.slots || {}, a = q.answer || {};
      if (!(s.debit || []).includes(a.debit)) out.push(`${q.id} 借方の正解が選択肢にない`);
      if (!(s.credit || []).includes(a.credit)) out.push(`${q.id} 貸方の正解が選択肢にない`);
      if (a.debitTax && !(s.tax || []).includes(a.debitTax)) out.push(`${q.id} 借方税区分`);
      if (a.creditTax && !(s.tax || []).includes(a.creditTax)) out.push(`${q.id} 貸方税区分`);
    }
    if (q.type === "spot") {
      if (!Array.isArray(q.answer) || !q.answer.length) out.push(`${q.id} spot answer`);
      else if (q.answer.some(i => !q.rows[i])) out.push(`${q.id} spot answer 範囲外`);
      if (q.rows.some(r => r.length !== q.header.length)) out.push(`${q.id} 列数が見出しと違う`);
    }
  }
  bad(out, "形の不備");
});

test("同じ問題文が重複していない", () => {
  const seen = {}, out = [];
  for (const q of Q) { const k = norm(q.stem) + "|" + norm(q.situation || ""); if (seen[k]) out.push(`${q.id} と ${seen[k]}`); else seen[k] = q.id; }
  bad(out, "同じ問題文");
});

test("期限つきの問題（制度改正など）が期限切れになっていない", () => {
  const today = new Date().toISOString().slice(0, 10);
  bad(Q.filter(q => q.valid_until && q.valid_until < today).map(q => `${q.id} valid_until=${q.valid_until}`), "期限切れ");
});
