/* 入口（経理を学ぶ／財務を学ぶ）と財務ルートの画面。中身は data/finance.js */
(function () {
  const F = window.FINANCE;
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const img = (id, cls) => `<img class="${cls || "pic"}" src="img/${esc(id)}.jpg" alt="" loading="lazy" onerror="this.classList.add('noimg')">`;
  const lensById = Object.fromEntries(F.lenses.map(l => [l.id, l]));
  const sessionById = Object.fromEntries(F.sessions.map(s => [s.id, s]));
  const sLabel = id => { const s = sessionById[id]; return s ? `${s.label}（${s.when}）` : ""; };

  function show(id) { document.querySelectorAll(".view").forEach(v => v.classList.remove("active")); $("#" + id).classList.add("active"); window.scrollTo({ top: 0 }); if (window.KichoDojo && window.KichoDojo.setCrumb) window.KichoDojo.setCrumb(id); }

  /* ---------- 入口 ---------- */
  function renderTrack() {
    const name = (window.Store && Store.load().name) || "";
    $("#who-name").textContent = name;
    $("#track-hello").textContent = name ? `${name}さん、今日はどちらを学びますか？` : "今日はどちらを学びますか？";
    show("track");
  }

  /* ---------- 財務ルート ---------- */
  let tag = "";
  function renderFinance() {
    const nEv = F.lenses.reduce((s, l) => s + l.evidence.length, 0);
    const mins = F.sessions.reduce((s, x) => s + (x.minutes || 0), 0);
    const ranked = F.lenses.map(l => [l, l.evidence.length]).sort((a, b) => b[1] - a[1]);
    const max = ranked[0][1] || 1;
    const tags = [...new Set(F.knowledge.flatMap(k => k.tags))];

    $("#finance-box").innerHTML = `
      <div class="card fin-hero">
        ${img("f-hero", "fin-hero-pic")}
        <div>
          <div class="eyebrow">${esc(F.role)}の頭の中</div>
          <h1>${esc(F.person)}は、数字をどう考えているか</h1>
          <p class="muted">${esc(F.intro)}</p>
          <div class="fin-stats">
            <div><b>${F.sessions.length}</b><span>セッション</span></div>
            <div><b>${F.lenses.length}</b><span>視点</span></div>
            <div><b>${F.knowledge.length}</b><span>知識カード</span></div>
            <div><b>${mins}</b><span>分を分析</span></div>
          </div>
        </div>
      </div>

      <nav class="fin-nav">
        <a href="#fin-flow">思考回路</a><a href="#fin-lens">視点のクセ</a><a href="#fin-think">思考の実演</a><a href="#fin-know">知識</a><a href="#fin-steal">盗める型</a>
      </nav>

      <div class="card" id="fin-flow">
        <h2>思考回路 ── 判断までの5つの段</h2>
        <p class="muted">押すと実際の発言が出ます。結論が出ても「もう一度疑う」が毎回入るのが特徴。</p>
        <div class="flow">${F.flow.map((s, i) => `
          ${i ? '<span class="flow-arrow" aria-hidden="true">→</span>' : ""}
          <button class="flow-step" data-lens="${s.lens}" type="button">
            <span class="flow-pic">${img("f-" + s.lens, "")}<em>${i + 1}</em></span>
            <b>${esc(s.short)}</b><span class="muted">${esc(s.sub)}</span>
          </button>`).join("")}
        </div>
        <div class="flow-loop">↺ 結論が出ても、もう一度疑ってやり直す</div>
      </div>

      <h2 class="fin-h" id="fin-lens">視点のクセ <span class="muted">出てきた回数の順</span></h2>
      <div class="lens-grid">${ranked.map(([l, n]) => `
        <button class="lens-card" data-lens="${l.id}" type="button">
          ${img("f-" + l.id, "lens-pic")}
          <div class="lens-tx"><b>${esc(l.name)}</b><span class="muted">${esc(l.desc)}</span>
            <span class="meter"><i style="width:${(n / max) * 100}%"></i></span><span class="cnt">${n}回</span></div>
        </button>`).join("")}
      </div>

      <h2 class="fin-h" id="fin-think">思考の実演 <span class="muted">どう考えて結論に行ったか</span></h2>
      ${F.thinking.map(t => `
        <details class="card think" ${t.id === "t1" ? "open" : ""}>
          <summary>${t.img ? img(t.img, "think-pic") : ""}<div><div class="eyebrow">${esc(sLabel(t.session))}</div><b class="think-title">${esc(t.title)}</b><span class="muted">${esc(t.sub)}</span></div></summary>
          <ol class="steps">${t.steps.map((s, i) => `<li><span class="dot">${i + 1}</span><div><b>${esc(s.label)}</b><p>${esc(s.detail)}</p></div></li>`).join("")}</ol>
        </details>`).join("")}

      <h2 class="fin-h" id="fin-know">知識カード <span class="muted">判断に使われた知識</span></h2>
      <div class="chips" id="fin-tags"><button class="chipf${tag ? "" : " on"}" data-tag="" type="button">すべて ${F.knowledge.length}</button>${tags.map(t => `<button class="chipf${t === tag ? " on" : ""}" data-tag="${esc(t)}" type="button">${esc(t)} ${F.knowledge.filter(k => k.tags.includes(t)).length}</button>`).join("")}</div>
      <div class="kgrid">${F.knowledge.filter(k => !tag || k.tags.includes(tag)).map(k => `
        <article class="kcard">
          <div class="ktags">${k.tags.map(t => `<span class="tag">${esc(t)}</span>`).join("")}<span class="muted">${esc(sLabel(k.session))}</span></div>
          <h3 class="k-title">${esc(k.title)}</h3>
          <p class="rule">${esc(k.rule)}</p>
          <p class="muted">${esc(k.detail)}</p>
        </article>`).join("")}
      </div>

      <div class="card steal" id="fin-steal">
        <h2>盗める型 ── 明日から顧問先で使う</h2>
        <div class="steal-grid">${F.steal.map((s, i) => `<div class="steal-item"><span class="num">${i + 1}</span><div><b>${esc(s.title)}</b><p class="muted">${esc(s.how)}</p></div></div>`).join("")}</div>
      </div>

      <div class="card">
        <h2>セッション一覧</h2>
        ${F.sessions.map(s => `<div class="sess"><b>${esc(s.label)}</b><span class="muted">${esc(s.when)}・${s.minutes}分</span><p>${esc(s.theme)}</p></div>`).join("")}
        <p class="muted" style="font-size:12px">顧客名・実際の金額は伏せて、考え方と制度の知識だけを載せています。</p>
      </div>`;

    const box = $("#finance-box");
    box.querySelectorAll("[data-lens]").forEach(b => b.addEventListener("click", () => openLens(b.dataset.lens)));
    box.querySelectorAll("[data-tag]").forEach(b => b.addEventListener("click", () => {
      tag = b.dataset.tag; const y = $("#fin-know").getBoundingClientRect().top + window.scrollY - 70;
      renderFinance(); window.scrollTo({ top: y });
    }));
    box.querySelectorAll(".fin-nav a").forEach(a => a.addEventListener("click", e => {
      e.preventDefault(); const t = $(a.getAttribute("href")); window.scrollTo({ top: t.getBoundingClientRect().top + window.scrollY - 70, behavior: "smooth" });
    }));
    if (!$("#finance").classList.contains("active")) show("finance");
  }

  function openLens(id) {
    const l = lensById[id];
    $("#lens-body").innerHTML = `
      ${img("f-" + l.id, "lens-dlg-pic")}
      <h2>${esc(l.name)}</h2><p class="muted">${esc(l.desc)}</p>
      ${l.evidence.map(e => `<figure class="quote"><blockquote>「${esc(e.quote)}」</blockquote><figcaption class="muted">${esc(sLabel(e.session))}　${esc(e.note)}</figcaption></figure>`).join("")}`;
    $("#lens-dialog").showModal();
  }

  /* ---------- つなぎ込み ---------- */
  $("#go-keiri").addEventListener("click", () => window.KichoDojo.renderHome());
  $("#go-zaimu").addEventListener("click", () => { tag = ""; renderFinance(); });
  document.querySelectorAll("[data-go=track]").forEach(b => b.addEventListener("click", renderTrack));
  $("#lens-dialog").addEventListener("click", e => { if (e.target.id === "lens-dialog") e.target.close(); });

  window.Finance = { renderTrack, renderFinance };
})();
