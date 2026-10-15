/* 記帳道場 — 画面の進行・出題・採点・進捗 */
(function () {
  const C = window.CURRICULUM;
  const Q = window.QUESTIONS || [];
  const D = window.DIAGRAMS || {};
  const $ = (s, r) => (r || document).querySelector(s);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmt = n => (typeof n === "number" ? n.toLocaleString("ja-JP") : n);

  const stagesFlat = [];
  C.chapters.forEach(ch => ch.stages.forEach(st => stagesFlat.push({ ...st, chapter: ch })));
  const qByStage = {};
  Q.forEach(q => { (qByStage[q.stage] = qByStage[q.stage] || []).push(q); });

  /* ---------- 進捗の判定 ---------- */
  const isCleared = id => !!(Store.stage(id) && Store.stage(id).cleared);
  function stageUnlocked(st) {
    const i = stagesFlat.findIndex(s => s.id === st.id);
    return i === 0 || isCleared(stagesFlat[i - 1].id);
  }
  const chapterDone = ch => ch.stages.every(s => isCleared(s.id));
  const chapterUnlocked = ch => stageUnlocked(ch.stages[0]);
  const overallRate = () => stagesFlat.filter(s => isCleared(s.id)).length / stagesFlat.length;

  /* ---------- ビュー切替 ---------- */
  function show(id) {
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    $("#" + id).classList.add("active");
    window.scrollTo({ top: 0 });
  }
  function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 2200); }
  function confetti() {
    const box = el("div", "confetti"); document.body.appendChild(box);
    const colors = ["#1f5fbf", "#1f8a4c", "#d9a516", "#c8372d", "#6ea3f0"];
    for (let i = 0; i < 60; i++) { const p = el("i"); p.style.left = Math.random() * 100 + "vw"; p.style.background = colors[i % 5]; p.style.animationDelay = Math.random() * .6 + "s"; box.appendChild(p); }
    setTimeout(() => box.remove(), 2600);
  }

  /* ---------- 図解 ---------- */
  function renderDiagram(key, host) {
    host.innerHTML = "";
    const d = D[key];
    if (!d) { host.innerHTML = '<p class="muted">（図解 ' + esc(key) + ' は準備中）</p>'; return; }
    const wrap = el("div", "diagram");
    wrap.appendChild(el("div", "d-title", esc(d.title)));
    if (d.caption) wrap.appendChild(el("div", "d-caption", esc(d.caption)));
    if (d.hint) wrap.appendChild(el("div", "d-hint", "▶ " + esc(d.hint)));
    if (d.controls) wrap.insertAdjacentHTML("beforeend", d.controls);
    wrap.insertAdjacentHTML("beforeend", d.svg);
    host.appendChild(wrap);
    // 共通の連動：data-link を hover/click したら同じキーを全部 lit
    wrap.querySelectorAll("[data-link]").forEach(n => {
      const key = n.getAttribute("data-link");
      const on = () => wrap.querySelectorAll('[data-link="' + CSS.escape(key) + '"]').forEach(m => m.classList.add("lit"));
      const off = () => wrap.querySelectorAll("[data-link].lit").forEach(m => m.classList.remove("lit"));
      n.addEventListener("mouseenter", () => { off(); on(); });
      n.addEventListener("mouseleave", off);
      n.addEventListener("click", e => { e.stopPropagation(); const lit = n.classList.contains("lit"); off(); if (!lit) on(); });
    });
    try { if (typeof d.init === "function") d.init(wrap); } catch (e) { console.error("diagram init", key, e); }
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
    const map = $("#map"); map.innerHTML = "";
    C.chapters.forEach(ch => {
      const done = chapterDone(ch), open = chapterUnlocked(ch);
      const w = el("div", "world" + (done ? " done" : "") + (open ? "" : " locked") + (ch.no === 7 ? " boss" : ""));
      w.innerHTML = `<div class="no">${done ? "✓" : ch.no}</div>
        <div><div class="ttl">${esc(ch.name)} <span class="muted" style="font-weight:400;font-size:13px">${esc(ch.sub)}</span>${done ? ' <span class="badge gold">バッジ</span>' : ""}</div>
        <div class="sub">${esc(ch.goal)}</div><div class="dots">${ch.stages.map(st => {
          const cls = isCleared(st.id) ? "done" : (stageUnlocked(st) ? "now" : "");
          return `<span class="dot ${cls}${st.boss ? " boss" : ""}" title="${esc(st.name)}"></span>`; }).join("")}</div></div>`;
      if (open) w.addEventListener("click", () => openChapter(ch.id));
      map.appendChild(w);
    });
    $("#queue-note").textContent = s.queue.length ? `未送信の記録 ${s.queue.length} 件（次に送信します）` : "";
    show("home");
  }

  /* ---------- 章 ---------- */
  let current = { chapter: null, stage: null, qs: [], i: 0, correct: 0, wrong: [], started: 0, answered: false };
  function openChapter(chId) {
    const ch = C.chapters.find(c => c.id === chId); current.chapter = ch;
    $("#ch-title").textContent = `第${ch.no}章　${ch.name}`;
    $("#ch-goal").textContent = ch.goal;
    renderDiagram(ch.diagram, $("#ch-diagram"));
    const list = $("#stages"); list.innerHTML = "";
    ch.stages.forEach((st, i) => {
      const rec = Store.stage(st.id), open = stageUnlocked(st), done = isCleared(st.id);
      const b = el("button", "stage" + (done ? " done" : "") + (open ? "" : " locked"));
      b.type = "button";
      b.innerHTML = `<div class="st">${done ? "✓" : (ch.no + "-" + (i + 1))}</div><div><div class="nm">${esc(st.name)}${st.boss ? ' <span class="badge">ボス</span>' : ""}</div><div class="aim">${esc(st.aim)}</div></div>
        <div class="score">${rec ? Math.round(rec.best * 100) + "%" : (open ? "未挑戦" : "🔒")}</div>`;
      if (open) b.addEventListener("click", () => startStage(st.id));
      list.appendChild(b);
    });
    show("chapter");
  }

  /* ---------- ステージ ---------- */
  const shuffle = a => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0;[b[i], b[j]] = [b[j], b[i]]; } return b; };
  function startStage(stId) {
    const st = stagesFlat.find(s => s.id === stId);
    const qs = qByStage[stId] || [];
    if (!qs.length) { toast("このステージの問題は準備中です"); return; }
    current = { chapter: st.chapter, stage: st, qs: shuffle(qs), i: 0, correct: 0, wrong: [], started: Date.now(), answered: false };
    $("#st-title").textContent = `${st.chapter.no}-${st.chapter.stages.findIndex(x => x.id === st.id) + 1}　${st.name}`;
    $("#st-aim").textContent = st.aim;
    const dia = D[st.diagram];
    $("#st-dia").style.display = dia ? "" : "none";
    $("#st-dia").open = false;
    $("#st-dia-title").textContent = dia ? dia.title : "";
    $("#st-diagram").innerHTML = "";
    $("#st-dia").ontoggle = () => { if ($("#st-dia").open && !$("#st-diagram").children.length) renderDiagram(st.diagram, $("#st-diagram")); };
    renderQuestion();
    show("stage");
  }
  function renderQuestion() {
    const q = current.qs[current.i];
    current.answered = false;
    $("#q-meta").innerHTML = `<span>問 ${current.i + 1} / ${current.qs.length}</span><span>${esc(C.types[q.type] || q.type)}</span>`;
    $("#q-progress").style.width = (current.i / current.qs.length * 100) + "%";
    const box = $("#q-body"); box.innerHTML = "";
    if (q.situation) box.appendChild(el("div", "situation", esc(q.situation)));
    box.appendChild(el("div", "stem", esc(q.stem)));
    $("#q-fb").innerHTML = ""; $("#q-fb").className = "";
    $("#q-next").style.display = "none";
    const r = renderers[q.type]; if (r) r(q, box); else box.appendChild(el("p", "muted", "未対応の問題タイプ: " + esc(q.type)));
  }
  function finishQuestion(q, ok, detail) {
    current.answered = true;
    if (ok) current.correct++; else current.wrong.push(q);
    const fb = $("#q-fb"); fb.className = "fb " + (ok ? "good" : "bad");
    fb.innerHTML = `<div class="ttl">${ok ? "正解！" : "惜しい"}${detail ? "　<span class='muted' style='font-weight:400'>" + esc(detail) + "</span>" : ""}</div><div>${esc(q.explanation)}</div><div class="src">出典：${esc(q.source || "")}</div>`;
    const nx = $("#q-next"); nx.style.display = "";
    nx.textContent = current.i + 1 < current.qs.length ? "次の問題へ" : "結果を見る";
    nx.focus();
  }
  $("#q-next").addEventListener("click", () => {
    if (current.i + 1 < current.qs.length) { current.i++; renderQuestion(); } else finishStage();
  });

  /* ---------- 出題UI ---------- */
  const renderers = {
    mc: mcLike, case: mcLike,
    sort2(q, box) {
      const g = el("div", "choices two");
      q.choices.forEach((c, i) => {
        const b = el("button", "choice", esc(c)); b.type = "button";
        b.addEventListener("click", () => { if (current.answered) return; lockChoices(g, i, q.answer); finishQuestion(q, i === q.answer); });
        g.appendChild(b);
      });
      box.appendChild(g);
    },
    journal(q, box) {
      const picked = {};
      const wrap = el("div", "journal");
      const labels = { debit: "借方（科目）", credit: "貸方（科目）", tax: "税区分" };
      ["debit", "credit", "tax"].forEach(k => {
        const slot = el("div", "slot"); slot.appendChild(el("div", "lbl", labels[k]));
        const chips = el("div", "chips");
        (q.slots[k] || []).forEach(v => {
          const c = el("button", "chip", esc(v)); c.type = "button"; c.dataset.v = v;
          c.addEventListener("click", () => { if (current.answered) return; picked[k] = v; chips.querySelectorAll(".chip").forEach(x => x.classList.toggle("sel", x.dataset.v === v)); btn.disabled = !(picked.debit && picked.credit && picked.tax); });
          chips.appendChild(c);
        });
        slot.appendChild(chips); wrap.appendChild(slot);
      });
      const btn = el("button", "btn block", "この仕訳で登録"); btn.type = "button"; btn.disabled = true;
      btn.addEventListener("click", () => {
        if (current.answered) return;
        let okAll = true;
        ["debit", "credit", "tax"].forEach(k => {
          const ok = picked[k] === q.answer[k]; if (!ok) okAll = false;
          wrap.querySelectorAll(".slot")[["debit", "credit", "tax"].indexOf(k)].querySelectorAll(".chip").forEach(c => {
            if (c.dataset.v === q.answer[k]) c.classList.add("correct"); else if (c.dataset.v === picked[k]) c.classList.add("wrong");
          });
        });
        wrap.querySelectorAll(".chip").forEach(c => c.disabled = true); btn.disabled = true;
        const t = el("div", "tform", `<div>借方：${esc(q.answer.debit)}</div><div>貸方：${esc(q.answer.credit)}</div><div>税区分：${esc(q.answer.tax)}</div>`);
        wrap.appendChild(t);
        finishQuestion(q, okAll, okAll ? "" : "正しい組み合わせを緑で表示");
      });
      wrap.appendChild(btn); box.appendChild(wrap);
    },
    spot(q, box) {
      const sel = new Set();
      const t = el("table", "ledger");
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
        if (current.answered) return;
        const ans = new Set(q.answer);
        let ok = ans.size === sel.size && [...ans].every(i => sel.has(i));
        tb.querySelectorAll("tr").forEach((tr, i) => { tr.classList.remove("sel", "pick"); if (ans.has(i) && sel.has(i)) tr.classList.add("correct"); else if (ans.has(i)) tr.classList.add("missed"); else if (sel.has(i)) tr.classList.add("wrong"); });
        btn.disabled = true;
        finishQuestion(q, ok, ok ? "" : "緑＝正しく拾えた・橙＝見落とし・赤＝拾いすぎ");
      });
      box.appendChild(btn);
    },
    order(q, box) {
      let items = shuffle(q.items.map((t, i) => ({ t, i })));
      if (items.every((x, i) => x.i === i)) items = items.reverse();
      const list = el("div", "order");
      function draw() {
        list.innerHTML = "";
        items.forEach((x, pos) => {
          const it = el("div", "oitem"); it.innerHTML = `<span class="n">${pos + 1}</span><span>${esc(x.t)}</span><span class="mv"><button type="button" aria-label="上へ">▲</button><button type="button" aria-label="下へ">▼</button></span>`;
          const [up, dn] = it.querySelectorAll("button");
          up.disabled = pos === 0; dn.disabled = pos === items.length - 1;
          up.addEventListener("click", () => { if (current.answered) return;[items[pos - 1], items[pos]] = [items[pos], items[pos - 1]]; draw(); });
          dn.addEventListener("click", () => { if (current.answered) return;[items[pos + 1], items[pos]] = [items[pos], items[pos + 1]]; draw(); });
          list.appendChild(it);
        });
      }
      draw(); box.appendChild(list);
      const btn = el("button", "btn block", "この順番で決定"); btn.type = "button";
      btn.addEventListener("click", () => {
        if (current.answered) return;
        let ok = true;
        list.querySelectorAll(".oitem").forEach((it, pos) => { const good = items[pos].i === pos; if (!good) ok = false; it.classList.add(good ? "correct" : "wrong"); it.querySelectorAll("button").forEach(b => b.disabled = true); });
        btn.disabled = true;
        if (!ok) { const ans = el("div", "muted", "正しい順：<ol style='margin:4px 0 0 18px;padding:0'>" + q.items.map(t => "<li>" + esc(t) + "</li>").join("") + "</ol>"); box.insertBefore(ans, btn); }
        finishQuestion(q, ok);
      });
      box.appendChild(btn);
    }
  };
  function mcLike(q, box) {
    const g = el("div", "choices");
    const order = shuffle(q.choices.map((c, i) => i));
    order.forEach((idx, k) => {
      const b = el("button", "choice", `<span class="k">${"ABCD"[k]}</span><span>${esc(q.choices[idx])}</span>`); b.type = "button"; b.dataset.idx = idx;
      b.addEventListener("click", () => { if (current.answered) return; lockChoices(g, idx, q.answer); finishQuestion(q, idx === q.answer); });
      g.appendChild(b);
    });
    box.appendChild(g);
  }
  function lockChoices(g, picked, answer) {
    g.querySelectorAll(".choice").forEach((b, k) => {
      const idx = b.dataset.idx != null ? Number(b.dataset.idx) : k;
      b.disabled = true; if (idx === answer) b.classList.add("correct"); else if (idx === picked) b.classList.add("wrong");
    });
  }

  /* ---------- 結果 ---------- */
  async function finishStage() {
    const st = current.stage, n = current.qs.length, rate = current.correct / n;
    const pass = st.pass || C.passRate; const cleared = rate >= pass - 1e-9;
    const weak = [...new Set(current.wrong.map(q => q.source).filter(Boolean))];
    const secs = Math.round((Date.now() - current.started) / 1000);
    const s = Store.load();
    const log = { logId: Store.uuid(), at: new Date().toISOString(), name: s.name, deviceId: s.deviceId, chapter: st.chapter.id, chapterName: st.chapter.name, stage: st.id, stageName: st.name, correct: current.correct, total: n, rate: Math.round(rate * 1000) / 1000, cleared, seconds: secs, weak: weak.join(";"), app: C.version };
    const wasDone = isCleared(st.id);
    Store.recordStage(st.id, { rate, cleared, weak, log });
    $("#r-title").textContent = cleared ? (st.boss ? "ボス撃破！" : "ステージクリア！") : "もう一度挑戦";
    $("#r-big").textContent = `${current.correct} / ${n}`;
    $("#r-big").style.color = cleared ? "var(--ok)" : "var(--ng)";
    $("#r-sub").textContent = `正答率 ${Math.round(rate * 100)}%（クリア条件 ${Math.round(pass * 100)}%）・${secs}秒`;
    const w = $("#r-weak"); w.innerHTML = weak.length ? "<div class='muted'>見直す出典</div>" + weak.map(x => `<span class="badge">${esc(x)}</span>`).join(" ") : "<div class='muted'>全問正解。弱点なし</div>";
    const chDoneNow = cleared && !wasDone && chapterDone(st.chapter);
    $("#r-badge").innerHTML = chDoneNow ? `<div class="fb good"><div class="ttl">🏅 第${st.chapter.no}章「${esc(st.chapter.name)}」のバッジを獲得</div></div>` : "";
    const next = stagesFlat[stagesFlat.findIndex(x => x.id === st.id) + 1];
    $("#r-next").style.display = cleared && next ? "" : "none";
    $("#r-next").onclick = () => next.chapter.id === st.chapter.id ? startStage(next.id) : openChapter(next.chapter.id);
    $("#r-retry").onclick = () => startStage(st.id);
    $("#r-chapter").onclick = () => openChapter(st.chapter.id);
    $("#r-send").textContent = Sheet.enabled ? "送信中…" : "（記録先の設定なし・この端末にのみ保存）";
    show("result");
    if (cleared) confetti();
    const res = await Sheet.flush();
    $("#r-send").textContent = !Sheet.enabled ? "（記録先の設定なし・この端末にのみ保存）" : res.sent ? `スプレッドシートに記録しました（${res.sent}件）` : "記録を送信できませんでした。次回起動時に再送します";
  }

  /* ---------- 名前 ---------- */
  $("#name-form").addEventListener("submit", e => {
    e.preventDefault(); const v = $("#name-input").value.trim(); if (!v) return;
    Store.setName(v); renderHome(); Sheet.flush();
  });
  $("#who-change").addEventListener("click", () => { $("#name-input").value = Store.load().name; show("name"); });
  $("#who-reset").addEventListener("click", () => { if (confirm("この端末の進捗をすべて消します。よろしいですか？")) { Store.reset(); $("#name-input").value = ""; show("name"); } });
  document.querySelectorAll("[data-go=home]").forEach(b => b.addEventListener("click", renderHome));
  $("#st-back").addEventListener("click", () => openChapter(current.chapter.id));
  $("#r-resend").addEventListener("click", async () => { const r = await Sheet.flush(); toast(r.sent ? `${r.sent}件を送信しました` : "送信できませんでした"); renderHomeQuiet(); });
  function renderHomeQuiet() { const s = Store.load(); $("#queue-note").textContent = s.queue.length ? `未送信の記録 ${s.queue.length} 件` : ""; }

  /* 検証用フック（本番でも無害） */
  window.KichoDojo = { startStage, openChapter, renderHome, get current() { return current; }, stagesFlat, qByStage };

  /* ---------- 起動 ---------- */
  $("#ver").textContent = "版 " + C.version + "・問題 " + Q.length + "問";
  const s = Store.load();
  if (s.name) { renderHome(); Sheet.flush().then(renderHomeQuiet); } else show("name");
})();
