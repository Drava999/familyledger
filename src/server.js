// Family Ledger: self-hosted on Cloudflare Workers + D1, behind Cloudflare Access.
// Build: node build.mjs  (embeds the web page into dist/worker.js)
const INDEX_HTML = "__INDEX_HTML__";

const CATS = ["Food & Dining","Groceries","Transport","Shopping","Bills & Utilities","Subscriptions","Health","Entertainment","Travel","Education","Insurance","Cash","Income","Transfers","Investing","Other"];
const MAX_TX_BYTES = 1_900_000; // D1 row limit is 2 MB

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    try {
      if (!url.pathname.startsWith("/api/")) {
        if (req.method !== "GET" && req.method !== "HEAD") return json({ error: "Not found" }, 404);
        // The page itself is also behind Access, but serving it is harmless: all data comes from /api.
        return new Response(INDEX_HTML, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache", ...SEC_HEADERS } });
      }
      const email = await authEmail(req, env);
      if (!email) return json({ error: "Sign in through Cloudflare Access to use Family Ledger." }, 401);
      if (env.ALLOWED_EMAILS) {
        const allow = env.ALLOWED_EMAILS.toLowerCase().split(/[\s,]+/).filter(Boolean);
        if (!allow.includes(email)) return json({ error: `${email} isn't on this family's list. Ask the owner to add you.` }, 403);
      }
      if (["POST", "PUT", "DELETE"].includes(req.method)) {
        // CSRF guard: only accept JSON from our own page
        const origin = req.headers.get("origin");
        if (origin && origin !== url.origin) return json({ error: "Wrong origin" }, 403);
        if (req.method !== "DELETE" && !(req.headers.get("content-type") || "").includes("application/json")) return json({ error: "Expected JSON" }, 415);
      }
      return await route(req, env, url, email);
    } catch (e) {
      const status = e.status || 500;
      if (status >= 500) console.error(e && e.stack || e);
      return json({ error: e.publicMessage || (status >= 500 ? "Something went wrong on the server." : e.message) }, status);
    }
  },
};

const SEC_HEADERS = { "x-content-type-options": "nosniff", "referrer-policy": "same-origin", "x-frame-options": "DENY" };
function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...SEC_HEADERS } }); }
function fail(status, msg) { const e = new Error(msg); e.status = status; e.publicMessage = msg; return e; }
async function body(req, limit = 4_000_000) {
  const text = await req.text();
  if (text.length > limit) throw fail(413, "That's too big to upload in one go.");
  try { return JSON.parse(text || "{}"); } catch { throw fail(400, "Bad JSON"); }
}

/* ---------------- auth: Cloudflare Access JWT ---------------- */
let certCache = { at: 0, keys: null, team: "" };
function b64urlToBytes(s) { s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
async function accessKeys(team) {
  if (certCache.keys && certCache.team === team && Date.now() - certCache.at < 3600_000) return certCache.keys;
  const r = await fetch(`https://${team}/cdn-cgi/access/certs`);
  if (!r.ok) throw fail(500, "Couldn't fetch Cloudflare Access keys. Check TEAM_DOMAIN.");
  const { keys } = await r.json();
  certCache = { at: Date.now(), keys, team };
  return keys;
}
async function authEmail(req, env) {
  if (env.DEV_EMAIL) return env.DEV_EMAIL.toLowerCase(); // local testing only, never set in production
  const team = String(env.TEAM_DOMAIN || "").replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const audTag = env.POLICY_AUD || env.ACCESS_AUD;
  if (!team || !audTag) throw fail(500, "Cloudflare Access isn't set up yet: set TEAM_DOMAIN and POLICY_AUD.");
  const token = req.headers.get("cf-access-jwt-assertion");
  if (!token) return null;
  const [h, p, s] = token.split(".");
  if (!h || !p || !s) return null;
  let header, payload;
  try { header = JSON.parse(new TextDecoder().decode(b64urlToBytes(h))); payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(p))); } catch { return null; }
  if (header.alg !== "RS256") return null;
  const keys = await accessKeys(team);
  const jwk = keys.find(k => k.kid === header.kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlToBytes(s), new TextEncoder().encode(`${h}.${p}`));
  if (!ok) return null;
  const now = Date.now() / 1000;
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(audTag)) return null;
  if (payload.exp && payload.exp < now) return null;
  if (payload.iss && payload.iss !== `https://${team}`) return null;
  return payload.email ? String(payload.email).toLowerCase() : null;
}

/* ---------------- routes ---------------- */
async function route(req, env, url, email) {
  const db = env.DB;
  if (!db) throw fail(500, "The D1 database isn't bound. Add a DB binding in wrangler.toml.");
  const m = req.method, p = url.pathname;

  if (p === "/api/me" && m === "GET") {
    await db.prepare("INSERT INTO users(email,name,created) VALUES(?,?,?) ON CONFLICT(email) DO NOTHING").bind(email, "", Date.now()).run();
    const u = await db.prepare("SELECT email,name FROM users WHERE email=?").bind(email).first();
    return json({ email, name: u?.name || "", ai: !!env.AI });
  }
  if (p === "/api/me" && m === "PUT") {
    const b = await body(req);
    const name = String(b.name || "").trim().slice(0, 30);
    await db.prepare("UPDATE users SET name=? WHERE email=?").bind(name, email).run();
    return json({ ok: true, name });
  }

  if (p === "/api/data" && m === "GET") {
    const [files, rules, budgets, lookups, users] = await db.batch([
      db.prepare("SELECT id,owner,name,person,added,shared,tx FROM files WHERE owner=? OR shared=1 ORDER BY added").bind(email),
      db.prepare("SELECT merchant,category,source,note FROM rules"),
      db.prepare("SELECT scope,data FROM budgets WHERE owner=?").bind(email),
      db.prepare("SELECT merchant,what,category,confidence FROM lookups"),
      db.prepare("SELECT email,name FROM users"),
    ]);
    const names = Object.fromEntries(users.results.map(u => [u.email, u.name]));
    const out = {
      files: files.results.map(f => ({ id: f.id, name: f.name, person: f.person, added: f.added, shared: !!f.shared, mine: f.owner === email, ownerName: f.owner === email ? "" : (names[f.owner] || "family"), tx: safeParse(f.tx, []) })),
      rules: {}, notes: {}, budgets: {}, lookups: {},
    };
    for (const r of rules.results) { out.rules[r.merchant] = r.category; if (r.note) out.notes[r.merchant] = r.note; }
    for (const b of budgets.results) out.budgets[b.scope] = safeParse(b.data, {});
    for (const l of lookups.results) out.lookups[l.merchant] = { what: l.what, category: l.category, confidence: l.confidence };
    return json(out);
  }

  if (p === "/api/files" && m === "POST") {
    const b = await body(req);
    const tx = cleanTx(b.tx);
    const id = /^[A-Za-z0-9_-]{4,40}$/.test(b.id || "") ? b.id : crypto.randomUUID();
    const existing = await db.prepare("SELECT owner FROM files WHERE id=?").bind(id).first();
    const finalId = existing ? crypto.randomUUID() : id;
    await db.prepare("INSERT INTO files(id,owner,name,person,added,shared,tx) VALUES(?,?,?,?,?,?,?)")
      .bind(finalId, email, String(b.name || "statement").slice(0, 120), String(b.person || "Me").slice(0, 30), Number(b.added) || Date.now(), b.shared ? 1 : 0, tx).run();
    return json({ id: finalId });
  }
  const fm = p.match(/^\/api\/files\/([A-Za-z0-9_-]{1,64})$/);
  if (fm) {
    const id = fm[1];
    const row = await db.prepare("SELECT owner FROM files WHERE id=?").bind(id).first();
    if (!row || row.owner !== email) throw fail(404, "That statement isn't yours or no longer exists.");
    if (m === "DELETE") { await db.prepare("DELETE FROM files WHERE id=?").bind(id).run(); return json({ ok: true }); }
    if (m === "PUT") {
      const b = await body(req);
      const sets = [], vals = [];
      if (b.tx !== undefined) { sets.push("tx=?"); vals.push(cleanTx(b.tx)); }
      if (b.shared !== undefined) { sets.push("shared=?"); vals.push(b.shared ? 1 : 0); }
      if (b.person !== undefined) { sets.push("person=?"); vals.push(String(b.person).slice(0, 30)); }
      if (b.name !== undefined) { sets.push("name=?"); vals.push(String(b.name).slice(0, 120)); }
      if (!sets.length) return json({ ok: true });
      await db.prepare(`UPDATE files SET ${sets.join(",")} WHERE id=?`).bind(...vals, id).run();
      return json({ ok: true });
    }
  }

  if (p === "/api/rules" && m === "POST") {
    const b = await body(req);
    const stmts = [];
    for (const [k, c] of Object.entries(b.set || {}).slice(0, 2000)) {
      const key = String(k).slice(0, 60);
      if (c === null) stmts.push(db.prepare("DELETE FROM rules WHERE merchant=?").bind(key));
      else if (CATS.includes(c)) stmts.push(db.prepare("INSERT INTO rules(merchant,category,source,note,by,updated) VALUES(?,?,'you',NULL,?,?) ON CONFLICT(merchant) DO UPDATE SET category=excluded.category,source='you',by=excluded.by,updated=excluded.updated").bind(key, c, email, Date.now()));
    }
    for (let i = 0; i < stmts.length; i += 100) await db.batch(stmts.slice(i, i + 100));
    return json({ ok: true, saved: stmts.length });
  }

  if (p === "/api/budgets" && m === "PUT") {
    const b = await body(req);
    const scope = String(b.scope || "All").slice(0, 30);
    const data = {};
    for (const [c, v] of Object.entries(b.data || {})) if (CATS.includes(c) && Number(v) > 0) data[c] = Math.round(Number(v) * 100) / 100;
    if (Object.keys(data).length) await db.prepare("INSERT INTO budgets(owner,scope,data) VALUES(?,?,?) ON CONFLICT(owner,scope) DO UPDATE SET data=excluded.data").bind(email, scope, JSON.stringify(data)).run();
    else await db.prepare("DELETE FROM budgets WHERE owner=? AND scope=?").bind(email, scope).run();
    return json({ ok: true });
  }

  if (p === "/api/lookup" && m === "POST") return json(await lookup(env, db, await body(req), email));
  if (p === "/api/analyse" && m === "POST") return json(await analyse(env, await body(req, 60_000)));
  if (p === "/api/pdf" && m === "POST") return json(await readPdf(env, await body(req, 12_000_000)));

  throw fail(404, "Not found");
}

function safeParse(s, d) { try { return JSON.parse(s); } catch { return d; } }
function cleanTx(tx) {
  if (!Array.isArray(tx)) throw fail(400, "tx must be a list");
  const out = [];
  for (const t of tx) {
    if (!Array.isArray(t) || !/^\d{4}-\d{2}-\d{2}$/.test(t[0]) || typeof t[2] !== "number" || !isFinite(t[2])) continue;
    const row = [t[0], String(t[1] ?? "").slice(0, 160), Math.round(t[2] * 100) / 100, CATS.includes(t[3]) ? t[3] : "Other"];
    if (t[4] === 1) row.push(1);
    out.push(row);
  }
  const s = JSON.stringify(out);
  if (s.length > MAX_TX_BYTES) throw fail(413, "This statement is too large for one file. Split it into smaller date ranges.");
  return s;
}

/* ---------------- Workers AI ---------------- */
const DEFAULT_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
function model(env) { return env.AI_MODEL || DEFAULT_MODEL; }
function lastJson(text) {
  if (text && typeof text === "object") return text;
  text = String(text || "");
  const fenced = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map(m => m[1]);
  for (const cand of [...fenced.reverse(), text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)]) {
    try { return JSON.parse(cand); } catch {}
  }
  return null;
}
// Runs the chat model. With a schema it asks for JSON mode and falls back to parsing plain text.
async function llm(env, messages, { schema, maxTokens = 1500 } = {}) {
  if (!env.AI) throw fail(400, "Workers AI isn't turned on for this site. Add the [ai] binding in wrangler.toml.");
  const base = { messages, max_tokens: maxTokens, temperature: 0.2 };
  let out;
  try {
    out = await env.AI.run(model(env), schema ? { ...base, response_format: { type: "json_schema", json_schema: schema } } : base);
  } catch (e) {
    const msg = String(e && e.message || e);
    if (schema && /json mode/i.test(msg)) out = await env.AI.run(model(env), base); // model couldn't meet the schema: try free text
    else if (/3040|capacity|429|rate/i.test(msg)) throw fail(429, "Cloudflare AI is busy. Try again in a minute.");
    else if (/4006|neuron|daily/i.test(msg)) throw fail(429, "Today's free AI allowance is used up. It resets at 8am Singapore time.");
    else throw fail(502, "Cloudflare AI error: " + msg.slice(0, 200));
  }
  const r = out && out.response !== undefined ? out.response : out;
  return schema ? lastJson(r) : String(r || "");
}

const LOOKUP_SCHEMA = { type: "object", properties: { results: { type: "array", items: { type: "object", properties: {
  name: { type: "string" }, what: { type: "string" }, category: { type: "string", enum: [...CATS, "Unsure"] }, confidence: { type: "string", enum: ["high", "medium", "low"] } },
  required: ["name", "what", "category", "confidence"] } } }, required: ["results"] };

async function lookup(env, db, b, email) {
  const items = (Array.isArray(b.merchants) ? b.merchants : []).slice(0, 12).map(x => ({
    name: String(x.name || "").slice(0, 60),
    examples: (Array.isArray(x.examples) ? x.examples : []).slice(0, 2).map(e => String(e).slice(0, 100)),
    direction: ["in", "out", "both"].includes(x.direction) ? x.direction : "out",
  })).filter(x => x.name);
  if (!items.length) return { results: {} };
  const results = {};
  const cached = await db.batch(items.map(i => db.prepare("SELECT merchant,what,category,confidence FROM lookups WHERE merchant=?").bind(i.name)));
  const todo = [];
  items.forEach((i, n) => { const c = cached[n].results[0]; if (c) results[i.name] = { what: c.what, category: c.category, confidence: c.confidence, applied: false }; else todo.push(i); });
  if (todo.length) {
    const system = `You categorise merchants from Singapore bank and card statements for a family budgeting app. You cannot browse the web, so rely on what you know.
Bank codes: MST/BAT = card purchase (Mastercard/Visa), NETS = NETS payment, "POS NETS QR PAYMENT ... TO:" = NETS QR at a hawker stall or shop, ICT = FAST/PayNow transfer, IDT = funds transfer out (often to a brokerage such as Interactive Brokers, whose account numbers start with U), RTF/TRF = transfers. "ShopBack", "Qashier", "Adyen", "Stripe", "SMP*" before a name is the payment processor, not the shop.
Allowed categories: ${CATS.filter(c => c !== "Other").join(", ")}. Use "Unsure" if you can't tell. Names that look like a private person (often masked, e.g. "JOHN TXX") are Transfers with low confidence.
Confidence: "high" only if you clearly know this business or brand. "medium" if the name strongly hints at it (e.g. "... NOODLE STALL"). Otherwise "low".
Keep "what" under 12 words, e.g. "Fish and chips restaurant chain". Return one result per merchant, with the name exactly as given.`;
    const parsed = await llm(env, [{ role: "system", content: system }, { role: "user", content: JSON.stringify(todo) }], { schema: LOOKUP_SCHEMA, maxTokens: 1500 });
    const list = (parsed && Array.isArray(parsed.results)) ? parsed.results : [];
    const stmts = [];
    for (const r of list) {
      const item = todo.find(i => i.name === r.name); if (!item || results[item.name]) continue;
      const category = CATS.includes(r.category) ? r.category : "Other";
      const confidence = category === "Other" ? "low" : (["high", "medium", "low"].includes(r.confidence) ? r.confidence : "low");
      const what = String(r.what || "").slice(0, 160);
      results[item.name] = { what, category, confidence, applied: false };
      stmts.push(db.prepare("INSERT INTO lookups(merchant,what,category,confidence,updated) VALUES(?,?,?,?,?) ON CONFLICT(merchant) DO UPDATE SET what=excluded.what,category=excluded.category,confidence=excluded.confidence,updated=excluded.updated").bind(item.name, what, category, confidence, Date.now()));
    }
    if (stmts.length) await db.batch(stmts);
  }
  // auto-file confident answers, never overriding a category a person chose
  const apply = Object.entries(results).filter(([, r]) => r.confidence === "high" && r.category !== "Other");
  if (apply.length) {
    const existing = await db.batch(apply.map(([k]) => db.prepare("SELECT source FROM rules WHERE merchant=?").bind(k)));
    const stmts = [];
    apply.forEach(([k, r], n) => {
      const ex = existing[n].results[0];
      if (ex && ex.source === "you") return;
      r.applied = true;
      stmts.push(db.prepare("INSERT INTO rules(merchant,category,source,note,by,updated) VALUES(?,?,'ai',?,?,?) ON CONFLICT(merchant) DO UPDATE SET category=excluded.category,source='ai',note=excluded.note,by=excluded.by,updated=excluded.updated").bind(k, r.category, r.what, email, Date.now()));
    });
    if (stmts.length) await db.batch(stmts);
  }
  return { results };
}

async function analyse(env, b) {
  const d = b.data || {};
  const f = k => String(d[k] ?? "").slice(0, 6000);
  const system = `You are a practical personal-finance coach for a household in Singapore. Amounts are SGD. Give specific, numbers-based advice tied to the data. No generic tips. "Transfers" between accounts and people are excluded from spending; "Investing" counts as saving; "Other" is spending not yet categorised. You are not a licensed financial adviser, so don't recommend specific investment products.
Format as plain text with these headings on their own lines:
SNAPSHOT (2-3 sentences)
WHAT STANDS OUT (3-5 bullets with numbers)
RECOMMENDATIONS (4-6 numbered actions, each with an estimated monthly saving in $)
SUGGESTED MONTHLY BUDGET (one line per category)
Keep it under 380 words.`;
  const user = `PERIOD: ${f("period")}
MONTHLY:
${f("monthly")}
BY PERSON:
${f("perPerson")}
TOP MERCHANTS (spend): ${f("top")}
RECURRING CHARGES: ${f("recurring")}
BUDGETS ${f("budgets")}
UNSORTED SPENDING: ${f("unsorted")}
GOALS/CONTEXT: ${f("goals")}`;
  const text = await llm(env, [{ role: "system", content: system }, { role: "user", content: user }], { maxTokens: 900 });
  return { text: text.trim() };
}

const TX_SCHEMA = { type: "object", properties: { transactions: { type: "array", items: { type: "object", properties: {
  date: { type: "string" }, description: { type: "string" }, amount: { type: "number" } }, required: ["date", "description", "amount"] } } }, required: ["transactions"] };

async function readPdf(env, b) {
  if (!env.AI) throw fail(400, "Workers AI isn't turned on for this site.");
  const data = String(b.data || "");
  if (!data || data.length > 11_000_000) throw fail(400, "Send a PDF under 8 MB.");
  const bin = atob(data); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  let conv;
  try { conv = await env.AI.toMarkdown([{ name: String(b.name || "statement.pdf").slice(0, 80), blob: new Blob([bytes], { type: "application/pdf" }) }], { conversionOptions: { pdf: { metadata: false } } }); }
  catch (e) { throw fail(502, "Couldn't convert the PDF: " + String(e && e.message || e).slice(0, 160)); }
  const doc = Array.isArray(conv) ? conv[0] : conv;
  if (!doc || doc.format === "error" || !doc.data) throw fail(422, "This PDF has no readable text. Try the bank's CSV export instead.");
  const text = String(doc.data);
  const chunks = []; for (let i = 0; i < text.length && chunks.length < 8; i += 7000) chunks.push(text.slice(i, i + 7000));
  const system = `You extract transactions from a Singapore bank account or credit card statement converted to text. List every transaction line in the text you are given.
amount is negative for money going out (purchases, withdrawals, fees, transfers out) and positive for money coming in (salary, deposits, refunds, payments made to the card). Skip balances, totals and summary lines.
date is YYYY-MM-DD. If lines show only day and month, take the year from the statement date in the text (a December line on a January statement belongs to the previous year).`;
  const out = [];
  for (const c of chunks) {
    const r = await llm(env, [{ role: "system", content: system }, { role: "user", content: c }], { schema: TX_SCHEMA, maxTokens: 3500 });
    for (const t of (r && Array.isArray(r.transactions) ? r.transactions : [])) out.push([t.date, t.description, t.amount]);
  }
  return { transactions: out.slice(0, 5000) };
}
