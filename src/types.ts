export type Provider = "netease" | "qq" | "kugou" | "kuwo";

export type ViewName = "home" | "search" | "library";

export type Quality = "standard" | "lossless" | "hires" | "jymaster";

export type RepeatMode = "off" | "all" | "one";

export type ThemeMode = "system" | "light" | "dark";

export type LxSource = "wy" | "tx" | "kg" | "kw" | "mg" | "local";

export type LxQuality = "128k" | "320k" | "flac" | "flac24bit";

export type SourceState = "idle" | "ready" | "error";

export interface TrackQualityMeta {
  size?: string;
  hash?: string;
}

export interface TrackPlatformMeta {
  lxSource: LxSource;
  songmid: string;
  songId?: string;
  hash?: string;
  albumId?: string;
  albumMid?: string;
  strMediaMid?: string;
  qualitys?: Array<{ type: LxQuality; size?: string; hash?: string }>;
  qualityMap?: Partial<Record<LxQuality, TrackQualityMeta>>;
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
  platformMeta: TrackPlatformMeta;
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

export interface ProviderInfo {
  id: Provider;
  name: string;
  shortName: string;
  tone: string;
}

export interface LyricLine {
  time: number;
  text: string;
  translation?: string;
}

export interface SearchState {
  query: string;
  provider: Provider;
  results: Track[];
  loading: boolean;
  error: string;
}

export interface SourceCapability {
  name?: string;
  type: "music";
  actions: string[];
  qualitys: LxQuality[];
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
  status: {
    state: SourceState;
    message?: string;
    checkedAt?: number;
  };
}

export interface SourceConfig {
  sources: SourceInfo[];
  primaryId: string;
  backupIds: string[];
}

export interface SourceRecommendation {
  id: string;
  name: string;
  description: string;
  url: string;
  mirrorUrl: string;
}

export const PROVIDERS: ProviderInfo[] = [
  { id: "netease", name: "网易云音乐", shortName: "网易云", tone: "#e23a3a" },
  { id: "qq", name: "QQ 音乐", shortName: "QQ", tone: "#21a366" },
  { id: "kugou", name: "酷狗音乐", shortName: "酷狗", tone: "#2468f2" },
  { id: "kuwo", name: "酷我音乐", shortName: "酷我", tone: "#f08a24" },
];

export const providerInfo = (provider: Provider) =>
  PROVIDERS.find((item) => item.id === provider) ?? PROVIDERS[0];
