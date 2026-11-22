import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  HttpError,
  requestText,
} from "./http";
import { getLyric, importNeteasePlaylist, searchTracks } from "./search";
import { SourceManager } from "./source-manager";
import { SourceStore } from "./source-store";
import type { Provider, Quality, Track } from "./types";

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "127.0.0.1";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const store = new SourceStore();
const sources = new SourceManager(store);

const providerIds = new Set<Provider>(["netease", "qq", "kugou", "kuwo"]);
const qualityIds = new Set<Quality>(["standard", "lossless", "hires", "jymaster"]);
const recommendations = [
  {
    id: "qingliang",
    name: "轻量音源",
    description: "QQ、网易、酷狗、酷我多线路并发取链，带超时和冷却。",
    url: "https://raw.githubusercontent.com/pdone/lx-music-source/main/qingliang/latest.js",
    mirrorUrl:
      "https://gh-proxy.org/raw.githubusercontent.com/pdone/lx-music-source/main/qingliang/latest.js",
  },
  {
    id: "juhe",
    name: "聚合 API",
    description: "结构简单的聚合取链接口，适合作为备用音源。",
    url: "https://raw.githubusercontent.com/pdone/lx-music-source/main/juhe/latest.js",
    mirrorUrl:
      "https://gh-proxy.org/raw.githubusercontent.com/pdone/lx-music-source/main/juhe/latest.js",
  },
  {
    id: "feichangdao",
    name: "非常刀",
    description: "多平台聚合音源，包含多个第三方线路。",
    url: "https://raw.githubusercontent.com/pdone/lx-music-source/main/feichangdao/latest.js",
    mirrorUrl:
      "https://gh-proxy.org/raw.githubusercontent.com/pdone/lx-music-source/main/feichangdao/latest.js",
  },
  {
    id: "changqing",
    name: "长青音源",
    description: "常见主备线路之一，脚本经过混淆，启用前请自行确认来源。",
    url: "https://raw.githubusercontent.com/pdone/lx-music-source/main/changqing/latest.js",
    mirrorUrl:
      "https://gh-proxy.org/raw.githubusercontent.com/pdone/lx-music-source/main/changqing/latest.js",
  },
];

function json(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > 10_000_000) throw new HttpError("请求体过大", 413);
    chunks.push(buffer);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
  } catch {
    throw new HttpError("请求数据不是有效 JSON", 400);
  }
}

async function importSource(url: string) {
  const response = await requestText(
    url,
    { redirect: "follow" },
    20_000,
  );
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new HttpError(`音源下载失败：HTTP ${response.statusCode}`, response.statusCode);
  }
  if (typeof response.body !== "string" || !response.body.trim()) {
    throw new HttpError("音源地址没有返回 JavaScript 文本");
  }
  const info = store.import(response.body, url);
  await sources.testSource(info.id).catch(() => undefined);
  return store.config();
}

async function handleApi(request: IncomingMessage, response: ServerResponse, url: URL) {
  if (request.method === "GET" && url.pathname === "/api/health") {
    json(response, 200, { ok: true });
    return true;
  }
  if (request.method === "GET" && url.pathname === "/api/config") {
    json(response, 200, store.config());
    return true;
  }
  if (request.method === "GET" && url.pathname === "/api/sources/catalog") {
    json(response, 200, { sources: recommendations });
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/sources/import") {
    const body = await readJson(request);
    const sourceUrl = typeof body.url === "string" ? body.url.trim() : "";
    if (!/^https?:\/\/[^\s]+$/i.test(sourceUrl)) {
      throw new HttpError("请输入有效的 HTTP(S) 音源地址", 400);
    }
    json(response, 200, await importSource(sourceUrl));
    return true;
  }
  const testMatch = /^\/api\/sources\/([^/]+)\/test$/.exec(url.pathname);
  if (request.method === "POST" && testMatch) {
    const id = decodeURIComponent(testMatch[1]);
    await sources.testSource(id).catch(() => undefined);
    json(response, 200, store.config());
    return true;
  }
  const removeMatch = /^\/api\/sources\/([^/]+)$/.exec(url.pathname);
  if (request.method === "DELETE" && removeMatch) {
    json(response, 200, await sources.removeSource(decodeURIComponent(removeMatch[1])));
    return true;
  }
  if (request.method === "PUT" && url.pathname === "/api/sources/selection") {
    const body = await readJson(request);
    const primaryId = typeof body.primaryId === "string" ? body.primaryId : "";
    const backupIds = Array.isArray(body.backupIds)
      ? body.backupIds.filter((id): id is string => typeof id === "string")
      : [];
    json(response, 200, store.setSelection(primaryId, backupIds));
    return true;
  }
  if (request.method === "GET" && url.pathname === "/api/search") {
    const provider = url.searchParams.get("provider") as Provider | null;
    const query = url.searchParams.get("q")?.trim() ?? "";
    if (!provider || !providerIds.has(provider)) {
      throw new HttpError("不支持的搜索平台", 400);
    }
    if (!query) {
      json(response, 200, { tracks: [] });
      return true;
    }
    json(response, 200, { tracks: await searchTracks(provider, query, 30) });
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/track/resolve") {
    const body = await readJson(request);
    const track = body.track as Track | undefined;
    const quality = body.quality as Quality | undefined;
    const excludedUrls = Array.isArray(body.excludedUrls)
      ? body.excludedUrls.filter((item): item is string => typeof item === "string")
      : [];
    if (!track || !track.platformMeta || !track.key) {
      throw new HttpError("缺少歌曲信息", 400);
    }
    if (!quality || !qualityIds.has(quality)) {
      throw new HttpError("不支持的音质", 400);
    }
    json(response, 200, await sources.resolve(track, quality, excludedUrls));
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/track/lyric") {
    const body = await readJson(request);
    const track = body.track as Track | undefined;
    if (!track || !track.platformMeta) throw new HttpError("缺少歌曲信息", 400);
    json(response, 200, await getLyric(track));
    return true;
  }
  const playlistMatch = /^\/api\/playlists\/netease\/([^/]+)$/.exec(url.pathname);
  if (request.method === "GET" && playlistMatch) {
    json(
      response,
      200,
      await importNeteasePlaylist(decodeURIComponent(playlistMatch[1])),
    );
    return true;
  }
  if (url.pathname.startsWith("/api/")) {
    throw new HttpError("接口不存在", 404);
  }
  return false;
}

const mimeTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

async function serveStatic(response: ServerResponse, pathname: string) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  let filePath = path.resolve(DIST, `.${requested}`);
  if (!filePath.startsWith(`${DIST}${path.sep}`)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }
  if (!existsSync(filePath)) filePath = path.join(DIST, "index.html");
  if (!existsSync(filePath)) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("前端尚未构建，请运行 npm run build 或使用 npm run dev。");
    return;
  }
  const info = await stat(filePath);
  response.writeHead(200, {
    "Content-Type": mimeTypes[path.extname(filePath).toLowerCase()] ?? "application/octet-stream",
    "Content-Length": info.size,
  });
  createReadStream(filePath).pipe(response);
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
    if (await handleApi(request, response, url)) return;
    await serveStatic(response, decodeURIComponent(url.pathname));
  } catch (error) {
    const status = error instanceof HttpError && error.statusCode ? error.statusCode : 500;
    const message = error instanceof Error ? error.message : "服务器内部错误";
    json(response, status, { message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Aria Music server: http://${HOST}:${PORT}`);
  const primaryId = store.config().primaryId;
  if (primaryId) void sources.testSource(primaryId).catch(() => undefined);
});

async function shutdown() {
  server.close();
  await sources.close();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
