# Family Ledger

A private household money app for the family. Upload bank and card statements (CSV, Excel or PDF), and it sorts every transaction, cancels out transfers between your own accounts, and shows spending, budgets, investing and goals per person and for the whole family.

Runs entirely on Cloudflare:
- **Worker** `familyledger` serves the page and a small JSON API (`src/server.js`).
- **D1** database `family-ledger` stores statements, household merchant rules, budgets and AI lookups (`schema.sql`, already applied).
- **Workers AI** (free tier) identifies unknown merchants, reads PDFs and writes the analysis. No paid API keys.
- **Cloudflare Access** handles login by email code. Free for up to 50 people.

## Deploy

1. `npx wrangler deploy` (runs `node build.mjs` first, which bundles `web/` into `dist/worker.js`).
   Pushing to `main` does the same if the repo is connected to the worker in Workers Builds.
2. Cloudflare dashboard → Workers & Pages → `familyledger` → Settings → Domains & Routes → **Enable Cloudflare Access** on the workers.dev URL.
   Copy the **AUD tag** and **team domain** from the pop-up into `wrangler.toml` (`POLICY_AUD`, `TEAM_DOMAIN`), and add family emails under **Manage Cloudflare Access**.
3. Deploy again. Until step 2 is done, the API refuses all requests.

## How merchants get sorted

1. Household rules: anything anyone in the family sorted, shared by all.
2. Built-in Singapore patterns (`web/parse.js`): common merchants, hawker words, NETS QR, Alipay/Antom, IBKR deposits.
3. Workers AI: unknown merchants are sent (name, two cleaned bank-text examples, money direction; never amounts) to `@cf/meta/llama-3.3-70b-instruct-fp8-fast`. Confident answers are filed automatically; unsure ones wait in "To sort". The model can't search the web, so small local shops often need a tap.
4. A person's choice always beats the AI.

## Files

- `src/server.js`: API, Access login check, Workers AI calls
- `web/head.html`, `web/body.html`: page markup and styles
- `web/parse.js`: statement parsing, merchant names, categories (shared logic)
- `web/app.js`: the page's behaviour
- `build.mjs`: bundles the page into `dist/worker.js`
- `schema.sql`: D1 tables
- `test/`: local test server with in-memory D1 and mocked AI (`node test/unit.mjs`; `python3 test/e2e.py <statement.csv>` for the browser test)

Never commit real statements. `*.csv` and `*.pdf` are git-ignored.
