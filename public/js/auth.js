/**
 * ===========================================
 * auth.js
 * - مدیریت ورود/ثبت‌نام
 * - ذخیره توکن در localStorage
 * - API helper
 * ===========================================
 */

// گرفتن توکن
export function getToken() {
	return localStorage.getItem("token") || "";
}

// ذخیره توکن و کاربر
export function saveAuth(token, user) {
	localStorage.setItem("token", token);
	localStorage.setItem("user", JSON.stringify(user));
}

// پاک کردن توکن
export function clearAuth() {
	localStorage.removeItem("token");
	localStorage.removeItem("user");
}

// گرفتن کاربر ذخیره شده (برای نمایش سریع)
export function getStoredUser() {
	try {
		return JSON.parse(localStorage.getItem("user") || "null");
	} catch {
		return null;
	}
}

// درخواست JSON با احراز هویت
export async function api(url, opts = {}) {
	const token = getToken();
	const headers = {
		"Content-Type": "application/json",
		...(opts.headers || {})
	};

	// اگر توکن داشتیم، هدر Authorization اضافه می‌کنیم
	if (token) headers.Authorization = `Bearer ${token}`;

	const res = await fetch(url, { ...opts, headers });
	const data = await res.json().catch(() => ({}));

	if (!res.ok || data?.ok === false) {
		throw new Error(data?.error || "error");
	}
	return data;
}

// اگر وارد نبود، بفرست صفحه ورود
export async function requireLogin() {
	try {
		const data = await api("/api/me");
		return data.user;
	} catch {
		location.href = "/login.html";
		return null;
	}
}

// پیام کوچک روی فرم‌ها
function showMsg(el, text, ok = true) {
	if (!el) return;
	el.style.display = "block";
	el.textContent = text;
	el.style.borderColor = ok ? "rgba(66,214,195,.45)" : "rgba(255,77,109,.45)";
	setTimeout(() => el.style.display = "none", 2600);
}

/**
 * اگر این فایل روی login/register لود شود،
 * خودش فرم‌ها را پیدا می‌کند و هندل می‌کند.
 */
document.addEventListener("DOMContentLoaded", () => {
	const loginForm = document.getElementById("loginForm");
	const registerForm = document.getElementById("registerForm");
	const msg = document.getElementById("msg");

	// فرم ورود
	if (loginForm) {
		loginForm.addEventListener("submit", async (e) => {
			e.preventDefault(); // ✅ جلوگیری از رفرش
			const fd = new FormData(loginForm);

			try {
				const data = await api("/api/login", {
					method: "POST",
					body: JSON.stringify({
						username: fd.get("username"),
						password: fd.get("password")
					})
				});

				// ذخیره توکن + کاربر
				saveAuth(data.token, data.user);

				// رفتن به داشبورد
				location.href = "/dashboard.html";
			} catch (err) {
				showMsg(msg, "ورود ناموفق ❌ (نام کاربری/رمز)", false);
			}
		});
	}

	// فرم ثبت‌نام
	if (registerForm) {
		registerForm.addEventListener("submit", async (e) => {
			e.preventDefault();
			const fd = new FormData(registerForm);

			try {
				const data = await api("/api/register", {
					method: "POST",
					body: JSON.stringify({
						name: fd.get("name"),
						username: fd.get("username"),
						password: fd.get("password")
					})
				});

				saveAuth(data.token, data.user);
				location.href = "/dashboard.html";
			} catch (err) {
				showMsg(msg, "ثبت‌نام ناموفق ❌ (نام کاربری تکراری یا ناقص)", false);
			}
		});
	}
});

