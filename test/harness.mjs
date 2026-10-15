// Local test server: runs dist/worker.js with an in-memory D1 stand-in and a mocked Claude API.
import http from "node:http";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
const here = new URL(".", import.meta.url).pathname;
const worker = (await import(here + "../dist/worker.js?" + Date.now())).default;

const sq = new DatabaseSync(process.env.DB_FILE || ":memory:");
sq.exec(fs.readFileSync(here + "../schema.sql", "utf8"));
class Stmt {
  constructor(sql, args = []) { this.sql = sql; this.args = args; }
  bind(...a) { return new Stmt(this.sql, a.map(v => v === undefined ? null : v)); }
  async first() { return sq.prepare(this.sql).get(...this.args) ?? null; }
  async all() { return { results: sq.prepare(this.sql).all(...this.args).map(r => ({ ...r })) }; }
  async run() { sq.prepare(this.sql).run(...this.args); return { success: true, results: [] }; }
}
export const DB = {
  prepare: sql => new Stmt(sql),
  batch: async stmts => { const out = []; sq.exec("BEGIN"); try { for (const s of stmts) out.push(/^\s*SELECT/i.test(s.sql) ? await s.all() : await s.run()); sq.exec("COMMIT"); } catch (e) { sq.exec("ROLLBACK"); throw e; } return out; },
};
export const sqlite = sq;

// Mock Workers AI (env.AI): answers merchant lookups from a small table, like the real model would.
const KNOWN = {
  "GOOGLE": ["Google Play or Google service charge", "Subscriptions", "medium"],
};
export const aiCalls = [];
export const AI = {
  async run(model, input) {
    aiCalls.push({ model, input });
    const sys = input.messages[0].content, user = input.messages[input.messages.length - 1].content;
    if (sys.includes("categorise merchants")) {
      const list = JSON.parse(user);
      return { response: { results: list.map(m => { const k = KNOWN[m.name] || [`Mock: ${m.name} is a cafe chain in Singapore`, "Food & Dining", "high"]; return { name: m.name, what: k[0], category: k[1], confidence: k[2] }; }) } };
    }
    if (sys.includes("finance coach")) return { response: "SNAPSHOT\nMock analysis." };
    return { response: { transactions: [{ date: "2026-10-01", description: "MOCK PDF LINE", amount: -9.5 }] } };
  },
  async toMarkdown(files) { return files.map(f => ({ name: f.name, format: "markdown", data: "01 Oct MOCK PDF LINE 9.50" })); },
};

export function start(port = 8787, envOverrides = {}) {
  const server = http.createServer(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    const headers = new Headers(); for (const [k, v] of Object.entries(req.headers)) headers.set(k, Array.isArray(v) ? v.join(",") : v);
    const r = new Request(`http://localhost:${port}${req.url}`, { method: req.method, headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks) });
    const env = { DB, AI, DEV_EMAIL: headers.get("x-dev-email") || "bryan@example.com", ...envOverrides };
    const out = await worker.fetch(r, env, { waitUntil() {} });
    res.writeHead(out.status, Object.fromEntries(out.headers));
    res.end(Buffer.from(await out.arrayBuffer()));
  });
  return new Promise(ok => server.listen(port, () => ok(server)));
}
if (process.argv[2] === "serve") { await start(Number(process.argv[3] || 8787)); console.log("listening"); }
