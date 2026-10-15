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
ok(await call(null, { DB }) === 500, "refuses to run when Access isn't configured");

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
