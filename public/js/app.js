const API = "";
const token = localStorage.getItem("token") || "";

function $(sel) { return document.querySelector(sel); }
function el(tag, cls) { const x = document.createElement(tag); if (cls) x.className = cls; return x; }

function authHeaders() {
	return { "Content-Type": "application/json", "Authorization": `Bearer ${token}` };
}

function toast(text, ok = true) {
	const t = $("#toast");
	if (!t) return;
	t.textContent = text;
	t.classList.toggle("ok", ok);
	t.classList.toggle("err", !ok);
	t.classList.add("show");
	setTimeout(() => t.classList.remove("show"), 2400);
}

async function apiGET(url) {
	const res = await fetch(API + url, { headers: authHeaders() });
	const data = await res.json().catch(() => ({}));
	if (!res.ok || !data.ok) throw new Error(data.error || "خطا");
	return data;
}
async function apiPOST(url, body) {
	const res = await fetch(API + url, { method: "POST", headers: authHeaders(), body: JSON.stringify(body) });
	const data = await res.json().catch(() => ({}));
	if (!res.ok || !data.ok) throw new Error(data.error || "خطا");
	return data;
}
async function apiPATCH(url, body) {
	const res = await fetch(API + url, { method: "PATCH", headers: authHeaders(), body: JSON.stringify(body) });
	const data = await res.json().catch(() => ({}));
	if (!res.ok || !data.ok) throw new Error(data.error || "خطا");
	return data;
}
async function apiDEL(url) {
	const res = await fetch(API + url, { method: "DELETE", headers: authHeaders() });
	const data = await res.json().catch(() => ({}));
	if (!res.ok || !data.ok) throw new Error(data.error || "خطا");
	return data;
}

let activeProjectId = null;
let tasks = [];

function setMe(user) {
	$("#me").textContent = `سلام ${user.name} 👋`;
	$("#roleTag").textContent = user.role === "admin" ? "ادمین" : "کاربر";
}

function priorityLabel(p) {
	if (p === 1) return "بالا";
	if (p === 2) return "متوسط";
	return "پایین";
}

function calcKPIs() {
	const total = tasks.length;
	const done = tasks.filter(t => t.status === "done").length;
	const doing = tasks.filter(t => t.status === "doing").length;
	const rate = total ? Math.round((done / total) * 100) : 0;

	$("#kpiTotal").textContent = total;
	$("#kpiDone").textContent = done;
	$("#kpiDoing").textContent = doing;
	$("#kpiRate").textContent = `${rate}%`;

	$("#countTodo").textContent = tasks.filter(t => t.status === "todo").length;
	$("#countDoing").textContent = doing;
	$("#countDone").textContent = done;
}

function renderTasks() {
	const colTodo = $("#colTodo");
	const colDoing = $("#colDoing");
	const colDone = $("#colDone");

	colTodo.innerHTML = "";
	colDoing.innerHTML = "";
	colDone.innerHTML = "";

	for (const t of tasks) {
		const card = el("div", `task priority-${t.priority}`);
		card.draggable = true;
		card.dataset.id = t.id;

		const head = el("div", "task-head");
		const title = el("div", "task-title");
		title.textContent = t.title;

		const delBtn = el("button", "mini danger");
		delBtn.textContent = "حذف";
		delBtn.addEventListener("click", async () => {
			if (!confirm("این تسک حذف شود؟")) return;
			try {
				await apiDEL(`/api/tasks/${t.id}`);
				tasks = tasks.filter(x => x.id !== t.id);
				renderTasks();
				calcKPIs();
				toast("تسک حذف شد ✅");
			} catch (e) {
				toast(e.message, false);
			}
		});

		head.appendChild(title);
		head.appendChild(delBtn);

		const desc = el("div", "task-desc");
		desc.textContent = t.description || "—";

		const meta = el("div", "task-meta");
		meta.textContent = `اولویت: ${priorityLabel(t.priority)}`;

		card.appendChild(head);
		card.appendChild(desc);
		card.appendChild(meta);

		card.addEventListener("dragstart", (e) => {
			e.dataTransfer.setData("text/plain", t.id);
			card.classList.add("dragging");
		});
		card.addEventListener("dragend", () => card.classList.remove("dragging"));

		if (t.status === "todo") colTodo.appendChild(card);
		else if (t.status === "doing") colDoing.appendChild(card);
		else colDone.appendChild(card);
	}
}

function setupDropzones() {
	document.querySelectorAll(".dropzone").forEach((zone) => {
		zone.addEventListener("dragover", (e) => {
			e.preventDefault();
			zone.classList.add("over");
		});
		zone.addEventListener("dragleave", () => zone.classList.remove("over"));
		zone.addEventListener("drop", async (e) => {
			e.preventDefault();
			zone.classList.remove("over");

			const taskId = e.dataTransfer.getData("text/plain");
			const status = zone.dataset.status;
			const task = tasks.find(t => t.id === taskId);
			if (!task || task.status === status) return;

			try {
				await apiPATCH(`/api/tasks/${taskId}`, { status });
				task.status = status;
				renderTasks();
				calcKPIs();
				toast("وضعیت تغییر کرد ✅");
			} catch (err) {
				toast(err.message, false);
			}
		});
	});
}

async function loadProjects() {
	const list = $("#projectList");
	list.innerHTML = "";
	const { projects } = await apiGET("/api/projects");

	if (!projects.length) {
		const empty = el("div", "empty");
		empty.textContent = "هیچ پروژه‌ای نداری 🙂 یکی بساز.";
		list.appendChild(empty);
		return;
	}

	for (const p of projects) {
		const row = el("div", "proj-row");

		const btn = el("button", "proj-btn");
		btn.innerHTML = `<span class="proj-title">${p.title}</span><span class="proj-sub">${p.description || ""}</span>`;
		btn.addEventListener("click", () => openProject(p));

		const del = el("button", "mini danger");
		del.textContent = "حذف";
		del.addEventListener("click", async (e) => {
			e.stopPropagation();
			if (!confirm("این پروژه و تمام تسک‌هایش حذف شود؟")) return;
			try {
				await apiDEL(`/api/projects/${p.id}`);
				if (activeProjectId === p.id) {
					activeProjectId = null;
					tasks = [];
					$("#activeProjectTitle").textContent = "کانبان";
					$("#activeProjectDesc").textContent = "ابتدا یک پروژه انتخاب کن.";
					renderTasks(); calcKPIs();
				}
				await loadProjects();
				toast("پروژه حذف شد ✅");
			} catch (err) {
				toast(err.message, false);
			}
		});

		row.appendChild(btn);
		row.appendChild(del);
		list.appendChild(row);
	}
}

async function openProject(project) {
	activeProjectId = project.id;
	$("#activeProjectTitle").textContent = `کانبان: ${project.title}`;
	$("#activeProjectDesc").textContent = project.description || "";

	const res = await apiGET(`/api/projects/${project.id}/tasks`);
	tasks = res.tasks || [];
	renderTasks();
	calcKPIs();
}

async function init() {
	if (!token) {
		location.href = "/login.html";
		return;
	}

	try {
		const { user } = await apiGET("/api/me");
		setMe(user);
	} catch {
		localStorage.removeItem("token");
		localStorage.removeItem("user");
		location.href = "/login.html";
		return;
	}

	// logout
	$("#logoutBtn").addEventListener("click", async () => {
		try { await apiPOST("/api/logout", {}); } catch { }
		localStorage.removeItem("token");
		localStorage.removeItem("user");
		location.href = "/login.html";
	});

	// theme toggle (پاستلی روشن/تیره)
	$("#themeBtn").addEventListener("click", () => {
		document.documentElement.classList.toggle("dark");
		localStorage.setItem("theme", document.documentElement.classList.contains("dark") ? "dark" : "light");
	});
	const savedTheme = localStorage.getItem("theme");
	if (savedTheme === "dark") document.documentElement.classList.add("dark");

	// create project
	$("#projectForm").addEventListener("submit", async (e) => {
		e.preventDefault();
		const f = e.currentTarget;
		const title = f.title.value.trim();
		const description = f.description.value.trim();

		try {
			const { project } = await apiPOST("/api/projects", { title, description });
			f.reset();
			await loadProjects();
			openProject(project);
			toast("پروژه ساخته شد ✨");
		} catch (err) {
			toast(err.message, false);
		}
	});

	// create task
	$("#taskForm").addEventListener("submit", async (e) => {
		e.preventDefault();
		if (!activeProjectId) return toast("اول یک پروژه انتخاب کن.", false);

		const f = e.currentTarget;
		const title = f.title.value.trim();
		const description = f.description.value.trim();
		const priority = Number(f.priority.value);

		try {
			const { task } = await apiPOST(`/api/projects/${activeProjectId}/tasks`, { title, description, priority });
			tasks.unshift(task);
			f.reset();
			renderTasks();
			calcKPIs();
			toast("تسک اضافه شد ✅");
		} catch (err) {
			toast(err.message, false);
		}
	});

	// feedback + stars
	let selectedStars = 5;
	document.querySelectorAll(".star").forEach((s) => {
		s.addEventListener("click", () => {
			selectedStars = Number(s.dataset.v);
			document.querySelectorAll(".star").forEach((x) => x.classList.toggle("on", Number(x.dataset.v) <= selectedStars));
			$("#starsValue").textContent = selectedStars;
		});
	});

	$("#feedbackForm").addEventListener("submit", async (e) => {
		e.preventDefault();
		const f = e.currentTarget;
		const message = f.message.value.trim();
		try {
			await apiPOST("/api/feedback", { message, stars: selectedStars });
			f.reset();
			toast("بازخورد ثبت شد 🌟");
		} catch (err) {
			toast(err.message, false);
		}
	});

	setupDropzones();
	await loadProjects();
	renderTasks();
	calcKPIs();
}

document.addEventListener("DOMContentLoaded", init);