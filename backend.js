import express from "express";
import path from "path";
import { db } from "./db.js";
import "dotenv/config";
import session from "express-session";
import bcrypt from "bcrypt";
import rateLimit from "express-rate-limit";

const app = express();
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
    cookie: {
      httpOnly: true,
      sameSite: "strict"
    }
  })
);

// Static files
app.use(express.static(path.join(ROOT, "public")));
app.use("/images", express.static(path.join(ROOT, "public", "images")));

// Serve admin page (public, admin panel hidden until login)
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
  res.json({ ok: true });
});

// Logout
app.post("/api/admin/logout", requireAdmin, (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).json({ error: "Logout failed" });
    res.clearCookie("admin-session");
    res.json({ ok: true });
  });
});

// ---------- PUBLIC ROUTES ----------
app.get("/", (req, res) => {
  res.sendFile(path.join(ROOT, "public", "supper healthy.html"));
});

// List products
app.get("/api/products", (req, res) => {
  const sort = String(req.query.sort || "").toLowerCase();
  const limit = Number(req.query.limit);

  const settings = db.prepare("SELECT currency, whatsapp_phone FROM settings WHERE id = 1").get() || {
    currency: "USD",
    whatsapp_phone: ""
  };

  let sql = "SELECT * FROM products";
  if (sort === "new") sql += " ORDER BY createdAt DESC";
  else sql += " ORDER BY id DESC";

  if (Number.isFinite(limit) && limit > 0) sql += " LIMIT ?";

  const products = Number.isFinite(limit) && limit > 0
    ? db.prepare(sql).all(limit)
    : db.prepare(sql).all();

  res.json({ currency: settings.currency, whatsapp_phone: settings.whatsapp_phone, products });
});

// Single product
app.get("/api/products/:slug", (req, res) => {
  const slug = String(req.params.slug);
  const product = db.prepare("SELECT * FROM products WHERE slug = ?").get(slug);
  if (!product) return res.status(404).json({ error: "Not found" });
  res.json(product);
});

// ---------- ADMIN PRODUCTS ----------
app.get("/api/admin/products", requireAdmin, (req, res) => {
  const products = db.prepare("SELECT * FROM products ORDER BY id DESC").all();
  res.json(products);
});

app.post("/api/admin/products", requireAdmin, (req, res) => {
  const p = req.body || {};
  if (!p.name || !p.slug) return res.status(400).json({ error: "name + slug required" });

  const exists = db.prepare("SELECT 1 FROM products WHERE slug = ?").get(String(p.slug));
  if (exists) return res.status(409).json({ error: "slug already exists" });

  const newProduct = {
    id: Date.now(),
    name: String(p.name),
    slug: String(p.slug),
    price: Number(p.price) || 0,
    grams: Number(p.grams) || 0,
    category: String(p.category || ""),
    shortDesc: String(p.shortDesc || ""),
    image: String(p.image || ""),
    createdAt: Date.now()
  };

  db.prepare(`
    INSERT INTO products (id, name, slug, price, grams, category, shortDesc, image, createdAt)
    VALUES (@id,@name,@slug,@price,@grams,@category,@shortDesc,@image,@createdAt)
  `).run(newProduct);

  res.json(newProduct);
});

app.put("/api/admin/products/:slug", requireAdmin, (req, res) => {
  const slug = String(req.params.slug);
  const existing = db.prepare("SELECT * FROM products WHERE slug = ?").get(slug);
  if (!existing) return res.status(404).json({ error: "Not found" });

  const updated = { ...existing, ...req.body };
  db.prepare(`
    UPDATE products SET
      name=?, slug=?, price=?, grams=?, category=?, shortDesc=?, image=?
    WHERE id=?
  `).run(
    String(updated.name),
    String(updated.slug),
    Number(updated.price),
    Number(updated.grams),
    String(updated.category),
    String(updated.shortDesc),
    String(updated.image),
    Number(existing.id)
  );

  res.json(db.prepare("SELECT * FROM products WHERE id=?").get(existing.id));
});

app.delete("/api/admin/products/:slug", requireAdmin, (req, res) => {
  const info = db.prepare("DELETE FROM products WHERE slug=?").run(String(req.params.slug));
  if (info.changes === 0) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

// ---------- REVIEWS ----------
app.get("/api/reviews", (req, res) => {
  const reviews = db.prepare("SELECT * FROM reviews WHERE approved=1 ORDER BY createdAt DESC").all();
  res.json(reviews);
});

app.post("/api/reviews", (req, res) => {
  const { name, title, text } = req.body || {};
  if (!name || !title || !text) return res.status(400).json({ error: "All fields required" });

  const review = {
    id: Date.now(),
    name: String(name),
    title: String(title),
    text: String(text),
    createdAt: Date.now(),
    approved: 0
  };

  db.prepare(`
    INSERT INTO reviews (id, name, title, text, createdAt, approved)
    VALUES (@id,@name,@title,@text,@createdAt,@approved)
  `).run(review);

  res.json(review);
});

// Admin reviews
app.get("/api/admin/reviews", requireAdmin, (req, res) => {
  const reviews = db.prepare("SELECT * FROM reviews ORDER BY createdAt DESC").all();
  res.json(reviews);
});

app.put("/api/admin/reviews/:id/approve", requireAdmin, (req, res) => {
  db.prepare("UPDATE reviews SET approved=1 WHERE id=?").run(Number(req.params.id));
  res.json({ ok: true });
});

app.delete("/api/admin/reviews/:id", requireAdmin, (req, res) => {
  db.prepare("DELETE FROM reviews WHERE id=?").run(Number(req.params.id));
  res.json({ ok: true });
});

// Start
app.listen(PORT, () => console.log(`✅ Backend running: http://localhost:${PORT}`));
