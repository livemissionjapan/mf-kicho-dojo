/* 記帳道場 v2 — 進捗の記録と復元（GAS Webアプリ）
 * デプロイ：ウェブアプリ／実行ユーザー＝自分／アクセス＝全員（匿名）
 *
 * POST {kind:"progress", name, pin, deviceId, app, logs:[{logId, at, chapter, chapterName, stage, stageName, correct, total, rate, cleared, seconds, weak, hard, fields}]}
 *   → 受講者（名前＋合言葉）を確かめてから「進捗ログ」に追記。合言葉が違えば捨てる。logId の重複は捨てる
 * GET ?action=restore&name=…&pin=…  → {ok, new?, stages:{stageId:{best,cleared,attempts,last}}, diag:{fields,at}|null, hard:[qid…]}  合言葉が違えば {error:"pin"}
 * GET ?action=ack&name=…&pin=…&ids=a,b  → {received:[…]}
 * GET ?action=ping / setup / count&name=… / cleanup_test
 * POST {kind:"admin", op, token, …}  → 管理者ページ（js/admin.js）。応答はJSON（text/plain で送ると読める）
 *   op: login / logout / changePass / data / staffAdd / staffPass / staffStatus / staffMemo / staffDelete / adminAdd / adminReset / adminDelete / setSetting
 *   管理者は「管理者」シート（ID・パスワードのハッシュ＋ソルト）。最初の管理者 admin の初期パスワードはシートにだけ書かれ、初回ログインで変更すると消える
 */
const SHEET_LOG = "進捗ログ";
const SHEET_USERS = "受講者";
const HEADER = ["送信日時", "受講者名", "端末ID", "章ID", "章名", "ステージID", "ステージ名", "正答数", "問題数", "正答率", "クリア", "所要秒", "弱い分野", "難しかった問題", "分野別", "アプリ版", "logId", "受信日時"];
const USER_HEADER = ["受講者名（ID）", "合言葉ハッシュ", "初回", "最終", "端末ID", "状態", "登録元", "メモ", "表示名"];
/* ID はメールアドレス（2026-11-07 石島さん決定）。@ を含む ID は小文字にそろえる。以前からの名前の ID はそのまま */
const normId_ = s => { s = String(s || "").trim(); return s.indexOf("@") >= 0 ? s.toLowerCase() : s; };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SHEET_ADMIN = "管理者";
const ADMIN_HEADER = ["ID", "パスワードハッシュ", "ソルト", "初期パスワード（初回変更で消えます）", "作成", "最終ログイン", "要変更"];
const PIN_RE = /^.{4,32}$/;
const TEST_NAMES = ["接続テスト", "動作確認テスト"];

function col_(name) { return HEADER.indexOf(name) + 1; }
function json_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
function hash_(name, pin) {
  const raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, normId_(name) + "|" + String(pin).trim(), Utilities.Charset.UTF_8);
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
  else if (sh.getLastColumn() < USER_HEADER.length) sh.getRange(1, 1, 1, USER_HEADER.length).setValues([USER_HEADER]); // 2026-11 列追加（状態・登録元・メモ）
  return sh;
}

/* 受講者を探す／登録する。戻り：{row, ok, reason} reason = pin（合言葉違い）/ stopped（停止中）/ unknown（未登録で自己登録が止まっている） */
function selfRegister_() { return PropertiesService.getScriptProperties().getProperty("SELF_REGISTER") === "1"; } // 既定は「管理者が発行した人だけ」
function findUser_(name, pin, deviceId, register) {
  const sh = userSheet_();
  const last = sh.getLastRow();
  const h = hash_(name, pin);
  if (last >= 2) {
    const vals = sh.getRange(2, 1, last - 1, USER_HEADER.length).getValues();
    for (let i = 0; i < vals.length; i++) {
      if (normId_(vals[i][0]) === normId_(name)) {
        if (String(vals[i][1]) !== h) return { ok: false, reason: "pin" };
        if (String(vals[i][5]) === "停止") return { ok: false, reason: "stopped" };
        const row = i + 2;
        sh.getRange(row, 4).setValue(new Date());
        if (deviceId) {
          const devs = String(vals[i][4] || "").split(";").filter(Boolean);
          if (!devs.includes(deviceId)) { devs.push(deviceId); sh.getRange(row, 5).setValue(devs.join(";")); }
        }
        return { ok: true, row, display: String(vals[i][8] || "") };
      }
    }
  }
  if (!selfRegister_()) return { ok: false, reason: "unknown" };
  if (!register) return { ok: true, row: 0, isNew: true };
  sh.appendRow([normId_(name), h, new Date(), new Date(), deviceId || "", "有効", "本人", "", ""]);
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
  let peek = null; try { peek = JSON.parse(e.postData.contents); } catch (err) { }
  if (peek && peek.kind === "admin") return json_(adminApi_(peek));
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.kind !== "progress" || !Array.isArray(body.logs)) return json_({ status: "ignored" });
    const name = normId_(body.name), pin = String(body.pin || "").trim();
    if (!name || !PIN_RE.test(pin)) return json_({ status: "bad user" });
    const u = findUser_(name, pin, String(body.deviceId || ""), true);
    if (!u.ok) return json_({ status: u.reason });
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
  if (p.action === "setup") { const mig = setupDashboard(); return json_({ ok: true, setup: true, migrated: mig }); }
  if (p.action === "restore" || p.action === "ack") {
    const name = normId_(p.name), pin = String(p.pin || "").trim();
    if (!name || !PIN_RE.test(pin)) return json_({ error: "bad user" });
    const u = findUser_(name, pin, String(p.deviceId || ""), p.action === "restore");
    if (!u.ok) return json_({ error: u.reason });
    if (p.action === "ack") {
      const ids = String(p.ids || "").split(",").filter(Boolean);
      const seen = existingIds_(logSheet_());
      return json_({ received: ids.filter(id => seen.has(id)) });
    }
    const sum = summarize_(name);
    return json_({ ok: true, new: !!u.isNew, display: u.display || "", stages: sum.stages, diag: sum.diag, hard: sum.hard });
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

/* 列の並びが古い行を新しい並びに移す（2026-10-19：16列→18列）。v1（2026-10-15.x）の行は v2 にステージがないので外す。logId の重複も消す */
function migrateLog_() {
  const sh = logSheet_();
  const last = sh.getLastRow(); if (last < 1) return { migrated: 0 };
  const width = Math.max(sh.getLastColumn(), HEADER.length);
  const head = sh.getRange(1, 1, 1, width).getValues()[0].map(String);
  const oldHeader = ["送信日時", "受講者名", "端末ID", "章ID", "章名", "ステージID", "ステージ名", "正答数", "問題数", "正答率", "クリア", "所要秒", "弱い出典", "アプリ版", "logId", "受信日時"];
  const isOldHead = head.slice(0, 16).join("|") === oldHeader.join("|");
  const isNewHead = head.slice(0, HEADER.length).join("|") === HEADER.join("|");
  if (isNewHead) return { migrated: 0 };
  if (!isOldHead) return { migrated: 0, note: "unknown header" };
  const rows = last >= 2 ? sh.getRange(2, 1, last - 1, width).getValues() : [];
  const out = []; const seen = new Set(); let dropped = 0;
  rows.forEach(r => {
    let n;
    if (String(r[16] || "")) { // 新しい並びで書かれた行（Q列に logId がある）
      n = r.slice(0, 18);
    } else { // 古い並び：弱い出典のあとに「難しかった問題」「分野別」を挟む
      n = r.slice(0, 13).concat(["", ""], r.slice(13, 16));
    }
    const app = String(n[15] || ""), id = String(n[16] || "");
    if (/^2026-10-15/.test(app)) { dropped++; return; }
    if (!id || seen.has(id)) { dropped++; return; }
    seen.add(id); out.push(n);
  });
  sh.clear();
  sh.getRange(1, 1, 1, HEADER.length).setValues([HEADER]);
  sh.setFrozenRows(1);
  sh.getRange("A:A").setNumberFormat("yyyy/mm/dd hh:mm"); sh.getRange("R:R").setNumberFormat("yyyy/mm/dd hh:mm"); sh.getRange("J:J").setNumberFormat("0%");
  if (out.length) sh.getRange(2, 1, out.length, HEADER.length).setValues(out);
  return { migrated: out.length, dropped };
}

/* 初回・列を変えたときに実行：ダッシュボードを作り直す */
function setupDashboard() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  logSheet_(); userSheet_(); adminSheet_();
  const mig = migrateLog_();
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
  d.getRange("E20").setValue("記帳代行 独り立ち（卒業試験 90%以上）");
  d.getRange("E22").setFormula('=IFERROR(QUERY(\'進捗ログ\'!A2:R, "select B, max(J), max(A) where F = \'exam\' and K = \'クリア\' group by B label B \'受講者\', max(J) \'正答率\', max(A) \'合格日\'", 0), "まだいません")');
  d.getRange("F22:F29").setNumberFormat("0%"); d.getRange("G22:G29").setNumberFormat("yyyy/mm/dd hh:mm");
  d.getRange("E30").setValue("ステージ別の平均正答率（全員・全回）");
  d.getRange("E32").setFormula('=IFERROR(QUERY(\'進捗ログ\'!A2:R, "select F, G, avg(J), count(J) where F <> \'diag\' group by F, G order by avg(J) label F \'ステージ\', G \'名前\', avg(J) \'平均正答率\', count(J) \'回数\'", 0), "")');
  d.getRange("G32:G80").setNumberFormat("0%");
  let r = ss.getSheetByName("README");
  if (!r) r = ss.insertSheet("README", 0);
  r.clear();
  const __ret = mig;
  r.getRange("A1:A9").setValues([["記帳道場 — 進捗の記録"], ["アプリ：https://livemissionjapan.github.io/mf-kicho-dojo/"], ["「進捗ログ」はアプリがステージ（実力診断を含む）を終えるたびに1行追記します（手で編集しない）。"], ["「受講者」は名前と合言葉（ハッシュ）。本人が別の端末で同じ名前＋合言葉を入れると進捗が戻ります。合言葉を忘れたら、この行を消せば次回は新規登録になります（進捗ログは残ります）。"], ["「ダッシュボード」は進捗ログの集計です。"], ["同じ logId の行は二重に入りません（再送に強い）。"], ["ソース：lmj/30_開発/学習/mf-kicho-dojo/gas/Code.js（clasp で同期）"], ["「管理者」は管理者ページ（アプリの #admin）のID・パスワード（ハッシュ）。最初の admin の初期パスワードはD列にだけあり、初回ログインで変更すると消えます。"], ["進捗ログの列：送信日時／受講者名／端末ID／章ID／章名／ステージID／ステージ名／正答数／問題数／正答率／クリア／所要秒／弱い分野／難しかった問題／分野別（JSON）／アプリ版／logId／受信日時"]]);
  return __ret;
}

/* ===================== 管理者ページ（2026-11） ===================== */
function adminSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_ADMIN);
  if (!sh) sh = ss.insertSheet(SHEET_ADMIN);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, ADMIN_HEADER.length).setValues([ADMIN_HEADER]); sh.setFrozenRows(1);
    sh.getRange("E:F").setNumberFormat("yyyy/mm/dd hh:mm");
  }
  if (sh.getLastRow() < 2) { // 最初の管理者。初期パスワードはこのシートにだけ書く（APIでは返さない）
    const temp = randomPass_(10), salt = Utilities.getUuid();
    sh.appendRow(["admin", passHash_(temp, salt), salt, temp, new Date(), "", true]);
  }
  return sh;
}
function randomPass_(n) {
  const cs = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let out = "";
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Date.now());
  for (let i = 0; i < n; i++) out += cs[(bytes[i] + 256) % cs.length];
  return out;
}
function passHash_(pass, salt) {
  let h = String(salt) + "|" + String(pass);
  for (let i = 0; i < 500; i++) h = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h + "|" + salt, Utilities.Charset.UTF_8));
  return h;
}
function admins_() {
  const sh = adminSheet_(); const last = sh.getLastRow();
  return sh.getRange(2, 1, last - 1, ADMIN_HEADER.length).getValues().map((r, i) => ({ row: i + 2, id: String(r[0]), hash: String(r[1]), salt: String(r[2]), created: r[4], lastLogin: r[5], mustChange: r[6] === true || String(r[6]).toUpperCase() === "TRUE" }));
}
const iso_ = d => d instanceof Date ? d.toISOString() : String(d || "");

function adminApi_(b) {
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try { return adminOp_(b); } catch (err) { return { error: "server", message: String(err) }; } finally { lock.releaseLock(); }
}
function adminOp_(b) {
  const cache = CacheService.getScriptCache();
  const op = String(b.op || "");
  if (op === "login") {
    const id = String(b.id || "").trim(), pass = String(b.pass || "");
    const failKey = "admfail:" + id, fails = Number(cache.get(failKey) || 0);
    if (fails >= 10) return { error: "locked" };
    const a = admins_().find(x => x.id === id);
    if (!a || passHash_(pass, a.salt) !== a.hash) { cache.put(failKey, String(fails + 1), 900); return { error: "login" }; }
    cache.remove(failKey);
    adminSheet_().getRange(a.row, 6).setValue(new Date());
    const token = Utilities.getUuid() + Utilities.getUuid();
    cache.put("adm:" + token, id, 21600);
    return { ok: true, token, id, mustChange: a.mustChange };
  }
  const me = b.token ? cache.get("adm:" + String(b.token)) : null;
  if (!me) return { error: "auth" };
  const meRec = admins_().find(x => x.id === me);
  if (!meRec) return { error: "auth" };
  if (op === "logout") { cache.remove("adm:" + b.token); return { ok: true }; }
  if (op === "changePass") {
    if (passHash_(String(b.oldPass || ""), meRec.salt) !== meRec.hash) return { error: "oldpass" };
    const np = String(b.newPass || ""); if (np.length < 8) return { error: "short" };
    const salt = Utilities.getUuid();
    adminSheet_().getRange(meRec.row, 2, 1, 6).setValues([[passHash_(np, salt), salt, "", meRec.created, new Date(), false]]);
    return { ok: true };
  }
  if (meRec.mustChange) return { error: "mustChange" };

  const us = userSheet_();
  const users = () => { const l = us.getLastRow(); return l < 2 ? [] : us.getRange(2, 1, l - 1, USER_HEADER.length).getValues().map((r, i) => ({ row: i + 2, name: String(r[0]), first: iso_(r[2]), last: iso_(r[3]), devices: String(r[4] || "").split(";").filter(Boolean).length, status: String(r[5] || "有効"), source: String(r[6] || "本人"), memo: String(r[7] || ""), display: String(r[8] || "") })); };
  const findU = n => users().find(u => normId_(u.name) === normId_(n));
  const checkPin = p => PIN_RE.test(String(p || "").trim());

  if (op === "data") {
    const sh = logSheet_(); const last = sh.getLastRow();
    const logs = last < 2 ? [] : sh.getRange(2, 1, last - 1, 16).getValues().map(r => [iso_(r[0]), String(r[1]), String(r[3]), String(r[4]), String(r[5]), String(r[6]), Number(r[7]) || 0, Number(r[8]) || 0, Number(r[9]) || 0, String(r[10]) === "クリア", Number(r[11]) || 0, String(r[12] || ""), String(r[13] || ""), String(r[14] || ""), String(r[15] || "")]);
    return { ok: true, me, users: users().map(u => { delete u.row; return u; }), logs, admins: admins_().map(a => ({ id: a.id, created: iso_(a.created), lastLogin: iso_(a.lastLogin), mustChange: a.mustChange })), settings: { selfRegister: selfRegister_() }, sheetUrl: SpreadsheetApp.getActiveSpreadsheet().getUrl() };
  }
  if (op === "staffAdd") {
    const name = normId_(b.name);
    if (!EMAIL_RE.test(name)) return { error: "email" }; if (!checkPin(b.pass)) return { error: "pin" };
    if (findU(name)) return { error: "exists" };
    us.appendRow([name, hash_(name, String(b.pass).trim()), new Date(), "", "", "有効", "管理者:" + me, String(b.memo || ""), String(b.display || "").trim()]);
    return { ok: true };
  }
  if (op === "staffPass") {
    const u = findU(b.name); if (!u) return { error: "notfound" }; if (!checkPin(b.pass)) return { error: "pin" };
    us.getRange(u.row, 2).setValue(hash_(u.name, String(b.pass).trim())); return { ok: true };
  }
  if (op === "staffStatus") {
    const u = findU(b.name); if (!u) return { error: "notfound" };
    us.getRange(u.row, 6).setValue(b.status === "停止" ? "停止" : "有効"); return { ok: true };
  }
  if (op === "staffMemo") {
    const u = findU(b.name); if (!u) return { error: "notfound" };
    us.getRange(u.row, 8).setValue(String(b.memo || ""));
    if (b.display != null) us.getRange(u.row, 9).setValue(String(b.display).trim());
    return { ok: true };
  }
  if (op === "staffDelete") { // 受講者の行だけ消す。進捗ログは残る（同じ名前で登録し直せば記録は戻る）
    const u = findU(b.name); if (!u) return { error: "notfound" };
    us.deleteRow(u.row); return { ok: true };
  }
  if (op === "adminAdd") {
    const id = String(b.id || "").trim(); if (!/^[A-Za-z0-9_.@-]{3,40}$/.test(id)) return { error: "id" };
    if (String(b.pass || "").length < 8) return { error: "short" };
    if (admins_().some(a => a.id === id)) return { error: "exists" };
    const salt = Utilities.getUuid();
    adminSheet_().appendRow([id, passHash_(String(b.pass), salt), salt, "", new Date(), "", true]);
    return { ok: true };
  }
  if (op === "adminReset") {
    const a = admins_().find(x => x.id === String(b.id || "")); if (!a) return { error: "notfound" };
    if (String(b.pass || "").length < 8) return { error: "short" };
    const salt = Utilities.getUuid();
    adminSheet_().getRange(a.row, 2, 1, 3).setValues([[passHash_(String(b.pass), salt), salt, ""]]);
    adminSheet_().getRange(a.row, 7).setValue(a.id !== me);
    return { ok: true };
  }
  if (op === "adminDelete") {
    const list = admins_(); const a = list.find(x => x.id === String(b.id || "")); if (!a) return { error: "notfound" };
    if (a.id === me) return { error: "self" }; if (list.length <= 1) return { error: "last" };
    adminSheet_().deleteRow(a.row); return { ok: true };
  }
  if (op === "setSetting") {
    PropertiesService.getScriptProperties().setProperty("SELF_REGISTER", b.selfRegister ? "1" : "0");
    return { ok: true, settings: { selfRegister: selfRegister_() } };
  }
  return { error: "op" };
}
