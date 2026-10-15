/* 記帳道場 — 進捗ログを受けてスプレッドシートに追記する GAS Webアプリ
 * デプロイ：ウェブアプリ／実行ユーザー＝自分／アクセス＝全員（匿名）
 * POST {kind:"progress", name, deviceId, app, logs:[{logId, at, chapter, chapterName, stage, stageName, correct, total, rate, cleared, seconds, weak}]}
 * GET  ?action=ack&deviceId=…&ids=a,b,c  → {received:[…]}（受領済み logId を返す。ブラウザ側のキューを落とすため）
 * GET  ?action=ping → {ok:true}
 */
const SHEET_LOG = "進捗ログ";
const HEADER = ["送信日時", "受講者名", "端末ID", "章ID", "章名", "ステージID", "ステージ名", "正答数", "問題数", "正答率", "クリア", "所要秒", "弱い出典", "アプリ版", "logId", "受信日時"];

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_LOG);
  if (!sh) { sh = ss.insertSheet(SHEET_LOG); }
  if (sh.getLastRow() === 0) { sh.appendRow(HEADER); sh.setFrozenRows(1); }
  return sh;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function existingIds_(sh) {
  const last = sh.getLastRow();
  if (last < 2) return new Set();
  const col = HEADER.indexOf("logId") + 1;
  const vals = sh.getRange(2, col, last - 1, 1).getValues();
  return new Set(vals.map(r => String(r[0])).filter(Boolean));
}

function doPost(e) {
  if (!e || !e.postData || !e.postData.contents) return json_({ status: "no data" });
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.kind !== "progress" || !Array.isArray(body.logs)) return json_({ status: "ignored" });
    const sh = sheet_();
    const seen = existingIds_(sh);
    const now = new Date();
    const rows = [];
    body.logs.forEach(l => {
      if (!l || !l.logId || seen.has(String(l.logId))) return; // 二重送信は捨てる
      rows.push([
        l.at ? new Date(l.at) : now, String(l.name || body.name || ""), String(l.deviceId || body.deviceId || ""),
        String(l.chapter || ""), String(l.chapterName || ""), String(l.stage || ""), String(l.stageName || ""),
        Number(l.correct) || 0, Number(l.total) || 0, Number(l.rate) || 0, l.cleared ? "クリア" : "未達",
        Number(l.seconds) || 0, String(l.weak || ""), String(l.app || body.app || ""), String(l.logId), now
      ]);
    });
    if (rows.length) sh.getRange(sh.getLastRow() + 1, 1, rows.length, HEADER.length).setValues(rows);
    return json_({ status: "ok", added: rows.length });
  } catch (err) {
    return json_({ status: "error", message: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.action === "ping") return json_({ ok: true });
  if (p.action === "setup") { setupDashboard(); return json_({ ok: true, setup: true }); }
  if (p.action === "ack") {
    const ids = String(p.ids || "").split(",").filter(Boolean);
    const seen = existingIds_(sheet_());
    return json_({ received: ids.filter(id => seen.has(id)) });
  }
  return json_({ ok: true, usage: "POST progress / GET ?action=ack&ids=…" });
}

/* 初回だけ手で実行：ダッシュボードタブを作る */
function setupDashboard() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  sheet_();
  let d = ss.getSheetByName("ダッシュボード");
  if (!d) d = ss.insertSheet("ダッシュボード");
  d.clear();
  d.getRange("A1").setValue("受講者ごとの到達（クリア済みステージ数・最終学習日）");
  d.getRange("A3").setFormula('=IFERROR(QUERY(\'進捗ログ\'!A2:N, "select B, count(F), max(A) where K = \'クリア\' group by B label B \'受講者\', count(F) \'クリア記録数\', max(A) \'最終学習\'", 0), "まだ記録がありません")');
  d.getRange("A10").setValue("受講者×章（クリア済みのステージ数）");
  d.getRange("A12").setFormula('=IFERROR(QUERY(\'進捗ログ\'!A2:N, "select B, E, count(F) where K = \'クリア\' group by B pivot E", 0), "")');
  d.getRange("A20").setValue("弱い出典（未達になった回の出典を集計）");
  d.getRange("A22").setFormula('=IFERROR(QUERY(\'進捗ログ\'!A2:N, "select M, count(M) where K = \'未達\' and M <> \'\' group by M order by count(M) desc label M \'出典\', count(M) \'回数\'", 0), "")');
  let r = ss.getSheetByName("README");
  if (!r) r = ss.insertSheet("README", 0);
  r.clear();
  r.getRange("A1:A8").setValues([["記帳道場 — 進捗の記録"], ["アプリ：https://livemissionjapan.github.io/mf-kicho-dojo/"], ["「進捗ログ」はアプリがステージを終えるたびに1行追記します（手で編集しない）。"], ["「ダッシュボード」は進捗ログの集計です。"], ["同じ logId の行は二重に入りません（再送に強い）。"], ["ソース：lmj/30_開発/学習/mf-kicho-dojo/gas/Code.js（clasp で同期）"], [""], ["列：送信日時／受講者名／端末ID／章ID／章名／ステージID／ステージ名／正答数／問題数／正答率／クリア／所要秒／弱い出典／アプリ版／logId／受信日時"]]);
}
