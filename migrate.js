// migrate.js
import Database from "better-sqlite3";
import pkg from "pg";
const { Pool } = pkg;

// ---------- SQLITE (OLD LOCAL DB) ----------
const sqlite = new Database("./data/site.db");

// ---------- POSTGRES (NEW DB) ----------
const pg = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function migrate() {
  console.log("🚀 Starting migration...");

  // 1️⃣ PRODUCTS
  const products = sqlite.prepare("SELECT * FROM products").all();

  for (const p of products) {
    await pg.query(
      `
      INSERT INTO products
      (name, slug, price, grams, category, "shortDesc", image, "createdAt")
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT (slug) DO NOTHING
      `,
      [
        p.name,
        p.slug,
        p.price,
        p.grams,
        p.category,
        p.shortDesc,
        p.image,
        p.createdAt,
      ]
    );
  }

  console.log(`✅ Migrated ${products.length} products`);

  // 2️⃣ REVIEWS
  const reviews = sqlite.prepare("SELECT * FROM reviews").all();

  for (const r of reviews) {
    await pg.query(
      `
      INSERT INTO reviews
      (name, title, text, "createdAt", approved)
      VALUES ($1,$2,$3,$4,$5)
      `,
      [r.name, r.title, r.text, r.createdAt, r.approved]
    );
  }

  console.log(`✅ Migrated ${reviews.length} reviews`);

  // 3️⃣ SETTINGS
  const settings = sqlite
    .prepare("SELECT * FROM settings WHERE id = 1")
    .get();

  if (settings) {
    await pg.query(
      `
      UPDATE settings
      SET currency = $1, whatsapp_phone = $2
      WHERE id = 1
      `,
      [settings.currency, settings.whatsapp_phone]
    );
  }

  console.log("✅ Settings migrated");

  console.log("🎉 Migration complete!");
  process.exit(0);
}

migrate().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});;