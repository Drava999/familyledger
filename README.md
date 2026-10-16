# Family Ledger

A private household money app for the family. Upload bank and card statements (CSV, Excel or PDF), and it sorts every transaction, cancels out transfers between your own accounts, and shows spending, budgets, investing and goals per person and for the whole family.

Runs entirely on Cloudflare:
- **Worker** `familyledger` serves the page and a small JSON API (`src/server.js`).
- **D1** database `family-ledger` stores statements, household merchant rules, budgets and AI lookups (`schema.sql`, already applied).
- **Workers AI** (free tier) identifies unknown merchants, reads PDFs and writes the analysis. No paid API keys.
- **Sign in with Google**, built in. Only emails on the family list (D1 table `members`) can get in.

## Deploy

1. Push to `main`. The repo is connected to the worker with Workers Builds, which runs `node build.mjs` and deploys. (Or run `npx wrangler deploy`.)
2. Turn on login: in Google Cloud Console → APIs & Services → Credentials, create an **OAuth client ID** (type: Web application) and add your site address (https://familyledger.<subdomain>.workers.dev) under **Authorized JavaScript origins**. Then store it and the family list in D1:
   `INSERT INTO settings(k,v) VALUES('google_client_id','<client id>');`
   `INSERT INTO members(email,added) VALUES('you@gmail.com',0);` (one row per family member)
3. Optional safety net: put the same emails in `ALLOWED_EMAILS` in `wrangler.toml`.

Until step 2 is done, the site loads but the API refuses every request.

## Screens

Four sections, same on phone (bottom tabs) and PC (left sidebar):
- **Overview**: this month's spending ring against your usual, categories with a "usual" marker, money out (spent / invested / to people), money in and left over, bills coming up, investing.
- **Spending**: Categories (by category or by shop, search), Bills (repeat charges, what's due next), To sort (unknown transactions, with the "What was this?" sheet: purchase, split bill, friend, own account, family, refund).
- **Money moves**: Money in (sources, money in vs out by month), Accounts (coverage per account, transfers paired between accounts, accounts that transfers point to but aren't uploaded, statement files), Investing (per platform), People.
- **Goals**: Limits (monthly cap and per-category limits) and Goals (save up, invest, spend less, keep a buffer).

## Importing

- Pick several files at once. The account number is read from the top of DBS/POSB CSVs (or typed in).
- Overlapping exports are fine: rows already stored are counted and skipped, so two identical $1.50 kopis on one day both stay.
- Card purchases are dated by the real purchase date in the text (e.g. `12OCT`) rather than the posting date.
- Bank exports only contain posted transactions; pending card payments appear in the next export.
- Transfers between the family's accounts (same amount, opposite direction, within 3 days) are paired and not counted.

## How merchants get sorted

1. Household rules: anything anyone in the family sorted, shared by all.
2. Built-in Singapore patterns (`web/parse.js`): common merchants, hawker words, NETS QR, Alipay/Antom, IBKR deposits.
3. Workers AI: unknown merchants are sent (name, two cleaned bank-text examples, money direction; never amounts) to `@cf/meta/llama-3.3-70b-instruct-fp8-fast`. Confident answers are filed automatically; unsure ones wait in "To sort". The model can't search the web, so small local shops often need a tap.
4. A person's choice always beats the AI.

## Files

- `src/server.js`: API, Google sign-in + sessions, Workers AI calls
- `web/head.html`, `web/body.html`: page markup and styles
- `web/parse.js`: statement parsing, merchant names, categories (shared logic)
- `web/app.js`: the page's behaviour
- `build.mjs`: bundles the page into `dist/worker.js`
- `schema.sql`: D1 tables
- `test/`: local test server with in-memory D1 and mocked AI. `node test/unit.mjs` for logic and API; `node test/ui.mjs` clicks through every screen with made-up statements (`test/make_fixtures.py`). Needs `npm i --no-save playwright xlsx@0.18.5`.

Never commit real statements. `*.csv` and `*.pdf` are git-ignored.
