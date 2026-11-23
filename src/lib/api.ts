import type {
  LxQuality,
  Playlist,
  Provider,
  Quality,
  SourceConfig,
  SourceRecommendation,
  Track,
} from "../types";

interface ApiErrorPayload {
  message?: string;
}

interface SearchResponse {
  tracks: Track[];
}

export interface ResolvedTrack {
  track: Track;
  url: string;
  remoteUrl?: string;
  quality: LxQuality;
  sourceId: string;
  sourceName: string;
}

export interface LyricResult {
  lyric: string;
  translatedLyric: string;
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status = 0) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError("无法连接本地音乐服务，请确认服务端已经启动");
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError(
      response.ok ? "音乐服务返回了无法识别的数据" : `请求失败 (${response.status})`,
      response.status,
    );
  }
  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload !== null &&
      typeof (payload as ApiErrorPayload).message === "string"
        ? (payload as ApiErrorPayload).message!
        : `请求失败 (${response.status})`;
    throw new ApiError(message, response.status);
  }
  return payload as T;
}

export async function searchTracks(provider: Provider, query: string) {
  const url = new URL("/api/search", window.location.origin);
  url.searchParams.set("provider", provider);
  url.searchParams.set("q", query);
  const payload = await requestJson<SearchResponse>(url.pathname + url.search);
  return payload.tracks;
}

export async function resolveTrack(
  track: Track,
  quality: Quality,
  excludedUrls: string[] = [],
) {
  return requestJson<ResolvedTrack>("/api/track/resolve", {
    method: "POST",
    body: JSON.stringify({ track, quality, excludedUrls }),
  });
}

export async function fetchTrackLyric(track: Track) {
  return requestJson<LyricResult>("/api/track/lyric", {
    method: "POST",
    body: JSON.stringify({ track }),
  });
}

export async function importNeteasePlaylist(id: string): Promise<Playlist> {
  return requestJson<Playlist>(`/api/playlists/netease/${encodeURIComponent(id)}`);
}

export async function getSourceConfig() {
  return requestJson<SourceConfig>("/api/config");
}

export async function getSourceRecommendations() {
  const payload = await requestJson<{ sources: SourceRecommendation[] }>(
    "/api/sources/catalog",
  );
  return payload.sources;
}

export async function importSource(url: string) {
  return requestJson<SourceConfig>("/api/sources/import", {
    method: "POST",
    body: JSON.stringify({ url }),
  });
}

export async function removeSource(id: string) {
  return requestJson<SourceConfig>(`/api/sources/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function testSource(id: string) {
  return requestJson<SourceConfig>(`/api/sources/${encodeURIComponent(id)}/test`, {
    method: "POST",
  });
}

export async function saveSourceSelection(primaryId: string, backupIds: string[]) {
  return requestJson<SourceConfig>("/api/sources/selection", {
    method: "PUT",
    body: JSON.stringify({ primaryId, backupIds }),
  });
}

export function hasConfiguredSource(config: SourceConfig) {
  return Boolean(
    config.primaryId && config.sources.some((source) => source.id === config.primaryId),
  );
}

export function sourceStatus(config: SourceConfig): "idle" | "ready" | "error" {
  if (!hasConfiguredSource(config)) return "idle";
  const primary = config.sources.find((source) => source.id === config.primaryId);
  if (!primary || primary.status.state === "error") return "error";
  return primary.status.state === "ready" ? "ready" : "idle";
}

export function providerLabel(provider: Provider) {
  if (provider === "netease") return "网易云音乐";
  if (provider === "qq") return "QQ 音乐";
  if (provider === "kugou") return "酷狗音乐";
  return "酷我音乐";
}
