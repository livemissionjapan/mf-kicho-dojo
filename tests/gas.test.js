/* GAS（記録の保存先）の検査：gas/Code.js を GAS もどきで動かし、受講者と管理者の API を通しで確かめる */
const test = require("node:test"), assert = require("node:assert/strict");
const { start } = require("./support/mockgas");

test("受講者と管理者の API", async t => {
  const s = await start(); t.after(() => s.close());
  const U = s.url + "exec";
  const post = b => fetch(U, { method: "POST", body: JSON.stringify(b) }).then(r => r.json());
  const get = q => fetch(U + "?" + new URLSearchParams(q)).then(r => r.json());
  let token;

  await t.test("未登録の人は、既定では自分で登録できない", async () => {
    assert.equal((await get({ action: "restore", name: "x@example.com", pin: "1234" })).error, "unknown");
  });
  await t.test("管理者：初期パスでログイン → 変更を求められる → 変更できる", async () => {
    assert.equal((await post({ kind: "admin", op: "login", id: "admin", pass: "wrong-pass" })).error, "login");
    const j = await post({ kind: "admin", op: "login", id: "admin", pass: s.tempPass });
    assert.ok(j.token); assert.equal(j.mustChange, true); token = j.token;
    assert.equal((await post({ kind: "admin", op: "changePass", token, oldPass: s.tempPass, newPass: "short" })).ok, undefined);
    assert.equal((await post({ kind: "admin", op: "changePass", token, oldPass: s.tempPass, newPass: "TestAdmin-2026" })).ok, true);
  });
  await t.test("トークンなし・偽トークンでは管理 API を使えない", async () => {
    assert.ok((await post({ kind: "admin", op: "data" })).error);
    assert.ok((await post({ kind: "admin", op: "data", token: "nope" })).error);
  });
  await t.test("スタッフ追加：ID はメールアドレスだけ。大文字小文字はそろえる", async () => {
    assert.equal((await post({ kind: "admin", op: "staffAdd", token, name: "yamada", pass: "12345678" })).error, "email");
    assert.equal((await post({ kind: "admin", op: "staffAdd", token, name: "Hanako@Example.com", pass: "12345678", display: "テスト 花子" })).ok, true);
    assert.equal((await post({ kind: "admin", op: "staffAdd", token, name: "hanako@example.com", pass: "12345678" })).error, "exists");
    const r = await get({ action: "restore", name: "HANAKO@example.com ", pin: "12345678" });
    assert.equal(r.ok, true); assert.equal(r.display, "テスト 花子");
    assert.equal((await get({ action: "restore", name: "hanako@example.com", pin: "00000000" })).error, "pin");
  });
  await t.test("進捗の記録が管理画面のデータに出る", async () => {
    const logs = [{ logId: "h1", at: new Date().toISOString(), chapter: "r1", stage: "r1-1", stageName: "x", correct: 5, total: 5, rate: 1, cleared: true, seconds: 200 }];
    await post({ kind: "progress", name: "hanako@example.com", pin: "12345678", logs });
    const j = await post({ kind: "admin", op: "data", token });
    assert.equal(j.users.length, 1); assert.equal(j.logs.length, 1);
  });
  await t.test("停止した人はログインできず、再開すれば戻る", async () => {
    await post({ kind: "admin", op: "staffStatus", token, name: "hanako@example.com", status: "停止" });
    assert.equal((await get({ action: "restore", name: "hanako@example.com", pin: "12345678" })).error, "stopped");
    await post({ kind: "admin", op: "staffStatus", token, name: "hanako@example.com", status: "有効" });
    assert.equal((await get({ action: "restore", name: "hanako@example.com", pin: "12345678" })).ok, true);
  });
  await t.test("最後の管理者・自分自身は消せない", async () => {
    assert.ok((await post({ kind: "admin", op: "adminDelete", token, id: "admin" })).error);
  });
});
