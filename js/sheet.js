/* Google スプレッドシートへの送信（GAS Webアプリ経由）
 * GAS_URL は gas/Code.js を clasp deploy した「ウェブアプリ」の URL。空なら送信しない（ローカル確認用）。
 * fetch は mode:"no-cors" で送る（応答は読めない）。送信できたかは判定できないため、
 * 送信後に GET（doGet）で受領済み logId を問い合わせてキューから落とす。
 */
window.Sheet = (function () {
  const GAS_URL = window.GAS_URL || "";
  const APP_VERSION = (window.CURRICULUM && window.CURRICULUM.version) || "dev";

  async function flush() {
    if (!GAS_URL) return { sent: 0, skipped: true };
    const queue = Store.takeQueue();
    if (!queue.length) return { sent: 0 };
    const s = Store.load();
    const body = JSON.stringify({ kind: "progress", name: s.name, deviceId: s.deviceId, app: APP_VERSION, logs: queue });
    try {
      await fetch(GAS_URL, { method: "POST", mode: "no-cors", body });
    } catch (e) { return { sent: 0, error: String(e) }; }
    // 受領確認（JSONP 不要：doGet は CORS を許す text/plain JSON を返す）
    try {
      const ids = queue.map(l => l.logId).join(",");
      const r = await fetch(GAS_URL + "?action=ack&deviceId=" + encodeURIComponent(s.deviceId) + "&ids=" + encodeURIComponent(ids), { method: "GET" });
      const j = await r.json();
      if (j && Array.isArray(j.received)) {
        Store.dropFromQueue(j.received);
        return { sent: j.received.length, pending: queue.length - j.received.length };
      }
    } catch (e) { /* 受領確認できない場合は次回再送 */ }
    return { sent: 0, pending: queue.length, unconfirmed: true };
  }

  return { flush, enabled: !!GAS_URL };
})();
