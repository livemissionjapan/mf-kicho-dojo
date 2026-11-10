/* 画面と同じ順で data/*.js を読み、問題・カリキュラム・飲食店・財務を返す */
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = path.resolve(__dirname, "..", "..");
function load() {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const srcs = [...html.matchAll(/<script src="(data\/[^"]+)"/g)].map(m => m[1]);
  const window = {}; const ctx = vm.createContext({ window, console });
  for (const s of srcs) vm.runInContext(fs.readFileSync(path.join(ROOT, s), "utf8"), ctx, { filename: s });
  const W = window;
  const Q = Object.keys(W).filter(k => k.startsWith("QUESTIONS")).flatMap(k => W[k].map(q => Object.assign({ _file: k }, q)));
  const C = W.CURRICULUM, INS = W.INSHOKU || { chapters: [], fields: [] };
  const XT = [W.SHIKIN, W.ZAIMU].filter(x => x && x.chapters);
  const chapters = C.chapters.concat(INS.chapters, ...XT.map(x => x.chapters));
  const stages = chapters.flatMap(ch => ch.stages.map(st => Object.assign({ chapter: ch }, st)));
  const fields = C.fields.concat(INS.fields, ...XT.map(x => x.fields));
  return { W, Q, C, INS, F: W.FINANCE, chapters, stages, fields, srcs, ROOT };
}
module.exports = { load, ROOT };
