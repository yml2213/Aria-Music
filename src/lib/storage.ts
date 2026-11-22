import type { Playlist, Quality, ThemeMode, Track } from "../types";

const QUALITY_STORAGE = "aria-music:quality";
const THEME_STORAGE = "aria-music:theme";
const FAVORITES_STORAGE = "aria-music:favorites";
const RECENT_STORAGE = "aria-music:recent";
const PLAYLISTS_STORAGE = "aria-music:playlists";

function read<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
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
  getFavorites: () => read<Track[]>(FAVORITES_STORAGE, []),
  setFavorites: (value: Track[]) => write(FAVORITES_STORAGE, value),
  getRecent: () => read<Track[]>(RECENT_STORAGE, []),
  setRecent: (value: Track[]) => write(RECENT_STORAGE, value),
  getPlaylists: () => read<Playlist[]>(PLAYLISTS_STORAGE, []),
  setPlaylists: (value: Playlist[]) => write(PLAYLISTS_STORAGE, value),
};
