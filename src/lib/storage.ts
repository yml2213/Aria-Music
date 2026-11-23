import type { Quality, ThemeMode } from "../types";

const QUALITY_STORAGE = "aria-music:quality";
const THEME_STORAGE = "aria-music:theme";
const VOLUME_STORAGE = "aria-music:volume";
export const STORAGE_ERROR_EVENT = "aria-music:storage-error";

function read<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent(STORAGE_ERROR_EVENT, {
          detail: "浏览器本地存储不可用，本次设置可能无法保留。",
        }),
      );
    }
  }
}

export const storage = {
  getTheme: () => {
    const value = read<ThemeMode>(THEME_STORAGE, "system");
    return value === "light" || value === "dark" || value === "system"
      ? value
      : "system";
  },
  setTheme: (value: ThemeMode) => write(THEME_STORAGE, value),
  getQuality: () => read<Quality>(QUALITY_STORAGE, "lossless"),
  setQuality: (value: Quality) => write(QUALITY_STORAGE, value),
  getVolume: () => {
    const value = read<number>(VOLUME_STORAGE, 0.82);
    return Number.isFinite(value) && value >= 0 && value <= 1 ? value : 0.82;
  },
  setVolume: (value: number) => write(VOLUME_STORAGE, Math.min(Math.max(value, 0), 1)),
};
