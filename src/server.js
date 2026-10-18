// Family Ledger: self-hosted on Cloudflare Workers + D1, behind Cloudflare Access.
// Build: node build.mjs  (embeds the web page into dist/worker.js)
const INDEX_HTML = "__INDEX_HTML__";
const ASSETS = "__ASSETS__"; // manifest, icons, service worker (filled in by build.mjs)

const CATS = ["Food & Dining","Groceries","Transport","Shopping","Bills & Utilities","Subscriptions","Health","Entertainment","Travel","Education","Insurance","Cash","Income","Transfers","Investing","People","Other"];
const MAX_TX_BYTES = 1_900_000; // D1 row limit is 2 MB

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    try {
      if (!url.pathname.startsWith("/api/")) {
        if (req.method !== "GET" && req.method !== "HEAD") return json({ error: "Not found" }, 404);
        const a = typeof ASSETS === "object" && ASSETS[url.pathname];
        if (a) {
          const bytes = a.b64 ? b64urlToBytes(a.b64) : a.text;
          const cc = url.pathname === "/sw.js" ? "no-cache" : "public, max-age=86400";
          return new Response(bytes, { headers: { "content-type": a.type, "cache-control": cc, ...(url.pathname === "/sw.js" ? { "service-worker-allowed": "/" } : {}), ...SEC_HEADERS } });
        }
        // The page itself is also behind Access, but serving it is harmless: all data comes from /api.
        return new Response(INDEX_HTML, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache", ...SEC_HEADERS } });
      }
      if (["POST", "PUT", "DELETE"].includes(req.method)) {
        // CSRF guard: only accept JSON from our own page
        const origin = req.headers.get("origin");
        if (origin && origin !== url.origin) return json({ error: "Wrong origin" }, 403);
        if (req.method !== "DELETE" && !(req.headers.get("content-type") || "").includes("application/json")) return json({ error: "Expected JSON" }, 415);
      }
      if (env.DB) await ensureSchema(env.DB);
      // Sign-in endpoints (no session needed)
      if (url.pathname === "/api/login-config" && req.method === "GET") return json({ clientId: await googleClientId(env) });
      if (url.pathname === "/api/login" && req.method === "POST") return await googleLogin(req, env, url);
      if (url.pathname === "/api/logout" && req.method === "POST") return json({ ok: true }, 200, { "set-cookie": clearCookie() });

      const who = await authEmail(req, env, ctx);
      if (!who) return json({ error: "Please sign in.", login: true }, 401);
      const email = who.email;
      const allow = await allowedEmails(env);
      if (allow.size ? !allow.has(email) : who.via === "google") return json({ error: `${email} isn't on this family's list. Ask the owner to add you.`, login: true }, 403);
      return await route(req, env, url, email);
    } catch (e) {
      const status = e.status || 500;
      if (status >= 500) console.error(e && e.stack || e);
      return json({ error: e.publicMessage || (status >= 500 ? "Something went wrong on the server." : e.message) }, status);
    }
  },
};

const SEC_HEADERS = { "x-content-type-options": "nosniff", "referrer-policy": "same-origin", "x-frame-options": "DENY" };
function json(obj, status = 200, extra = {}) { return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...SEC_HEADERS, ...extra } }); }
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
async function authEmail(req, env, ctx) {
  if (env.DEV_EMAIL) return { email: env.DEV_EMAIL.toLowerCase(), via: "dev" }; // local testing only, never set in production
  // 1. Our own Google sign-in session cookie
  const s = await readSession(req, env);
  if (s) return { email: s, via: "google" };
  // 2. Worker-level Cloudflare Access (optional): Cloudflare has already checked the login and hands us the identity.
  if (ctx && ctx.access) {
    const id = await ctx.access.getIdentity().catch(() => null);
    return id && id.email ? { email: String(id.email).toLowerCase(), via: "access" } : null;
  }
  const e = await accessJwtEmail(req, env);
  return e ? { email: e, via: "access" } : null;
}
async function accessJwtEmail(req, env) {
  // Fallback: hostname-based Access (e.g. a custom domain) — verify the JWT ourselves.
  const team = String(env.TEAM_DOMAIN || "").replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const audTag = env.POLICY_AUD || env.ACCESS_AUD;
  if (!team || !audTag) return null;
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

/* ---------------- Google sign-in ---------------- */
// Family list + settings live in D1 (not in this public repo).
let schemaReady = false;
async function ensureSchema(db) {
  if (schemaReady) return;
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS members (email TEXT PRIMARY KEY, added INTEGER)"),
    db.prepare("CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT)"),
    // the business (FloofMart) Ledger: one row per owner, rows copied from the Google Sheet's Ledger tab
    db.prepare("CREATE TABLE IF NOT EXISTS business (owner TEXT PRIMARY KEY, sheet TEXT NOT NULL DEFAULT '', name TEXT NOT NULL DEFAULT '', tab TEXT NOT NULL DEFAULT 'Ledger', rows TEXT NOT NULL DEFAULT '[]', links TEXT NOT NULL DEFAULT '{}', updated INTEGER)"),
  ]);
  // columns added after launch (ignore "duplicate column" on later runs)
  for (const sql of ["ALTER TABLE files ADD COLUMN account TEXT NOT NULL DEFAULT ''", "ALTER TABLE rules ADD COLUMN share TEXT", "ALTER TABLE rules ADD COLUMN tag TEXT"])
    await db.prepare(sql).run().catch(() => {});
  schemaReady = true;
}
async function setting(env, k) { const r = await env.DB.prepare("SELECT v FROM settings WHERE k=?").bind(k).first(); return r ? r.v : ""; }
async function googleClientId(env) { return String(env.GOOGLE_CLIENT_ID || (env.DB ? await setting(env, "google_client_id") : "") || "").trim(); }
async function allowedEmails(env) {
  const set = new Set(String(env.ALLOWED_EMAILS || "").toLowerCase().split(/[\s,]+/).filter(Boolean));
  if (env.DB) { const { results } = await env.DB.prepare("SELECT email FROM members").all(); for (const r of results || []) set.add(String(r.email).toLowerCase()); }
  return set;
}

let googleCerts = { at: 0, keys: null };
async function googleKeys() {
  if (googleCerts.keys && Date.now() - googleCerts.at < 3600_000) return googleCerts.keys;
  const r = await fetch("https://www.googleapis.com/oauth2/v3/certs");
  if (!r.ok) throw fail(502, "Couldn't reach Google to check the sign-in. Try again.");
  const { keys } = await r.json();
  googleCerts = { at: Date.now(), keys };
  return keys;
}
async function verifyGoogleToken(token, clientId) {
  const [h, p, s] = String(token || "").split(".");
  if (!h || !p || !s) return null;
  let header, payload;
  try { header = JSON.parse(new TextDecoder().decode(b64urlToBytes(h))); payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(p))); } catch { return null; }
  if (header.alg !== "RS256") return null;
  const jwk = (await googleKeys()).find(k => k.kid === header.kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  if (!(await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlToBytes(s), new TextEncoder().encode(`${h}.${p}`)))) return null;
  const now = Date.now() / 1000;
  if (payload.aud !== clientId) return null;
  if (!["accounts.google.com", "https://accounts.google.com"].includes(payload.iss)) return null;
  if (!payload.exp || payload.exp < now) return null;
  if (payload.email_verified !== true && payload.email_verified !== "true") return null;
  return payload.email ? String(payload.email).toLowerCase() : null;
}
async function googleLogin(req, env, url) {
  if (!env.DB) throw fail(500, "The D1 database isn't bound.");
  const clientId = await googleClientId(env);
  if (!clientId) return json({ error: "Google sign-in isn't set up yet (no client ID)." }, 503);
  const b = await body(req, 10_000);
  const email = await verifyGoogleToken(b.credential, clientId);
  if (!email) return json({ error: "Google sign-in couldn't be verified. Try again." }, 401);
  const allow = await allowedEmails(env);
  if (!allow.has(email)) return json({ error: `${email} isn't on this family's list. Ask the owner to add you.` }, 403);
  return json({ ok: true, email }, 200, { "set-cookie": await sessionCookie(env, email, url) });
}

// Session cookie: base64url({e,exp}) + "." + HMAC-SHA256, key generated once and kept in D1.
const SESSION_DAYS = 30;
async function sessionKey(env) {
  let k = await setting(env, "session_key");
  if (!k) {
    const raw = crypto.getRandomValues(new Uint8Array(32));
    await env.DB.prepare("INSERT INTO settings(k,v) VALUES('session_key',?) ON CONFLICT(k) DO NOTHING").bind(bytesToB64url(raw)).run();
    k = await setting(env, "session_key");
  }
  return crypto.subtle.importKey("raw", b64urlToBytes(k), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
function bytesToB64url(u) { let s = ""; for (const b of u) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
async function sessionCookie(env, email, url) {
  const p = bytesToB64url(new TextEncoder().encode(JSON.stringify({ e: email, exp: Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400 })));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await sessionKey(env), new TextEncoder().encode(p)));
  const secure = url.protocol === "https:" ? "; Secure" : "";
  return `fl_session=${p}.${bytesToB64url(sig)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure}`;
}
function clearCookie() { return "fl_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure"; }
async function readSession(req, env) {
  if (!env.DB) return null;
  const m = (req.headers.get("cookie") || "").match(/(?:^|;\s*)fl_session=([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)/);
  if (!m) return null;
  const ok = await crypto.subtle.verify("HMAC", await sessionKey(env), b64urlToBytes(m[2]), new TextEncoder().encode(m[1])).catch(() => false);
  if (!ok) return null;
  let d; try { d = JSON.parse(new TextDecoder().decode(b64urlToBytes(m[1]))); } catch { return null; }
  if (!d.e || !d.exp || d.exp < Date.now() / 1000) return null;
  return String(d.e).toLowerCase();
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
    const [files, rules, budgets, lookups, users, biz] = await db.batch([
      db.prepare("SELECT id,owner,name,person,account,added,shared,tx FROM files WHERE owner=? OR shared=1 ORDER BY added").bind(email),
      db.prepare("SELECT merchant,category,source,note,share,tag FROM rules"),
      db.prepare("SELECT scope,data FROM budgets WHERE owner=?").bind(email),
      db.prepare("SELECT merchant,what,category,confidence FROM lookups"),
      db.prepare("SELECT email,name FROM users"),
      db.prepare("SELECT sheet,name,tab,rows,links,updated FROM business WHERE owner=?").bind(email),
    ]);
    const names = Object.fromEntries(users.results.map(u => [u.email, u.name]));
    const out = {
      files: files.results.map(f => ({ id: f.id, name: f.name, person: f.person, account: f.account || "", added: f.added, shared: !!f.shared, mine: f.owner === email, ownerName: f.owner === email ? "" : (names[f.owner] || "family"), tx: safeParse(f.tx, []) })),
      rules: {}, notes: {}, meta: {}, budgets: {}, lookups: {},
    };
    for (const r of rules.results) { out.rules[r.merchant] = r.category; if (r.note) out.notes[r.merchant] = r.note; if (r.share || r.tag) out.meta[r.merchant] = { share: r.share || "", tag: r.tag || "" }; }
    for (const b of budgets.results) out.budgets[b.scope] = safeParse(b.data, {});
    for (const l of lookups.results) out.lookups[l.merchant] = { what: l.what, category: l.category, confidence: l.confidence };
    const bz = biz.results[0];
    out.business = bz ? { sheet: bz.sheet, name: bz.name, tab: bz.tab, rows: safeParse(bz.rows, []), links: safeParse(bz.links, {}), updated: bz.updated } : null;
    return json(out);
  }

  if (p === "/api/files" && m === "POST") {
    const b = await body(req);
    const tx = cleanTx(b.tx);
    const id = /^[A-Za-z0-9_-]{4,40}$/.test(b.id || "") ? b.id : crypto.randomUUID();
    const existing = await db.prepare("SELECT owner FROM files WHERE id=?").bind(id).first();
    const finalId = existing ? crypto.randomUUID() : id;
    await db.prepare("INSERT INTO files(id,owner,name,person,account,added,shared,tx) VALUES(?,?,?,?,?,?,?,?)")
      .bind(finalId, email, String(b.name || "statement").slice(0, 120), String(b.person || "Me").slice(0, 30), String(b.account || "").slice(0, 40), Number(b.added) || Date.now(), b.shared ? 1 : 0, tx).run();
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
      if (b.account !== undefined) { sets.push("account=?"); vals.push(String(b.account).slice(0, 40)); }
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
      if (c === null) { stmts.push(db.prepare("DELETE FROM rules WHERE merchant=?").bind(key)); continue; }
      const r = typeof c === "string" ? { c } : (c && typeof c === "object" ? c : {});
      if (!CATS.includes(r.c)) continue;
      if (typeof c === "string") stmts.push(db.prepare("INSERT INTO rules(merchant,category,source,note,by,updated) VALUES(?,?,'you',NULL,?,?) ON CONFLICT(merchant) DO UPDATE SET category=excluded.category,source='you',by=excluded.by,updated=excluded.updated").bind(key, r.c, email, Date.now()));
      else stmts.push(db.prepare("INSERT INTO rules(merchant,category,source,note,share,tag,by,updated) VALUES(?,?,'you',?,?,?,?,?) ON CONFLICT(merchant) DO UPDATE SET category=excluded.category,source='you',note=excluded.note,share=excluded.share,tag=excluded.tag,by=excluded.by,updated=excluded.updated")
        .bind(key, r.c, cleanNote(r.note), cleanShare(r.share), ["family", "own", "biz", ""].includes(r.tag) ? (r.tag || null) : null, email, Date.now()));
    }
    for (let i = 0; i < stmts.length; i += 100) await db.batch(stmts.slice(i, i + 100));
    return json({ ok: true, saved: stmts.length });
  }

  if (p === "/api/budgets" && m === "PUT") {
    const b = await body(req);
    const scope = String(b.scope || "All").slice(0, 30);
    if (scope === "goals") {
      const goals = (Array.isArray(b.data) ? b.data : []).slice(0, 20).map(g => ({
        id: String(g.id || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 20) || crypto.randomUUID().slice(0, 8),
        kind: ["save", "invest", "spend", "buffer"].includes(g.kind) ? g.kind : "save",
        name: String(g.name || "").slice(0, 40), target: Math.max(0, Math.round(Number(g.target) * 100) / 100 || 0),
        start: /^\d{4}-\d{2}$/.test(g.start || "") ? g.start : "", who: String(g.who || "All").slice(0, 30),
      }));
      if (goals.length) await db.prepare("INSERT INTO budgets(owner,scope,data) VALUES(?,?,?) ON CONFLICT(owner,scope) DO UPDATE SET data=excluded.data").bind(email, scope, JSON.stringify(goals)).run();
      else await db.prepare("DELETE FROM budgets WHERE owner=? AND scope=?").bind(email, scope).run();
      return json({ ok: true });
    }
    const data = {};
    for (const [c, v] of Object.entries(b.data || {})) if ((CATS.includes(c) || c === "Total") && Number(v) > 0) data[c] = Math.round(Number(v) * 100) / 100;
    if (Object.keys(data).length) await db.prepare("INSERT INTO budgets(owner,scope,data) VALUES(?,?,?) ON CONFLICT(owner,scope) DO UPDATE SET data=excluded.data").bind(email, scope, JSON.stringify(data)).run();
    else await db.prepare("DELETE FROM budgets WHERE owner=? AND scope=?").bind(email, scope).run();
    return json({ ok: true });
  }

  // Business ledger (FloofMart): the page reads the Google Sheet's Ledger tab (or an export of it) and keeps a copy here,
  // plus the manual links between ledger rows and bank transactions. Private to the owner.
  if (p === "/api/business" && m === "PUT") {
    const b = await body(req, 3_000_000);
    const cur = await db.prepare("SELECT sheet,name,tab,rows,links FROM business WHERE owner=?").bind(email).first();
    const sheet = b.sheet !== undefined ? String(b.sheet || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80) : (cur?.sheet || "");
    const name = b.name !== undefined ? txt(b.name, 80) : (cur?.name || "");
    const tab = b.tab !== undefined ? (txt(b.tab, 40) || "Ledger") : (cur?.tab || "Ledger");
    const rows = b.rows !== undefined ? JSON.stringify(cleanBizRows(b.rows)) : (cur?.rows || "[]");
    const links = b.links !== undefined ? JSON.stringify(cleanBizLinks(b.links)) : (cur?.links || "{}");
    await db.prepare("INSERT INTO business(owner,sheet,name,tab,rows,links,updated) VALUES(?,?,?,?,?,?,?) ON CONFLICT(owner) DO UPDATE SET sheet=excluded.sheet,name=excluded.name,tab=excluded.tab,rows=excluded.rows,links=excluded.links,updated=excluded.updated")
      .bind(email, sheet, name, tab, rows, links, Date.now()).run();
    return json({ ok: true, rows: JSON.parse(rows).length });
  }
  if (p === "/api/business" && m === "DELETE") { await db.prepare("DELETE FROM business WHERE owner=?").bind(email).run(); return json({ ok: true }); }

  if (p === "/api/lookup" && m === "POST") return json(await lookup(env, db, await body(req), email));
  if (p === "/api/analyse" && m === "POST") return json(await analyse(env, await body(req, 60_000)));
  if (p === "/api/pdf" && m === "POST") return json(await readPdf(env, await body(req, 12_000_000)));

  throw fail(404, "Not found");
}

function cleanNote(n) { const s = String(n ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 80); return s || null; }
// split-bill share: "50%" or a fixed amount like "20" / "20.50"
function cleanShare(v) { const s = String(v ?? "").trim(); if (/^(100|[1-9]?\d)(\.\d+)?%$/.test(s)) return s; if (/^\d{1,6}(\.\d{1,2})?$/.test(s) && Number(s) > 0) return s; return null; }
function safeParse(s, d) { try { return JSON.parse(s); } catch { return d; } }
const txt = (v, n) => String(v ?? "").replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
const num2 = v => { const n = Math.round(Number(v) * 100) / 100; return isFinite(n) ? n : 0; };
// ledger rows: {r: sheet row, d: date or "", t: type, c: category, a: amount, n: notes, w: [[name, amount]]}
function cleanBizRows(rows) {
  if (!Array.isArray(rows)) throw fail(400, "rows must be a list");
  const out = [];
  for (const x of rows.slice(0, 4000)) {
    if (!x || typeof x !== "object") continue;
    const a = Math.abs(num2(x.a)); const t = txt(x.t, 30), n = txt(x.n, 160);
    if (!a && !t && !n) continue;
    const w = (Array.isArray(x.w) ? x.w : []).slice(0, 10).filter(p => Array.isArray(p) && typeof p[0] === "string" && txt(p[0], 30)).map(p => [txt(p[0], 30), num2(p[1])]);
    out.push({ r: Math.max(0, Math.min(1e6, Math.floor(Number(x.r)) || 0)), d: /^\d{4}-\d{2}-\d{2}$/.test(x.d) ? x.d : "", t: t || "Expense", c: txt(x.c, 30), a, n, w });
  }
  return out;
}
// links: "r<ledger row>" -> transaction id (file id ":" index) or "none"; "t<transaction id>" -> 1 (marked business by hand)
function cleanBizLinks(links) {
  const out = {};
  if (!links || typeof links !== "object") return out;
  for (const [k, v] of Object.entries(links).slice(0, 5000)) {
    if (/^r\d{1,7}$/.test(k) && (v === "none" || /^[A-Za-z0-9_-]{1,64}:\d{1,6}$/.test(String(v)))) out[k] = String(v);
    else if (/^t[A-Za-z0-9_-]{1,64}:\d{1,6}$/.test(k) && v) out[k] = 1;
  }
  return out;
}
function cleanTx(tx) {
  if (!Array.isArray(tx)) throw fail(400, "tx must be a list");
  const out = [];
  for (const t of tx) {
    if (!Array.isArray(t) || !/^\d{4}-\d{2}-\d{2}$/.test(t[0]) || typeof t[2] !== "number" || !isFinite(t[2])) continue;
    const row = [t[0], String(t[1] ?? "").slice(0, 160), Math.round(t[2] * 100) / 100, CATS.includes(t[3]) ? t[3] : "Other"];
    const share = cleanShare(t[5]);
    if (t[4] === 1 || share) row.push(t[4] === 1 ? 1 : 0);
    if (share) row.push(share);
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
