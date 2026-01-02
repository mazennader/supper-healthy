import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "data");
const JSON_FILE = path.join(DATA_DIR, "products.json");
const DB_FILE = path.join(DATA_DIR, "site.db");

if (!fs.existsSync(JSON_FILE)) {
  console.error("❌ Cannot find:", JSON_FILE);
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(JSON_FILE, "utf8"));
const currency = raw.currency || "USD";
const whatsapp_phone = raw.whatsapp_phone || "";
const products = Array.isArray(raw.products) ? raw.products : [];

const db = new Database(DB_FILE);

// 1) Create tables if they don't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    currency TEXT NOT NULL,
    whatsapp_phone TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  price REAL NOT NULL DEFAULT 0,
  grams INTEGER NOT NULL DEFAULT 0,
  category TEXT NOT NULL DEFAULT '',
  shortDesc TEXT NOT NULL DEFAULT '',
  image TEXT NOT NULL DEFAULT '',
  createdAt INTEGER NOT NULL DEFAULT 0
);
`);

const upsertSettings = db.prepare(`
  INSERT INTO settings (id, currency, whatsapp_phone)
  VALUES (1, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    currency=excluded.currency,
    whatsapp_phone=excluded.whatsapp_phone
`);

const insertProduct = db.prepare(`
  INSERT INTO products (id, name, slug, price, grams, category, shortDesc, image, createdAt)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(slug) DO UPDATE SET
    name=excluded.name,
    price=excluded.price,
    grams=excluded.grams,
    category=excluded.category,
    shortDesc=excluded.shortDesc,
    image=excluded.image,
    createdAt=excluded.createdAt
`);

const tx = db.transaction(() => {
  upsertSettings.run(currency, whatsapp_phone);

  for (const p of products) {
    insertProduct.run(
      Number(p.id) || Date.now(),
      String(p.name || ""),
      String(p.slug || ""),
      Number(p.price) || 0,
      Number(p.grams) || 0,
      String(p.category || ""),
      String(p.shortDesc || ""),
      String(p.image || ""),
      Number(p.createdAt) || 0
    );
  }
});

tx();

db.close();

console.log("✅ Migration complete!");
console.log("✅ SQLite DB created at:", DB_FILE);
console.log("✅ Products migrated:", products.length);