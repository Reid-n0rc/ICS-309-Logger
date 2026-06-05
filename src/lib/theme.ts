// Light/dark theme handling. The `dark` class on <html> drives Tailwind's
// `dark:` variants. The choice is persisted in localStorage; with no stored
// choice we follow the OS preference.
export type Theme = "light" | "dark";

const KEY = "ics309-theme";

function stored(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}

function systemPrefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    !!window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

/** The theme currently applied to the document. */
export function currentTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function apply(theme: Theme): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

/** Apply the persisted theme (or the OS preference) — call once on startup. */
export function initTheme(): void {
  apply(stored() ?? (systemPrefersDark() ? "dark" : "light"));
}

/** Set and persist the theme. */
export function setTheme(theme: Theme): void {
  apply(theme);
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* storage unavailable — the in-memory class still applies */
  }
}

/** Flip between light and dark, persist it, and return the new theme. */
export function toggleTheme(): Theme {
  const next: Theme = currentTheme() === "dark" ? "light" : "dark";
  setTheme(next);
  return next;
}
