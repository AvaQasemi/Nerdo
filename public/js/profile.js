/**
 * ===========================================
 * profile.js
 * - صفحه پروفایل کاربر
 * - نمایش تعداد پروژه‌ها
 * - آمار هر پروژه (done از کل)
 * - حالت خالی هوشمند
 * ===========================================
 */

import { api, requireLogin, getStoredUser } from "./auth.js";

// کمک: ساخت ردیف آمار پروژه
function projectRowHTML(pTitle, total, done){
  const pct = total === 0 ? 0 : Math.round((done/total)*100);
  return `
    <div class="card inner" style="padding:12px;margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap">
        <div style="font-weight:900">${pTitle}</div>
        <div class="tag">${done} از ${total} • ${pct}%</div>
      </div>
      <div class="progress-wrap" style="margin-top:10px">
        <div class="progress"><div class="progress-bar" style="width:${pct}%"></div></div>
      </div>
    </div>
  `;
}

async function main(){
  const user = await requireLogin();
  if(!user) return;

  // نمایش نام
  document.getElementById("meName").textContent = `سلام ${user.name} 👋`;

  // گرفتن پروژه‌ها
  const data = await api("/api/projects");
  const projects = data.projects || [];

  // KPI کلی
  let totalTasks = 0;
  let doneTasks = 0;

  // حالت خالی هوشمند
  const empty = document.getElementById("emptyProfile");
  const list = document.getElementById("projectStats");

  if(projects.length === 0){
    empty.style.display = "block";
    document.getElementById("pProjects").textContent = "0";
    document.getElementById("pTotal").textContent = "0";
    document.getElementById("pDone").textContent = "0";
    document.getElementById("pRate").textContent = "0%";
    return;
  }

  // برای هر پروژه، تعداد تسک‌ها را از API خودش می‌گیریم
  // (تا آمار دقیق باشد)
  const rows = [];
  for(const p of projects){
    const td = await api(`/api/projects/${p.id}/tasks`);
    const tasks = td.tasks || [];

    const total = tasks.length;
    const done = tasks.filter(t => t.status === "done").length;

    totalTasks += total;
    doneTasks += done;

    rows.push(projectRowHTML(p.title, total, done));
  }

  // پر کردن KPI ها
  const rate = totalTasks === 0 ? 0 : Math.round((doneTasks/totalTasks)*100);

  document.getElementById("pProjects").textContent = String(projects.length);
  document.getElementById("pTotal").textContent = String(totalTasks);
  document.getElementById("pDone").textContent = String(doneTasks);
  document.getElementById("pRate").textContent = `${rate}%`;

  // رندر لیست
  list.innerHTML = rows.join("");
}

main();