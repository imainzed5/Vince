export const APPEARANCE_STORAGE_KEY = "vince:appearance";

export const APPEARANCE_MODES = ["light", "dark"] as const;

export type AppearanceMode = (typeof APPEARANCE_MODES)[number];

export const DEFAULT_APPEARANCE: AppearanceMode = "light";

export function isAppearanceMode(value: string | null | undefined): value is AppearanceMode {
  return value === "light" || value === "dark";
}

export function getAppearanceBootstrapScript(): string {
  return `
(() => {
  const storageKey = ${JSON.stringify(APPEARANCE_STORAGE_KEY)};
  const fallback = ${JSON.stringify(DEFAULT_APPEARANCE)};
  const root = document.documentElement;
  const storedValue = window.localStorage.getItem(storageKey);
  const mode = storedValue === "dark" || storedValue === "light" ? storedValue : fallback;

  root.dataset.appearance = mode;
  root.classList.toggle("dark", mode === "dark");
  root.style.colorScheme = mode === "dark" ? "dark" : "light";
})();`;
}