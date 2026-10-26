/* 記帳道場 v2 — 画面の進行・出題・採点・診断・進捗 */
(function () {
  const C = window.CURRICULUM;
  const Q = [].concat(window.QUESTIONS_A || [], window.QUESTIONS_B || [], window.QUESTIONS || []);
  const D = window.DIAGRAMS || {};
  const $ = (s, r) => (r || document).querySelector(s);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const pic = (id, cls) => id ? `<img class="pic ${cls || ""}" src="img/${esc(id)}.jpg" alt="" loading="lazy" onerror="this.remove()">` : "";
  const expHtml = t => String(t || "").split(/\n+/).map(p => "<p>" + esc(p) + "</p>").join("");
  const fieldOf = id => C.fields.find(f => f.id === id);
  const chapterOfField = fid => C.chapters.find(c => c.field === fid);

  const stagesFlat = [];
  C.chapters.forEach(ch => ch.stages.forEach(st => stagesFlat.push({ ...st, chapter: ch })));
  const qByStage = {};
  Q.forEach(q => { (qByStage[q.stage] = qByStage[q.stage] || []).push(q); });
  const qById = {}; Q.forEach(q => qById[q.id] = q);

  /* ---------- 進捗の判定 ---------- */
  const isCleared = id => !!(Store.stage(id) && Store.stage(id).cleared);
  function stageUnlocked(st) {
    const i = st.chapter.stages.findIndex(s => s.id === st.id);
    return i === 0 || isCleared(st.chapter.stages[i - 1].id);
  }
  const chapterDone = ch => ch.stages.every(s => isCleared(s.id));
  const overallRate = () => stagesFlat.filter(s => isCleared(s.id)).length / stagesFlat.length;

  /* ---------- 共通UI ---------- */
  function show(id) { document.querySelectorAll(".view").forEach(v => v.classList.remove("active")); $("#" + id).classList.add("active"); window.scrollTo({ top: 0 }); setCrumb(id); }
  /* ---------- 現在地（パンくず） ---------- */
  function setCrumb(view) {
    const parts = [];
    const top = { label: "入口（トップ）", go: () => window.Finance && window.Finance.renderTrack() };
    const keiri = { label: "経理の道", go: renderHome };
    if (view === "name") parts.push({ label: "はじめに" });
    else if (view === "track") parts.push({ label: "入口（トップ）", here: true });
    else if (view === "home") parts.push(top, { label: "経理の道 ワールドマップ", here: true });
    else if (view === "hard") parts.push(top, keiri, { label: "むずかしかった問題", here: true });
    else if (view === "finance") parts.push(top, { label: "財務の部屋", here: true });
    else if (view === "chapter" && current && current.chapterView) parts.push(top, keiri, { label: `第${current.chapterView.no}章 ${current.chapterView.name}`, here: true });
    else if ((view === "stage" || view === "result") && current) {
      parts.push(top, keiri);
      if (current.kind === "diag") parts.push({ label: "実力診断", here: view === "stage" });
      else { const ch = current.chapter; parts.push({ label: `第${ch.no}章 ${ch.name}`, go: () => openChapter(ch.id) }); parts.push({ label: `${ch.no}-${ch.stages.findIndex(x => x.id === current.stage.id) + 1} ${current.stage.name}`, here: view === "stage" }); }
      if (view === "result") parts.push({ label: "結果", here: true });
    }
    const host = $("#crumb"); if (!host) return;
    host.innerHTML = "";
    if (!parts.length) { host.style.display = "none"; return; }
    host.style.display = "";
    parts.forEach((p, i) => {
      if (i) host.appendChild(el("span", "sep", "›"));
      if (p.go && !p.here) { const b = el("button", "crumb-link", esc(p.label)); b.type = "button"; b.addEventListener("click", p.go); host.appendChild(b); }
      else host.appendChild(el("span", p.here ? "here" : "", (p.here ? "📍 " : "") + esc(p.label)));
    });
  }
  function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 2400); }
  function confetti() {
    const box = el("div", "confetti"); document.body.appendChild(box);
    const colors = ["#1f5fbf", "#1f8a4c", "#d9a516", "#c8372d", "#6ea3f0"];
    for (let i = 0; i < 60; i++) { const p = el("i"); p.style.left = Math.random() * 100 + "vw"; p.style.background = colors[i % 5]; p.style.animationDelay = Math.random() * .6 + "s"; box.appendChild(p); }
    setTimeout(() => box.remove(), 2600);
  }
  const shuffle = a => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0;[b[i], b[j]] = [b[j], b[i]]; } return b; };
  const pct = (c, t) => t ? Math.round(c / t * 100) : 0;
  const tone = p => p >= 80 ? "ok" : p >= 50 ? "warn" : "ng";
  function fieldBars(fields, opts) {
    opts = opts || {};
    return '<div class="fieldbars">' + C.fields.map(f => {
      const v = fields && fields[f.id]; const has = v && v.t;
      const p = has ? pct(v.c, v.t) : 0;
      const ch = chapterOfField(f.id);
      return `<div class="fb-row${has ? "" : " none"}" ${opts.link && ch ? `data-ch="${ch.id}" role="button" tabindex="0"` : ""}>
        <div class="fb-name" title="${esc(f.name)}">${esc(f.short)}</div>
        <div class="fb-bar"><i class="${tone(p)}" style="width:${has ? p : 0}%"></i></div>
        <div class="fb-val">${has ? p + "%" : "—"}<small>${has ? ` ${v.c}/${v.t}` : ""}</small></div></div>`;
    }).join("") + "</div>";
  }

  /* ---------- 図解 ---------- */
  function renderDiagram(key, host) {
    host.innerHTML = "";
    const d = D[key];
    if (!d) return false;
    const wrap = el("div", "diagram");
    wrap.appendChild(el("div", "d-title", esc(d.title)));
    if (d.caption) wrap.appendChild(el("div", "d-caption", esc(d.caption)));
    if (d.hint) wrap.appendChild(el("div", "d-hint", "▶ " + esc(d.hint)));
    wrap.insertAdjacentHTML("beforeend", `<img class="d-pic" src="img/d-${esc(key)}.jpg" alt="" loading="lazy" onerror="this.remove()">`);
    if (d.controls) wrap.insertAdjacentHTML("beforeend", d.controls);
    wrap.insertAdjacentHTML("beforeend", '<div class="d-scroll">' + d.svg + '</div>');
    host.appendChild(wrap);
    wrap.querySelectorAll("[data-link]").forEach(n => {
      const key = n.getAttribute("data-link");
      const on = () => wrap.querySelectorAll('[data-link="' + CSS.escape(key) + '"]').forEach(m => m.classList.add("lit"));
      const off = () => wrap.querySelectorAll("[data-link].lit").forEach(m => m.classList.remove("lit"));
      n.addEventListener("mouseenter", () => { off(); on(); });
      n.addEventListener("mouseleave", off);
      n.addEventListener("click", e => { e.stopPropagation(); const lit = n.classList.contains("lit"); off(); if (!lit) on(); });
    });
    try { if (typeof d.init === "function") d.init(wrap); } catch (e) { console.error("diagram init", key, e); }
    return true;
  }

  /* ---------- ホーム ---------- */
  function renderHome() {
    const s = Store.load();
    $("#who-name").textContent = s.name;
    const rate = overallRate();
    const bar = $("#ring-bar"); const len = 2 * Math.PI * 42;
    bar.style.strokeDasharray = len; bar.style.strokeDashoffset = len * (1 - rate);
    $("#ring-text").textContent = Math.round(rate * 100) + "%";
    const clearedN = stagesFlat.filter(st => isCleared(st.id)).length;
    $("#home-sub").textContent = `クリア ${clearedN} / ${stagesFlat.length} ステージ・バッジ ${C.chapters.filter(chapterDone).length} / ${C.chapters.length}`;
    // 実力診断
    const dg = $("#diag-card"); const diagQs = qByStage.diag || [];
    if (!s.diag) {
      dg.innerHTML = `<div class="diag-hero">${pic(C.diagnostic.img, "cover")}<div><h2>まずは実力診断</h2><p class="muted">${esc(C.diagnostic.aim)}（${diagQs.length}問・約10分）</p><button class="btn" id="diag-start" type="button">実力診断をはじめる</button></div></div>`;
    } else {
      const worst = C.fields.map(f => ({ f, v: s.diag.fields[f.id] })).filter(x => x.v && x.v.t).sort((a, b) => pct(a.v.c, a.v.t) - pct(b.v.c, b.v.t))[0];
      const rec = worst ? chapterOfField(worst.f.id) : null;
      dg.innerHTML = `<div class="row" style="align-items:baseline"><h2 style="margin:0">実力診断の結果</h2><span class="muted">${esc(s.diag.correct)} / ${esc(s.diag.total)} 問正解・${esc((s.diag.at || "").slice(0, 10))}</span><span class="sp"></span><button class="d-btn" id="diag-start" type="button">もう一度診断</button></div>
        ${fieldBars(s.diag.fields, { link: true })}
        ${rec ? `<p class="muted">いちばん伸びしろがあるのは「${esc(worst.f.name)}」。<b>第${rec.no}章 ${esc(rec.name)}</b> から始めるのがおすすめです（分野名をタップで章へ）</p>` : ""}`;
    }
    $("#diag-start").addEventListener("click", startDiag);
    dg.querySelectorAll("[data-ch]").forEach(n => { n.addEventListener("click", () => openChapter(n.dataset.ch)); n.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") openChapter(n.dataset.ch); }); });
    // 章の地図
    const map = $("#map"); map.innerHTML = "";
    C.chapters.forEach(ch => {
      const done = chapterDone(ch);
      const w = el("div", "world" + (done ? " done" : ""));
      w.innerHTML = `${pic(ch.img, "thumb")}<div class="no">${done ? "✓" : ch.no}</div>
        <div><div class="ttl">${esc(ch.name)} <span class="muted" style="font-weight:400;font-size:13px">${esc(ch.sub)}</span>${done ? ' <span class="badge gold">バッジ</span>' : ""}</div>
        <div class="sub">${esc(ch.goal)}</div><div class="dots">${ch.stages.map(st => {
          const cls = isCleared(st.id) ? "done" : (stageUnlocked({ ...st, chapter: ch }) ? "now" : "");
          return `<span class="dot ${cls}" title="${esc(st.name)}"></span>`; }).join("")}</div></div>`;
      w.addEventListener("click", () => openChapter(ch.id));
      map.appendChild(w);
    });
    const hardN = s.hard.length;
    $("#hard-note").innerHTML = hardN ? `「むずかしかった」の印：${hardN}問 <button class="d-btn" id="hard-list" type="button">一覧</button>` : "";
    if (hardN) $("#hard-list").addEventListener("click", showHardList);
    $("#queue-note").textContent = s.queue.length ? `未送信の記録 ${s.queue.length} 件（次に送信します）` : "";
    show("home");
  }
  function showHardList() {
    const s = Store.load();
    const items = s.hard.map(id => qById[id]).filter(Boolean);
    const box = $("#hard-box");
    box.innerHTML = `<div class="row"><h2 style="margin:0">むずかしかった問題</h2><span class="sp"></span><button class="btn secondary" data-go="home" type="button">← マップ</button></div>` +
      (items.length ? items.map(q => { const st = stagesFlat.find(x => x.id === q.stage); return `<div class="card hard-item"><div class="muted">${st ? `第${st.chapter.no}章 ${esc(st.name)}` : "実力診断"}・${esc(fieldOf(q.field) ? fieldOf(q.field).name : "")}</div><div class="stem" style="font-size:15px">${esc(q.stem)}</div><div class="muted exp">${expHtml(q.explanation)}</div><div class="row" style="margin-top:6px"><button class="d-btn" data-unhard="${esc(q.id)}" type="button">印を外す</button>${st ? `<button class="d-btn" data-stage="${esc(st.id)}" type="button">このステージをやり直す</button>` : ""}</div></div>`; }).join("") : "<p class='muted'>まだありません</p>");
    box.querySelectorAll("[data-go=home]").forEach(b => b.addEventListener("click", renderHome));
    box.querySelectorAll("[data-unhard]").forEach(b => b.addEventListener("click", () => { Store.toggleHard(b.dataset.unhard, false); showHardList(); }));
    box.querySelectorAll("[data-stage]").forEach(b => b.addEventListener("click", () => startStage(b.dataset.stage)));
    show("hard");
  }

  /* ---------- 章 ---------- */
  let current = null;
  function openChapter(chId) {
    const ch = C.chapters.find(c => c.id === chId);
    current = Object.assign(current || {}, { chapterView: ch });
    $("#ch-title").textContent = `第${ch.no}章　${ch.name}`;
    $("#ch-sub").textContent = ch.sub;
    $("#ch-goal").textContent = ch.goal;
    $("#ch-pic").innerHTML = pic(ch.img, "cover");
    const s = Store.load();
    const dv = s.diag && s.diag.fields && s.diag.fields[ch.field];
    $("#ch-diag").innerHTML = dv && dv.t ? `<span class="badge ${tone(pct(dv.c, dv.t))}">診断：${pct(dv.c, dv.t)}%（${dv.c}/${dv.t}）</span>` : "";
    const list = $("#stages"); list.innerHTML = "";
    ch.stages.forEach((st, i) => {
      const rec = Store.stage(st.id), open = stageUnlocked({ ...st, chapter: ch }), done = isCleared(st.id);
      const b = el("button", "stage" + (done ? " done" : "") + (open ? "" : " locked")); b.type = "button";
      b.innerHTML = `${pic(st.img, "thumb")}<div class="st">${done ? "✓" : (ch.no + "-" + (i + 1))}</div><div><div class="nm">${esc(st.name)}</div><div class="aim">${esc(st.aim)}</div></div>
        <div class="score">${rec ? Math.round(rec.best * 100) + "%" : (open ? "未挑戦" : "🔒")}</div>`;
      if (open) b.addEventListener("click", () => startStage(st.id));
      list.appendChild(b);
    });
    show("chapter");
  }

  /* ---------- ステージ・診断 ---------- */
  function startStage(stId) {
    const st = stagesFlat.find(s => s.id === stId);
    const qs = qByStage[stId] || [];
    if (!qs.length) { toast("このステージの問題は準備中です"); return; }
    current = { kind: "stage", chapter: st.chapter, stage: st, qs: shuffle(qs), i: 0, correct: 0, wrong: [], hard: [], fields: {}, started: Date.now(), answered: false };
    const idx = st.chapter.stages.findIndex(x => x.id === st.id) + 1;
    $("#st-title").textContent = `${st.chapter.no}-${idx}　${st.name}`;
    $("#st-aim").textContent = st.aim;
    $("#st-pic").innerHTML = pic(st.img, "cover");
    setupStageDiagram(st.diagram);
    renderQuestion(); show("stage");
  }
  function startDiag() {
    const qs = qByStage.diag || [];
    if (!qs.length) { toast("診断問題は準備中です"); return; }
    current = { kind: "diag", chapter: null, stage: { id: "diag", name: C.diagnostic.name, pass: 0 }, qs: shuffle(qs), i: 0, correct: 0, wrong: [], hard: [], fields: {}, started: Date.now(), answered: false };
    $("#st-title").textContent = "実力診断";
    $("#st-aim").textContent = "分からなくても気にせず、今の感覚で答えてください";
    $("#st-pic").innerHTML = "";
    setupStageDiagram(null);
    renderQuestion(); show("stage");
  }
  function setupStageDiagram(key) {
    const dia = key && D[key];
    $("#st-dia").style.display = dia ? "" : "none";
    $("#st-dia").open = false;
    $("#st-dia-title").textContent = dia ? dia.title : "";
    $("#st-diagram").innerHTML = "";
    $("#st-dia").ontoggle = () => { if ($("#st-dia").open && !$("#st-diagram").children.length) renderDiagram(key, $("#st-diagram")); };
  }
  function renderQuestion() {
    const q = current.qs[current.i];
    current.answered = false;
    const f = fieldOf(q.field);
    $("#q-meta").innerHTML = `<span>問 ${current.i + 1} / ${current.qs.length}</span><span>${f ? esc(f.name) + "・" : ""}${esc(C.types[q.type] || q.type)}</span>`;
    $("#q-progress").style.width = (current.i / current.qs.length * 100) + "%";
    const box = $("#q-body"); box.innerHTML = "";
    box.insertAdjacentHTML("beforeend", pic(q.img || q.id, "scene"));
    if (q.situation) box.appendChild(el("div", "situation", esc(q.situation)));
    box.appendChild(el("div", "stem", esc(q.stem)));
    $("#q-fb").innerHTML = ""; $("#q-fb").className = "";
    $("#q-next").style.display = "none";
    const r = renderers[q.type]; if (r) r(q, box); else box.appendChild(el("p", "muted", "未対応の問題タイプ: " + esc(q.type)));
  }
  function finishQuestion(q, ok, detail) {
    current.answered = true;
    if (ok) current.correct++; else current.wrong.push(q);
    const fv = current.fields[q.field] || { c: 0, t: 0 }; fv.t++; if (ok) fv.c++; current.fields[q.field] = fv;
    const fb = $("#q-fb"); fb.className = "fb " + (ok ? "good" : "bad");
    const hard = Store.isHard(q.id);
    fb.innerHTML = `<div class="ttl">${ok ? "正解！" : "惜しい"}${detail ? "　<span class='muted' style='font-weight:400'>" + esc(detail) + "</span>" : ""}</div>${pic("e-" + (q.img || q.id), "explain")}<div class="exp">${expHtml(q.explanation)}</div>
      <div class="row" style="margin-top:8px"><span class="src">${esc(q.source || "")}</span><span class="sp"></span><button class="hardbtn${hard ? " on" : ""}" type="button" aria-pressed="${hard}">${hard ? "✓ むずかしかった" : "むずかしかった"}</button></div>`;
    fb.querySelector(".hardbtn").addEventListener("click", ev => {
      const b = ev.currentTarget; const on = !b.classList.contains("on");
      b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); b.textContent = on ? "✓ むずかしかった" : "むずかしかった";
      Store.toggleHard(q.id, on); const i = current.hard.indexOf(q.id); if (on && i < 0) current.hard.push(q.id); if (!on && i >= 0) current.hard.splice(i, 1);
    });
    const nx = $("#q-next"); nx.style.display = "";
    nx.textContent = current.i + 1 < current.qs.length ? "次の問題へ" : "結果を見る";
    nx.focus();
  }
  $("#q-next").addEventListener("click", () => { if (current.i + 1 < current.qs.length) { current.i++; renderQuestion(); } else finish(); });

  /* ---------- 出題UI ---------- */
  const renderers = {
    mc: mcLike, case: mcLike,
    sort2(q, box) {
      const g = el("div", "choices two");
      q.choices.forEach((c, i) => { const b = el("button", "choice", esc(c)); b.type = "button"; b.addEventListener("click", () => { if (current.answered) return; lockChoices(g, i, q.answer); finishQuestion(q, i === q.answer); }); g.appendChild(b); });
      box.appendChild(g);
    },
    journal(q, box) {
      const picked = {}; const wrap = el("div", "journal");
      const sides = [["debit", "借方", "debitTax"], ["credit", "貸方", "creditTax"]];
      const form = el("div", "jform");
      const btn = el("button", "btn block", "この仕訳で登録"); btn.type = "button"; btn.disabled = true;
      const check = () => { btn.disabled = !(picked.debit && picked.credit && picked.debitTax && picked.creditTax); };
      sides.forEach(([k, label, tk]) => {
        const col = el("div", "jcol " + k);
        col.appendChild(el("div", "jhead", label));
        col.appendChild(el("div", "lbl", "科目"));
        const chips = el("div", "chips");
        (q.slots[k] || []).forEach(v => { const c = el("button", "chip", esc(v)); c.type = "button"; c.dataset.v = v; c.dataset.k = k; c.addEventListener("click", () => { if (current.answered) return; picked[k] = v; chips.querySelectorAll(".chip").forEach(x => x.classList.toggle("sel", x.dataset.v === v)); check(); }); chips.appendChild(c); });
        col.appendChild(chips);
        col.appendChild(el("div", "lbl", "税区分"));
        const tchips = el("div", "chips tax");
        (q.slots.tax || []).forEach(v => { const c = el("button", "chip", esc(v)); c.type = "button"; c.dataset.v = v; c.dataset.k = tk; c.addEventListener("click", () => { if (current.answered) return; picked[tk] = v; tchips.querySelectorAll(".chip").forEach(x => x.classList.toggle("sel", x.dataset.v === v)); check(); }); tchips.appendChild(c); });
        col.appendChild(tchips);
        form.appendChild(col);
      });
      wrap.appendChild(form);
      btn.addEventListener("click", () => {
        if (current.answered) return; let okAll = true;
        ["debit", "debitTax", "credit", "creditTax"].forEach(k => { if (picked[k] !== q.answer[k]) okAll = false; });
        wrap.querySelectorAll(".chip").forEach(c => { const k = c.dataset.k; if (c.dataset.v === q.answer[k]) c.classList.add("correct"); else if (c.dataset.v === picked[k]) c.classList.add("wrong"); c.disabled = true; });
        btn.disabled = true;
        wrap.appendChild(el("table", "jresult", `<thead><tr><th colspan="2">借方</th><th colspan="2">貸方</th></tr></thead><tbody><tr><td>${esc(q.answer.debit)}</td><td class="tx">${esc(q.answer.debitTax)}</td><td>${esc(q.answer.credit)}</td><td class="tx">${esc(q.answer.creditTax)}</td></tr></tbody>`));
        finishQuestion(q, okAll, okAll ? "" : "正しい仕訳を緑で表示");
      });
      wrap.appendChild(btn); box.appendChild(wrap);
    },
    spot(q, box) {
      const sel = new Set(); const t = el("table", "ledger");
      t.innerHTML = "<thead><tr>" + q.header.map(h => "<th>" + esc(h) + "</th>").join("") + "</tr></thead>";
      const tb = el("tbody");
      q.rows.forEach((row, i) => {
        const tr = el("tr", "pick");
        tr.innerHTML = row.map(c => { const s = String(c); const num = /^[-−▲△]?[\d,]+(円)?$/.test(s.trim()); const neg = num && /^[-−▲△]/.test(s.trim()); return `<td class="${num ? "num" : ""}${neg ? " neg" : ""}">${esc(s)}</td>`; }).join("");
        tr.addEventListener("click", () => { if (current.answered) return; sel.has(i) ? sel.delete(i) : sel.add(i); tr.classList.toggle("sel", sel.has(i)); btn.disabled = sel.size === 0; });
        tb.appendChild(tr);
      });
      t.appendChild(tb); box.appendChild(t);
      box.appendChild(el("p", "muted", "おかしい行をすべてタップしてから判定します"));
      const btn = el("button", "btn block", "判定する"); btn.type = "button"; btn.disabled = true;
      btn.addEventListener("click", () => {
        if (current.answered) return; const ans = new Set(q.answer);
        const ok = ans.size === sel.size && [...ans].every(i => sel.has(i));
        tb.querySelectorAll("tr").forEach((tr, i) => { tr.classList.remove("sel", "pick"); if (ans.has(i) && sel.has(i)) tr.classList.add("correct"); else if (ans.has(i)) tr.classList.add("missed"); else if (sel.has(i)) tr.classList.add("wrong"); });
        btn.disabled = true; finishQuestion(q, ok, ok ? "" : "緑＝正しく見つけた・橙＝見落とし・赤＝違う行");
      });
      box.appendChild(btn);
    },
    order(q, box) {
      let items = shuffle(q.items.map((t, i) => ({ t, i }))); if (items.every((x, i) => x.i === i)) items = items.reverse();
      const list = el("div", "order");
      function draw() {
        list.innerHTML = "";
        items.forEach((x, pos) => {
          const it = el("div", "oitem"); it.innerHTML = `<span class="n">${pos + 1}</span><span>${esc(x.t)}</span><span class="mv"><button type="button" aria-label="上へ">▲</button><button type="button" aria-label="下へ">▼</button></span>`;
          const [up, dn] = it.querySelectorAll("button"); up.disabled = pos === 0; dn.disabled = pos === items.length - 1;
          up.addEventListener("click", () => { if (current.answered) return;[items[pos - 1], items[pos]] = [items[pos], items[pos - 1]]; draw(); });
          dn.addEventListener("click", () => { if (current.answered) return;[items[pos + 1], items[pos]] = [items[pos], items[pos + 1]]; draw(); });
          list.appendChild(it);
        });
      }
      draw(); box.appendChild(list);
      const btn = el("button", "btn block", "この順番で決定"); btn.type = "button";
      btn.addEventListener("click", () => {
        if (current.answered) return; let ok = true;
        list.querySelectorAll(".oitem").forEach((it, pos) => { const good = items[pos].i === pos; if (!good) ok = false; it.classList.add(good ? "correct" : "wrong"); it.querySelectorAll("button").forEach(b => b.disabled = true); });
        btn.disabled = true;
        if (!ok) box.insertBefore(el("div", "muted", "正しい順：<ol style='margin:4px 0 0 18px;padding:0'>" + q.items.map(t => "<li>" + esc(t) + "</li>").join("") + "</ol>"), btn);
        finishQuestion(q, ok);
      });
      box.appendChild(btn);
    }
  };
  function mcLike(q, box) {
    const g = el("div", "choices"); const order = shuffle(q.choices.map((c, i) => i));
    order.forEach((idx, k) => { const b = el("button", "choice", `<span class="k">${"ABCD"[k]}</span><span>${esc(q.choices[idx])}</span>`); b.type = "button"; b.dataset.idx = idx; b.addEventListener("click", () => { if (current.answered) return; lockChoices(g, idx, q.answer); finishQuestion(q, idx === q.answer); }); g.appendChild(b); });
    box.appendChild(g);
  }
  function lockChoices(g, picked, answer) {
    g.querySelectorAll(".choice").forEach((b, k) => { const idx = b.dataset.idx != null ? Number(b.dataset.idx) : k; b.disabled = true; if (idx === answer) b.classList.add("correct"); else if (idx === picked) b.classList.add("wrong"); });
  }

  /* ---------- 結果 ---------- */
  async function finish() {
    const n = current.qs.length, rate = current.correct / n, secs = Math.round((Date.now() - current.started) / 1000);
    const s = Store.load();
    const base = { logId: Store.uuid(), at: new Date().toISOString(), name: s.name, deviceId: s.deviceId, correct: current.correct, total: n, rate: Math.round(rate * 1000) / 1000, seconds: secs, hard: current.hard.join(";"), fields: JSON.stringify(current.fields), app: C.version };
    const r = { title: $("#r-title"), big: $("#r-big"), sub: $("#r-sub"), map: $("#r-map"), weak: $("#r-weak"), badge: $("#r-badge") };
    r.badge.innerHTML = ""; r.map.innerHTML = ""; r.weak.innerHTML = "";
    let cleared = false, next = null, stageForRetry = null;
    if (current.kind === "diag") {
      const diag = { fields: current.fields, correct: current.correct, total: n, at: base.at };
      Store.recordDiag(diag, { ...base, chapter: "diag", chapterName: "実力診断", stage: "diag", stageName: "実力診断", cleared: true, weak: C.fields.filter(f => current.fields[f.id] && pct(current.fields[f.id].c, current.fields[f.id].t) < 80).map(f => f.name).join(";") });
      r.title.textContent = "実力診断の結果"; r.big.textContent = `${current.correct} / ${n}`; r.big.style.color = "var(--accent)";
      r.sub.textContent = `${secs}秒。分野ごとの正答率です。低いところから学ぶと効率的です`;
      r.map.innerHTML = fieldBars(current.fields, { link: true });
      r.map.querySelectorAll("[data-ch]").forEach(x => x.addEventListener("click", () => openChapter(x.dataset.ch)));
      const worst = C.fields.map(f => ({ f, v: current.fields[f.id] })).filter(x => x.v && x.v.t).sort((a, b) => pct(a.v.c, a.v.t) - pct(b.v.c, b.v.t))[0];
      const rec = worst ? chapterOfField(worst.f.id) : null;
      if (rec) { next = { chapter: rec }; $("#r-next").textContent = `第${rec.no}章 ${rec.name} へ →`; }
      $("#r-retry").style.display = "none";
    } else {
      const st = current.stage; const pass = st.pass || C.passRate; cleared = rate >= pass - 1e-9;
      const weak = [...new Set(current.wrong.map(q => (fieldOf(q.field) || {}).name).filter(Boolean))];
      const wasDone = isCleared(st.id);
      Store.recordStage(st.id, { rate, cleared, weak, log: { ...base, chapter: st.chapter.id, chapterName: st.chapter.name, stage: st.id, stageName: st.name, cleared, weak: weak.join(";") } });
      r.title.textContent = cleared ? "ステージクリア！" : "もう一度挑戦";
      r.big.textContent = `${current.correct} / ${n}`; r.big.style.color = cleared ? "var(--ok)" : "var(--ng)";
      r.sub.textContent = `正答率 ${Math.round(rate * 100)}%（クリア条件 ${Math.round(pass * 100)}%）・${secs}秒`;
      if (current.wrong.length) r.weak.innerHTML = "<div class='muted'>間違えた問題</div>" + current.wrong.map(q => `<div class="miss">${esc(q.stem)}</div>`).join("");
      else r.weak.innerHTML = "<div class='muted'>全問正解</div>";
      if (cleared && !wasDone && chapterDone(st.chapter)) r.badge.innerHTML = `<div class="fb good"><div class="ttl">🏅 第${st.chapter.no}章「${esc(st.chapter.name)}」のバッジを獲得</div></div>`;
      const nx = stagesFlat[stagesFlat.findIndex(x => x.id === st.id) + 1];
      if (cleared && nx) { next = nx.chapter.id === st.chapter.id ? { stage: nx } : { chapter: nx.chapter }; $("#r-next").textContent = nx.chapter.id === st.chapter.id ? "次のステージへ →" : `第${nx.chapter.no}章へ →`; }
      stageForRetry = st; $("#r-retry").style.display = "";
    }
    if (current.hard.length) r.weak.insertAdjacentHTML("beforeend", `<div class="muted" style="margin-top:6px">「むずかしかった」の印：${current.hard.length}問（マップの一覧で見直せます）</div>`);
    $("#r-next").style.display = next ? "" : "none";
    $("#r-next").onclick = () => next.stage ? startStage(next.stage.id) : openChapter(next.chapter.id);
    $("#r-retry").onclick = () => stageForRetry && startStage(stageForRetry.id);
    $("#r-chapter").onclick = () => current.kind === "diag" ? renderHome() : openChapter(current.chapter.id);
    $("#r-chapter").textContent = current.kind === "diag" ? "マップへ" : "章に戻る";
    $("#r-send").textContent = Sheet.enabled ? "送信中…" : "（記録先の設定なし・この端末にのみ保存）";
    show("result");
    if (cleared) confetti();
    const res = await Sheet.flush();
    $("#r-send").textContent = !Sheet.enabled ? "（記録先の設定なし・この端末にのみ保存）" : res.sent ? `記録しました（${res.sent}件）` : res.pin ? "合言葉が違うため記録できません。名前から入り直してください" : "記録を送信できませんでした。次回起動時に再送します";
  }

  /* ---------- 名前・合言葉 ---------- */
  $("#name-form").addEventListener("submit", async e => {
    e.preventDefault();
    const name = $("#name-input").value.trim(), pin = $("#pin-input").value.trim();
    if (!name) return; if (!/^\d{4}$/.test(pin)) { $("#name-msg").textContent = "合言葉は数字4桁で入れてください"; return; }
    const btn = $("#name-go"); btn.disabled = true; $("#name-msg").textContent = "記録を確認しています…";
    const res = await Sheet.restore(name, pin, Store.load().deviceId);
    btn.disabled = false;
    if (res.error === "pin") { $("#name-msg").textContent = "合言葉が違います。前に決めた4桁を入れてください（忘れたときは石島さんへ）"; return; }
    Store.setUser(name, pin);
    if (res.error === "offline") { $("#name-msg").textContent = ""; toast("通信できないので、この端末の記録だけで始めます"); }
    else if (res.ok && !res.new) { Store.merge(res); const n = Object.keys(res.stages || {}).length; toast(n ? `おかえりなさい。${n}ステージ分の記録を読み込みました` : "おかえりなさい"); }
    else toast("はじめまして。この名前と合言葉で記録します");
    $("#name-msg").textContent = "";
    window.Finance.renderTrack(); Sheet.flush().then(renderHomeQuiet);
  });
  $("#who-change").addEventListener("click", () => { const s = Store.load(); $("#name-input").value = s.name; $("#pin-input").value = ""; $("#name-msg").textContent = ""; show("name"); });
  document.querySelectorAll("[data-go=home]").forEach(b => b.addEventListener("click", renderHome));
  $("#st-back").addEventListener("click", () => current && current.kind === "diag" ? renderHome() : openChapter(current.chapter.id));
  $("#r-resend").addEventListener("click", async () => { const r = await Sheet.flush(); toast(r.sent ? `${r.sent}件を送信しました` : "送信できませんでした"); renderHomeQuiet(); });
  function renderHomeQuiet() { const s = Store.load(); const n = $("#queue-note"); if (n) n.textContent = s.queue.length ? `未送信の記録 ${s.queue.length} 件` : ""; }

  /* 検証用フック */
  window.KichoDojo = { startStage, startDiag, openChapter, renderHome, setCrumb, get current() { return current; }, stagesFlat, qByStage, Q };

  /* ---------- 起動 ---------- */
  $("#ver").textContent = "版 " + C.version + "・問題 " + Q.length + "問";
  const s = Store.load();
  if (s.name && s.pin) { window.Finance.renderTrack(); Sheet.flush().then(renderHomeQuiet); } else show("name");
})();
