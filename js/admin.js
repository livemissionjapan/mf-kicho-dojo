/* 管理者ページ（#admin）— 受講者ごとの進捗・全体の進み具合・スタッフのID/パス・管理者アカウント
 * データは GAS（gas/Code.js の adminApi_）から。管理者のIDとパスワードはサーバー側で確かめ、
 * 通ったら6時間有効のトークンを sessionStorage に持つ。公開ページなので、データはログインするまで一切読まない。
 */
(function () {
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const TKEY = "kicho-dojo:admin-token";
  const C = window.CURRICULUM;
  const I = window.INSHOKU || null;
  const QALL = () => (window.KichoDojo && window.KichoDojo.Q) || [];

  /* ---------- 道（トラック）とステージ ---------- */
  const TRACKS = [{ id: "keiri", name: "経理の道", chapters: C.chapters }];
  if (I && I.chapters) TRACKS.push({ id: "inshoku", name: I.name || "飲食店の数字", chapters: I.chapters });
  const stageInfo = {};
  TRACKS.forEach(t => t.chapters.forEach(ch => ch.stages.forEach((st, i) => { stageInfo[st.id] = { track: t.id, chapter: ch, label: `${t.id === "keiri" ? "" : "飲"}${ch.no}-${i + 1} ${st.name}` }; })));
  const trackStages = tid => TRACKS.find(t => t.id === tid).chapters.flatMap(ch => ch.stages.map(s => s.id));

  let token = ""; try { token = sessionStorage.getItem(TKEY) || ""; } catch (e) { }
  let D = null, tab = "overview", person = null;

  async function api(op, payload) {
    if (!window.GAS_URL) return { error: "nourl" };
    try {
      const r = await fetch(window.GAS_URL, { method: "POST", body: JSON.stringify(Object.assign({ kind: "admin", op, token }, payload || {})) });
      const j = await r.json();
      if (j && j.error === "auth") { setToken(""); renderLogin("ログインの有効期限が切れました。もう一度入ってください"); }
      return j || { error: "empty" };
    } catch (e) { return { error: "offline" }; }
  }
  function setToken(t) { token = t; try { t ? sessionStorage.setItem(TKEY, t) : sessionStorage.removeItem(TKEY); } catch (e) { } }
  function show() {
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    $("#admin").classList.add("active"); window.scrollTo({ top: 0 });
    const c = $("#crumb"); if (c) { c.style.display = ""; c.innerHTML = '<span class="here">🔒 管理者ページ</span>'; }
  }
  const box = () => $("#admin-box");
  const ERR = { login: "IDかパスワードが違います", locked: "失敗が続いたため15分ロックしています", offline: "通信できませんでした", oldpass: "今のパスワードが違います", short: "パスワードは8文字以上にしてください", exists: "同じ名前（ID）がすでにあります", pin: "スタッフのパスは4〜32文字にしてください", name: "名前を入れてください", email: "IDはメールアドレスで入れてください", notfound: "見つかりません", self: "自分自身は削除できません", last: "最後の管理者は削除できません", id: "IDは半角英数字（3〜40文字）にしてください", nourl: "記録先（GAS）が設定されていません", server: "サーバーでエラーが起きました" };
  const err = j => ERR[j.error] || ("エラー：" + j.error);
  function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 2600); }

  /* ---------- ログイン ---------- */
  function renderLogin(msg) {
    show();
    box().innerHTML = `<div class="card adm-login">
      <h1>🔒 管理者ページ</h1>
      <p class="muted">スタッフの進捗と、ID・パスの管理。管理者のIDとパスワードで入ります。</p>
      <form id="adm-login">
        <label class="lbl" for="adm-id">管理者ID</label><input class="text" id="adm-id" autocomplete="username" required>
        <label class="lbl" for="adm-pass" style="margin-top:10px">パスワード</label><input class="text" id="adm-pass" type="password" autocomplete="current-password" required>
        <div class="adm-msg" id="adm-msg">${esc(msg || "")}</div>
        <button class="btn block" type="submit">入る</button>
      </form>
      <p class="muted" style="font-size:12px;margin-top:10px">最初の管理者は ID「admin」。初期パスワードは進捗スプレッドシートの「管理者」タブにだけ書かれています（初回ログインで変更すると消えます）。IDは「管理者」タブのA列を書き換えれば、メールアドレスにできます。</p>
      <button class="btn secondary" id="adm-back" type="button">← 記帳道場へ戻る</button></div>`;
    $("#adm-back").onclick = leave;
    $("#adm-login").onsubmit = async e => {
      e.preventDefault();
      $("#adm-msg").textContent = "確認しています…";
      const j = await api("login", { id: $("#adm-id").value.trim(), pass: $("#adm-pass").value });
      if (!j.ok) { $("#adm-msg").textContent = err(j); return; }
      setToken(j.token);
      if (j.mustChange) renderChangePass(true); else load();
    };
  }
  function renderChangePass(first) {
    show();
    box().innerHTML = `<div class="card adm-login"><h1>パスワードの変更</h1>
      <p class="muted">${first ? "初回ログインです。自分だけのパスワード（8文字以上）に変えてください。変えると、シートに書かれた初期パスワードは消えます。" : "8文字以上で決めてください。"}</p>
      <form id="adm-cp">
        <label class="lbl" for="cp-old">今のパスワード</label><input class="text" id="cp-old" type="password" autocomplete="current-password" required>
        <label class="lbl" for="cp-new" style="margin-top:10px">新しいパスワード（8文字以上）</label><input class="text" id="cp-new" type="password" autocomplete="new-password" minlength="8" required>
        <label class="lbl" for="cp-new2" style="margin-top:10px">もう一度</label><input class="text" id="cp-new2" type="password" autocomplete="new-password" minlength="8" required>
        <div class="adm-msg" id="cp-msg"></div>
        <button class="btn block" type="submit">変更する</button>
      </form>${first ? "" : '<button class="btn secondary" id="cp-cancel" type="button">やめる</button>'}</div>`;
    if (!first) $("#cp-cancel").onclick = () => render();
    $("#adm-cp").onsubmit = async e => {
      e.preventDefault();
      if ($("#cp-new").value !== $("#cp-new2").value) { $("#cp-msg").textContent = "新しいパスワードが一致しません"; return; }
      const j = await api("changePass", { oldPass: $("#cp-old").value, newPass: $("#cp-new").value });
      if (!j.ok) { $("#cp-msg").textContent = err(j); return; }
      toast("パスワードを変更しました"); load();
    };
  }
  async function logout() { await api("logout"); setToken(""); D = null; renderLogin("ログアウトしました"); }
  function leave() { if (location.hash === "#admin") history.replaceState(null, "", location.pathname + location.search); const s = window.Store && Store.load(); if (s && s.name && s.pin) window.Finance.renderTrack(); else { document.querySelectorAll(".view").forEach(v => v.classList.remove("active")); $("#name").classList.add("active"); $("#crumb").style.display = "none"; } }

  /* ---------- データの集計 ---------- */
  async function load() {
    show();
    box().innerHTML = '<div class="card"><p class="muted">データを読み込んでいます…</p></div>';
    const j = await api("data");
    if (j.error === "mustChange") return renderChangePass(true);
    if (!j.ok) { if (j.error !== "auth") box().innerHTML = `<div class="card"><p>${esc(err(j))}</p><button class="btn" id="adm-retry" type="button">もう一度</button></div>`; const b = $("#adm-retry"); if (b) b.onclick = load; return; }
    D = build(j); render();
  }
  function build(j) {
    const logs = j.logs.map(r => ({ at: r[0], name: r[1], chapter: r[2], chapterName: r[3], stage: r[4], stageName: r[5], correct: r[6], total: r[7], rate: r[8], cleared: r[9], seconds: r[10], weak: r[11], hard: r[12], fields: r[13], app: r[14] }));
    const people = {};
    const ensure = n => people[n] = people[n] || { name: n, user: null, logs: [], stages: {}, diag: null, exam: null, seconds: 0, first: "", last: "", hard: new Set() };
    j.users.forEach(u => { ensure(u.name).user = u; });
    logs.forEach(l => {
      const p = ensure(l.name); p.logs.push(l); p.seconds += l.seconds;
      if (!p.first || l.at < p.first) p.first = l.at; if (!p.last || l.at > p.last) p.last = l.at;
      l.hard.split(";").filter(Boolean).forEach(x => p.hard.add(x));
      if (l.stage === "diag") { if (!p.diag || l.at > p.diag.at) { let f = null; try { f = JSON.parse(l.fields || "null"); } catch (e) { } p.diag = { at: l.at, rate: l.rate, correct: l.correct, total: l.total, fields: f }; } return; }
      if (l.stage === "exam") { const e = p.exam || { best: 0, cleared: false, attempts: 0, last: "" }; e.best = Math.max(e.best, l.rate); e.cleared = e.cleared || l.cleared; e.attempts++; if (l.at > e.last) e.last = l.at; p.exam = e; return; }
      const s = p.stages[l.stage] || { best: 0, cleared: false, attempts: 0, last: "", seconds: 0 };
      s.best = Math.max(s.best, l.rate); s.cleared = s.cleared || l.cleared; s.attempts++; s.seconds += l.seconds; if (l.at > s.last) s.last = l.at;
      p.stages[l.stage] = s;
    });
    Object.values(people).forEach(p => {
      p.label = (p.user && p.user.display) || p.name;
      p.track = {}; TRACKS.forEach(t => { const ids = trackStages(t.id); const n = ids.filter(id => p.stages[id] && p.stages[id].cleared).length; p.track[t.id] = { cleared: n, total: ids.length, rate: ids.length ? n / ids.length : 0 }; });
      p.status = p.user ? p.user.status : "（未登録）";
      p.next = nextStage(p);
    });
    return Object.assign({}, j, { logs, people: Object.values(people).sort((a, b) => (b.last || "").localeCompare(a.last || "")) });
  }
  function nextStage(p) { for (const t of TRACKS) for (const ch of t.chapters) for (const st of ch.stages) if (!(p.stages[st.id] && p.stages[st.id].cleared) && p.stages[st.id]) return stageInfo[st.id].label + "（挑戦中）"; return ""; }

  /* ---------- 表示の部品 ---------- */
  const pct = x => Math.round((x || 0) * 100) + "%";
  const tone = x => x >= .8 ? "ok" : x >= .5 ? "warn" : "ng";
  const day = s => s ? s.slice(0, 10).replace(/-/g, "/") : "—";
  const ago = s => { if (!s) return "—"; const d = Math.floor((Date.now() - new Date(s).getTime()) / 864e5); return d <= 0 ? "今日" : d === 1 ? "昨日" : d + "日前"; };
  const mins = sec => { const m = Math.round(sec / 60); return m >= 60 ? `${Math.floor(m / 60)}時間${m % 60}分` : `${m}分`; };
  const bar = (x, label) => `<div class="adm-bar"><i class="${tone(x)}" style="width:${Math.round((x || 0) * 100)}%"></i><span>${esc(label != null ? label : pct(x))}</span></div>`;
  const qById = () => { const m = {}; QALL().forEach(q => m[q.id] = q); return m; };
  const fieldName = id => { const f = C.fields.find(x => x.id === id) || (I && (I.fields || []).find(x => x.id === id)); return f ? f.short || f.name : id; };

  function render() {
    if (!D) return load();
    show();
    const tabs = [["overview", "全体"], ["people", "人ごと"], ["stages", "ステージ"], ["staff", "スタッフのID・パス"], ["settings", "設定"]];
    box().innerHTML = `<div class="row adm-head"><h1 style="margin:0">🔒 管理者ダッシュボード</h1><span class="sp"></span><span class="muted" style="font-size:12px">${esc(D.me)} でログイン中</span><button class="d-btn" id="adm-reload" type="button">更新</button><button class="d-btn" id="adm-out" type="button">ログアウト</button><button class="d-btn" id="adm-leave" type="button">道場へ戻る</button></div>
      <div class="adm-tabs" role="tablist">${tabs.map(([k, v]) => `<button type="button" role="tab" class="${tab === k ? "on" : ""}" data-tab="${k}">${v}</button>`).join("")}</div>
      <div id="adm-body"></div>`;
    $("#adm-reload").onclick = load; $("#adm-out").onclick = logout; $("#adm-leave").onclick = leave;
    box().querySelectorAll("[data-tab]").forEach(b => b.onclick = () => { tab = b.dataset.tab; person = null; render(); });
    const body = $("#adm-body");
    ({ overview: renderOverview, people: renderPeople, stages: renderStages, staff: renderStaff, settings: renderSettings })[tab](body);
  }

  /* 全体 */
  function renderOverview(host) {
    const ps = D.people.filter(p => p.status !== "停止");
    const active7 = ps.filter(p => p.last && Date.now() - new Date(p.last) < 7 * 864e5).length;
    const totalSec = D.logs.reduce((s, l) => s + l.seconds, 0);
    const grads = ps.filter(p => p.exam && p.exam.cleared);
    const stale = ps.filter(p => p.user && (!p.last || Date.now() - new Date(p.last) > 14 * 864e5));
    // 日別の挑戦回数（30日）
    const days = []; for (let i = 29; i >= 0; i--) { const d = new Date(Date.now() - i * 864e5); days.push(d.toISOString().slice(0, 10)); }
    const cnt = {}; D.logs.forEach(l => { const k = (l.at || "").slice(0, 10); cnt[k] = (cnt[k] || 0) + 1; });
    const maxC = Math.max(1, ...days.map(d => cnt[d] || 0));
    const trackAvg = TRACKS.map(t => ({ t, avg: ps.length ? ps.reduce((s, p) => s + p.track[t.id].rate, 0) / ps.length : 0, started: ps.filter(p => p.track[t.id].cleared > 0 || trackStages(t.id).some(id => p.stages[id])).length }));
    // 分野ごとの診断平均
    const fsum = {}; ps.forEach(p => { if (p.diag && p.diag.fields) Object.entries(p.diag.fields).forEach(([k, v]) => { if (!v || !v.t) return; const f = fsum[k] = fsum[k] || { c: 0, t: 0 }; f.c += v.c; f.t += v.t; }); });
    // むずかしかった問題
    const hard = {}; D.logs.forEach(l => l.hard.split(";").filter(Boolean).forEach(q => hard[q] = (hard[q] || 0) + 1));
    const hardTop = Object.entries(hard).sort((a, b) => b[1] - a[1]).slice(0, 8); const qm = qById();
    // 難しいステージ
    const st = stageStats().filter(s => s.attempts >= 2).sort((a, b) => a.avg - b.avg).slice(0, 5);
    host.innerHTML = `
      <div class="adm-kpis">
        <div><b>${ps.filter(p => p.user).length}</b><span>受講者</span></div>
        <div><b>${active7}</b><span>7日以内に学習</span></div>
        <div><b>${D.logs.length}</b><span>挑戦回数</span></div>
        <div><b>${mins(totalSec)}</b><span>学習時間の合計</span></div>
        <div><b>${grads.length}</b><span>独り立ち（卒業）</span></div>
      </div>
      <div class="card"><h2>道ごとの平均進捗</h2>${trackAvg.map(x => `<div class="adm-line"><div class="adm-lbl">${esc(x.t.name)}<small>${x.started}人が着手</small></div>${bar(x.avg)}</div>`).join("")}</div>
      <div class="card"><h2>直近30日の挑戦回数</h2><div class="adm-spark" role="img" aria-label="直近30日の挑戦回数">${days.map(d => `<i style="height:${Math.round((cnt[d] || 0) / maxC * 100)}%" title="${d}：${cnt[d] || 0}回"></i>`).join("")}</div><div class="row muted" style="font-size:12px"><span>${day(days[0])}</span><span class="sp"></span><span>今日</span></div></div>
      ${stale.length ? `<div class="card adm-alert"><h2>⚠ 2週間以上止まっている人（${stale.length}人）</h2><div class="adm-chips">${stale.map(p => `<button type="button" class="chip" data-person="${esc(p.name)}">${esc(p.label)}<small>${ago(p.last)}</small></button>`).join("")}</div></div>` : ""}
      <div class="card"><h2>チーム全体の得意・苦手（実力診断の平均）</h2>${Object.keys(fsum).length ? C.fields.map(f => fsum[f.id] ? `<div class="adm-line"><div class="adm-lbl">${esc(f.name)}</div>${bar(fsum[f.id].c / fsum[f.id].t)}</div>` : "").join("") : '<p class="muted">まだ診断を受けた人がいません</p>'}</div>
      <div class="adm-grid2">
        <div class="card"><h2>つまずきやすいステージ</h2>${st.length ? st.map(s => `<div class="adm-line"><div class="adm-lbl">${esc(s.label)}<small>${s.attempts}回・${s.people}人</small></div>${bar(s.avg)}</div>`).join("") : '<p class="muted">データが少ないため、まだ出せません</p>'}</div>
        <div class="card"><h2>「むずかしかった」が多い問題</h2>${hardTop.length ? hardTop.map(([id, n]) => `<div class="adm-q"><b>${n}回</b><span>${esc(qm[id] ? qm[id].stem : id)}</span></div>`).join("") : '<p class="muted">まだありません</p>'}</div>
      </div>
      <div class="card"><h2>独り立ち（卒業試験 合格）</h2>${grads.length ? grads.map(p => `<span class="badge gold">${esc(p.label)} ${pct(p.exam.best)}</span>`).join(" ") : '<p class="muted">まだいません</p>'}</div>`;
    host.querySelectorAll("[data-person]").forEach(b => b.onclick = () => { tab = "people"; person = b.dataset.person; render(); });
  }

  /* 人ごと */
  function renderPeople(host) {
    if (person) return renderPerson(host, D.people.find(p => p.name === person));
    host.innerHTML = `<div class="card"><p class="muted" style="margin-top:0">名前を押すと、その人の章ごとの進み具合・診断・最近の挑戦が見られます。</p>
      <div class="adm-table"><table><thead><tr><th>名前</th>${TRACKS.map(t => `<th>${esc(t.name)}</th>`).join("")}<th>診断</th><th>卒業</th><th>学習時間</th><th>最終学習</th></tr></thead><tbody>
      ${D.people.map(p => `<tr class="${p.status === "停止" ? "off" : ""}"><td><button type="button" class="link" data-person="${esc(p.name)}">${esc(p.label)}</button>${p.label !== p.name ? `<br><small class="muted">${esc(p.name)}</small>` : ""}${p.status !== "有効" ? `<small class="muted"> ${esc(p.status)}</small>` : ""}</td>
        ${TRACKS.map(t => `<td>${bar(p.track[t.id].rate, `${p.track[t.id].cleared}/${p.track[t.id].total}`)}</td>`).join("")}
        <td>${p.diag ? `<span class="badge ${tone(p.diag.rate)}">${pct(p.diag.rate)}</span>` : "—"}</td>
        <td>${p.exam ? (p.exam.cleared ? '<span class="badge gold">合格</span>' : pct(p.exam.best)) : "—"}</td>
        <td>${mins(p.seconds)}</td><td class="${p.last && Date.now() - new Date(p.last) > 14 * 864e5 ? "stale" : ""}">${ago(p.last)}</td></tr>`).join("") || `<tr><td colspan="9" class="muted">まだ受講者がいません</td></tr>`}
      </tbody></table></div></div>`;
    host.querySelectorAll("[data-person]").forEach(b => b.onclick = () => { person = b.dataset.person; render(); });
  }
  function renderPerson(host, p) {
    if (!p) { person = null; return renderPeople(host); }
    const qm = qById();
    const weak = {}; p.logs.forEach(l => l.weak.split(";").filter(Boolean).forEach(w => weak[w] = (weak[w] || 0) + 1));
    const weakTop = Object.entries(weak).sort((a, b) => b[1] - a[1]).slice(0, 5);
    host.innerHTML = `<div class="row" style="margin:8px 0"><button class="btn secondary" id="pp-back" type="button">← 一覧</button></div>
      <div class="card"><div class="row" style="align-items:baseline"><h2 style="margin:0">${esc(p.label)}</h2><span class="muted">${esc(p.name)}・${esc(p.status)}${p.user && p.user.memo ? "・" + esc(p.user.memo) : ""}</span></div>
        <div class="adm-kpis small">
          ${TRACKS.map(t => `<div><b>${pct(p.track[t.id].rate)}</b><span>${esc(t.name)}（${p.track[t.id].cleared}/${p.track[t.id].total}）</span></div>`).join("")}
          <div><b>${p.logs.length}</b><span>挑戦回数</span></div><div><b>${mins(p.seconds)}</b><span>学習時間</span></div><div><b>${day(p.first)}</b><span>はじめた日</span></div><div><b>${ago(p.last)}</b><span>最終学習</span></div>
        </div>
        ${p.exam ? `<p>${p.exam.cleared ? '<span class="badge gold">🏅 記帳代行 独り立ち</span>' : "卒業試験："} 最高 ${pct(p.exam.best)}・${p.exam.attempts}回</p>` : ""}
        ${p.next ? `<p class="muted">いま取り組んでいるところ：${esc(p.next)}</p>` : ""}</div>
      ${TRACKS.map(t => `<div class="card"><h2>${esc(t.name)}</h2>${t.chapters.map(ch => { const ids = ch.stages.map(s => s.id); const done = ids.filter(id => p.stages[id] && p.stages[id].cleared).length; return `<div class="adm-ch"><div class="adm-lbl">第${ch.no}章 ${esc(ch.name)}<small>${done}/${ids.length}</small></div><div class="adm-dots">${ch.stages.map((s, i) => { const r = p.stages[s.id]; return `<span class="${r ? (r.cleared ? "done" : "try") : ""}" title="${esc(`${ch.no}-${i + 1} ${s.name}：${r ? `最高${pct(r.best)}・${r.attempts}回` : "未挑戦"}`)}">${r ? Math.round(r.best * 100) : ""}</span>`; }).join("")}</div></div>`; }).join("")}</div>`).join("")}
      <div class="card"><h2>実力診断</h2>${p.diag && p.diag.fields ? `<p class="muted">${day(p.diag.at)}・${p.diag.correct}/${p.diag.total}問</p>` + Object.entries(p.diag.fields).filter(([, v]) => v && v.t).map(([k, v]) => `<div class="adm-line"><div class="adm-lbl">${esc(fieldName(k))}</div>${bar(v.c / v.t, `${Math.round(v.c / v.t * 100)}% ${v.c}/${v.t}`)}</div>`).join("") : '<p class="muted">まだ受けていません</p>'}</div>
      <div class="adm-grid2">
        <div class="card"><h2>間違えが多い分野</h2>${weakTop.length ? weakTop.map(([w, n]) => `<div class="adm-q"><b>${n}回</b><span>${esc(w)}</span></div>`).join("") : '<p class="muted">なし</p>'}</div>
        <div class="card"><h2>「むずかしかった」の印（${p.hard.size}問）</h2>${[...p.hard].slice(0, 10).map(id => `<div class="adm-q"><span>${esc(qm[id] ? qm[id].stem : id)}</span></div>`).join("") || '<p class="muted">なし</p>'}</div>
      </div>
      <div class="card"><h2>最近の挑戦</h2><div class="adm-table"><table><thead><tr><th>日時</th><th>ステージ</th><th>結果</th><th>時間</th></tr></thead><tbody>
        ${p.logs.slice().sort((a, b) => b.at.localeCompare(a.at)).slice(0, 30).map(l => `<tr><td>${esc(l.at.slice(0, 16).replace("T", " "))}</td><td>${esc(l.stage === "diag" ? "実力診断" : l.stage === "exam" ? "卒業試験" : (stageInfo[l.stage] ? stageInfo[l.stage].label : l.stageName))}</td><td><span class="badge ${l.cleared ? "ok" : tone(l.rate)}">${l.correct}/${l.total}${l.cleared ? " クリア" : ""}</span></td><td>${mins(l.seconds)}</td></tr>`).join("") || '<tr><td colspan="4" class="muted">まだありません</td></tr>'}
      </tbody></table></div></div>`;
    $("#pp-back").onclick = () => { person = null; render(); };
  }

  /* ステージ */
  function stageStats() {
    const m = {};
    D.logs.forEach(l => { if (!stageInfo[l.stage]) return; const s = m[l.stage] = m[l.stage] || { id: l.stage, label: stageInfo[l.stage].label, attempts: 0, sum: 0, sec: 0, people: new Set(), cleared: new Set() }; s.attempts++; s.sum += l.rate; s.sec += l.seconds; s.people.add(l.name); if (l.cleared) s.cleared.add(l.name); });
    return Object.values(m).map(s => ({ ...s, avg: s.sum / s.attempts, people: s.people.size, clearedN: s.cleared.size }));
  }
  function renderStages(host) {
    const st = {}; stageStats().forEach(s => st[s.id] = s);
    host.innerHTML = TRACKS.map(t => `<div class="card"><h2>${esc(t.name)}</h2><div class="adm-table"><table><thead><tr><th>ステージ</th><th>挑戦した人</th><th>クリアした人</th><th>平均正答率</th><th>平均時間</th></tr></thead><tbody>
      ${t.chapters.map(ch => `<tr class="grp"><td colspan="5">第${ch.no}章 ${esc(ch.name)}</td></tr>` + ch.stages.map((s, i) => { const x = st[s.id]; return `<tr><td>${ch.no}-${i + 1} ${esc(s.name)}</td><td>${x ? x.people + "人" : "—"}</td><td>${x ? x.clearedN + "人" : "—"}</td><td>${x ? bar(x.avg) : "—"}</td><td>${x ? mins(x.sec / x.attempts) : "—"}</td></tr>`; }).join("")).join("")}
    </tbody></table></div></div>`).join("");
  }

  /* スタッフのID・パス */
  const APP_URL = location.origin + location.pathname;
  const handout = (id, pass, disp) => `${disp ? disp + "さん\n" : ""}記帳道場のIDとパスをお送りします。\n${APP_URL}\nID：${id}\nパス：${pass}\n（スマホでもパソコンでも、同じIDとパスで続きから学べます）`;
  function showHandout(id, pass, disp) {
    const t = handout(id, pass, disp);
    $("#sf-msg").innerHTML = `<div class="fb good" style="color:var(--ink)"><div class="ttl">本人に送る文面（この表示は画面を移ると消えます）</div><pre class="adm-pre">${esc(t)}</pre><button class="btn" id="sf-copy" type="button">文面をコピー</button></div>`;
    $("#sf-copy").onclick = async () => { try { await navigator.clipboard.writeText(t); toast("コピーしました"); } catch (e) { toast("コピーできませんでした。長押しで選んでください"); } };
  }
  function renderStaff(host) {
    const us = D.users;
    host.innerHTML = `<div class="card"><h2>スタッフを追加</h2>
        <p class="muted">ID＝メールアドレス。パスは管理者が決めて本人に配ります（「自動で作る」で8桁の数字）。追加すると、送る文面が出ます。</p>
        <form id="sf-add" class="adm-form"><input class="text" id="sf-name" type="email" inputmode="email" autocapitalize="off" placeholder="ID（メールアドレス）" required><input class="text" id="sf-disp" placeholder="表示名 例：山田 花子"><input class="text" id="sf-pass" placeholder="パス（4文字以上）" autocomplete="off" autocapitalize="off" required><input class="text" id="sf-memo" placeholder="メモ（任意）"><button class="btn secondary" type="button" id="sf-gen">パスを自動で作る</button><button class="btn" type="submit">追加</button></form>
        <div class="adm-msg" id="sf-msg"></div></div>
      <div class="card"><h2>スタッフ一覧（${us.length}人）</h2><div class="adm-table"><table><thead><tr><th>表示名 / ID</th><th>状態</th><th>登録</th><th>最終</th><th>メモ</th><th>操作</th></tr></thead><tbody>
      ${us.map(u => `<tr class="${u.status === "停止" ? "off" : ""}"><td><b>${esc(u.display || "—")}</b><br><small class="muted">${esc(u.name)}</small></td><td>${esc(u.status)}</td><td>${day(u.first)}<br><small class="muted">${esc(u.source)}</small></td><td>${ago(u.last)}</td><td>${esc(u.memo)}</td>
        <td class="adm-ops"><button class="d-btn" data-op="pass" data-n="${esc(u.name)}" type="button">パス再発行</button><button class="d-btn" data-op="status" data-n="${esc(u.name)}" type="button">${u.status === "停止" ? "再開" : "停止"}</button><button class="d-btn" data-op="memo" data-n="${esc(u.name)}" type="button">名前・メモ</button><button class="d-btn danger" data-op="del" data-n="${esc(u.name)}" type="button">削除</button></td></tr>`).join("") || '<tr><td colspan="6" class="muted">まだいません</td></tr>'}
      </tbody></table></div>
      <p class="muted" style="font-size:12px">停止：ログインも記録もできなくなります（記録は残る）。削除：登録だけ消えます。進捗ログは残るので、同じIDで追加し直すと記録が戻ります。</p></div>`;
    $("#sf-gen").onclick = () => { $("#sf-pass").value = genPin(); };
    $("#sf-add").onsubmit = async e => {
      e.preventDefault(); $("#sf-msg").textContent = "登録しています…";
      const name = $("#sf-name").value.trim().toLowerCase(), pass = $("#sf-pass").value.trim(), disp = $("#sf-disp").value.trim();
      const j = await api("staffAdd", { name, pass, display: disp, memo: $("#sf-memo").value.trim() });
      if (!j.ok) { $("#sf-msg").textContent = err(j); return; }
      toast("追加しました"); await load(); tab = "staff"; render(); showHandout(name, pass, disp);
    };
    host.querySelectorAll("[data-op]").forEach(b => b.onclick = async () => {
      const n = b.dataset.n, op = b.dataset.op, u = us.find(x => x.name === n); let j;
      if (op === "pass") { const p = prompt(`${u.display || n} さんの新しいパス（4文字以上）`, genPin()); if (!p) return; j = await api("staffPass", { name: n, pass: p.trim() }); if (j.ok) { toast("パスを変えました"); await load(); tab = "staff"; render(); showHandout(n, p.trim(), u.display); return; } }
      else if (op === "status") { const to = u.status === "停止" ? "有効" : "停止"; if (!confirm(`${u.display || n} さんを「${to}」にしますか？`)) return; j = await api("staffStatus", { name: n, status: to }); }
      else if (op === "memo") { const d = prompt(`表示名（${n}）`, u.display || ""); if (d == null) return; const m = prompt("メモ", u.memo || ""); if (m == null) return; j = await api("staffMemo", { name: n, memo: m, display: d }); }
      else if (op === "del") { if (!confirm(`${u.display || n} さんの登録を削除しますか？\n（進捗ログは残ります。同じIDで追加し直すと記録が戻ります）`)) return; j = await api("staffDelete", { name: n }); }
      if (!j.ok) { toast(err(j)); return; }
      toast("更新しました"); await load(); tab = "staff"; render();
    });
  }
  function genPin() { const a = new Uint32Array(1); crypto.getRandomValues(a); return String(a[0] % 90000000 + 10000000); }

  /* 設定 */
  function renderSettings(host) {
    host.innerHTML = `<div class="card"><h2>スタッフの登録方法</h2>
        <label class="adm-check"><input type="checkbox" id="st-self" ${D.settings.selfRegister ? "checked" : ""}> 本人が自分でIDとパスを決めて登録できる</label>
        <p class="muted">ふだんはオフ（管理者が発行したIDとパスの人だけが入れる）。登録済みの人はどちらでもそのまま使えます。</p></div>
      <div class="card"><h2>管理者アカウント</h2><div class="adm-table"><table><thead><tr><th>ID</th><th>作成</th><th>最終ログイン</th><th>操作</th></tr></thead><tbody>
        ${D.admins.map(a => `<tr><td>${esc(a.id)}${a.id === D.me ? ' <small class="muted">（自分）</small>' : ""}${a.mustChange ? ' <small class="muted">初回変更待ち</small>' : ""}</td><td>${day(a.created)}</td><td>${ago(a.lastLogin)}</td><td class="adm-ops">${a.id === D.me ? '<button class="d-btn" id="ad-mine" type="button">自分のパスワードを変更</button>' : `<button class="d-btn" data-ad="reset" data-id="${esc(a.id)}" type="button">パスワード再設定</button><button class="d-btn danger" data-ad="del" data-id="${esc(a.id)}" type="button">削除</button>`}</td></tr>`).join("")}
      </tbody></table></div>
      <form id="ad-add" class="adm-form" style="margin-top:10px"><input class="text" id="ad-id" type="email" placeholder="新しい管理者ID（メールアドレス）" autocomplete="off" autocapitalize="off" required><input class="text" id="ad-pass" type="password" placeholder="仮パスワード（8文字以上）" autocomplete="new-password" minlength="8" required><button class="btn" type="submit">管理者を追加</button></form>
      <p class="muted" style="font-size:12px">追加した人・再設定した人は、初回ログインで自分のパスワードに変えるまで中を見られません。</p><div class="adm-msg" id="ad-msg"></div></div>
      <div class="card"><h2>元データ</h2><p class="muted">進捗はスプレッドシートの「進捗ログ」が正本です。${D.sheetUrl ? `<a class="btn secondary" style="margin-top:6px" href="${esc(D.sheetUrl)}" target="_blank" rel="noopener">スプレッドシートを開く</a>` : ""}</p></div>`;
    $("#st-self").onchange = async e => { const j = await api("setSetting", { selfRegister: e.target.checked }); if (!j.ok) { toast(err(j)); e.target.checked = !e.target.checked; return; } D.settings = j.settings; toast(j.settings.selfRegister ? "自分で登録できるようにしました" : "管理者が追加した人だけにしました"); };
    $("#ad-mine").onclick = () => renderChangePass(false);
    $("#ad-add").onsubmit = async e => { e.preventDefault(); const j = await api("adminAdd", { id: $("#ad-id").value.trim(), pass: $("#ad-pass").value }); if (!j.ok) { $("#ad-msg").textContent = err(j); return; } toast("管理者を追加しました"); await load(); tab = "settings"; render(); };
    host.querySelectorAll("[data-ad]").forEach(b => b.onclick = async () => {
      const id = b.dataset.id; let j;
      if (b.dataset.ad === "reset") { const p = prompt(`${id} の仮パスワード（8文字以上）。本人は初回ログインで変更します`); if (!p) return; j = await api("adminReset", { id, pass: p }); }
      else { if (!confirm(`管理者 ${id} を削除しますか？`)) return; j = await api("adminDelete", { id }); }
      if (!j.ok) { toast(err(j)); return; } toast("更新しました"); await load(); tab = "settings"; render();
    });
  }

  /* ---------- 入口 ---------- */
  function open() { if (location.hash !== "#admin") history.replaceState(null, "", "#admin"); token ? (D ? render() : load()) : renderLogin(); }
  window.Admin = { open };
  const fb = $("#admin-open"); if (fb) fb.addEventListener("click", open);
  window.addEventListener("hashchange", () => { if (location.hash === "#admin") open(); });
  if (location.hash === "#admin") setTimeout(open, 0);
})();
