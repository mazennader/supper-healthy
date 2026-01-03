import pkg from "pg";
const { Pool } = pkg;

// Create Postgres connection
export const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Initialize database (run on server start)
export async function initDB() {
  // ---------------- PRODUCTS ----------------
  await db.query(`
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      name TEXT,
      slug TEXT UNIQUE,
      price NUMERIC,
      grams INTEGER DEFAULT 0,
      category TEXT,
      "shortDesc" TEXT DEFAULT '',
      image TEXT,
      "createdAt" BIGINT
    );
  `);

  // ---------------- REVIEWS ----------------
  await db.query(`
    CREATE TABLE IF NOT EXISTS reviews (
      id SERIAL PRIMARY KEY,
      name TEXT,
      title TEXT,
      text TEXT,
      "createdAt" BIGINT,
      approved INTEGER DEFAULT 0
    );
  `);

  // ---------------- SETTINGS ----------------
  await db.query(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY,
      currency TEXT,
      whatsapp_phone TEXT
    );
  `);

  // Insert default settings if missing
  const settings = await db.query(
    "SELECT 1 FROM settings WHERE id = 1"
  );

  if (settings.rowCount === 0) {
    await db.query(
      "INSERT INTO settings (id, currency, whatsapp_phone) VALUES (1, 'USD', '')"
    );
  }

  console.log("✅ Database initialized successfully");
}