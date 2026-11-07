/* 画面が読みにいく絵の一覧（id → 何に使うか・場面説明）。tests/images.test.js と scripts/missing_images.js が使う */
const fs = require("fs"), path = require("path"), vm = require("vm");
const { load, ROOT } = require("./load");
const D = load();
function required() {
  const need = new Map(), scenes = {}; required.scenes = scenes; const add = (id, why, scene) => { if (id && !need.has(id)) need.set(id, why); if (id && scene) scenes[id] = scene; };
  const { C, F, Q } = D;
  add(C.diagnostic.img, "実力診断", C.diagnostic.scene); add(C.exam.img, "卒業試験", C.exam.scene);
  for (const ch of D.chapters) { add(ch.img, `章 ${ch.id}`, ch.scene); for (const st of ch.stages) add(st.img, `ステージ ${st.id}`, st.scene); }
  for (const q of Q) { const id = q.img || q.id; add(id, `問題 ${q.id} の場面`, q.scene); add("e-" + id, `問題 ${q.id} の解説`, q.explainScene); }
  ["t-keiri", "t-zaimu", "t-inshoku", "f-hero"].forEach(id => add(id, "入口・財務"));
  for (const l of F.lenses) add("f-" + l.id, `財務の視点 ${l.id}`);
  for (const t of (F.thinking || F.thoughts || [])) if (t.img) add(t.img, `財務 ${t.id || t.title}`);
  const ctx = vm.createContext({ window: {} }); vm.runInContext(fs.readFileSync(path.join(ROOT, "js/diagrams.js"), "utf8"), ctx);
  for (const k of Object.keys(ctx.window.DIAGRAMS || {})) add("d-" + k, `図解 ${k}`);
  return need;
}
module.exports = { required, ROOT, D };
