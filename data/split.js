/* ステージは1回5問まで。5問を超えるステージは、読み込みのときに前半・後半（3つ以上なら 1/3 など）に分ける。
 * - 分けた1つ目は元のステージIDのまま（これまでの記録がそのまま残る）。2つ目以降は「元のID-2」「元のID-3」
 * - 問題は問題ファイルの並び順で、ほぼ同じ数ずつに分ける（例：10問→5・5、6問→3・3、11問→4・4・3）
 * - 5問未満のステージは「1問まで間違えてよい」をクリア条件にする
 * このファイルは、全部の data/*.js のあと、js/app.js の前に読み込む。 */
(function () {
  var W = window, MAX = 5;
  var Q = []; Object.keys(W).forEach(function (k) { if (k.indexOf("QUESTIONS") === 0 && Array.isArray(W[k])) Q = Q.concat(W[k]); });
  var by = {}; Q.forEach(function (q) { (by[q.stage] = by[q.stage] || []).push(q); });
  var tracks = [W.CURRICULUM, W.INSHOKU, W.SHIKIN, W.ZAIMU].filter(function (x) { return x && x.chapters; });
  tracks.forEach(function (T) {
    T.chapters.forEach(function (ch) {
      var out = [];
      ch.stages.forEach(function (st) {
        var qs = by[st.id] || [], n = qs.length;
        if (n <= MAX) { if (n && n < MAX) st.pass = (n - 1) / n; out.push(st); return; }
        var parts = Math.ceil(n / MAX), base = Math.floor(n / parts), extra = n % parts, at = 0;
        for (var p = 0; p < parts; p++) {
          var size = base + (p < extra ? 1 : 0), part = {};
          Object.keys(st).forEach(function (k) { part[k] = st[k]; });
          part.id = p === 0 ? st.id : st.id + "-" + (p + 1);
          part.name = st.name + (parts === 2 ? (p === 0 ? "（前半）" : "（後半）") : "（" + (p + 1) + "/" + parts + "）");
          part.base = st.id;
          if (size < MAX) part.pass = (size - 1) / size;
          qs.slice(at, at + size).forEach(function (q) { q.stage = part.id; });
          at += size; out.push(part);
        }
      });
      ch.stages = out;
    });
  });
})();
