// server.js
// ✅ بک‌اند Nerdo (کانبان فارسی) با دیتابیس SQLite واقعی (ولی بدون نصب ابزارهای سیستمی)
// ✅ با sql.js (WASM) کار می‌کنیم تا روی ویندوز/نود جدید، خطای node-gyp نگیری
// ✅ داده‌ها داخل فایل nerdo.db ذخیره میشن (کنار server.js)

import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import crypto from "crypto";
import initSqlJs from "sql.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ========= تنظیمات =========
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");

// فایل دیتابیس (SQLite)
const DB_FILE = path.join(__dirname, "nerdo.db");

// اگر قبلاً JSON داشتی، برای مهاجرت خودکار
const LEGACY_JSON = path.join(__dirname, "data.json");

// ========= ابزارهای کمکی =========

// ✅ ساخت هش امن برای رمز
function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  // از scrypt (امن و داخلی نود) استفاده می‌کنیم
  const hashed = crypto.scryptSync(password, salt, 32).toString("hex");
  return { salt, hashed };
}

// ✅ چک کردن رمز
function verifyPassword(password, salt, hashed) {
  const test = crypto.scryptSync(password, salt, 32).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(test, "hex"), Buffer.from(hashed, "hex"));
}

// ✅ تولید توکن سشن
function makeToken() {
  return crypto.randomBytes(24).toString("hex");
}

// ✅ خواندن Bearer Token
function getToken(req) {
  const h = req.headers.authorization || "";
  if (h.startsWith("Bearer ")) return h.slice(7).trim();
  // بعضی فرانت‌ها x-token می‌فرستن
  if (req.headers["x-token"]) return String(req.headers["x-token"]);
  return "";
}

// ✅ ساخت تاریخ ISO
function nowISO() {
  return new Date().toISOString();
}

// ========= بوت SQLite (sql.js) =========

let SQL;         // ماژول sql.js
let db;          // دیتابیس
let saveTimer;   // تایمر ذخیره‌سازی

async function bootDatabase() {
  SQL = await initSqlJs({
    // مسیر فایل wasm
    locateFile: (file) => path.join(__dirname, "node_modules", "sql.js", "dist", file),
  });

  if (fs.existsSync(DB_FILE)) {
    // ✅ اگر دیتابیس هست، می‌خونیم
    const filebuffer = fs.readFileSync(DB_FILE);
    db = new SQL.Database(filebuffer);
  } else {
    // ✅ اگر نیست، می‌سازیم
    db = new SQL.Database();
  }

  // ✅ ساخت جدول‌ها اگر نبودن
  db.run(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'todo',     -- todo | doing | done
      priority INTEGER NOT NULL DEFAULT 2,     -- 1 بالا | 2 متوسط | 3 پایین
      deadline TEXT DEFAULT NULL,              -- ISO date (اختیاری)
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      stars INTEGER NOT NULL DEFAULT 5,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // ✅ ادمین پیش‌فرض (اختیاری) - اگر خواستی بعداً حذفش کن
  ensureAdmin();

  // ✅ اگر data.json قدیمی داری، یک بار مهاجرت کن
  migrateFromJsonIfNeeded();

  // ✅ ذخیره خودکار روی دیسک (هر بار تغییر، 500ms بعد)
  scheduleSave();
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      const data = db.export();
      fs.writeFileSync(DB_FILE, Buffer.from(data));
      // console.log("✅ DB saved");
    } catch (e) {
      console.log("❌ DB save error:", e?.message || e);
    }
  }, 500);
}

// ✅ هر جایی که db.run یا تغییر داده داریم، بعدش scheduleSave() صدا می‌زنیم

function ensureAdmin() {
  const username = "admin@nerdo.local";
  const name = "ادمین";
  const row = getOne(`SELECT id FROM users WHERE username = ?`, [username]);
  if (!row) {
    const pass = "admin1234"; // فقط برای تست (برای ارائه بد نیست)
    const { salt, hashed } = hashPassword(pass);
    run(
      `INSERT INTO users (username, name, salt, password_hash, role, created_at)
       VALUES (?, ?, ?, ?, 'admin', ?)`,
      [username, name, salt, hashed, nowISO()]
    );
    scheduleSave();
    console.log("✅ Admin created:", username, "pass:", pass);
  }
}

function migrateFromJsonIfNeeded() {
  // ✅ اگر دیتابیس تازه ساخته شده و data.json وجود دارد، مهاجرت کن
  if (!fs.existsSync(LEGACY_JSON)) return;

  // اگر قبلاً مهاجرت انجام شده باشد، دوباره انجام نمی‌دهیم
  const hasAnyUser = getOne(`SELECT id FROM users LIMIT 1`, []);
  const hasAnyProject = getOne(`SELECT id FROM projects LIMIT 1`, []);
  const hasAnyTask = getOne(`SELECT id FROM tasks LIMIT 1`, []);
  if (hasAnyUser || hasAnyProject || hasAnyTask) return;

  try {
    const raw = fs.readFileSync(LEGACY_JSON, "utf-8").trim();
    if (!raw) return;
    const j = JSON.parse(raw);

    // ساختارهای مختلف رو هندل می‌کنیم (چون معلوم نیست json دقیقاً چطور بوده)
    const users = Array.isArray(j.users) ? j.users : [];
    const projects = Array.isArray(j.projects) ? j.projects : [];
    const tasks = Array.isArray(j.tasks) ? j.tasks : [];

    const userIdMap = new Map();
    const projectIdMap = new Map();

    for (const u of users) {
      const username = String(u.username || u.email || "").trim();
      if (!username) continue;
      const name = String(u.name || u.fullname || "کاربر");
      const role = u.role === "admin" ? "admin" : "user";
      const pass = String(u.password || "123456"); // اگر قبلاً پسورد واضح ذخیره می‌شد
      const { salt, hashed } = hashPassword(pass);

      run(
        `INSERT INTO users (username, name, salt, password_hash, role, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [username, name, salt, hashed, role, nowISO()]
      );
      const newId = getOne(`SELECT id FROM users WHERE username = ?`, [username]).id;
      userIdMap.set(u.id ?? username, newId);
    }

    for (const p of projects) {
      const owner = userIdMap.get(p.userId ?? p.user_id ?? p.ownerId ?? p.owner) || null;
      if (!owner) continue;

      run(
        `INSERT INTO projects (user_id, title, description, created_at)
         VALUES (?, ?, ?, ?)`,
        [owner, String(p.title || "پروژه"), String(p.description || ""), nowISO()]
      );
      const newPid = getOne(
        `SELECT id FROM projects WHERE user_id = ? AND title = ? ORDER BY id DESC LIMIT 1`,
        [owner, String(p.title || "پروژه")]
      ).id;

      projectIdMap.set(p.id ?? `${owner}:${p.title}`, newPid);
    }

    for (const t of tasks) {
      const pid = projectIdMap.get(t.projectId ?? t.project_id) || null;
      if (!pid) continue;

      const status = ["todo", "doing", "done"].includes(t.status) ? t.status : "todo";
      const pr = Number(t.priority || 2);
      const deadline = t.deadline ? String(t.deadline) : null;

      run(
        `INSERT INTO tasks (project_id, title, description, status, priority, deadline, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          pid,
          String(t.title || "تسک"),
          String(t.description || ""),
          status,
          [1, 2, 3].includes(pr) ? pr : 2,
          deadline,
          nowISO(),
          nowISO(),
        ]
      );
    }

    scheduleSave();
    console.log("✅ Migrated legacy data.json -> SQLite (nerdo.db)");
  } catch (e) {
    console.log("❌ Migration failed:", e?.message || e);
  }
}

// ========= Wrapper های SQL =========

// ✅ اجرای INSERT/UPDATE/DELETE
function run(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  stmt.step();
  stmt.free();
  scheduleSave();
}

// ✅ گرفتن یک ردیف
function getOne(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const has = stmt.step();
  if (!has) {
    stmt.free();
    return null;
  }
  const row = stmt.getAsObject();
  stmt.free();
  return row;
}

// ✅ گرفتن چند ردیف
function getAll(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

// ========= Auth Middleware =========
function authRequired(req, res, next) {
  const token = getToken(req);
  if (!token) return res.status(401).json({ ok: false, message: "Unauthorized" });

  const sess = getOne(
    `SELECT s.token, u.id as userId, u.username, u.name, u.role
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = ?`,
    [token]
  );
  if (!sess) return res.status(401).json({ ok: false, message: "Session invalid" });

  req.user = {
    id: sess.userId,
    username: sess.username,
    name: sess.name,
    role: sess.role,
    token: sess.token,
  };
  next();
}

// ========= App =========
const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// ✅ سرو فایل‌های static (HTML/CSS/JS)
app.use(express.static(PUBLIC_DIR));

// ✅ صفحه اصلی اگر خواستی
app.get("/api/health", (req, res) => {
  res.json({ ok: true, db: "sqlite(sql.js)", time: nowISO() });
});

// ========= Auth Routes =========

// ✅ ثبت‌نام
app.post("/api/register", (req, res) => {
  try {
    const username = String(req.body.username || "").trim().toLowerCase();
    const password = String(req.body.password || "").trim();
    const name = String(req.body.name || req.body.fullname || "کاربر").trim();

    if (!username || !password) {
      return res.status(400).json({ ok: false, message: "نام کاربری و رمز لازم است" });
    }
    if (password.length < 4) {
      return res.status(400).json({ ok: false, message: "رمز خیلی کوتاه است" });
    }

    const exists = getOne(`SELECT id FROM users WHERE username = ?`, [username]);
    if (exists) {
      return res.status(409).json({ ok: false, message: "این نام کاربری قبلاً ثبت شده" });
    }

    const { salt, hashed } = hashPassword(password);

    run(
      `INSERT INTO users (username, name, salt, password_hash, role, created_at)
       VALUES (?, ?, ?, ?, 'user', ?)`,
      [username, name, salt, hashed, nowISO()]
    );

    // ✅ بعد از ثبت‌نام، اتومات لاگین هم می‌کنیم
    const u = getOne(`SELECT id, username, name, role FROM users WHERE username = ?`, [username]);
    const token = makeToken();
    run(`INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)`, [token, u.id, nowISO()]);

    res.json({ ok: true, token, user: { id: u.id, username: u.username, name: u.name, role: u.role } });
  } catch (e) {
    res.status(500).json({ ok: false, message: "ثبت‌نام ناموفق" });
  }
});

// ✅ ورود
app.post("/api/login", (req, res) => {
  try {
    const username = String(req.body.username || "").trim().toLowerCase();
    const password = String(req.body.password || "").trim();

    if (!username || !password) {
      return res.status(400).json({ ok: false, message: "اطلاعات ناقص است" });
    }

    const u = getOne(
      `SELECT id, username, name, role, salt, password_hash FROM users WHERE username = ?`,
      [username]
    );
    if (!u) return res.status(401).json({ ok: false, message: "نام کاربری یا رمز اشتباه است" });

    const ok = verifyPassword(password, u.salt, u.password_hash);
    if (!ok) return res.status(401).json({ ok: false, message: "نام کاربری یا رمز اشتباه است" });

    const token = makeToken();
    run(`INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)`, [token, u.id, nowISO()]);

    res.json({ ok: true, token, user: { id: u.id, username: u.username, name: u.name, role: u.role } });
  } catch (e) {
    res.status(500).json({ ok: false, message: "ورود ناموفق" });
  }
});

// ✅ خروج
app.post("/api/logout", authRequired, (req, res) => {
  const token = req.user.token;
  run(`DELETE FROM sessions WHERE token = ?`, [token]);
  res.json({ ok: true });
});

// ✅ کاربر فعلی
app.get("/api/me", authRequired, (req, res) => {
  res.json({ ok: true, user: req.user });
});

// ========= Projects =========

// ✅ لیست پروژه‌های من
app.get("/api/projects", authRequired, (req, res) => {
  const rows = getAll(
    `SELECT id, title, description, created_at
     FROM projects
     WHERE user_id = ?
     ORDER BY id DESC`,
    [req.user.id]
  );
  res.json({ ok: true, projects: rows });
});

// ✅ ساخت پروژه
app.post("/api/projects", authRequired, (req, res) => {
  const title = String(req.body.title || "").trim();
  const description = String(req.body.description || "").trim();

  if (!title) return res.status(400).json({ ok: false, message: "عنوان پروژه لازم است" });

  run(
    `INSERT INTO projects (user_id, title, description, created_at)
     VALUES (?, ?, ?, ?)`,
    [req.user.id, title, description, nowISO()]
  );

  const p = getOne(
    `SELECT id, title, description, created_at
     FROM projects
     WHERE user_id = ? AND title = ?
     ORDER BY id DESC LIMIT 1`,
    [req.user.id, title]
  );

  res.json({ ok: true, project: p });
});

// ✅ حذف پروژه (همه تسک‌ها هم با ON DELETE CASCADE حذف میشن)
app.delete("/api/projects/:id", authRequired, (req, res) => {
  const pid = Number(req.params.id);
  const own = getOne(`SELECT id FROM projects WHERE id = ? AND user_id = ?`, [pid, req.user.id]);
  if (!own) return res.status(404).json({ ok: false, message: "پروژه پیدا نشد" });

  run(`DELETE FROM projects WHERE id = ?`, [pid]);
  res.json({ ok: true });
});

// ========= Tasks =========

// ✅ گرفتن تسک‌های یک پروژه
app.get("/api/projects/:id/tasks", authRequired, (req, res) => {
  const pid = Number(req.params.id);

  const own = getOne(`SELECT id FROM projects WHERE id = ? AND user_id = ?`, [pid, req.user.id]);
  if (!own) return res.status(404).json({ ok: false, message: "پروژه پیدا نشد" });

  const tasks = getAll(
    `SELECT id, project_id, title, description, status, priority, deadline, created_at, updated_at
     FROM tasks
     WHERE project_id = ?
     ORDER BY id DESC`,
    [pid]
  );

  res.json({ ok: true, tasks });
});

// ✅ ساخت تسک در پروژه
app.post("/api/projects/:id/tasks", authRequired, (req, res) => {
  const pid = Number(req.params.id);

  const own = getOne(`SELECT id FROM projects WHERE id = ? AND user_id = ?`, [pid, req.user.id]);
  if (!own) return res.status(404).json({ ok: false, message: "پروژه پیدا نشد" });

  const title = String(req.body.title || "").trim();
  const description = String(req.body.description || "").trim();
  const priority = Number(req.body.priority || 2);
  const deadline = req.body.deadline ? String(req.body.deadline) : null;

  if (!title) return res.status(400).json({ ok: false, message: "عنوان تسک لازم است" });

  run(
    `INSERT INTO tasks (project_id, title, description, status, priority, deadline, created_at, updated_at)
     VALUES (?, ?, ?, 'todo', ?, ?, ?, ?)`,
    [pid, title, description, [1, 2, 3].includes(priority) ? priority : 2, deadline, nowISO(), nowISO()]
  );

  const t = getOne(
    `SELECT id, project_id, title, description, status, priority, deadline, created_at, updated_at
     FROM tasks WHERE project_id = ? ORDER BY id DESC LIMIT 1`,
    [pid]
  );

  res.json({ ok: true, task: t });
});

// ✅ آپدیت تسک (برای Drag&Drop: تغییر status) + ویرایش
app.patch("/api/tasks/:id", authRequired, (req, res) => {
  const tid = Number(req.params.id);

  // مالکیت: تسک باید مربوط به پروژه‌های همین کاربر باشد
  const own = getOne(
    `SELECT t.id, t.project_id
     FROM tasks t
     JOIN projects p ON p.id = t.project_id
     WHERE t.id = ? AND p.user_id = ?`,
    [tid, req.user.id]
  );
  if (!own) return res.status(404).json({ ok: false, message: "تسک پیدا نشد" });

  // فیلدهای مجاز
  const title = req.body.title !== undefined ? String(req.body.title).trim() : null;
  const description = req.body.description !== undefined ? String(req.body.description).trim() : null;
  const status = req.body.status !== undefined ? String(req.body.status).trim() : null;
  const priority = req.body.priority !== undefined ? Number(req.body.priority) : null;
  const deadline = req.body.deadline !== undefined ? (req.body.deadline ? String(req.body.deadline) : null) : undefined;

  // آپدیت پویا (هرچی فرستادی همون تغییر می‌کنه)
  const sets = [];
  const params = [];

  if (title !== null) { sets.push("title = ?"); params.push(title); }
  if (description !== null) { sets.push("description = ?"); params.push(description); }
  if (status !== null) {
    const s = ["todo", "doing", "done"].includes(status) ? status : "todo";
    sets.push("status = ?"); params.push(s);
  }
  if (priority !== null) {
    sets.push("priority = ?"); params.push([1, 2, 3].includes(priority) ? priority : 2);
  }
  if (deadline !== undefined) {
    sets.push("deadline = ?"); params.push(deadline);
  }

  // اگر هیچ چیزی نفرستاده بود
  if (sets.length === 0) return res.json({ ok: true });

  sets.push("updated_at = ?");
  params.push(nowISO());

  params.push(tid);

  run(`UPDATE tasks SET ${sets.join(", ")} WHERE id = ?`, params);

  const t = getOne(
    `SELECT id, project_id, title, description, status, priority, deadline, created_at, updated_at
     FROM tasks WHERE id = ?`,
    [tid]
  );

  res.json({ ok: true, task: t });
});

// ✅ حذف تسک
app.delete("/api/tasks/:id", authRequired, (req, res) => {
  const tid = Number(req.params.id);

  const own = getOne(
    `SELECT t.id
     FROM tasks t
     JOIN projects p ON p.id = t.project_id
     WHERE t.id = ? AND p.user_id = ?`,
    [tid, req.user.id]
  );
  if (!own) return res.status(404).json({ ok: false, message: "تسک پیدا نشد" });

  run(`DELETE FROM tasks WHERE id = ?`, [tid]);
  res.json({ ok: true });
});

// ========= Feedback (ستاره + متن) =========

// ✅ ثبت بازخورد
app.post("/api/feedback", authRequired, (req, res) => {
  const stars = Math.max(1, Math.min(5, Number(req.body.stars || 5)));
  const message = String(req.body.message || "").trim();
  if (!message) return res.status(400).json({ ok: false, message: "متن بازخورد خالی است" });

  run(
    `INSERT INTO feedback (user_id, stars, message, created_at)
     VALUES (?, ?, ?, ?)`,
    [req.user.id, stars, message, nowISO()]
  );

  res.json({ ok: true });
});

// ✅ دیدن بازخوردها (فقط ادمین)
app.get("/api/admin/feedback", authRequired, (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ ok: false, message: "Forbidden" });

  const rows = getAll(
    `SELECT f.id, f.stars, f.message, f.created_at, u.name, u.username
     FROM feedback f JOIN users u ON u.id = f.user_id
     ORDER BY f.id DESC`,
    []
  );

  res.json({ ok: true, feedback: rows });
});

<<<<<<< HEAD
// ========= شروع سرور =========

bootDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`✅ Nerdo (SQLite via sql.js) running on http://localhost:${PORT}`);
  });
}).catch((e) => {
  console.log("❌ Failed to boot DB:", e?.message || e);
});
=======
// ---------- Start ----------
app.listen(PORT, () => {
	console.log(`✅ Nerdo running on http://localhost:${PORT}`);
});
git check
>>>>>>> 06efbdd7f4ab2d36d7917271203f242a7d2fdfd0
