/* 進捗の保存（localStorage・版キー付き）と送信キュー */
window.Store = (function () {
  const KEY = "kicho-dojo:v1";
  const empty = () => ({
    version: 1,
    name: "",
    deviceId: "",
    stages: {},     // stageId -> {best:0.8, attempts:2, cleared:true, last:"ISO", weak:["rules.md C4"]}
    queue: [],      // 未送信の進捗ログ
    createdAt: new Date().toISOString()
  });
  let state = null;
  function load() {
    if (state) return state;
    try {
      const raw = localStorage.getItem(KEY);
      state = raw ? JSON.parse(raw) : empty();
      if (!state || state.version !== 1) state = empty();
    } catch (e) { state = empty(); }
    if (!state.deviceId) { state.deviceId = uuid(); save(); }
    return state;
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* private window など */ }
  }
  function uuid() {
    if (crypto && crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }
  function setName(name) { load().name = name.trim(); save(); }
  function stage(id) { return load().stages[id] || null; }
  function recordStage(id, rec) {
    const s = load();
    const prev = s.stages[id] || { best: 0, attempts: 0, cleared: false, weak: [] };
    s.stages[id] = {
      best: Math.max(prev.best, rec.rate),
      attempts: prev.attempts + 1,
      cleared: prev.cleared || rec.cleared,
      last: new Date().toISOString(),
      weak: rec.weak
    };
    s.queue.push(rec.log);
    save();
  }
  function reset() { state = empty(); state.deviceId = uuid(); save(); }
  function takeQueue() { return load().queue.slice(); }
  function dropFromQueue(ids) { const s = load(); s.queue = s.queue.filter(l => !ids.includes(l.logId)); save(); }
  return { load, save, setName, stage, recordStage, reset, takeQueue, dropFromQueue, uuid };
})();
