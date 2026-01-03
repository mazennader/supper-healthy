import express from "express";
import path from "path";
import { db } from "./db.js";
import "dotenv/config";
import session from "express-session";
import bcrypt from "bcrypt";
import rateLimit from "express-rate-limit";

const app = express();
app.set("trust proxy", 1);
const PORT = process.env.PORT || 3000;
const ROOT = process.cwd();

app.use(express.json({ limit: "1mb" }));

// Session setup
app.use(
  session({
    name: "admin-session",
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: {
      httpOnly: true,
      secure: true,   // Render = HTTPS → required
      sameSite: "lax" // ✅ REQUIRED for same-domain admin
    }
  })
);

// Static files (PUBLIC SITE)
app.use(express.static(path.join(ROOT, "public")));
app.use("/images", express.static(path.join(ROOT, "public", "images")));

// Admin page
app.get("/admin", (req, res) => {
  res.sendFile(path.join(ROOT, "admin", "index.html"));
});

// ---------- helpers ----------
function requireAdmin(req, res, next) {
  if (!req.session.isAdmin) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

// Rate limiter for login
const adminLoginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  message: { error: "Too many login attempts, try again later." }
});

// Login
app.post("/api/admin/login", adminLoginLimiter, async (req, res) => {
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: "Password required" });

  const ok = await bcrypt.compare(password, process.env.ADMIN_PASSWORD_HASH);
  if (!ok) return res.status(401).json({ error: "Wrong password" });

  req.session.isAdmin = true;

req.session.save(err => {
  if (err) {
    return res.status(500).json({ error: "Session save failed" });
  }
  res.json({ ok: true });
});
});

// Logout
app.post("/api/admin/logout", requireAdmin, (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).json({ error: "Logout failed" });
    res.clearCookie("admin-session");
    res.json({ ok: true });
  });
});
// ---------- ADMIN PRODUCTS ----------
app.get("/api/admin/products", requireAdmin, (req, res) => {
  const products = db.prepare("SELECT * FROM products ORDER BY id DESC").all();
  res.json(products);
});

app.post("/api/admin/products", requireAdmin, (req, res) => {
  const { name, slug, price, grams, category, image, shortDesc } = req.body;

  if (!name || !slug) {
    return res.status(400).json({ error: "Name and slug required" });
  }

  db.prepare(`
    INSERT INTO products
    (name, slug, price, grams, category, image, shortDesc, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    name,
    slug,
    price || 0,
    grams || 0,
    category || "",
    image || "",
    shortDesc || "",
    Date.now()
  );

  res.json({ ok: true });
});

app.put("/api/admin/products/:slug", requireAdmin, (req, res) => {
  const { price, grams, shortDesc } = req.body;

  db.prepare(`
    UPDATE products
    SET price=?, grams=?, shortDesc=?
    WHERE slug=?
  `).run(
    price || 0,
    grams || 0,
    shortDesc || "",
    req.params.slug
  );

  res.json({ ok: true });
});

app.delete("/api/admin/products/:slug", requireAdmin, (req, res) => {
  db.prepare("DELETE FROM products WHERE slug=?").run(req.params.slug);
  res.json({ ok: true });
});
// ---------- ADMIN REVIEWS ----------
app.get("/api/admin/reviews", requireAdmin, (req, res) => {
  const reviews = db.prepare("SELECT * FROM reviews ORDER BY id DESC").all();
  res.json(reviews);
});

app.put("/api/admin/reviews/:id/approve", requireAdmin, (req, res) => {
  db.prepare("UPDATE reviews SET approved=1 WHERE id=?")
    .run(Number(req.params.id));
  res.json({ ok: true });
});

app.delete("/api/admin/reviews/:id", requireAdmin, (req, res) => {
  db.prepare("DELETE FROM reviews WHERE id=?")
    .run(Number(req.params.id));
  res.json({ ok: true });
});

// ---------- API ROUTES ----------
app.get("/api/products", (req, res) => {
  const sort = String(req.query.sort || "").toLowerCase();
  const limit = Number(req.query.limit);

  const settings =
    db.prepare("SELECT currency, whatsapp_phone FROM settings WHERE id = 1").get() || {
      currency: "USD",
      whatsapp_phone: ""
    };

  let sql = "SELECT * FROM products";
  if (sort === "new") sql += " ORDER BY createdAt DESC";
  else sql += " ORDER BY id DESC";

  if (Number.isFinite(limit) && limit > 0) sql += " LIMIT ?";

  const products =
    Number.isFinite(limit) && limit > 0
      ? db.prepare(sql).all(limit)
      : db.prepare(sql).all();

  res.json({ currency: settings.currency, whatsapp_phone: settings.whatsapp_phone, products });
});

app.get("/api/products/:slug", (req, res) => {
  const product = db.prepare("SELECT * FROM products WHERE slug = ?").get(req.params.slug);
  if (!product) return res.status(404).json({ error: "Not found" });
  res.json(product);
});
// ---------- PUBLIC REVIEWS ----------
app.get("/api/reviews", (req, res) => {
  const reviews = db
    .prepare("SELECT * FROM reviews WHERE approved = 1 ORDER BY createdAt DESC")
    .all();

  res.json(reviews);
});

app.post("/api/reviews", (req, res) => {
  const { name, title, text } = req.body || {};

  if (!name || !title || !text) {
    return res.status(400).json({ error: "All fields required" });
  }

  db.prepare(`
    INSERT INTO reviews (name, title, text, createdAt, approved)
    VALUES (?, ?, ?, ?, 0)
  `).run(name, title, text, Date.now());

  res.json({ ok: true });
});

// ---------- START ----------
app.listen(PORT, () => {
  console.log(`✅ Backend running on port ${PORT}`);
});
