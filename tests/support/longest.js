/* 「正解だけ長い」選択式の一覧。使い方：node tests/support/longest.js data/questions-a.js [ほかのファイル…] */
const { load } = require("./load"); const D = load(); const fs = require("fs"), path = require("path");
const files = process.argv.slice(2).map(f => path.resolve(f));
const keyOf = {}; for (const f of files) { const m = fs.readFileSync(f, "utf8").match(/window\.(QUESTIONS[A-Z0-9_]*)\s*=/); if (m) keyOf[m[1]] = f; }
for (const q of D.Q.filter(q => (!files.length || keyOf[q._file]) && ["mc", "case"].includes(q.type) && q.choices.length >= 3)) {
  const L = q.choices.map(c => String(c).length), r = L[q.answer], o = Math.max(...L.filter((_, i) => i !== q.answer));
  if (r >= 14 && r > o * 1.5) console.log(`${q.id}\t正解${r}字／他の最長${o}字`);
}
