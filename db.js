import path from "path";
import Database from "better-sqlite3";

const ROOT = process.cwd();
const DB_FILE = path.join(ROOT, "data", "site.db");

export const db = new Database(DB_FILE);

// Create products table if it doesn't exist
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

try { db.prepare(`ALTER TABLE products ADD COLUMN grams INTEGER DEFAULT 0`).run(); } catch(e){}
try { db.prepare(`ALTER TABLE products ADD COLUMN shortDesc TEXT DEFAULT ''`).run(); } catch(e){}

// Create reviews table if it doesn't exist
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