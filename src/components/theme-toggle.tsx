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
    let observer: MutationObserver | null = null;
    let timer = 0;

    const startLocation = () => {
      if (cancelled || !("geolocation" in navigator)) return true;
      const button = document.querySelector<HTMLButtonElement>("#cheapest .panel-title > button");
      if (!button) return false;
      button.style.display = "none";
      if (!button.disabled) button.click();
      return true;
    };

    const initialized = startLocation();
    if (!initialized) {
      observer = new MutationObserver(() => {
        if (startLocation()) observer?.disconnect();
      });
      observer.observe(document.body, { childList: true, subtree: true });
      timer = window.setTimeout(() => observer?.disconnect(), 5000);
    }

    return () => {
      cancelled = true;
      observer?.disconnect();
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
