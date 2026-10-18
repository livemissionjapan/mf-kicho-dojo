/* 進捗の保存（localStorage・版キー付き）と送信キュー
 * v2：名前＋合言葉で本人を識別し、サーバー（スプレッドシート）から復元できる
 */
window.Store = (function () {
  const KEY = "kicho-dojo:v2";
  const empty = () => ({
    version: 2,
    name: "",
    pin: "",
    deviceId: "",
    stages: {},     // stageId -> {best, attempts, cleared, last, weak[]}
    diag: null,     // {fields:{f1:{c,t},…}, correct, total, at}
    hard: [],       // むずかしかった問題の id
    queue: [],      // 未送信の進捗ログ
    createdAt: new Date().toISOString()
  });
  let state = null;
  function load() {
    if (state) return state;
    try {
      const raw = localStorage.getItem(KEY);
      state = raw ? JSON.parse(raw) : empty();
      if (!state || state.version !== 2) state = empty();
    } catch (e) { state = empty(); }
    if (!state.deviceId) { state.deviceId = uuid(); save(); }
    return state;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { } }
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16); });
  }
  function setUser(name, pin) {
    const s = load();
    if (s.name && (s.name !== name.trim() || s.pin !== pin)) { // 別の人に切り替え：この端末の記録は初期化（未送信分は捨てない）
      const q = s.queue; state = empty(); state.deviceId = s.deviceId; state.queue = q;
    }
    state.name = name.trim(); state.pin = pin; save();
  }
  function stage(id) { return load().stages[id] || null; }
  function recordStage(id, rec) {
    const s = load();
    const prev = s.stages[id] || { best: 0, attempts: 0, cleared: false, weak: [] };
    s.stages[id] = { best: Math.max(prev.best, rec.rate), attempts: prev.attempts + 1, cleared: prev.cleared || rec.cleared, last: new Date().toISOString(), weak: rec.weak };
    s.queue.push(rec.log); save();
  }
  function recordDiag(diag, log) { const s = load(); s.diag = diag; s.queue.push(log); save(); }
  function toggleHard(qid, on) { const s = load(); const i = s.hard.indexOf(qid); if (on && i < 0) s.hard.push(qid); if (!on && i >= 0) s.hard.splice(i, 1); save(); }
  function isHard(qid) { return load().hard.includes(qid); }
  /* サーバーの記録を取り込む（良い方を残す） */
  function merge(remote) {
    const s = load();
    Object.entries(remote.stages || {}).forEach(([id, r]) => {
      const l = s.stages[id] || { best: 0, attempts: 0, cleared: false, weak: [], last: "" };
      s.stages[id] = { best: Math.max(l.best, r.best || 0), attempts: Math.max(l.attempts, r.attempts || 0), cleared: l.cleared || !!r.cleared, last: (r.last || "") > (l.last || "") ? r.last : l.last, weak: l.weak || [] };
    });
    if (remote.diag && remote.diag.fields && (!s.diag || (remote.diag.at || "") > (s.diag.at || ""))) s.diag = remote.diag;
    (remote.hard || []).forEach(q => { if (!s.hard.includes(q)) s.hard.push(q); });
    save();
  }
  function reset() { state = empty(); state.deviceId = uuid(); save(); }
  function takeQueue() { return load().queue.slice(); }
  function dropFromQueue(ids) { const s = load(); s.queue = s.queue.filter(l => !ids.includes(l.logId)); save(); }
  return { load, save, setUser, stage, recordStage, recordDiag, toggleHard, isHard, merge, reset, takeQueue, dropFromQueue, uuid };
})();
