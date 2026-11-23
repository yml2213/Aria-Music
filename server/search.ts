import { createCipheriv, createHash } from "node:crypto";
import {
  HttpError,
  decodeBase64Text,
  decodeHtml,
  requestJson,
  secondsFromDuration,
  sizeText,
} from "./http";
import type {
  LxQuality,
  PlatformMeta,
  Playlist,
  Provider,
  QualityMeta,
  Track,
} from "./types";

type UnknownRecord = Record<string, unknown>;

const NET_EASE_EAPI_KEY = Buffer.from("e82ckenh8dichen8");
const QQ_PART1 = [23, 14, 6, 36, 16, 7, 19];
const QQ_PART2 = [16, 1, 32, 12, 19, 27, 8, 5];
const QQ_SCRAMBLE = [
  89, 39, 179, 150, 218, 82, 58, 252, 177, 52, 186, 123, 120, 64, 242, 133,
  143, 161, 121, 179,
];

function record(value: unknown): UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown) {
  if (typeof value === "string") return decodeHtml(value);
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  return "";
}

function number(value: unknown) {
  const result = Number(value);
  return Number.isFinite(result) ? result : undefined;
}

function netEaseEapi(url: string, data: UnknownRecord) {
  const body = JSON.stringify(data);
  const digest = createHash("md5")
    .update(`nobody${url}use${body}md5forencrypt`)
    .digest("hex");
  const payload = `${url}-36cd479b6b5-${body}-36cd479b6b5-${digest}`;
  const cipher = createCipheriv("aes-128-ecb", NET_EASE_EAPI_KEY, "");
  return Buffer.concat([cipher.update(payload), cipher.final()])
    .toString("hex")
    .toUpperCase();
}

function qqSign(body: string) {
  const hash = createHash("sha1").update(body, "utf8").digest("hex");
  const part1 = QQ_PART1.map((index) => hash[index]).join("");
  const part2 = QQ_PART2.map((index) => hash[index]).join("");
  const scrambled = QQ_SCRAMBLE.map(
    (value, index) => value ^ Number.parseInt(hash.slice(index * 2, index * 2 + 2), 16),
  );
  const part3 = Buffer.from(scrambled)
    .toString("base64")
    .replace(/[\\/+=]/g, "");
  return `zzc${part1}${part3}${part2}`.toLowerCase();
}

function qualityMapFromNetEase(item: UnknownRecord) {
  const qualitys: PlatformMeta["qualitys"] = [];
  const qualityMap: Partial<Record<LxQuality, QualityMeta>> = {};
  const push = (type: LxQuality, raw: unknown) => {
    const value = record(raw);
    const size = sizeText(value.size);
    qualitys.push({ type, size });
    qualityMap[type] = { size };
  };
  if (Number(item.hr)) push("flac24bit", item.hr);
  if (Number(item.sq)) push("flac", item.sq);
  if (Number(item.h)) push("320k", item.h);
  if (Number(item.m)) push("320k", item.m);
  if (Number(item.l)) push("128k", item.l);
  return { qualitys, qualityMap };
}

export function netEaseTrack(value: unknown): Track | undefined {
  const item = record(value);
  if (!item.id) return undefined;
  const artists = array(item.ar ?? item.artists)
    .map((artist) => text(record(artist).name))
    .filter(Boolean);
  const album = record(item.al ?? item.album);
  const { qualitys, qualityMap } = qualityMapFromNetEase(item);
  return {
    key: `netease:${item.id}`,
    provider: "netease",
    id: String(item.id),
    title: text(item.name) || "未知歌曲",
    artist: artists.join(" / ") || "未知歌手",
    album: text(album.name) || "未知专辑",
    cover: text(album.picUrl) || undefined,
    duration: secondsFromDuration(item.dt ?? item.duration),
    platformMeta: {
      lxSource: "wy",
      songmid: String(item.id),
      songId: String(item.id),
      albumId: album.id == null ? undefined : String(album.id),
      qualitys,
      qualityMap,
    },
  };
}

async function searchNetEase(query: string, limit: number) {
  const path = "/api/search/song/list/page";
  const params = new URLSearchParams({
    params: netEaseEapi(path, {
      keyword: query,
      needCorrect: "1",
      channel: "typing",
      offset: 0,
      scene: "normal",
      total: true,
      limit,
    }),
  });
  const payload = await requestJson<UnknownRecord>(
    "https://interface.music.163.com/eapi/search/song/list/page",
    {
      method: "POST",
      headers: {
        origin: "https://music.163.com",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    },
    20_000,
  );
  const resources = array(record(payload.data).resources);
  return resources
    .map((resource) => netEaseTrack(record(record(resource).baseInfo).simpleSongData))
    .filter((track): track is Track => Boolean(track));
}

export function qqTrack(value: unknown): Track | undefined {
  const item = record(value);
  const file = record(item.file);
  const songmid = text(item.mid);
  if (!songmid) return undefined;
  const qualitys: PlatformMeta["qualitys"] = [];
  const qualityMap: Partial<Record<LxQuality, QualityMeta>> = {};
  const add = (type: LxQuality, sizeValue: unknown) => {
    if (Number(sizeValue) <= 0) return;
    const size = sizeText(sizeValue);
    qualitys.push({ type, size });
    qualityMap[type] = { size };
  };
  add("128k", file.size_128mp3);
  add("320k", file.size_320mp3);
  add("flac", file.size_flac);
  add("flac24bit", file.size_hires);
  const album = record(item.album);
  const albumId = text(album.mid);
  const artist = array(item.singer)
    .map((singer) => text(record(singer).name))
    .filter(Boolean)
    .join(" / ");
  return {
    key: `qq:${songmid}`,
    provider: "qq",
    id: songmid,
    title: text(item.title ?? item.name) || "未知歌曲",
    artist: artist || "未知歌手",
    album: text(album.name) || "未知专辑",
    cover: albumId
      ? `https://y.gtimg.cn/music/photo_new/T002R500x500M000${albumId}.jpg`
      : undefined,
    duration: secondsFromDuration(item.interval),
    platformMeta: {
      lxSource: "tx",
      songmid,
      songId: item.id == null ? undefined : String(item.id),
      albumId: albumId || undefined,
      albumMid: albumId || undefined,
      strMediaMid: text(file.media_mid) || undefined,
      qualitys,
      qualityMap,
    },
  };
}

async function searchQq(query: string, limit: number) {
  const body = JSON.stringify({
    comm: {
      ct: "11",
      cv: "14090508",
      v: "14090508",
      tmeAppID: "qqmusic",
      phonetype: "EBG-AN10",
      deviceScore: "553.47",
      devicelevel: "50",
      newdevicelevel: "20",
      rom: "HuaWei/EMOTION/EmotionUI_14.2.0",
      os_ver: "12",
      OpenUDID: "0",
      OpenUDID2: "0",
      QIMEI36: "0",
      udid: "0",
      chid: "0",
      aid: "0",
      oaid: "0",
      taid: "0",
      tid: "0",
      wid: "0",
      uid: "0",
      sid: "0",
      modeSwitch: "6",
      teenMode: "0",
      ui_mode: "2",
      nettype: "1020",
      v4ip: "",
    },
    req: {
      module: "music.search.SearchCgiService",
      method: "DoSearchForQQMusicMobile",
      param: {
        search_type: 0,
        searchid: String(Date.now()),
        query,
        page_num: 1,
        num_per_page: limit,
        highlight: 0,
        nqc_flag: 0,
        multi_zhida: 0,
        cat: 2,
        grp: 1,
        sin: 0,
        sem: 0,
      },
    },
  });
  const payload = await requestJson<UnknownRecord>(
    `https://u.y.qq.com/cgi-bin/musics.fcg?sign=${qqSign(body)}`,
    {
      method: "POST",
      headers: {
        "User-Agent": "QQMusic 14090508(android 12)",
        "Content-Type": "application/json",
      },
      body,
    },
    20_000,
  );
  const data = record(record(record(payload.req).data).body);
  return array(data.item_song)
    .map(qqTrack)
    .filter((track): track is Track => Boolean(track));
}

export function kugouTrack(value: unknown, sourceIndex: number): Track | undefined {
  const item = record(value);
  const hash = text(item.FileHash);
  const songmid = text(item.Audioid);
  if (!hash || !songmid) return undefined;
  const qualitys: PlatformMeta["qualitys"] = [];
  const qualityMap: Partial<Record<LxQuality, QualityMeta>> = {};
  const add = (
    type: LxQuality,
    rawSize: unknown,
    rawHash: unknown,
  ) => {
    if (Number(rawSize) <= 0) return;
    const size = sizeText(rawSize);
    const qualityHash = text(rawHash) || undefined;
    qualitys.push({ type, size, hash: qualityHash });
    qualityMap[type] = { size, hash: qualityHash };
  };
  add("128k", item.FileSize, item.FileHash);
  add("320k", item.HQFileSize, item.HQFileHash);
  add("flac", item.SQFileSize, item.SQFileHash);
  add("flac24bit", item.ResFileSize, item.ResFileHash);
  const cover =
    text(record(item.album_info).sizable_cover) ||
    text(record(item.trans_param).union_cover).replace("{size}", "480") ||
    undefined;
  return {
    key: `kugou:${songmid}:${hash}`,
    provider: "kugou",
    id: songmid,
    title: text(item.SongName) || "未知歌曲",
    artist: text(item.SingerName) || "未知歌手",
    album: text(item.AlbumName) || "未知专辑",
    cover,
    duration: secondsFromDuration(item.Duration),
    sourceIndex,
    platformMeta: {
      lxSource: "kg",
      songmid,
      hash,
      albumId: item.AlbumID == null ? undefined : String(item.AlbumID),
      qualitys,
      qualityMap,
    },
  };
}

async function searchKugou(query: string, limit: number) {
  const url = new URL("https://songsearch.kugou.com/song_search_v2");
  url.search = new URLSearchParams({
    keyword: query,
    page: "1",
    pagesize: String(limit),
    userid: "0",
    clientver: "",
    platform: "WebFilter",
    filter: "2",
    iscorrection: "1",
    privilege_filter: "0",
    area_code: "1",
  }).toString();
  const payload = await requestJson<UnknownRecord>(url.toString(), {}, 20_000);
  if (Number(payload.error_code) !== 0) throw new HttpError("酷狗搜索失败");
  const rows = array(record(payload.data).lists);
  const tracks: Track[] = [];
  rows.forEach((row) => {
    const parent = record(row);
    const candidates = [parent, ...array(parent.Grp).map(record)];
    candidates.forEach((candidate) => {
      const track = kugouTrack(candidate, tracks.length + 1);
      if (
        track &&
        !tracks.some(
          (item) =>
            item.platformMeta.songmid === track.platformMeta.songmid &&
            item.platformMeta.hash === track.platformMeta.hash,
        )
      ) {
        tracks.push(track);
      }
    });
  });
  return tracks.slice(0, limit);
}

export function kuwoTrack(value: unknown, sourceIndex: number): Track | undefined {
  const item = record(value);
  const songId = text(item.MUSICRID).replace(/^MUSIC_/, "") || text(item.DC_TARGETID);
  if (!songId) return undefined;
  const qualitys: PlatformMeta["qualitys"] = [];
  const qualityMap: Partial<Record<LxQuality, QualityMeta>> = {};
  const info = text(item.N_MINFO ?? item.MINFO);
  for (const raw of info.split(";")) {
    const match = /bitrate:(\d+),format:([^,]+),size:([^;]+)/.exec(raw);
    if (!match) continue;
    const bitrate = Number(match[1]);
    const type: LxQuality =
      bitrate >= 4000
        ? "flac24bit"
        : bitrate >= 2000
          ? "flac"
          : bitrate >= 320
            ? "320k"
            : "128k";
    if (qualityMap[type]) continue;
    qualitys.push({ type, size: match[3] });
    qualityMap[type] = { size: match[3] };
  }
  return {
    key: `kuwo:${songId}`,
    provider: "kuwo",
    id: songId,
    title: text(item.SONGNAME ?? item.NAME) || "未知歌曲",
    artist: text(item.ARTIST).replace(/&/g, " / ") || "未知歌手",
    album: text(item.ALBUM) || "未知专辑",
    duration: secondsFromDuration(item.DURATION),
    sourceIndex,
    platformMeta: {
      lxSource: "kw",
      songmid: songId,
      songId,
      albumId: item.ALBUMID == null ? undefined : String(item.ALBUMID),
      qualitys,
      qualityMap,
    },
  };
}

async function searchKuwo(query: string, limit: number) {
  const url = new URL("http://search.kuwo.cn/r.s");
  url.search = new URLSearchParams({
    client: "kt",
    all: query,
    pn: "0",
    rn: String(limit),
    uid: "794762570",
    ver: "kwplayer_ar_9.2.2.1",
    vipver: "1",
    show_copyright_off: "1",
    newver: "1",
    ft: "music",
    cluster: "0",
    strategy: "2012",
    encoding: "utf8",
    rformat: "json",
    vermerge: "1",
    mobi: "1",
    issubtitle: "1",
  }).toString();
  const payload = await requestJson<UnknownRecord>(url.toString(), {}, 20_000);
  return array(payload.abslist)
    .map((item, index) => kuwoTrack(item, index + 1))
    .filter((track): track is Track => Boolean(track));
}

export async function searchTracks(provider: Provider, query: string, limit = 30) {
  if (!query.trim()) return [];
  if (provider === "netease") return searchNetEase(query.trim(), limit);
  if (provider === "qq") return searchQq(query.trim(), limit);
  if (provider === "kugou") return searchKugou(query.trim(), limit);
  return searchKuwo(query.trim(), limit);
}

const SEARCH_PROVIDERS: Provider[] = ["netease", "qq", "kugou", "kuwo"];

export function interleaveTracks(buckets: Track[][], limit: number) {
  const tracks: Track[] = [];
  for (let index = 0; tracks.length < limit; index += 1) {
    let added = false;
    for (const bucket of buckets) {
      const track = bucket[index];
      if (!track) continue;
      tracks.push(track);
      added = true;
      if (tracks.length >= limit) break;
    }
    if (!added) break;
  }
  return tracks;
}

export async function searchAllTracks(query: string, limit = 40) {
  const keyword = query.trim();
  if (!keyword) return { tracks: [] as Track[], errors: [] };
  const perProvider = Math.max(8, Math.ceil(limit / SEARCH_PROVIDERS.length));
  const settled = await Promise.allSettled(
    SEARCH_PROVIDERS.map((provider) =>
      searchTracks(provider, keyword, perProvider),
    ),
  );
  const buckets: Track[][] = [];
  const errors: Array<{ provider: Provider; message: string }> = [];
  settled.forEach((result, index) => {
    const provider = SEARCH_PROVIDERS[index];
    if (result.status === "fulfilled") {
      buckets.push(result.value);
    } else {
      buckets.push([]);
      errors.push({
        provider,
        message:
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason),
      });
    }
  });
  if (errors.length === SEARCH_PROVIDERS.length) {
    throw new HttpError(`联合搜索失败：${errors[0]?.message ?? "所有平台均不可用"}`);
  }

  return { tracks: interleaveTracks(buckets, limit), errors };
}

async function netEaseLyric(track: Track) {
  const payload = await requestJson<UnknownRecord>(
    `https://music.163.com/api/song/lyric?id=${encodeURIComponent(
      track.platformMeta.songmid,
    )}&lv=-1&kv=-1&tv=-1`,
    {},
    12_000,
  ).catch(() => ({}) as UnknownRecord);
  return {
    lyric: text(record(payload.lrc).lyric),
    translatedLyric: text(record(payload.tlyric).lyric),
  };
}

async function qqLyric(track: Track) {
  const url = new URL("https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg");
  url.search = new URLSearchParams({
    songmid: track.platformMeta.songmid,
    format: "json",
    nobase64: "0",
    g_tk: "5381",
  }).toString();
  const payload = await requestJson<UnknownRecord>(
    url.toString(),
    { headers: { Referer: "https://y.qq.com/" } },
    12_000,
  ).catch(() => ({}) as UnknownRecord);
  const decode = (value: unknown) => {
    const raw = text(value);
    if (!raw) return "";
    try {
      return decodeBase64Text(raw);
    } catch {
      return raw;
    }
  };
  return {
    lyric: decode(payload.lyric),
    translatedLyric: decode(payload.trans),
  };
}

async function kugouLyric(track: Track) {
  const search = new URL("https://krcs.kugou.com/search");
  search.search = new URLSearchParams({
    ver: "1",
    man: "yes",
    client: "mobi",
    keyword: `${track.title} ${track.artist}`,
    duration: track.duration ? String(Math.round(track.duration * 1000)) : "",
    hash: track.platformMeta.hash ?? "",
    album_audio_id: track.platformMeta.songmid,
  }).toString();
  const result = await requestJson<UnknownRecord>(search.toString(), {}, 12_000).catch(
    () => ({}) as UnknownRecord,
  );
  const candidate = record(array(result.candidates)[0]);
  if (!candidate.id || !candidate.accesskey) return { lyric: "", translatedLyric: "" };
  const download = new URL("https://krcs.kugou.com/download");
  download.search = new URLSearchParams({
    ver: "1",
    client: "mobi",
    fmt: "lrc",
    charset: "utf8",
    id: String(candidate.id),
    accesskey: String(candidate.accesskey),
  }).toString();
  const payload = await requestJson<UnknownRecord>(download.toString(), {}, 12_000).catch(
    () => ({}) as UnknownRecord,
  );
  return {
    lyric: payload.content ? decodeBase64Text(text(payload.content)).replace(/^\uFEFF/, "") : "",
    translatedLyric: "",
  };
}

async function kuwoLyric(track: Track) {
  let payload = {} as UnknownRecord;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    payload = await requestJson<UnknownRecord>(
      `https://m.kuwo.cn/newh5/singles/songinfoandlrc?musicId=${encodeURIComponent(
        track.platformMeta.songmid,
      )}&_=${Date.now()}`,
      {},
      12_000,
    ).catch(() => ({}) as UnknownRecord);
    if (Array.isArray(record(payload.data).lrclist)) break;
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  const lines = array(record(payload.data).lrclist)
    .map((line) => {
      const item = record(line);
      const seconds = Number(item.time);
      const content = text(item.lineLyric);
      if (!Number.isFinite(seconds) || !content) return "";
      const minutes = Math.floor(seconds / 60);
      const rest = (seconds % 60).toFixed(2).padStart(5, "0");
      return `[${String(minutes).padStart(2, "0")}:${rest}]${content}`;
    })
    .filter(Boolean);
  return { lyric: lines.join("\n"), translatedLyric: "" };
}

const MAX_LYRIC_CACHE_ENTRIES = 500;
const lyricCache = new Map<
  string,
  { expiresAt: number; value: { lyric: string; translatedLyric: string } }
>();

export async function getLyric(track: Track) {
  const key = track.key || `${track.provider}:${track.id}`;
  const cached = lyricCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  let value = { lyric: "", translatedLyric: "" };
  try {
    if (track.provider === "netease") value = await netEaseLyric(track);
    else if (track.provider === "qq") value = await qqLyric(track);
    else if (track.provider === "kugou") value = await kugouLyric(track);
    else value = await kuwoLyric(track);
  } catch {
    value = { lyric: "", translatedLyric: "" };
  }
  lyricCache.delete(key);
  lyricCache.set(key, {
    expiresAt: Date.now() + (value.lyric ? 30 * 60_000 : 30_000),
    value,
  });
  while (lyricCache.size > MAX_LYRIC_CACHE_ENTRIES) {
    const oldest = lyricCache.keys().next().value;
    if (typeof oldest !== "string") break;
    lyricCache.delete(oldest);
  }
  return value;
}

export async function importNeteasePlaylist(id: string): Promise<Playlist> {
  const payload = await requestJson<UnknownRecord>(
    `https://music.163.com/api/v6/playlist/detail?id=${encodeURIComponent(id)}&n=1000`,
    {},
    20_000,
  );
  const playlist = record(payload.playlist);
  if (!playlist.id) throw new HttpError("未获取到网易云歌单");
  const trackIds = array(playlist.trackIds)
    .map((item) => Number(record(item).id))
    .filter((trackId) => Number.isFinite(trackId) && trackId > 0);
  let rawTracks: unknown[] = array(playlist.tracks);
  if (trackIds.length) {
    rawTracks = [];
    for (let index = 0; index < trackIds.length; index += 100) {
      const batch = trackIds.slice(index, index + 100);
      const detail = await requestJson<UnknownRecord>(
        `https://music.163.com/api/song/detail?ids=${encodeURIComponent(
          JSON.stringify(batch),
        )}`,
        {},
        20_000,
      ).catch(() => ({} as UnknownRecord));
      rawTracks.push(...array(detail.songs));
    }
  }
  const tracks = rawTracks
    .map(netEaseTrack)
    .filter((track): track is Track => Boolean(track));
  return {
    id: String(playlist.id),
    title: text(playlist.name) || "网易云歌单",
    creator: text(record(playlist.creator).nickname) || "网易云音乐",
    cover: text(playlist.coverImgUrl) || tracks[0]?.cover,
    trackCount: number(playlist.trackCount) ?? tracks.length,
    tracks,
    importedAt: Date.now(),
  };
}
