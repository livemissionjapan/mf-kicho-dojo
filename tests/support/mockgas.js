/* テスト用：GAS の実行環境をまねて gas/Code.js を動かし、/exec と静的ファイルを配る。
 * start() → { url, tempPass, props, sheets, close }。index.html の GAS_URL はこのサーバーの /exec に差し替える */
const fs = require('fs'), vm = require('vm'), http = require('http'), crypto = require('crypto'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
function start() { return new Promise(resolve => {
const sheets = {};
function mkSheet(name) {
  let data = [];
  const width = () => Math.max(0, ...data.map(r => r.length));
  const pad = (r, n) => { while (data.length < r) data.push([]); };
  const sh = {
    getName: () => name,
    getLastRow: () => data.length, getLastColumn: () => width(),
    clear() { data = []; }, setFrozenRows() { }, appendRow(row) { data.push(row.slice()); },
    deleteRow(r) { data.splice(r - 1, 1); },
    getRange(r, c, nr, nc) {
      if (typeof r === 'string') return { setNumberFormat() { return this; }, setFormula() { return this; }, setValue() { return this; }, setValues() { return this; } };
      nr = nr || 1; nc = nc || 1;
      return {
        getValues() { const out = []; for (let i = 0; i < nr; i++) { const row = data[r - 1 + i] || []; const o = []; for (let j = 0; j < nc; j++) o.push(row[c - 1 + j] === undefined ? '' : row[c - 1 + j]); out.push(o); } return out; },
        setValues(v) { pad(r - 1 + nr); for (let i = 0; i < nr; i++) { const row = data[r - 1 + i]; for (let j = 0; j < nc; j++) row[c - 1 + j] = v[i][j]; } return this; },
        setValue(v) { pad(r); data[r - 1][c - 1] = v; return this; },
        setNumberFormat() { return this; }
      };
    }, _data: () => data
  };
  return sh;
}
const ss = { getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = mkSheet(n)), getSheets: () => Object.values(sheets), deleteSheet() { }, getUrl: () => 'https://docs.google.com/spreadsheets/d/MOCK' };
const cache = {}, props = {};
const ctx = vm.createContext({
  console, Date, JSON, Math, String, Number, Set, Object, Array, Boolean,
  SpreadsheetApp: { getActiveSpreadsheet: () => ss },
  Utilities: {
    DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
    computeDigest: (alg, s) => [...crypto.createHash('sha256').update(String(s), 'utf8').digest()].map(b => b > 127 ? b - 256 : b),
    base64Encode: arr => Buffer.from(arr.map(b => (b + 256) % 256)).toString('base64'),
    getUuid: () => crypto.randomUUID()
  },
  CacheService: { getScriptCache: () => ({ get: k => cache[k] || null, put: (k, v) => { cache[k] = v; }, remove: k => { delete cache[k]; } }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] == null ? null : props[k], setProperty: (k, v) => { props[k] = v; } }) },
  LockService: { getScriptLock: () => ({ waitLock() { }, releaseLock() { } }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => ({ t, setMimeType() { return this; } }) }
});
vm.runInContext(fs.readFileSync(path.join(ROOT, 'gas/Code.js'), 'utf8'), ctx);
ctx.setupDashboard();
// print the initial admin temp pass (as the owner would see in the sheet)
const tempPass = String(sheets['管理者']._data()[1][3]); let PORT = 0;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/exec') {
    const send = o => { res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(o.t); };
    if (req.method === 'POST') { let b = ''; req.on('data', d => b += d); req.on('end', () => send(ctx.doPost({ postData: { contents: b } }))); return; }
    return send(ctx.doGet({ parameter: Object.fromEntries(u.searchParams) }));
  }
  let f = path.join(ROOT, decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname));
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  let body = fs.readFileSync(f);
  if (f.endsWith('index.html')) body = body.toString().replace(/window\.GAS_URL = "[^"]*"/, `window.GAS_URL = "http://localhost:${PORT}/exec"`);
  res.writeHead(200, { 'Content-Type': (types[path.extname(f)] || 'application/octet-stream') + '; charset=utf-8' }); res.end(body);
});
server.listen(0, '127.0.0.1', () => { PORT = server.address().port;
  resolve({ url: `http://localhost:${PORT}/`, tempPass, props, sheets, ctx, close: () => new Promise(r => server.close(r)) }); });
}); }
module.exports = { start };
if (require.main === module) start().then(s => console.log(s.url, 'TEMP_ADMIN_PASS=' + s.tempPass));
