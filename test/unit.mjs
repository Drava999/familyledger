// Unit checks: Access JWT verification and web-lookup auto-filing rules.
import { DB, sqlite, aiCalls, AI } from "./harness.mjs";
const here = new URL(".", import.meta.url).pathname;
const worker = (await import(here + "../dist/worker.js?u")).default;
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) process.exitCode = 1; };

// --- JWT ---
const kp = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const jwk = { ...(await crypto.subtle.exportKey("jwk", kp.publicKey)), kid: "k1", alg: "RS256" };
const team = "fam.cloudflareaccess.com", AUD = "aud123";
const prevFetch = globalThis.fetch;
globalThis.fetch = async (u, o) => String(u) === `https://${team}/cdn-cgi/access/certs` ? new Response(JSON.stringify({ keys: [jwk] })) : prevFetch(u, o);
const b64u = b => Buffer.from(b).toString("base64url");
async function token(claims, key = kp.privateKey, kid = "k1") {
  const h = b64u(JSON.stringify({ alg: "RS256", kid })), p = b64u(JSON.stringify(claims));
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${h}.${p}`));
  return `${h}.${p}.${b64u(new Uint8Array(sig))}`;
}
const env = { DB, TEAM_DOMAIN: "https://" + team, POLICY_AUD: AUD };
const call = async (tok, e = env) => (await worker.fetch(new Request("https://x/api/me", { headers: tok ? { "cf-access-jwt-assertion": tok } : {} }), e, {})).status;
const now = Math.floor(Date.now() / 1000);
ok(await call(await token({ aud: [AUD], email: "Bryan@Example.com", exp: now + 600, iss: `https://${team}` })) === 200, "valid Access token accepted");
ok(await call(null) === 401, "no token rejected");
ok(await call(await token({ aud: ["other"], email: "a@b.c", exp: now + 600 })) === 401, "wrong audience rejected");
ok(await call(await token({ aud: [AUD], email: "a@b.c", exp: now - 10 })) === 401, "expired token rejected");
const other = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
ok(await call(await token({ aud: [AUD], email: "a@b.c", exp: now + 600 }, other.privateKey)) === 401, "forged signature rejected");
ok(await call(await token({ aud: [AUD], email: "x@y.z", exp: now + 600 }), { ...env, ALLOWED_EMAILS: "bryan@example.com, mum@example.com" }) === 403, "email not on allow-list rejected");
ok(await call(null, { DB }) === 401, "refuses everything when Access isn't switched on");
const viaCtx = await worker.fetch(new Request("https://x/api/me"), { DB }, { access: { aud: "a", getIdentity: async () => ({ email: "Mum@Example.com" }) } });
ok(viaCtx.status === 200 && (await viaCtx.json()).email === "mum@example.com", "Worker-level Access identity (ctx.access) accepted");
const ctxAllow = await worker.fetch(new Request("https://x/api/me"), { DB, ALLOWED_EMAILS: "bryan@example.com" }, { access: { aud: "a", getIdentity: async () => ({ email: "stranger@gmail.com" }) } });
ok(ctxAllow.status === 403, "allow-list still applies with ctx.access");

// --- lookup auto-filing ---
const dev = { DB, AI, DEV_EMAIL: "bryan@example.com" };
const post = async (path, body) => (await worker.fetch(new Request("http://localhost" + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), dev, {})).json();
await post("/api/rules", { set: { "MY CAFE": "Shopping" } }); // a person's choice
const r = await post("/api/lookup", { merchants: [{ name: "MY CAFE", examples: ["MST MY CAFE SI SGP"], direction: "out" }, { name: "NEW CAFE", examples: ["MST NEW CAFE SI SGP"], direction: "out" }] });
ok(r.results["NEW CAFE"].applied === true, "high-confidence AI answer filed automatically");
ok(r.results["MY CAFE"].applied === false, "AI answer never overrides a person's choice");
const rules = Object.fromEntries(sqlite.prepare("SELECT merchant,category,source FROM rules").all().map(x => [x.merchant, x.category + "/" + x.source]));
ok(rules["MY CAFE"] === "Shopping/you" && rules["NEW CAFE"] === "Food & Dining/ai", "rules table correct: " + JSON.stringify(rules));
const n = aiCalls.length;
await post("/api/lookup", { merchants: [{ name: "NEW CAFE", examples: [], direction: "out" }] });
ok(aiCalls.length === n, "repeat lookups come from the cache, no new AI call");
const first = aiCalls[0];
ok(first.model === "@cf/meta/llama-3.3-70b-instruct-fp8-fast" && first.input.response_format.type === "json_schema", "uses the free Workers AI model in JSON mode");
const pdf = await post("/api/pdf", { name: "s.pdf", data: Buffer.from("%PDF-1.4 test").toString("base64") });
ok(pdf.transactions.length === 1 && pdf.transactions[0][2] === -9.5, "PDF goes through toMarkdown then the model");
const noai = await (await worker.fetch(new Request("http://localhost/api/lookup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ merchants: [{ name: "X SHOP" }] }) }), { DB, DEV_EMAIL: "a@b.c" }, {})).json();
ok(/Workers AI isn't turned on/.test(noai.error || ""), "clear message when the AI binding is missing");
const big = await worker.fetch(new Request("http://localhost/api/files", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "x", tx: [["2026-01-01", "<script>", 1, "Hacker"], ["bad"], ["2026-01-02", "ok", "NaN"]] }) }), dev, {});
const fid = (await big.json()).id; const stored = JSON.parse(sqlite.prepare("SELECT tx FROM files WHERE id=?").get(fid).tx);
ok(stored.length === 1 && stored[0][3] === "Other", "server drops malformed rows and unknown categories");

// --- import helpers (pure functions from web/parse.js) ---
{
  const src = (await import("node:fs")).readFileSync(here + "../web/parse.js", "utf8");
  const P = new Function(src + ";return {purchaseDate,accountFromRows,shortAcct,dedupeCount,pairTransfers,applyShare,autoCategory,NON_SPEND};")();
  ok(P.purchaseDate("2026-10-14", "MST SHOPEE SG SI SGP 12OCT") === "2026-10-12", "card purchase date read from 12OCT");
  ok(P.purchaseDate("2026-01-02", "X SI SGP 30DEC") === "2025-12-30", "purchase date across new year");
  ok(P.purchaseDate("2026-10-14", "X 20OCT") === "2026-10-14", "future 'purchase date' ignored");
  ok(P.accountFromRows([["Account Details For:", "POSB Savings Account 123-45692-9"], [], ["Transaction Date", "Description"]], 2) === "123-45692-9", "account number found above the header");
  ok(P.shortAcct("123-45692-9") === "…692-9", "account shown as last digits");
  const d = P.dedupeCount([["2026-10-01", "KOPI", -1.5], ["2026-10-01", "KOPI", -1.5]], [["2026-10-01", "KOPI", -1.5], ["2026-10-01", "KOPI", -1.5], ["2026-10-01", "KOPI", -1.5], ["2026-10-02", "X", -3]]);
  ok(d.dup === 2 && d.fresh.length === 2, "overlap counted: 2 of 3 identical kopis already there, third kept");
  const pr = P.pairTransfers([{ id: 1, date: "2026-10-14", amt: -1654, acct: "A", cat: "Transfers" }, { id: 2, date: "2026-10-15", amt: 1654, acct: "B", cat: "Transfers" }, { id: 3, date: "2026-10-15", amt: 1654, acct: "A", cat: "Transfers" }, { id: 4, date: "2026-10-30", amt: -50, acct: "A", cat: "Transfers" }, { id: 5, date: "2026-10-20", amt: 50, acct: "B", cat: "Transfers" }]);
  ok(pr.get(1) === 2 && !pr.has(3) && !pr.has(4), "transfers paired across accounts within 3 days only");
  ok(P.applyShare(-68, "50%") === -34 && P.applyShare(-68, "20") === -20 && P.applyShare(-10, "20") === -10 && P.applyShare(25, "50%") === 25, "split share applied to payments only");
  ok(P.autoCategory("ICT PayNow Transfer 1 To: JOHN TAN OTHR", -20, {})[0] === "People" && P.NON_SPEND.has("People"), "PayNow to a person is People, not spending");
}
// --- business: FloofMart's Ledger tab -> rows, matched to bank payments ---
{
  const src = (await import("node:fs")).readFileSync(here + "../web/parse.js", "utf8");
  const P = new Function(src + ";return {parseBizLedger,bizExpense,matchBusiness};")();
  const sheet = [["FloofMart"], [], ["date", "type", "category", "amount", "notes", "contributors", "amount spent by each", ""],
    ["", "Inventory", "Cards", 535, "Card lot, bought jointly", "You; Danish", "267.50; 267.50"],
    [46305, "Overhead", "Software", "S$65.30", "PriceCharting (monthly)", "You", "65.3"],   // 2026-10-10 as a Sheets serial number
    ["10/10/2026", "Inventory", "Cards", 215, "Bulk — first part", "", ""],
    ["2026-10-12", "Equipment", "Hardware", 89, "Label printer", "Danish", "89"],
    ["", "", "", "", "", "", ""],
    ["2026-10-01", "Sales", "", 120, "Drop 14", "", ""]];
  const rows = P.parseBizLedger(sheet);
  ok(rows && rows.length === 5 && rows[0].r === 4 && rows[0].a === 535 && JSON.stringify(rows[0].w) === JSON.stringify([["You", 267.5], ["Danish", 267.5]]), "Ledger header found by name, blank row skipped, contributors split: " + JSON.stringify(rows && rows[0]));
  ok(rows[1].d === "2026-10-10" && rows[1].a === 65.3 && rows[2].d === "2026-10-10", "dates read as Sheets serial numbers, day-first text and ISO; S$ amounts cleaned");
  const E = rows.map(r => P.bizExpense(r, ["Bryan"]));
  ok(E[0].mine === 267.5 && E[0].others[0] === "Danish" && E[2].mine === 215 && E[3].mine === 0 && E[3].others[0] === "Danish" && E[4].income, "your share: half of a joint buy, all of an unsplit row, nothing when Danish paid; Sales is income");
  ok(P.parseBizLedger([["a", "b"], [1, 2]]) === null, "a sheet without Ledger columns is refused");
  const tx = [
    { id: "f:0", date: "2026-10-10", post: "2026-10-10", raw: -215, cat: "Other", pair: null },
    { id: "f:1", date: "2026-10-13", post: "2026-10-14", raw: -65.3, cat: "Subscriptions", pair: null },
    { id: "f:2", date: "2026-08-15", post: "2026-08-15", raw: -267.5, cat: "People", pair: null },
    { id: "f:3", date: "2026-07-01", post: "2026-07-01", raw: -89, cat: "Shopping", pair: null },
    { id: "f:4", date: "2026-10-09", post: "2026-10-09", raw: -215, cat: "Transfers", pair: "g:0" },
    { id: "f:5", date: "2026-10-30", post: "2026-10-30", raw: -65.3, cat: "Subscriptions", pair: null },
  ];
  let M = P.matchBusiness(rows, tx, {}, ["Bryan"]);
  ok(M.byRow.get(6) === "f:0" && M.byRow.get(5) === "f:1" && M.byRow.get(4) === "f:2", "dated rows match the nearest payment within 5 days (not the paired transfer); undated row matches its one 267.50 payment: " + JSON.stringify([...M.byRow]));
  ok(!M.byRow.has(7) && !M.byRow.has(8), "a row Danish paid and an income row match nothing");
  M = P.matchBusiness(rows, tx.concat([{ id: "f:6", date: "2026-09-01", post: "2026-09-01", raw: -267.5, cat: "Other", pair: null }]), {}, ["Bryan"]);
  ok(!M.byRow.has(4), "an undated row with two possible payments is left for a person to decide");
  M = P.matchBusiness(rows, tx, { r4: "f:3", r6: "none" }, ["Bryan"]);
  ok(M.byRow.get(4) === "f:3" && !M.byRow.has(6) && M.skipped.has(6) && M.byTx.get("f:3").r === 4, "links by hand win: a chosen payment and a skipped row");
}
// --- server: people, rule details, accounts, goals ---
{
  const E = { DB, DEV_EMAIL: "bryan@example.com" };
  const call = (method, path, body) => worker.fetch(new Request("http://localhost" + path, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }), E, {});
  const f = await (await call("POST", "/api/files", { name: "a.csv", person: "Bryan", account: "123-45692-9", tx: [["2026-10-01", "ICT PayNow To: JOHN", -20, "People"], ["2026-10-02", "DINNER", -68, "Food & Dining", 0, "50%"], ["2026-10-03", "X", -5, "Food & Dining", 1, "bad!"]] })).json();
  await call("POST", "/api/rules", { set: { "INFINITE FLORIST": { c: "Shopping", note: "Flowers for a birthday", share: "20", tag: "" }, "HO LENG": { c: "Income", note: "Pocket money", tag: "family" }, "BAD": { c: "Nope" } } });
  await call("PUT", "/api/budgets", { scope: "goals", data: [{ id: "g1", kind: "save", name: "Japan", target: 3000, start: "2026-10" }, { kind: "evil", target: "x" }] });
  await call("PUT", "/api/budgets", { scope: "All", data: { Total: 1300, Shopping: 300, Hacker: 5 } });
  const data = await (await call("GET", "/api/data")).json();
  const file = data.files.find(x => x.id === f.id);
  ok(file.account === "123-45692-9", "account number stored with the statement");
  ok(file.tx[0][3] === "People" && JSON.stringify(file.tx[1]) === JSON.stringify(["2026-10-02", "DINNER", -68, "Food & Dining", 0, "50%"]) && file.tx[2].length === 5, "People category and split share kept; bad share dropped");
  ok(data.rules["INFINITE FLORIST"] === "Shopping" && data.notes["INFINITE FLORIST"] === "Flowers for a birthday" && data.meta["INFINITE FLORIST"].share === "20", "rule saved with note and split share");
  ok(data.meta["HO LENG"].tag === "family" && !("BAD" in data.rules), "family tag saved; unknown category refused");
  ok(data.budgets.goals.length === 2 && data.budgets.goals[0].target === 3000 && data.budgets.goals[1].kind === "save" && data.budgets.goals[1].target === 0, "goals saved and cleaned");
  ok(data.budgets.All.Total === 1300 && data.budgets.All.Shopping === 300 && !("Hacker" in data.budgets.All), "monthly cap saved with limits");
  await call("PUT", "/api/files/" + f.id, { account: "POSB Savings" });
  ok((await (await call("GET", "/api/data")).json()).files.find(x => x.id === f.id).account === "POSB Savings", "account label can be renamed");
  // business ledger: stored per owner, cleaned, links kept when only rows change
  const bz = await (await call("PUT", "/api/business", { sheet: "1AbC-def_GhIJKLMNOPQRSTUVWXYZ0123456789abc/evil", name: "FloofMart\u0001 Sheet", rows: [{ r: 4, d: "2026-10-10", t: "Inventory", c: "Cards", a: "215", n: "Bulk — first part", w: [["You", 215]] }, { r: 5, d: "bad", t: "", c: "", a: 0, n: "" }, "junk", { r: 9, d: "", t: "Loss", a: -510, n: "<b>Scam</b>", w: [["You", "510"], [7, 1]] }], links: { r4: f.id + ":0", r9: "none", r1: "../etc", ["t" + f.id + ":2"]: 1, evil: 1 } })).json();
  ok(bz.ok && bz.rows === 2, "ledger rows saved, blank and junk rows dropped");
  await call("POST", "/api/rules", { set: { "PRICECHARTING": { c: "Subscriptions", tag: "biz" } } });
  let d2 = await (await call("GET", "/api/data")).json();
  ok(d2.business.sheet === "1AbC-def_GhIJKLMNOPQRSTUVWXYZ0123456789abcevil" && d2.business.name === "FloofMart Sheet" && d2.business.tab === "Ledger", "sheet id and name cleaned");
  ok(d2.business.rows[1].a === 510 && d2.business.rows[1].w.length === 1 && d2.business.rows[0].a === 215, "amounts positive numbers, bad contributor dropped: " + JSON.stringify(d2.business.rows[1]));
  ok(JSON.stringify(d2.business.links) === JSON.stringify({ r4: f.id + ":0", r9: "none", ["t" + f.id + ":2"]: 1 }), "only well-formed links kept: " + JSON.stringify(d2.business.links));
  ok(d2.meta["PRICECHARTING"].tag === "biz", "a merchant rule can carry the business tag");
  await call("PUT", "/api/business", { rows: [] });
  d2 = await (await call("GET", "/api/data")).json();
  ok(d2.business.rows.length === 0 && d2.business.links.r4 === f.id + ":0" && d2.business.sheet.startsWith("1AbC"), "updating rows alone keeps the sheet and the links");
  const other = await (await worker.fetch(new Request("http://localhost/api/data"), { DB, DEV_EMAIL: "mum@example.com" }, {})).json();
  ok(other.business === null, "the ledger is private to its owner");
  await call("DELETE", "/api/business");
  ok((await (await call("GET", "/api/data")).json()).business === null, "ledger can be removed");
}
// --- Google sign-in (runs last: it fills the family list) ---
{
  const gkp = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const gjwk = { ...(await crypto.subtle.exportKey("jwk", gkp.publicKey)), kid: "g1", alg: "RS256" };
  const pf = globalThis.fetch;
  globalThis.fetch = async (u, o) => String(u) === "https://www.googleapis.com/oauth2/v3/certs" ? new Response(JSON.stringify({ keys: [gjwk] })) : pf(u, o);
  const CID = "123-abc.apps.googleusercontent.com";
  const gtok = (claims, key = gkp.privateKey) => token({ iss: "https://accounts.google.com", aud: CID, email_verified: true, exp: now + 600, ...claims }, key, "g1");
  const E = { DB };
  const req = (path, opts = {}) => worker.fetch(new Request("https://fam.workers.dev" + path, opts), E, {});
  const login = (cred, origin = "https://fam.workers.dev") => req("/api/login", { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify({ credential: cred }) });

  ok((await login(await gtok({ email: "bryan@gmail.com" }))).status === 503, "login refused until a client ID is set");
  sqlite.prepare("INSERT INTO settings(k,v) VALUES('google_client_id',?)").run(CID);
  ok((await (await req("/api/login-config")).json()).clientId === CID, "page gets the client ID");
  ok((await login(await gtok({ email: "bryan@gmail.com" }))).status === 403, "nobody gets in while the family list is empty");
  sqlite.prepare("INSERT INTO members(email,added) VALUES('bryan@gmail.com',0)").run();
  const good = await login(await gtok({ email: "Bryan@Gmail.com" }));
  const cookie = (good.headers.get("set-cookie") || "").split(";")[0];
  ok(good.status === 200 && /HttpOnly/.test(good.headers.get("set-cookie")) && /Secure/.test(good.headers.get("set-cookie")), "family member signs in, gets a secure cookie");
  const me = await req("/api/me", { headers: { cookie } });
  ok(me.status === 200 && (await me.json()).email === "bryan@gmail.com", "cookie works for the API");
  ok((await req("/api/me")).status === 401, "no cookie, no data");
  ok((await req("/api/me", { headers: { cookie: cookie.slice(0, -3) + "AAA" } })).status === 401, "tampered cookie rejected");
  const forged = "fl_session=" + Buffer.from(JSON.stringify({ e: "bryan@gmail.com", exp: now + 999 })).toString("base64url") + ".AAAA";
  ok((await req("/api/me", { headers: { cookie: forged } })).status === 401, "forged cookie rejected");
  ok((await login(await gtok({ email: "stranger@gmail.com" }))).status === 403, "Google account not in family rejected");
  ok((await login(await gtok({ email: "bryan@gmail.com", aud: "someone-elses-app" }))).status === 401, "token for another app rejected");
  ok((await login(await gtok({ email: "bryan@gmail.com", email_verified: false }))).status === 401, "unverified email rejected");
  ok((await login(await gtok({ email: "bryan@gmail.com", exp: now - 5 }))).status === 401, "expired Google token rejected");
  ok((await login(await gtok({ email: "bryan@gmail.com", iss: "https://evil.example" }))).status === 401, "wrong issuer rejected");
  ok((await login(await gtok({ email: "bryan@gmail.com" }, other.privateKey))).status === 401, "forged Google signature rejected");
  ok((await login(await gtok({ email: "bryan@gmail.com" }), "https://evil.example")).status === 403, "login from another site rejected");
  const strangerAccess = await worker.fetch(new Request("https://x/api/me"), { DB }, { access: { aud: "a", getIdentity: async () => ({ email: "stranger@gmail.com" }) } });
  ok(strangerAccess.status === 403, "family list also applies to Cloudflare Access sign-ins");
  const out = await req("/api/logout", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  ok(/Max-Age=0/.test(out.headers.get("set-cookie") || ""), "sign out clears the cookie");
  globalThis.fetch = pf;
}
