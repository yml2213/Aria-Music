export type Provider = "netease" | "qq" | "kugou" | "kuwo";

export type LxSource = "wy" | "tx" | "kg" | "kw" | "mg" | "local";

export type LxQuality = "128k" | "320k" | "flac" | "flac24bit";

export type Quality = "standard" | "lossless" | "hires" | "jymaster";

export interface QualityMeta {
  size?: string;
  hash?: string;
}

export interface PlatformMeta {
  lxSource: LxSource;
  songmid: string;
  songId?: string;
  hash?: string;
  albumId?: string;
  albumMid?: string;
  strMediaMid?: string;
  qualitys?: Array<{ type: LxQuality; size?: string; hash?: string }>;
  qualityMap?: Partial<Record<LxQuality, QualityMeta>>;
}

export interface Track {
  key: string;
  provider: Provider;
  id: string;
  title: string;
  artist: string;
  album: string;
  cover?: string;
  duration?: number;
  sourceIndex?: number;
  quality?: string;
  url?: string;
  lyric?: string;
  translatedLyric?: string;
  platformMeta: PlatformMeta;
}

export interface Playlist {
  id: string;
  title: string;
  creator: string;
  cover?: string;
  trackCount: number;
  tracks: Track[];
  importedAt: number;
}

export interface SourceCapability {
  name?: string;
  type: "music";
  actions: string[];
  qualitys: LxQuality[];
}

export interface SourceStatus {
  state: "idle" | "ready" | "error";
  message?: string;
  checkedAt?: number;
}

export interface SourceMetrics {
  rank: number;
  score: number;
  attempts: number;
  successes: number;
  failures: number;
  mediaFailures: number;
  successRate: number;
  averageLatencyMs?: number;
  lastLatencyMs?: number;
  consecutiveFailures: number;
  cooldownUntil?: number;
  lastError?: string;
  lastEventAt?: number;
}

export type SourceRoutingEvent =
  | "resolve-success"
  | "resolve-failure"
  | "media-failure";

export interface SourceRoutingLogEntry {
  timestamp: number;
  sourceId: string;
  event: SourceRoutingEvent;
  score: number;
  latencyMs?: number;
  message?: string;
}

export interface SourceRouting {
  effectiveIds: string[];
  updatedAt: number;
  log: SourceRoutingLogEntry[];
}

export interface SourceInfo {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  homepage: string;
  sourceUrl?: string;
  importedAt: number;
  capabilities: Partial<Record<LxSource, SourceCapability>>;
  status: SourceStatus;
  metrics?: SourceMetrics;
}

export interface SourceConfig {
  sources: SourceInfo[];
  primaryId: string;
  backupIds: string[];
  routing?: SourceRouting;
}

export interface PlaybackResolution {
  track: Track;
  url: string;
  quality: LxQuality;
  sourceId: string;
  sourceName: string;
  lyric?: string;
  translatedLyric?: string;
}
