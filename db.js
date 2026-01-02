import path from "path";
import Database from "better-sqlite3";

const ROOT = process.cwd();
const DB_FILE = path.join(ROOT, "data", "site.db");

export const db = new Database(DB_FILE);

// ---------------- PRODUCTS ----------------
db.prepare(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY,
    name TEXT,
    slug TEXT UNIQUE,
    price REAL,
    grams INTEGER DEFAULT 0,
    category TEXT,
    shortDesc TEXT DEFAULT '',
    image TEXT,
    createdAt INTEGER
  )
`).run();

// Backward-compatible column safety
try { db.prepare(`ALTER TABLE products ADD COLUMN grams INTEGER DEFAULT 0`).run(); } catch {}
try { db.prepare(`ALTER TABLE products ADD COLUMN shortDesc TEXT DEFAULT ''`).run(); } catch {}

// ---------------- REVIEWS ----------------
db.prepare(`
  CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY,
    name TEXT,
    title TEXT,
    text TEXT,
    createdAt INTEGER,
    approved INTEGER DEFAULT 0
  )
`).run();

// ---------------- SETTINGS (🚨 THIS WAS MISSING) ----------------
db.prepare(`
  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY,
    currency TEXT,
    whatsapp_phone TEXT
  )
`).run();

// Insert default settings row if not exists
const settingsExists = db
  .prepare("SELECT 1 FROM settings WHERE id = 1")
  .get();

if (!settingsExists) {
  db.prepare(
    "INSERT INTO settings (id, currency, whatsapp_phone) VALUES (1, 'USD', '')"
  ).run();
}