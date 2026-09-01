"use client";

import { useEffect, useState } from "react";

type Theme = "dark" | "light";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const saved = window.localStorage.getItem("fueltracker-theme") as Theme | null;
    const next: Theme = saved === "light" || saved === "dark" ? saved : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
  }, []);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem("fueltracker-theme", next);
  };

  return (
    <button className="theme-toggle" type="button" onClick={toggle} aria-label={theme === "dark" ? "Включи светъл режим" : "Включи тъмен режим"} title={theme === "dark" ? "Светъл режим" : "Тъмен режим"}>
      <span aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span>
      <span>{theme === "dark" ? "Light" : "Dark"}</span>
    </button>
  );
}
