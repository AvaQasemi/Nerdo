/**
 * ===========================================
 * app.js (Dashboard)
 * - پروژه‌ها: ساخت/انتخاب/حذف
 * - تسک‌ها: ساخت/حذف/Drag&Drop + ددلاین
 * - KPI + Progress bar
 * - بازخورد + ستاره
 * - حالت خالی هوشمند
 * ===========================================
 */

import { api, requireLogin, clearAuth, getStoredUser } from "./auth.js";

// وضعیت‌های اصلی
let me = null;
let activeProject = null;
let tasks = [];

// کمک: گرفتن المنت
const $ = (id) => document.getElementById(id);

// Toast کوچک پایین صفحه
function toast(text, ok=true){
  const t = $("toast");
  if(!t) return;
  t.textContent = text;
  t.classList.remove("ok","err","show");
  t.classList.add(ok ? "ok" : "err");
  // کمی تاخیر برای انیمیشن
  setTimeout(()=> t.classList.add("show"), 10);
  setTimeout(()=> t.classList.remove("show"), 2400);
}

// تبدیل اولویت به متن
function priorityLabel(p){
  if (p === 1) return "بالا";
  if (p === 2) return "متوسط";
  return "پایین";
}

// تبدیل اولویت به کلاس
function priorityClass(p){
  if (p === 1) return "priority-1";
  if (p === 2) return "priority-2";
  return "priority-3";
}

// نمایش تاریخ ددلاین خوشگل
function formatDeadline(d){
  if(!d) return "ندارد";
  // d مثل 2026-02-20
  return d;
}

/* =========================
   رندر لیست پروژه‌ها
   ========================= */
async function loadProjects(){
  const box = $("projectList");
  box.innerHTML = "";

  const data = await api("/api/projects");
  const projects = data.projects || [];

  // حالت خالی هوشمند (پروژه نداری)
  if(projects.length === 0){
    box.innerHTML = `
      <div class="empty">
        هنوز پروژه‌ای نداری 🙂<br/>
        از سمت چپ «ساخت پروژه جدید» یک پروژه بساز.
      </div>
    `;
    return;
  }

  // ساخت هر ردیف پروژه
  projects.forEach((p) => {
    const row = document.createElement("div");
    row.className = "proj-row";

    const openBtn = document.createElement("button");
    openBtn.className = "ghost proj-btn";
    openBtn.innerHTML = `
      <span class="proj-title">${p.title}</span>
      <span class="proj-sub">${p.description || ""}</span>
    `;
    openBtn.addEventListener("click", () => selectProject(p));

    const delBtn = document.createElement("button");
    delBtn.className = "danger mini";
    delBtn.textContent = "حذف";
    delBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if(!confirm("پروژه حذف شود؟ همه تسک‌هایش پاک می‌شود.")) return;
      await api(`/api/projects/${p.id}`, { method:"DELETE" });
      // اگر پروژه فعال بود، خالی کن
      if(activeProject?.id === p.id){
        activeProject = null;
        tasks = [];
        renderBoardEmpty();
      }
      await loadProjects();
      toast("پروژه حذف شد ✅");
    });

    row.appendChild(openBtn);
    row.appendChild(delBtn);
    box.appendChild(row);
  });
}

/* =========================
   انتخاب پروژه و لود تسک‌ها
   ========================= */
async function selectProject(p){
  activeProject = p;

  $("activeProjectTitle").textContent = `کانبان: ${p.title}`;
  $("activeProjectDesc").textContent = p.description || "";

  // گرفتن تسک‌های پروژه
  const data = await api(`/api/projects/${p.id}/tasks`);
  tasks = data.tasks || [];

  renderTasks();
  updateKPIsAndProgress();
}

/* =========================
   رندر حالت خالی برد
   ========================= */
function renderBoardEmpty(){
  $("activeProjectTitle").textContent = "کانبان";
  $("activeProjectDesc").textContent = "ابتدا یک پروژه انتخاب کن.";
  $("colTodo").innerHTML = "";
  $("colDoing").innerHTML = "";
  $("colDone").innerHTML = "";

  $("emptyTasks").style.display = "block"; // پیام خالی
  updateKPIsAndProgress();
}

/* =========================
   KPI + نوار پیشرفت
   ========================= */
function updateKPIsAndProgress(){
  const total = tasks.length;
  const done = tasks.filter(t => t.status === "done").length;
  const doing = tasks.filter(t => t.status === "doing").length;
  const rate = total === 0 ? 0 : Math.round((done/total)*100);

  $("kpiTotal").textContent = total;
  $("kpiDone").textContent = done;
  $("kpiDoing").textContent = doing;
  $("kpiRate").textContent = `${rate}%`;

  $("countTodo").textContent = tasks.filter(t => t.status === "todo").length;
  $("countDoing").textContent = doing;
  $("countDone").textContent = done;

  // نوار پیشرفت
  $("progressText").textContent = `${rate}%`;
  $("progressBar").style.width = `${rate}%`;

  // حالت خالی هوشمند (تسک نداری)
  const showEmpty = activeProject && total === 0;
  $("emptyTasks").style.display = showEmpty ? "block" : "none";
}

/* =========================
   ساخت کارت تسک
   ========================= */
function makeTaskCard(t){
  const card = document.createElement("div");
  card.className = `task ${priorityClass(t.priority)}`;
  card.draggable = true;
  card.dataset.id = t.id;

  // هد کارت
  const head = document.createElement("div");
  head.className = "task-head";

  const title = document.createElement("div");
  title.className = "task-title";
  title.textContent = t.title;

  // حذف تسک
  const delBtn = document.createElement("button");
  delBtn.className = "danger mini";
  delBtn.textContent = "حذف";
  delBtn.addEventListener("click", async () => {
    if(!confirm("این تسک حذف شود؟")) return;
    await api(`/api/tasks/${t.id}`, { method:"DELETE" });
    tasks = tasks.filter(x => x.id !== t.id);
    renderTasks();
    updateKPIsAndProgress();
    toast("تسک حذف شد ✅");
  });

  head.appendChild(title);
  head.appendChild(delBtn);

  // توضیح
  const desc = document.createElement("div");
  desc.className = "task-desc";
  desc.textContent = t.description || "—";

  // متا: اولویت + ددلاین
  const meta = document.createElement("div");
  meta.className = "task-meta";
  meta.innerHTML = `
    <span class="badgeSmall">اولویت: ${priorityLabel(t.priority)}</span>
    <span class="badgeSmall">ددلاین: ${formatDeadline(t.deadline)}</span>
  `;

  card.appendChild(head);
  card.appendChild(desc);
  card.appendChild(meta);

  // Drag start
  card.addEventListener("dragstart", (e) => {
    e.dataTransfer.setData("text/plain", String(t.id));
  });

  return card;
}

/* =========================
   رندر ستون‌ها
   ========================= */
function renderTasks(){
  $("colTodo").innerHTML = "";
  $("colDoing").innerHTML = "";
  $("colDone").innerHTML = "";

  tasks.forEach((t) => {
    const card = makeTaskCard(t);
    if(t.status === "doing") $("colDoing").appendChild(card);
    else if(t.status === "done") $("colDone").appendChild(card);
    else $("colTodo").appendChild(card);
  });
}

/* =========================
   Dropzones (Drag & Drop)
   ========================= */
function setupDropzones(){
  document.querySelectorAll(".dropzone").forEach((zone) => {
    zone.addEventListener("dragover", (e) => {
      e.preventDefault();
      zone.classList.add("over");
    });

    zone.addEventListener("dragleave", () => zone.classList.remove("over"));

    zone.addEventListener("drop", async (e) => {
      e.preventDefault();
      zone.classList.remove("over");

      const taskId = Number(e.dataTransfer.getData("text/plain"));
      const newStatus = zone.dataset.status;

      const t = tasks.find(x => x.id === taskId);
      if(!t || t.status === newStatus) return;

      // آپدیت در سرور
      await api(`/api/tasks/${taskId}`, {
        method:"PATCH",
        body: JSON.stringify({ status: newStatus })
      });

      // آپدیت لوکال
      t.status = newStatus;
      renderTasks();
      updateKPIsAndProgress();
      toast("وضعیت تغییر کرد ✅");
    });
  });
}

/* =========================
   Stars (Feedback)
   ========================= */
function setupStars(){
  const stars = Array.from(document.querySelectorAll(".star"));
  let selected = 5;

  // روشن/خاموش کردن ستاره‌ها
  function paint(){
    stars.forEach((s) => {
      const v = Number(s.dataset.v);
      s.classList.toggle("on", v <= selected);
    });
    $("starsValue").textContent = String(selected);
  }

  stars.forEach((s) => {
    s.addEventListener("click", () => {
      selected = Number(s.dataset.v);
      paint();
    });
  });

  paint();
  return () => selected;
}

/* =========================
   شروع برنامه داشبورد
   ========================= */
async function main(){
  // اگر وارد نباشه می‌فرستیم login
  me = await requireLogin();
  if(!me) return;

  // نمایش نام
  $("me").textContent = `سلام ${me.name} 👋`;
  $("roleTag").textContent = me.role === "admin" ? "ادمین" : "کاربر";

  // خروج
  $("logoutBtn").addEventListener("click", async () => {
    try{ await api("/api/logout", { method:"POST" }); }catch{}
    clearAuth();
    location.href = "/login.html";
  });

  // لینک پروفایل
  $("profileBtn").addEventListener("click", () => location.href = "/profile.html");

  // ساخت پروژه
  $("projectForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);

    const title = fd.get("title");
    const description = fd.get("description");

    const data = await api("/api/projects", {
      method:"POST",
      body: JSON.stringify({ title, description })
    });

    toast("پروژه ساخته شد ✨");
    e.currentTarget.reset();

    // رفرش لیست پروژه‌ها
    await loadProjects();

    // پروژه تازه را فعال کن
    await selectProject(data.project);
  });

  // ساخت تسک (با ددلاین)
  $("taskForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if(!activeProject) return toast("اول یک پروژه انتخاب کن.", false);

    const fd = new FormData(e.currentTarget);

    const payload = {
      title: fd.get("title"),
      description: fd.get("description"),
      priority: Number(fd.get("priority") || 2),
      deadline: fd.get("deadline") || null // ✅ ددلاین
    };

    const data = await api(`/api/projects/${activeProject.id}/tasks`, {
      method:"POST",
      body: JSON.stringify(payload)
    });

    tasks.unshift(data.task);
    e.currentTarget.reset();
    renderTasks();
    updateKPIsAndProgress();
    toast("تسک اضافه شد ✅");
  });

  // بازخورد + ستاره
  const getStars = setupStars();
  $("feedbackForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const message = fd.get("message");

    await api("/api/feedback", {
      method:"POST",
      body: JSON.stringify({ message, stars: getStars() })
    });

    e.currentTarget.reset();
    toast("بازخورد ثبت شد 🌟");
  });

  // فعال کردن دراپ زون‌ها
  setupDropzones();

  // لود پروژه‌ها
  await loadProjects();
  renderBoardEmpty();
}

main().catch(() => {
  // اگر یه خطای غیرمنتظره شد، لاگین را دوباره بخواه
  clearAuth();
  location.href = "/login.html";
});
