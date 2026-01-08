import express from "express";
import path from "path";
import "dotenv/config";
import session from "express-session";
import bcrypt from "bcrypt";
import rateLimit from "express-rate-limit";
import pgSession from "connect-pg-simple";

import { db, initDB } from "./db.js";

const app = express();
app.set("trust proxy", 1);

const PORT = process.env.PORT || 3000;
const ROOT = process.cwd();
const PgSession = pgSession(session);

app.use(express.json({ limit: "1mb" }));

// ---------------- SESSION SETUP ----------------
app.use(
  session({
    store: new PgSession({
      conString: process.env.DATABASE_URL,
      createTableIfMissing: true,
      ssl: { rejectUnauthorized: false },
    }),
    name: "admin-session",
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: {
      httpOnly: true,
      secure: true, // Render HTTPS
      sameSite: "lax",
    },
  })
);

// ---------------- STATIC FILES ----------------
app.use(express.static(path.join(ROOT, "public")));
app.use("/images", express.static(path.join(ROOT, "public", "images")));

// ---------------- ADMIN PAGE ----------------
app.get("/admin", (req, res) => {
  res.sendFile(path.join(ROOT, "admin", "index.html"));
});

// ---------------- HELPERS ----------------
function requireAdmin(req, res, next) {
  if (!req.session.isAdmin) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

// ---------------- LOGIN ----------------
const adminLoginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  message: { error: "Too many login attempts, try again later." },
});

app.post("/api/admin/login", adminLoginLimiter, async (req, res) => {
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: "Password required" });

  const ok = await bcrypt.compare(password, process.env.ADMIN_PASSWORD_HASH);
  if (!ok) return res.status(401).json({ error: "Wrong password" });

  req.session.isAdmin = true;
  req.session.save(err => {
    if (err) return res.status(500).json({ error: "Session save failed" });
    res.json({ ok: true });
  });
});

app.post("/api/admin/logout", requireAdmin, (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("admin-session");
    res.json({ ok: true });
  });
});

// ---------------- ADMIN PRODUCTS ----------------
app.get("/api/admin/products", requireAdmin, async (req, res) => {
  const { rows } = await db.query("SELECT * FROM products ORDER BY id DESC");
  res.json(rows);
});

app.post("/api/admin/products", requireAdmin, async (req, res) => {
  const { name, slug, price, grams, category, image, shortDesc } = req.body;

  if (!name || !slug) {
    return res.status(400).json({ error: "Name and slug required" });
  }

  await db.query(
    `
    INSERT INTO products
    (name, slug, price, grams, category, image, "shortDesc", "createdAt")
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    `,
    [
      name,
      slug,
      price || 0,
      grams || 0,
      category || "",
      image || "",
      shortDesc || "",
      Date.now(),
    ]
  );

  res.json({ ok: true });
});

app.put("/api/admin/products/:slug", requireAdmin, async (req, res) => {
  const { price, grams, shortDesc } = req.body;

  await db.query(
    `
    UPDATE products
    SET price=$1, grams=$2, "shortDesc"=$3
    WHERE slug=$4
    `,
    [price || 0, grams || 0, shortDesc || "", req.params.slug]
  );

  res.json({ ok: true });
});

app.delete("/api/admin/products/:slug", requireAdmin, async (req, res) => {
  await db.query("DELETE FROM products WHERE slug=$1", [req.params.slug]);
  res.json({ ok: true });
});

// ---------------- ADMIN REVIEWS ----------------
app.get("/api/admin/reviews", requireAdmin, async (req, res) => {
  const { rows } = await db.query("SELECT * FROM reviews ORDER BY id DESC");
  res.json(rows);
});

app.put("/api/admin/reviews/:id/approve", requireAdmin, async (req, res) => {
  await db.query("UPDATE reviews SET approved=1 WHERE id=$1", [
    Number(req.params.id),
  ]);
  res.json({ ok: true });
});

app.delete("/api/admin/reviews/:id", requireAdmin, async (req, res) => {
  await db.query("DELETE FROM reviews WHERE id=$1", [
    Number(req.params.id),
  ]);
  res.json({ ok: true });
});
// ---------------- SITEMAP ----------------
app.get("/sitemap.xml", async (req, res) => {
  try {
    const { rows: products } = await db.query(
      "SELECT slug FROM products"
    );

    const baseUrl = "https://manounelb.com";

    let urls = `
      <url>
        <loc>${baseUrl}/</loc>
      </url>
      <url>
        <loc>${baseUrl}/products.html</loc>
      </url>
      <url>
        <loc>${baseUrl}/who-we-are.html</loc>
      </url>
      <url>
        <loc>${baseUrl}/locate-us.html</loc>
      </url>
    `;

    products.forEach(p => {
      urls += `
        <url>
          <loc>${baseUrl}/product.html?slug=${p.slug}</loc>
        </url>
      `;
    });

    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

    res.header("Content-Type", "application/xml");
    res.send(sitemap);
  } catch (err) {
    console.error("Sitemap error:", err);
    res.status(500).end();
  }
});

// ---------------- PUBLIC PRODUCTS ----------------
app.get("/api/products", async (req, res) => {
  const sort = String(req.query.sort || "").toLowerCase();
  const limit = Number(req.query.limit);

  const settingsRes = await db.query(
    "SELECT currency, whatsapp_phone FROM settings WHERE id=1"
  );

  const settings = settingsRes.rows[0] || {
    currency: "USD",
    whatsapp_phone: "",
  };

  let sql = "SELECT * FROM products";
  if (sort === "new") sql += ' ORDER BY "createdAt" DESC';
  else sql += " ORDER BY id DESC";

  if (limit > 0) {
    const { rows } = await db.query(sql + " LIMIT $1", [limit]);
    return res.json({ ...settings, products: rows });
  }

  const { rows } = await db.query(sql);
  res.json({ ...settings, products: rows });
});

app.get("/api/products/:slug", async (req, res) => {
  const { rows } = await db.query(
    "SELECT * FROM products WHERE slug=$1",
    [req.params.slug]
  );

  if (!rows[0]) {
    return res.status(404).json({ error: "Not found" });
  }

  res.json(rows[0]);
});

// ---------------- PUBLIC REVIEWS ----------------
app.get("/api/reviews", async (req, res) => {
  const { rows } = await db.query(
    'SELECT * FROM reviews WHERE approved=1 ORDER BY "createdAt" DESC'
  );
  res.json(rows);
});

app.post("/api/reviews", async (req, res) => {
  const { name, title, text } = req.body || {};
  if (!name || !title || !text) {
    return res.status(400).json({ error: "All fields required" });
  }

  await db.query(
    `
    INSERT INTO reviews (name, title, text, "createdAt", approved)
    VALUES ($1,$2,$3,$4,0)
    `,
    [name, title, text, Date.now()]
  );

  res.json({ ok: true });
});

// ---------------- START SERVER ----------------
async function start() {
  await initDB();
  app.listen(PORT, () => {
    console.log(`✅ Backend running on port ${PORT}`);
  });
}

start();