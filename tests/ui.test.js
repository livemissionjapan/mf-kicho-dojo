/* 画面の検査：スマホ（320・375）／タブレット（768）／PC（1280）で全画面を開き、
 *  - 横にはみ出して横スクロールが出ない
 *  - ボタンや選択肢の文字が切れない
 *  - スマホで押しにくい小さなボタンがない（高さ 32px 未満）
 *  - 読み込みに失敗した絵がない
 * を確かめる。Chrome（/Applications/Google Chrome.app）を使う */
const test = require("node:test"), assert = require("node:assert/strict");
const { chromium } = require("playwright-core");
const { start } = require("./support/mockgas");

const VIEWPORTS = [
  { name: "スマホ小 320", width: 320, height: 640, mobile: true },
  { name: "スマホ 375", width: 375, height: 812, mobile: true },
  { name: "タブレット 768", width: 768, height: 1024, mobile: false },
  { name: "PC 1280", width: 1280, height: 800, mobile: false }
];

/* ページの中で走らせる検査 */
function inspect(mobile) {
  const W = document.documentElement.clientWidth, out = [];
  const desc = e => (e.id ? "#" + e.id : e.tagName.toLowerCase() + (e.className && typeof e.className === "string" ? "." + e.className.trim().split(/\s+/).join(".") : "")) + ` 「${(e.textContent || "").trim().slice(0, 18)}」`;
  if (document.documentElement.scrollWidth > W + 1) out.push(`横スクロールが出る（ページ幅 ${document.documentElement.scrollWidth}px / 画面 ${W}px）`);
  const scroller = e => { for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) { const s = getComputedStyle(p); if (/(auto|scroll)/.test(s.overflowX) || p.tagName === "DIALOG") return true; } return false; };
  const visible = e => { const r = e.getBoundingClientRect(); if (!r.width || !r.height) return false; const s = getComputedStyle(e); return s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity) > 0.05; };
  for (const e of document.querySelectorAll("body *")) {
    if (!visible(e) || e.closest("svg") && e.tagName !== "svg") continue;
    const r = e.getBoundingClientRect();
    if ((r.right > W + 1 || r.left < -1) && !scroller(e) && getComputedStyle(e).position !== "fixed") out.push(`はみ出し ${desc(e)}（左${Math.round(r.left)}〜右${Math.round(r.right)} / 画面${W}）`);
    if (e.matches("button, .btn, .choice, a, .chip, input, select") && e.scrollWidth > e.clientWidth + 2 && !/(auto|scroll)/.test(getComputedStyle(e).overflowX)) out.push(`文字が切れる ${desc(e)}（中身${e.scrollWidth} / 枠${e.clientWidth}）`);
    if (mobile && e.matches("button, a[href], input, select, summary") && !e.disabled && (e.closest("label") || e).getBoundingClientRect().height < 32 && !e.closest(".crumb")) out.push(`押しにくい（高さ${Math.round(r.height)}px） ${desc(e)}`);
  }
  for (const e of document.querySelectorAll("header.top .brand, header.top .who > *, .track-go, .adm-tabs button")) { // 1行で収まるべき文字
    if (!visible(e) || !e.textContent.trim()) continue;
    let lines = 0; const tw = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
    for (let t; (t = tw.nextNode());) { if (!t.textContent.trim()) continue; const rg = document.createRange(); rg.selectNodeContents(t); lines = Math.max(lines, new Set([...rg.getClientRects()].filter(r => r.width > 1).map(r => Math.round(r.top / 6))).size); }
    if (lines > 1) out.push(`2行に折り返す ${desc(e)}`);
  }
  for (const img of document.images) if (img.complete && img.naturalWidth === 0 && visible(img) && !img.classList.contains("noimg")) out.push(`絵が出ない ${img.getAttribute("src")}`);
  return [...new Set(out)];
}

test("どの画面幅でも崩れない", { timeout: 600000 }, async t => {
  const s = await start(); s.props.SELF_REGISTER = "1";
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  t.after(async () => { await browser.close(); await s.close(); });

  // 管理画面に出すためのデータ（受講者 2人と記録）
  const U = s.url + "exec", post = b => fetch(U, { method: "POST", body: JSON.stringify(b) }).then(r => r.json());
  const login = await post({ kind: "admin", op: "login", id: "admin", pass: s.tempPass });
  await post({ kind: "admin", op: "changePass", token: login.token, oldPass: s.tempPass, newPass: "TestAdmin-2026" });
  for (const [n, d] of [["hanako@example.com", "山田 花子"], ["a-very-long-email-address-for-testing@example-restaurant.co.jp", "とても長い表示名のスタッフさん"]]) {
    await post({ kind: "admin", op: "staffAdd", token: login.token, name: n, pass: "12345678", display: d });
    await post({ kind: "progress", name: n, pin: "12345678", logs: [{ logId: n + "1", at: new Date().toISOString(), chapter: "c1", stage: "s1-1", stageName: "x", correct: 4, total: 5, rate: 0.8, cleared: true, seconds: 300, hard: "q1-1-a", fields: '{"f1":{"c":4,"t":5}}' }] });
  }

  // 問題の型ごとに1問ずつ（経理・飲食店・診断）
  const pickTypes = await (async () => {
    const p = await browser.newPage(); await p.goto(s.url);
    const ids = await p.evaluate(() => { const Q = window.KichoDojo.Q, seen = {}; for (const q of Q) { const k = q.type + (q.stage.startsWith("r") ? "-inshoku" : q.stage === "diag" ? "-diag" : ""); if (!seen[k]) seen[k] = q.id; } return seen; });
    await p.close(); return ids;
  })();

  for (const vp of VIEWPORTS) {
    await t.test(vp.name, async () => {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.mobile, hasTouch: vp.mobile, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      const failed = [];
      page.on("response", r => { if (r.status() >= 400 && !r.url().includes("favicon")) failed.push(`${r.status()} ${new URL(r.url()).pathname}`); });
      page.on("pageerror", e => failed.push("JSエラー " + e.message));
      const problems = [];
      const check = async label => {
        await page.waitForTimeout(350);
        await page.evaluate(() => Promise.all([...document.images].filter(i => !i.complete).map(i => new Promise(r => { i.onload = i.onerror = r; setTimeout(r, 1500); }))));
        for (const p of await page.evaluate(inspect, vp.mobile)) problems.push(`[${label}] ${p}`);
      };

      await page.goto(s.url); await check("ログイン");
      await page.fill("#name-input", "hanako@example.com"); await page.fill("#pin-input", "12345678"); await page.click("#name-go");
      await page.waitForSelector("#track.active"); await check("入口（3つの道）");
      await page.click("#go-keiri"); await page.waitForSelector("#home.active"); await check("経理の道 マップ");
      await page.evaluate(() => window.KichoDojo.openChapter("c1")); await check("章");
      await page.evaluate(() => window.Finance.renderTrack()); await page.click("#go-inshoku"); await check("飲食店の道 マップ");
      await page.evaluate(() => window.KichoDojo.openChapter("r1")); await check("飲食店の章");
      for (const [k, id] of Object.entries(pickTypes)) {
        await page.evaluate(id => window.KichoDojo.showQuestion(id), id); await check(`問題 ${k}`);
        // 答えて解説を出す
        const answered = await page.evaluate(() => {
          const b = document.querySelector("#q-body .choice:not([disabled])"); if (b) { b.click(); return true; }
          const sel = document.querySelectorAll("#q-body select"); sel.forEach(s => { s.selectedIndex = 1; s.dispatchEvent(new Event("change", { bubbles: true })); });
          const tr = document.querySelector("#q-body tbody tr"); if (tr) tr.click();
          const go = [...document.querySelectorAll("#q-body .btn")].find(x => !x.disabled); if (go) { go.click(); return true; } return false;
        });
        if (answered) await check(`解説 ${k}`);
      }
      await page.evaluate(() => { const c = window.KichoDojo.current; c.i = c.qs.length - 1; c.answered = true; document.querySelector("#q-next").style.display = ""; document.querySelector("#q-next").click(); });
      await page.waitForSelector("#result.active"); await check("結果");
      await page.evaluate(() => window.Finance.renderTrack()); await page.click("#go-zaimu"); await check("財務の部屋");
      const lens = await page.$("#finance-box [data-lens]"); if (lens) { await lens.click(); await check("財務の視点（ダイアログ）"); await page.keyboard.press("Escape"); }

      // 管理者
      await page.goto(s.url + "#admin"); await page.waitForSelector("#adm-login"); await check("管理者ログイン");
      await page.fill("#adm-id", "admin"); await page.fill("#adm-pass", "TestAdmin-2026"); await page.click("#adm-login button[type=submit]");
      await page.waitForSelector("[data-tab]");
      for (const tab of ["overview", "people", "stages", "staff", "settings"]) {
        await page.click(`[data-tab=${tab}]`); await check(`管理 ${tab}`);
        if (tab === "people") { await page.click("#adm-body [data-person]"); await check("管理 人の詳細"); }
      }
      await ctx.close();
      const all = problems.concat(failed.map(f => "[読み込み失敗] " + f));
      assert.equal(all.length, 0, `${vp.name} の問題 ${all.length}件\n  ` + all.slice(0, 60).join("\n  "));
    });
  }
});

test("ログアウトすると、次に開いたときログイン画面に戻る", async t => {
  const s = await start(); s.props.SELF_REGISTER = "1";
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  t.after(async () => { await browser.close(); await s.close(); });
  const page = await browser.newPage();
  await page.goto(s.url);
  await page.fill("#name-input", "taro@example.com"); await page.fill("#pin-input", "12345678"); await page.click("#name-go");
  await page.waitForSelector("#track.active");
  await page.click("#who-change"); await page.reload();
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => document.querySelector("#name").classList.contains("active")), true);
});
