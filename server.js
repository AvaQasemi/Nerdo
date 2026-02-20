const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = 3000;

const DATA_PATH = path.join(__dirname, "data.json");
const PUBLIC_DIR = path.join(__dirname, "public");

app.use(express.json({ limit: "1mb" }));
app.use(express.static(PUBLIC_DIR));

function readDB() {
  try {
    if (!fs.existsSync(DATA_PATH)) {
      fs.writeFileSync(
        DATA_PATH,
        JSON.stringify({ users: [], sessions: [], projects: [], tasks: [], feedback: [] }, null, 2),
        "utf-8"
      );
    }
    const raw = fs.readFileSync(DATA_PATH, "utf-8");
    return JSON.parse(raw || "{}");
  } catch (e) {
    return { users: [], sessions: [], projects: [], tasks: [], feedback: [] };
  }
}

function writeDB(db) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(db, null, 2), "utf-8");
}

function hashPassword(pw) {
  // ساده ولی کافی برای پروژه دانش‌آموزی
  return crypto.createHash("sha256").update(String(pw)).digest("hex");
}

function makeToken() {
  return crypto.randomBytes(24).toString("hex");
}

function auth(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "") || "";
  const db = readDB();
  const sess = db.sessions.find((s) => s.token === token);
  if (!sess) return res.status(401).json({ ok: false, error: "وارد نشده‌ای." });

  const user = db.users.find((u) => u.id === sess.userId);
  if (!user) return res.status(401).json({ ok: false, error: "حساب کاربری پیدا نشد." });

  req.user = user;
  req.token = token;
  req.db = db;
  next();
}

// ---------- Pages ----------
app.get("/", (req, res) => res.sendFile(path.join(PUBLIC_DIR, "index.html")));

// ---------- Auth APIs ----------
app.post("/api/register", (req, res) => {
  const { username, password, name } = req.body || {};
  if (!username || !password) return res.status(400).json({ ok: false, error: "نام کاربری و رمز لازم است." });
  if (String(password).length < 4) return res.status(400).json({ ok: false, error: "رمز حداقل ۴ کاراکتر." });

  const db = readDB();
  const uname = String(username).trim().toLowerCase();
  if (db.users.some((u) => u.username === uname)) return res.status(409).json({ ok: false, error: "این نام کاربری قبلاً ثبت شده." });

  const user = {
    id: crypto.randomUUID(),
    username: uname,
    name: String(name || "کاربر").trim() || "کاربر",
    passHash: hashPassword(password),
    createdAt: Date.now()
  };

  db.users.push(user);

  // اولین کاربر = ادمین (برای ارائه خوبه)
  // می‌تونی تغییر بدی ولی همین جذابه
  if (db.users.length === 1) user.role = "admin";
  else user.role = "user";

  const token = makeToken();
  db.sessions.push({ token, userId: user.id, createdAt: Date.now() });
  writeDB(db);

  res.json({ ok: true, token, user: { id: user.id, username: user.username, name: user.name, role: user.role } });
});

app.post("/api/login", (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ ok: false, error: "نام کاربری و رمز لازم است." });

  const db = readDB();
  const uname = String(username).trim().toLowerCase();
  const user = db.users.find((u) => u.username === uname);
  if (!user) return res.status(401).json({ ok: false, error: "نام کاربری یا رمز اشتباه است." });

  if (user.passHash !== hashPassword(password)) return res.status(401).json({ ok: false, error: "نام کاربری یا رمز اشتباه است." });

  const token = makeToken();
  db.sessions.push({ token, userId: user.id, createdAt: Date.now() });
  writeDB(db);

  res.json({ ok: true, token, user: { id: user.id, username: user.username, name: user.name, role: user.role } });
});

app.get("/api/me", auth, (req, res) => {
  res.json({ ok: true, user: { id: req.user.id, username: req.user.username, name: req.user.name, role: req.user.role } });
});

app.post("/api/logout", auth, (req, res) => {
  const db = readDB();
  db.sessions = db.sessions.filter((s) => s.token !== req.token);
  writeDB(db);
  res.json({ ok: true });
});

// ---------- Projects ----------
app.get("/api/projects", auth, (req, res) => {
  const db = readDB();
  const projects = db.projects.filter((p) => p.ownerId === req.user.id).sort((a, b) => b.createdAt - a.createdAt);
  res.json({ ok: true, projects });
});

app.post("/api/projects", auth, (req, res) => {
  const { title, description } = req.body || {};
  if (!title) return res.status(400).json({ ok: false, error: "عنوان پروژه لازم است." });

  const db = readDB();
  const project = {
    id: crypto.randomUUID(),
    ownerId: req.user.id,
    title: String(title).trim(),
    description: String(description || "").trim(),
    createdAt: Date.now()
  };
  db.projects.push(project);
  writeDB(db);
  res.json({ ok: true, project });
});

app.delete("/api/projects/:id", auth, (req, res) => {
  const projectId = req.params.id;
  const db = readDB();

  const p = db.projects.find((x) => x.id === projectId && x.ownerId === req.user.id);
  if (!p) return res.status(404).json({ ok: false, error: "پروژه پیدا نشد." });

  db.projects = db.projects.filter((x) => x.id !== projectId);
  db.tasks = db.tasks.filter((t) => t.projectId !== projectId); // حذف تسک‌ها همزمان
  writeDB(db);

  res.json({ ok: true });
});

// ---------- Tasks ----------
app.get("/api/projects/:id/tasks", auth, (req, res) => {
  const projectId = req.params.id;
  const db = readDB();

  const p = db.projects.find((x) => x.id === projectId && x.ownerId === req.user.id);
  if (!p) return res.status(404).json({ ok: false, error: "پروژه پیدا نشد." });

  const tasks = db.tasks
    .filter((t) => t.projectId === projectId && t.ownerId === req.user.id)
    .sort((a, b) => b.createdAt - a.createdAt);

  res.json({ ok: true, tasks });
});

app.post("/api/projects/:id/tasks", auth, (req, res) => {
  const projectId = req.params.id;
  const { title, description, priority } = req.body || {};
  if (!title) return res.status(400).json({ ok: false, error: "عنوان تسک لازم است." });

  const db = readDB();
  const p = db.projects.find((x) => x.id === projectId && x.ownerId === req.user.id);
  if (!p) return res.status(404).json({ ok: false, error: "پروژه پیدا نشد." });

  const task = {
    id: crypto.randomUUID(),
    ownerId: req.user.id,
    projectId,
    title: String(title).trim(),
    description: String(description || "").trim(),
    priority: Number(priority || 2),
    status: "todo",
    createdAt: Date.now()
  };

  db.tasks.push(task);
  writeDB(db);
  res.json({ ok: true, task });
});

app.patch("/api/tasks/:id", auth, (req, res) => {
  const taskId = req.params.id;
  const { status, title, description, priority } = req.body || {};
  const db = readDB();

  const task = db.tasks.find((t) => t.id === taskId && t.ownerId === req.user.id);
  if (!task) return res.status(404).json({ ok: false, error: "تسک پیدا نشد." });

  if (status) task.status = status;
  if (typeof title === "string") task.title = title.trim();
  if (typeof description === "string") task.description = description.trim();
  if (priority != null) task.priority = Number(priority);

  writeDB(db);
  res.json({ ok: true, task });
});

app.delete("/api/tasks/:id", auth, (req, res) => {
  const taskId = req.params.id;
  const db = readDB();

  const exists = db.tasks.some((t) => t.id === taskId && t.ownerId === req.user.id);
  if (!exists) return res.status(404).json({ ok: false, error: "تسک پیدا نشد." });

  db.tasks = db.tasks.filter((t) => t.id !== taskId);
  writeDB(db);
  res.json({ ok: true });
});

// ---------- Feedback (stars) ----------
app.post("/api/feedback", auth, (req, res) => {
  const { message, stars } = req.body || {};
  if (!message) return res.status(400).json({ ok: false, error: "متن بازخورد لازم است." });

  const db = readDB();
  const fb = {
    id: crypto.randomUUID(),
    userId: req.user.id,
    username: req.user.username,
    name: req.user.name,
    stars: Math.max(1, Math.min(5, Number(stars || 5))),
    message: String(message).trim(),
    createdAt: Date.now()
  };
  db.feedback.push(fb);
  writeDB(db);
  res.json({ ok: true, feedback: fb });
});

app.get("/api/feedback", auth, (req, res) => {
  const db = readDB();
  // فقط ادمین همه رو می‌بینه
  if (req.user.role !== "admin") return res.status(403).json({ ok: false, error: "اجازه نداری." });
  res.json({ ok: true, feedback: db.feedback.slice().sort((a, b) => b.createdAt - a.createdAt) });
});

// ---------- Start ----------
app.listen(PORT, () => {
  console.log(`✅ Nerdo running on http://localhost:${PORT}`);
});