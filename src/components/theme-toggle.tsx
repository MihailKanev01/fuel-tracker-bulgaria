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

  useEffect(() => {
    let cancelled = false;

    const startLocation = () => {
      if (cancelled || !("geolocation" in navigator)) return;
      const button = document.querySelector<HTMLButtonElement>("#cheapest .panel-title > button");
      if (!button) return;
      button.style.display = "none";
      if (!button.disabled) button.click();
    };

    const timer = window.setTimeout(startLocation, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
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
