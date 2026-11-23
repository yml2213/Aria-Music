import type {
  LxQuality,
  LxSource,
  Playlist,
  Provider,
  Track,
  TrackPlatformMeta,
} from "../types";

const DB_NAME = "aria-music";
const DB_VERSION = 1;
const STORE_NAME = "state";
const LIBRARY_KEY = "library";
const FALLBACK_KEY = "aria-music:library:v1";
const LEGACY_FAVORITES = "aria-music:favorites";
const LEGACY_RECENT = "aria-music:recent";
const LEGACY_PLAYLISTS = "aria-music:playlists";
const PROVIDERS = new Set<Provider>(["netease", "qq", "kugou", "kuwo"]);
const LX_SOURCES = new Set<LxSource>(["wy", "tx", "kg", "kw", "mg", "local"]);
const LX_QUALITIES = new Set<LxQuality>(["128k", "320k", "flac", "flac24bit"]);

export interface LibraryData {
  favorites: Track[];
  recent: Track[];
  playlists: Playlist[];
}

interface StoredLibrary extends LibraryData {
  version: 1;
  updatedAt: number;
}

let databasePromise: Promise<IDBDatabase> | undefined;
let libraryLoadPromise: Promise<LibraryData> | undefined;

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function string(value: unknown) {
  return typeof value === "string" ? value : "";
}

function optionalString(value: unknown) {
  return typeof value === "string" && value ? value : undefined;
}

function finiteNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function normalizePlatformMeta(value: unknown): TrackPlatformMeta | undefined {
  const meta = record(value);
  const lxSource = string(meta.lxSource) as LxSource;
  const songmid = string(meta.songmid);
  if (!LX_SOURCES.has(lxSource) || !songmid) return undefined;
  const qualitys = Array.isArray(meta.qualitys)
    ? meta.qualitys.flatMap((item) => {
        const quality = record(item);
        const type = string(quality.type) as LxQuality;
        if (!LX_QUALITIES.has(type)) return [];
        return [
          {
            type,
            size: optionalString(quality.size),
            hash: optionalString(quality.hash),
          },
        ];
      })
    : undefined;
  return {
    lxSource,
    songmid,
    songId: optionalString(meta.songId),
    hash: optionalString(meta.hash),
    albumId: optionalString(meta.albumId),
    albumMid: optionalString(meta.albumMid),
    strMediaMid: optionalString(meta.strMediaMid),
    qualitys,
    qualityMap:
      typeof meta.qualityMap === "object" && meta.qualityMap !== null
        ? (meta.qualityMap as TrackPlatformMeta["qualityMap"])
        : undefined,
  };
}

export function normalizeTrack(value: unknown): Track | undefined {
  const track = record(value);
  const provider = string(track.provider) as Provider;
  const key = string(track.key);
  const id = string(track.id);
  const platformMeta = normalizePlatformMeta(track.platformMeta);
  if (!PROVIDERS.has(provider) || !key || !id || !platformMeta) return undefined;
  return {
    key,
    provider,
    id,
    title: string(track.title) || "未知歌曲",
    artist: string(track.artist) || "未知歌手",
    album: string(track.album) || "未知专辑",
    cover: optionalString(track.cover),
    duration: finiteNumber(track.duration),
    sourceIndex: finiteNumber(track.sourceIndex),
    platformMeta,
  };
}

function uniqueTracks(values: unknown[]) {
  const seen = new Set<string>();
  return values.flatMap((value) => {
    const track = normalizeTrack(value);
    if (!track || seen.has(track.key)) return [];
    seen.add(track.key);
    return [track];
  });
}

function normalizePlaylist(value: unknown): Playlist | undefined {
  const playlist = record(value);
  const id = string(playlist.id);
  if (!id) return undefined;
  const tracks = Array.isArray(playlist.tracks) ? uniqueTracks(playlist.tracks) : [];
  return {
    id,
    title: string(playlist.title) || "网易云歌单",
    creator: string(playlist.creator) || "网易云音乐",
    cover: optionalString(playlist.cover),
    trackCount: finiteNumber(playlist.trackCount) ?? tracks.length,
    tracks,
    importedAt: finiteNumber(playlist.importedAt) ?? Date.now(),
  };
}

export function normalizeLibraryData(value: unknown): LibraryData {
  const library = record(value);
  const seenPlaylists = new Set<string>();
  const playlists = (Array.isArray(library.playlists) ? library.playlists : []).flatMap(
    (item) => {
      const playlist = normalizePlaylist(item);
      if (!playlist || seenPlaylists.has(playlist.id)) return [];
      seenPlaylists.add(playlist.id);
      return [playlist];
    },
  );
  return {
    favorites: Array.isArray(library.favorites)
      ? uniqueTracks(library.favorites)
      : [],
    recent: Array.isArray(library.recent) ? uniqueTracks(library.recent).slice(0, 24) : [],
    playlists,
  };
}

function openDatabase() {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB 不可用"));
  }
  databasePromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("无法打开本地音乐库"));
  });
  return databasePromise;
}

async function readIndexedLibrary() {
  const database = await openDatabase();
  return new Promise<unknown>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(LIBRARY_KEY);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("读取本地音乐库失败"));
  });
}

async function writeIndexedLibrary(data: StoredLibrary) {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(data, LIBRARY_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("写入本地音乐库失败"));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("本地音乐库写入已中止"));
  });
}

function readFallback() {
  if (typeof localStorage === "undefined") return undefined;
  try {
    const value = localStorage.getItem(FALLBACK_KEY);
    return value ? JSON.parse(value) : undefined;
  } catch {
    return undefined;
  }
}

function writeFallback(data: StoredLibrary) {
  if (typeof localStorage === "undefined") {
    throw new Error("浏览器不支持持久化存储");
  }
  localStorage.setItem(FALLBACK_KEY, JSON.stringify(data));
}

function readLegacy() {
  if (typeof localStorage === "undefined") return undefined;
  try {
    const favorites = JSON.parse(localStorage.getItem(LEGACY_FAVORITES) ?? "[]");
    const recent = JSON.parse(localStorage.getItem(LEGACY_RECENT) ?? "[]");
    const playlists = JSON.parse(localStorage.getItem(LEGACY_PLAYLISTS) ?? "[]");
    if (!favorites.length && !recent.length && !playlists.length) return undefined;
    return { favorites, recent, playlists };
  } catch {
    return undefined;
  }
}

function clearLegacy() {
  if (typeof localStorage === "undefined") return;
  for (const key of [LEGACY_FAVORITES, LEGACY_RECENT, LEGACY_PLAYLISTS]) {
    localStorage.removeItem(key);
  }
}

async function persist(data: LibraryData) {
  const stored: StoredLibrary = {
    version: 1,
    updatedAt: Date.now(),
    ...normalizeLibraryData(data),
  };
  try {
    await writeIndexedLibrary(stored);
  } catch {
    writeFallback(stored);
  }
  clearLegacy();
}

async function loadLibraryOnce(): Promise<LibraryData> {
  let stored: unknown;
  try {
    stored = await readIndexedLibrary();
    if (!stored) stored = readFallback();
  } catch {
    stored = readFallback();
  }
  if (stored) return normalizeLibraryData(stored);
  const legacy = readLegacy();
  const library = normalizeLibraryData(legacy);
  if (legacy) await persist(library);
  return library;
}

export function loadLibrary() {
  libraryLoadPromise ??= loadLibraryOnce().catch((error) => {
    libraryLoadPromise = undefined;
    throw error;
  });
  return libraryLoadPromise;
}

export async function saveLibrary(data: LibraryData) {
  await persist(data);
}
