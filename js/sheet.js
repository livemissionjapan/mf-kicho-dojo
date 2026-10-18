/* Google スプレッドシートとのやり取り（GAS Webアプリ経由）
 * GAS_URL は gas/Code.js を clasp deploy した「ウェブアプリ」の URL。空なら通信しない（ローカル確認用）。
 * POST は mode:"no-cors"（応答は読めない）。送れたかは GET ?action=ack で受領済み logId を聞いてキューから落とす。
 */
window.Sheet = (function () {
  const GAS_URL = window.GAS_URL || "";
  const APP_VERSION = (window.CURRICULUM && window.CURRICULUM.version) || "dev";
  const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
  const q = o => Object.entries(o).map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(v)).join("&");

  /* 名前＋合言葉で本人の記録を取りに行く。{ok, new, stages, diag, hard} / {error:"pin"} / {error:"offline"} */
  async function restore(name, pin, deviceId) {
    if (!GAS_URL) return { ok: true, new: true, offline: true };
    try {
      const r = await withTimeout(fetch(GAS_URL + "?" + q({ action: "restore", name, pin, deviceId })), 15000);
      return await r.json();
    } catch (e) { return { error: "offline" }; }
  }

  async function flush() {
    if (!GAS_URL) return { sent: 0, skipped: true };
    const queue = Store.takeQueue();
    if (!queue.length) return { sent: 0 };
    const s = Store.load();
    if (!s.name || !s.pin) return { sent: 0, pending: queue.length };
    const body = JSON.stringify({ kind: "progress", name: s.name, pin: s.pin, deviceId: s.deviceId, app: APP_VERSION, logs: queue });
    try { await withTimeout(fetch(GAS_URL, { method: "POST", mode: "no-cors", body }), 20000); } catch (e) { return { sent: 0, pending: queue.length, error: String(e) }; }
    try {
      const r = await withTimeout(fetch(GAS_URL + "?" + q({ action: "ack", name: s.name, pin: s.pin, ids: queue.map(l => l.logId).join(",") })), 15000);
      const j = await r.json();
      if (j && Array.isArray(j.received)) { Store.dropFromQueue(j.received); return { sent: j.received.length, pending: queue.length - j.received.length }; }
      if (j && j.error === "pin") return { sent: 0, pending: queue.length, pin: true };
    } catch (e) { }
    return { sent: 0, pending: queue.length, unconfirmed: true };
  }

  return { restore, flush, enabled: !!GAS_URL };
})();
