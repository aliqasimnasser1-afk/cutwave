"use client";

import { Moon, Sun } from "lucide-react";

export default function ThemeToggle() {
  function toggle() {
    const root = document.documentElement;
    const current =
      root.dataset.theme ??
      (window.matchMedia("(prefers-color-scheme: light)").matches
        ? "light"
        : "dark");
    const next = current === "light" ? "dark" : "light";
    root.dataset.theme = next;
    try {
      localStorage.setItem("cw-theme", next);
    } catch {}
  }

  return (
    <button
      type="button"
      className="btn btn-ghost btn-icon theme-toggle"
      onClick={toggle}
      aria-label="تبديل الوضع الفاتح والداكن"
      title="تبديل الوضع"
    >
      <Sun size={18} className="tt-sun" />
      <Moon size={18} className="tt-moon" />
    </button>
  );
}
