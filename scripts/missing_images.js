/* 足りない絵を _stock/pending_images.json に書き出す（scripts/gen_images.py --input で生成）。
 * 使い方：node scripts/missing_images.js && python3 scripts/gen_images.py --input _stock/pending_images.json --parallel 3 --skip-existing */
const fs = require("fs"), path = require("path");
const { required, ROOT } = require("../tests/support/images");
const EXTRA = { // 場面説明がデータにない絵
  "t-inshoku": "経理担当のミナが、昼の営業を終えた飲食店のカウンターで、店長と並んで売上日報と食材の伝票を見比べ、電卓を手に笑顔で話している。奥に厨房が見える",
  "d-S0": "ミナがホワイトボードに3つの無地の箱を横に並べて描き、1枚のカードを動かすと3つの箱に線が伸びる様子を社長に見せている"
};
const need = required(), out = [];
for (const [id] of need) {
  if (fs.existsSync(path.join(ROOT, "img", id + ".jpg"))) continue;
  const scene = required.scenes[id] || EXTRA[id];
  if (!scene) { console.error("場面説明なし: " + id); continue; }
  out.push({ id, scene });
}
fs.mkdirSync(path.join(ROOT, "_stock"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "_stock/pending_images.json"), JSON.stringify(out, null, 1));
console.log(out.length + " 枚");
