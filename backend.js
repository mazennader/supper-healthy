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

// ---------- START ----------
app.listen(PORT, () => {
  console.log(`✅ Backend running on port ${PORT}`);
});
