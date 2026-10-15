-- Family Ledger D1 schema
CREATE TABLE IF NOT EXISTS users (email TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', created INTEGER);
CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY, owner TEXT NOT NULL, name TEXT, person TEXT, added INTEGER,
  shared INTEGER NOT NULL DEFAULT 0, tx TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS files_owner ON files(owner);
CREATE INDEX IF NOT EXISTS files_shared ON files(shared);
CREATE TABLE IF NOT EXISTS rules (merchant TEXT PRIMARY KEY, category TEXT NOT NULL, source TEXT, note TEXT, by TEXT, updated INTEGER);
CREATE TABLE IF NOT EXISTS budgets (owner TEXT NOT NULL, scope TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (owner, scope));
CREATE TABLE IF NOT EXISTS lookups (merchant TEXT PRIMARY KEY, what TEXT, category TEXT, confidence TEXT, updated INTEGER);
