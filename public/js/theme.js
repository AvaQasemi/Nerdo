// public/js/theme.js
// ✅ مدیریت تم (لایت/دارک) برای کل سایت + ذخیره در localStorage

(function () {
	const KEY = "nerdo_theme";

	function applyTheme(theme) {
		// روی <html> ست می‌کنیم تا کل سایت یک‌دست تغییر کنه
		document.documentElement.setAttribute("data-theme", theme);

		// متن دکمه (اگه وجود داشت)
		const btn = document.getElementById("themeToggle");
		if (btn) btn.textContent = theme === "dark" ? "☀️ لایت" : "🌙 دارک";
	}

	function getPreferredTheme() {
		const saved = localStorage.getItem(KEY);
		if (saved === "light" || saved === "dark") return saved;

		// اگر چیزی ذخیره نشده بود، از تنظیمات سیستم حدس می‌زنیم
		const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
		return prefersDark ? "dark" : "light";
	}

	// اجرای اولیه
	applyTheme(getPreferredTheme());

	// کلیک روی دکمه تم
	window.addEventListener("DOMContentLoaded", () => {
		const btn = document.getElementById("themeToggle");
		if (!btn) return;

		btn.addEventListener("click", () => {
			const current = document.documentElement.getAttribute("data-theme") || "light";
			const next = current === "dark" ? "light" : "dark";
			localStorage.setItem(KEY, next);
			applyTheme(next);
		});
	});
})();