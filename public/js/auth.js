const API = "";

function $(sel) { return document.querySelector(sel); }

function saveAuth(token, user) {
	localStorage.setItem("token", token);
	localStorage.setItem("user", JSON.stringify(user));
}

function getToken() {
	return localStorage.getItem("token") || "";
}

function showMsg(el, text, ok = true) {
	if (!el) return;
	el.style.display = "block";
	el.textContent = text;
	el.classList.toggle("ok", ok);
	el.classList.toggle("err", !ok);
	setTimeout(() => (el.style.display = "none"), 3500);
}

async function postJSON(url, body) {
	const res = await fetch(API + url, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body)
	});
	const data = await res.json().catch(() => ({}));
	if (!res.ok || !data.ok) throw new Error(data.error || "خطا");
	return data;
}

async function initLogin() {
	const form = $("#loginForm");
	if (!form) return;

	const msg = $("#msg");

	form.addEventListener("submit", async (e) => {
		e.preventDefault(); // مهم: جلوی رفرش گرفتن
		const username = form.username.value.trim();
		const password = form.password.value;

		try {
			const data = await postJSON("/api/login", { username, password });
			saveAuth(data.token, data.user);
			location.href = "/dashboard.html";
		} catch (err) {
			showMsg(msg, err.message || "ورود ناموفق", false);
		}
	});
}

async function initRegister() {
	const form = $("#registerForm");
	if (!form) return;

	const msg = $("#msg");

	form.addEventListener("submit", async (e) => {
		e.preventDefault();
		const name = form.name.value.trim();
		const username = form.username.value.trim();
		const password = form.password.value;

		try {
			const data = await postJSON("/api/register", { name, username, password });
			saveAuth(data.token, data.user);
			location.href = "/dashboard.html";
		} catch (err) {
			showMsg(msg, err.message || "ثبت‌نام ناموفق", false);
		}
	});
}

document.addEventListener("DOMContentLoaded", () => {
	initLogin();
	initRegister();
});
git check