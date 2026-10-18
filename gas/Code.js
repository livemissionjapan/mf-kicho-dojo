/* 記帳道場 v2 — 進捗の記録と復元（GAS Webアプリ）
 * デプロイ：ウェブアプリ／実行ユーザー＝自分／アクセス＝全員（匿名）
 *
 * POST {kind:"progress", name, pin, deviceId, app, logs:[{logId, at, chapter, chapterName, stage, stageName, correct, total, rate, cleared, seconds, weak, hard, fields}]}
 *   → 受講者（名前＋合言葉）を確かめてから「進捗ログ」に追記。合言葉が違えば捨てる。logId の重複は捨てる
 * GET ?action=restore&name=…&pin=…  → {ok, new?, stages:{stageId:{best,cleared,attempts,last}}, diag:{fields,at}|null, hard:[qid…]}  合言葉が違えば {error:"pin"}
 * GET ?action=ack&name=…&pin=…&ids=a,b  → {received:[…]}
 * GET ?action=ping / setup / count&name=… / cleanup_test
 */
const SHEET_LOG = "進捗ログ";
const SHEET_USERS = "受講者";
const HEADER = ["送信日時", "受講者名", "端末ID", "章ID", "章名", "ステージID", "ステージ名", "正答数", "問題数", "正答率", "クリア", "所要秒", "弱い分野", "難しかった問題", "分野別", "アプリ版", "logId", "受信日時"];
const USER_HEADER = ["受講者名", "合言葉ハッシュ", "初回", "最終", "端末ID"];
const TEST_NAMES = ["接続テスト", "動作確認テスト"];

function col_(name) { return HEADER.indexOf(name) + 1; }
function json_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
function hash_(name, pin) {
  const raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(name).trim() + "|" + String(pin).trim(), Utilities.Charset.UTF_8);
  return Utilities.base64Encode(raw);
}

function logSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_LOG);
  if (!sh) sh = ss.insertSheet(SHEET_LOG);
  const last = sh.getLastRow();
  const headNow = last >= 1 ? sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0].map(String) : [];
  if (last === 0 || (last === 1 && headNow.join("|") !== HEADER.join("|"))) {
    sh.clear();
    sh.getRange(1, 1, 1, HEADER.length).setValues([HEADER]);
    sh.setFrozenRows(1);
    sh.getRange("A:A").setNumberFormat("yyyy/mm/dd hh:mm");
    sh.getRange("R:R").setNumberFormat("yyyy/mm/dd hh:mm");
    sh.getRange("J:J").setNumberFormat("0%");
  }
  return sh;
}
function userSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_USERS);
  if (!sh) sh = ss.insertSheet(SHEET_USERS);
  if (sh.getLastRow() === 0) { sh.getRange(1, 1, 1, USER_HEADER.length).setValues([USER_HEADER]); sh.setFrozenRows(1); sh.getRange("C:D").setNumberFormat("yyyy/mm/dd hh:mm"); }
  return sh;
}

/* 受講者を探す／登録する。戻り：{row, ok} ok=false は合言葉違い */
function findUser_(name, pin, deviceId, register) {
  const sh = userSheet_();
  const last = sh.getLastRow();
  const h = hash_(name, pin);
  if (last >= 2) {
    const vals = sh.getRange(2, 1, last - 1, USER_HEADER.length).getValues();
    for (let i = 0; i < vals.length; i++) {
      if (String(vals[i][0]) === String(name).trim()) {
        if (String(vals[i][1]) !== h) return { ok: false };
        const row = i + 2;
        sh.getRange(row, 4).setValue(new Date());
        if (deviceId) {
          const devs = String(vals[i][4] || "").split(";").filter(Boolean);
          if (!devs.includes(deviceId)) { devs.push(deviceId); sh.getRange(row, 5).setValue(devs.join(";")); }
        }
        return { ok: true, row };
      }
    }
  }
  if (!register) return { ok: true, row: 0, isNew: true };
  sh.appendRow([String(name).trim(), h, new Date(), new Date(), deviceId || ""]);
  return { ok: true, row: sh.getLastRow(), isNew: true };
}

function existingIds_(sh) {
  const last = sh.getLastRow();
  if (last < 2) return new Set();
  const vals = sh.getRange(2, col_("logId"), last - 1, 1).getValues();
  return new Set(vals.map(r => String(r[0])).filter(Boolean));
}

function doPost(e) {
  if (!e || !e.postData || !e.postData.contents) return json_({ status: "no data" });
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.kind !== "progress" || !Array.isArray(body.logs)) return json_({ status: "ignored" });
    const name = String(body.name || "").trim(), pin = String(body.pin || "").trim();
    if (!name || !/^\d{4}$/.test(pin)) return json_({ status: "bad user" });
    const u = findUser_(name, pin, String(body.deviceId || ""), true);
    if (!u.ok) return json_({ status: "pin" });
    const sh = logSheet_();
    const seen = existingIds_(sh);
    const now = new Date();
    const rows = [];
    body.logs.forEach(l => {
      if (!l || !l.logId || seen.has(String(l.logId))) return;
      rows.push([
        l.at ? new Date(l.at) : now, name, String(l.deviceId || body.deviceId || ""),
        String(l.chapter || ""), String(l.chapterName || ""), String(l.stage || ""), String(l.stageName || ""),
        Number(l.correct) || 0, Number(l.total) || 0, Number(l.rate) || 0, l.cleared ? "クリア" : "未達",
        Number(l.seconds) || 0, String(l.weak || ""), String(l.hard || ""), String(l.fields || ""),
        String(l.app || body.app || ""), String(l.logId), now
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

/* 受講者の記録をまとめる */
function summarize_(name) {
  const sh = logSheet_();
  const last = sh.getLastRow();
  const out = { stages: {}, diag: null, hard: [] };
  if (last < 2) return out;
  const vals = sh.getRange(2, 1, last - 1, HEADER.length).getValues();
  const hardSet = new Set();
  vals.forEach(r => {
    if (String(r[col_("受講者名") - 1]) !== name) return;
    const stage = String(r[col_("ステージID") - 1]);
    const rate = Number(r[col_("正答率") - 1]) || 0;
    const cleared = String(r[col_("クリア") - 1]) === "クリア";
    const at = r[col_("送信日時") - 1];
    const atIso = at instanceof Date ? at.toISOString() : String(at);
    String(r[col_("難しかった問題") - 1] || "").split(";").filter(Boolean).forEach(x => hardSet.add(x));
    if (stage === "diag") {
      if (!out.diag || atIso > out.diag.at) {
        let fields = null; try { fields = JSON.parse(String(r[col_("分野別") - 1] || "null")); } catch (e) { }
        out.diag = { fields, at: atIso, correct: Number(r[col_("正答数") - 1]) || 0, total: Number(r[col_("問題数") - 1]) || 0 };
      }
      return;
    }
    const s = out.stages[stage] || { best: 0, cleared: false, attempts: 0, last: "" };
    s.best = Math.max(s.best, rate); s.cleared = s.cleared || cleared; s.attempts++; if (atIso > s.last) s.last = atIso;
    out.stages[stage] = s;
  });
  out.hard = [...hardSet];
  return out;
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.action === "ping") return json_({ ok: true });
  if (p.action === "setup") { setupDashboard(); return json_({ ok: true, setup: true }); }
  if (p.action === "restore" || p.action === "ack") {
    const name = String(p.name || "").trim(), pin = String(p.pin || "").trim();
    if (!name || !/^\d{4}$/.test(pin)) return json_({ error: "bad user" });
    const u = findUser_(name, pin, String(p.deviceId || ""), p.action === "restore");
    if (!u.ok) return json_({ error: "pin" });
    if (p.action === "ack") {
      const ids = String(p.ids || "").split(",").filter(Boolean);
      const seen = existingIds_(logSheet_());
      return json_({ received: ids.filter(id => seen.has(id)) });
    }
    const sum = summarize_(name);
    return json_({ ok: true, new: !!u.isNew, stages: sum.stages, diag: sum.diag, hard: sum.hard });
  }
  if (p.action === "count") {
    const sh = logSheet_(); const last = sh.getLastRow(); if (last < 2) return json_({ count: 0 });
    const vals = sh.getRange(2, col_("受講者名"), last - 1, 1).getValues().map(r => String(r[0]));
    return json_({ count: vals.filter(v => v === String(p.name || "")).length });
  }
  if (p.action === "cleanup_test") {
    let removed = 0;
    const sh = logSheet_(); const last = sh.getLastRow();
    if (last >= 2) {
      const vals = sh.getRange(2, col_("受講者名"), last - 1, 1).getValues();
      for (let i = vals.length - 1; i >= 0; i--) if (TEST_NAMES.includes(String(vals[i][0]))) { sh.deleteRow(i + 2); removed++; }
    }
    const us = userSheet_(); const ulast = us.getLastRow();
    if (ulast >= 2) {
      const vals = us.getRange(2, 1, ulast - 1, 1).getValues();
      for (let i = vals.length - 1; i >= 0; i--) if (TEST_NAMES.includes(String(vals[i][0]))) { us.deleteRow(i + 2); removed++; }
    }
    return json_({ removed });
  }
  return json_({ ok: true, usage: "POST progress / GET ?action=restore&name&pin" });
}

/* 初回・列を変えたときに実行：ダッシュボードを作り直す */
function setupDashboard() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  logSheet_(); userSheet_();
  const def = ss.getSheetByName("シート1") || ss.getSheetByName("Sheet1");
  if (def && def.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(def);
  let d = ss.getSheetByName("ダッシュボード");
  if (!d) d = ss.insertSheet("ダッシュボード");
  d.clear();
  d.getRange("A1").setValue("受講者ごとの到達（クリア済みステージ数・最終学習日）");
  d.getRange("A3").setFormula('=IFERROR(QUERY(\'進捗ログ\'!A2:R, "select B, count(F), max(A) where K = \'クリア\' and F <> \'diag\' group by B label B \'受講者\', count(F) \'クリア記録数\', max(A) \'最終学習\'", 0), "まだ記録がありません")');
  d.getRange("C3:C12").setNumberFormat("yyyy/mm/dd hh:mm");
  d.getRange("A14").setValue("受講者×章（クリア済みのステージ数）");
  d.getRange("A16").setFormula('=IFERROR(QUERY(\'進捗ログ\'!A2:R, "select B, count(F) where K = \'クリア\' and F <> \'diag\' group by B pivot E label B \'受講者\'", 0), "")');
  d.getRange("A30").setValue("実力診断の結果（最新の正答率）");
  d.getRange("A32").setFormula('=IFERROR(QUERY(\'進捗ログ\'!A2:R, "select B, max(J), max(A) where F = \'diag\' group by B label B \'受講者\', max(J) \'正答率\', max(A) \'受けた日\'", 0), "")');
  d.getRange("B32:B45").setNumberFormat("0%"); d.getRange("C32:C45").setNumberFormat("yyyy/mm/dd hh:mm");
  d.getRange("E1").setValue("「むずかしかった」が多い問題（問題ID・回数）");
  d.getRange("E3").setFormula('=IFERROR(QUERY(FLATTEN(ARRAYFORMULA(IF(\'進捗ログ\'!N2:N="", "", SPLIT(\'進捗ログ\'!N2:N, ";")))), "select Col1, count(Col1) where Col1 <> \'\' group by Col1 order by count(Col1) desc label Col1 \'問題ID\', count(Col1) \'回数\'", 0), "")');
  d.getRange("E30").setValue("ステージ別の平均正答率（全員・全回）");
  d.getRange("E32").setFormula('=IFERROR(QUERY(\'進捗ログ\'!A2:R, "select F, G, avg(J), count(J) where F <> \'diag\' group by F, G order by avg(J) label F \'ステージ\', G \'名前\', avg(J) \'平均正答率\', count(J) \'回数\'", 0), "")');
  d.getRange("G32:G80").setNumberFormat("0%");
  let r = ss.getSheetByName("README");
  if (!r) r = ss.insertSheet("README", 0);
  r.clear();
  r.getRange("A1:A9").setValues([["記帳道場 — 進捗の記録"], ["アプリ：https://livemissionjapan.github.io/mf-kicho-dojo/"], ["「進捗ログ」はアプリがステージ（実力診断を含む）を終えるたびに1行追記します（手で編集しない）。"], ["「受講者」は名前と合言葉（ハッシュ）。本人が別の端末で同じ名前＋合言葉を入れると進捗が戻ります。合言葉を忘れたら、この行を消せば次回は新規登録になります（進捗ログは残ります）。"], ["「ダッシュボード」は進捗ログの集計です。"], ["同じ logId の行は二重に入りません（再送に強い）。"], ["ソース：lmj/30_開発/学習/mf-kicho-dojo/gas/Code.js（clasp で同期）"], [""], ["進捗ログの列：送信日時／受講者名／端末ID／章ID／章名／ステージID／ステージ名／正答数／問題数／正答率／クリア／所要秒／弱い分野／難しかった問題／分野別（JSON）／アプリ版／logId／受信日時"]]);
}
