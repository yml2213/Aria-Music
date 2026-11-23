import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HttpError } from "./http";
import { MediaProxy } from "./media-proxy";
import { seedDefaultSources } from "./default-source-seeder";
import { DEFAULT_SOURCES } from "./default-sources";
import { requestPublicText } from "./remote";
import {
  getLyric,
  importNeteasePlaylist,
  searchAllTracks,
  searchTracks,
} from "./search";
import {
  applySecurityHeaders,
  authConfigFromEnv,
  isAuthorized,
  requestIsSameOrigin,
} from "./security";
import { SourceManager } from "./source-manager";
import { SourceStore } from "./source-store";
import type { Provider, Quality, Track } from "./types";

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "127.0.0.1";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const store = new SourceStore();
const sources = new SourceManager(store);
const mediaProxy = new MediaProxy();
const mediaProxyEnabled = process.env.MEDIA_PROXY === "1";
let auth: ReturnType<typeof authConfigFromEnv>;
try {
  auth = authConfigFromEnv();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

const providerIds = new Set<Provider>(["netease", "qq", "kugou", "kuwo"]);
const qualityIds = new Set<Quality>(["standard", "lossless", "hires", "jymaster"]);
function missingDefaultSources() {
  const existingUrls = new Set(
    store
      .config()
      .sources.flatMap((item) => (item.sourceUrl ? [item.sourceUrl] : [])),
  );
  return DEFAULT_SOURCES.filter(
    (item) => !existingUrls.has(item.url) && !existingUrls.has(item.mirrorUrl),
  ).map((item) => ({
    id: item.slug,
    name: item.name,
    description: item.description,
    url: item.url,
    mirrorUrl: item.mirrorUrl,
  }));
}

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
    if (size > 1_000_000) throw new HttpError("请求体过大", 413);
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
  const debug = process.env.DEBUG_HTTP === "1";
  if (debug) console.error(`[source] downloading ${url}`);
  const response = await requestPublicText(
    url,
    {},
    20_000,
    9_100_000,
  );
  if (debug) console.error(`[source] downloaded status=${response.statusCode}`);
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new HttpError(`音源下载失败：HTTP ${response.statusCode}`, response.statusCode);
  }
  if (typeof response.body !== "string" || !response.body.trim()) {
    throw new HttpError("音源地址没有返回 JavaScript 文本");
  }
  const info = store.import(response.body, url);
  if (debug) console.error(`[source] stored ${info.id}`);
  await sources.testSource(info.id).catch(() => undefined);
  if (debug) console.error(`[source] initialized ${info.id}`);
  return store.config();
}

async function handleApi(request: IncomingMessage, response: ServerResponse, url: URL) {
  if (request.method === "GET" && url.pathname === "/api/config") {
    json(response, 200, store.config());
    return true;
  }
  if (request.method === "GET" && url.pathname === "/api/sources/catalog") {
    json(response, 200, { sources: missingDefaultSources() });
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/sources/import") {
    const body = await readJson(request);
    const sourceUrl = typeof body.url === "string" ? body.url.trim() : "";
    if (
      sourceUrl.length > 2048 ||
      !/^https?:\/\/[^\s]+$/i.test(sourceUrl)
    ) {
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
    json(response, 200, store.setSelection(primaryId, backupIds.slice(0, 20)));
    return true;
  }
  if (request.method === "GET" && url.pathname === "/api/search") {
    const requestedProvider = url.searchParams.get("provider") ?? "all";
    const query = url.searchParams.get("q")?.trim() ?? "";
    if (requestedProvider !== "all" && !providerIds.has(requestedProvider as Provider)) {
      throw new HttpError("不支持的搜索平台", 400);
    }
    if (!query) {
      json(response, 200, { tracks: [], errors: [] });
      return true;
    }
    if (query.length > 200) throw new HttpError("搜索关键词过长", 400);
    if (requestedProvider === "all") {
      json(response, 200, await searchAllTracks(query, 40));
    } else {
      json(response, 200, {
        tracks: await searchTracks(requestedProvider as Provider, query, 30),
        errors: [],
      });
    }
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
    const resolved = await sources.resolve(
      track,
      quality,
      excludedUrls.slice(0, 200),
    );
    json(response, 200, {
      ...resolved,
      remoteUrl: resolved.url,
      url: mediaProxyEnabled ? mediaProxy.create(resolved.url) : resolved.url,
    });
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
    const playlistId = decodeURIComponent(playlistMatch[1]);
    if (!/^\d{1,24}$/.test(playlistId)) {
      throw new HttpError("网易云歌单 ID 无效", 400);
    }
    json(
      response,
      200,
      await importNeteasePlaylist(playlistId),
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
  if (!existsSync(filePath)) {
    if (path.extname(requested)) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not Found");
      return;
    }
    filePath = path.join(DIST, "index.html");
  }
  if (!existsSync(filePath)) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("前端尚未构建，请运行 npm run build 或使用 npm run dev。");
    return;
  }
  const info = await stat(filePath);
  response.writeHead(200, {
    "Content-Type": mimeTypes[path.extname(filePath).toLowerCase()] ?? "application/octet-stream",
    "Content-Length": info.size,
    "Cache-Control":
      pathname.startsWith("/assets/") && /\.[a-f0-9]{8,}\./i.test(pathname)
        ? "public, max-age=31536000, immutable"
        : "no-cache",
  });
  const stream = createReadStream(filePath);
  stream.on("error", () => response.destroy());
  stream.pipe(response);
}

const server = createServer(async (request, response) => {
  applySecurityHeaders(response);
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
    if (request.method === "GET" && url.pathname === "/api/health") {
      json(response, 200, { ok: true, uptime: Math.round(process.uptime()) });
      return;
    }
    if (!isAuthorized(request, auth)) {
      response.setHeader("WWW-Authenticate", 'Basic realm="Aria Music", charset="UTF-8"');
      if (url.pathname.startsWith("/api/")) {
        json(response, 401, { message: "需要登录后才能访问" });
      } else {
        response.writeHead(401, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("需要登录后才能访问 Aria Music");
      }
      return;
    }
    if (!requestIsSameOrigin(request)) {
      json(response, 403, { message: "拒绝跨站请求" });
      return;
    }
    const mediaMatch = /^\/api\/media\/([A-Za-z0-9_-]+)$/.exec(url.pathname);
    if (
      mediaMatch &&
      (request.method === "GET" || request.method === "HEAD")
    ) {
      await mediaProxy.handle(request, response, mediaMatch[1]);
      return;
    }
    if (await handleApi(request, response, url)) return;
    await serveStatic(response, decodeURIComponent(url.pathname));
  } catch (error) {
    const status = error instanceof HttpError && error.statusCode ? error.statusCode : 500;
    const message = error instanceof Error ? error.message : "服务器内部错误";
    if (status >= 500) {
      console.error(`${request.method} ${request.url} -> ${status}`, error);
    }
    if (response.headersSent) {
      response.destroy();
    } else {
      json(response, status, { message });
    }
  }
});

server.on("error", (error) => {
  console.error("Aria Music server error", error);
});

server.listen(PORT, HOST, () => {
  console.log(
    `Aria Music server: http://${HOST}:${PORT} (auth: ${auth.enabled ? "on" : "off"})`,
  );
  const defaultSourcesEnabled = process.env.DEFAULT_SOURCES_ENABLED !== "0";
  if (defaultSourcesEnabled) {
    void seedDefaultSources({ store, manager: sources }).catch((error) => {
      console.error("[default-sources] initialization failed", error);
      const primaryId = store.config().primaryId;
      if (primaryId) void sources.testSource(primaryId).catch(() => undefined);
    });
  } else {
    const primaryId = store.config().primaryId;
    if (primaryId) void sources.testSource(primaryId).catch(() => undefined);
  }
});

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}, shutting down`);
  const forceExit = setTimeout(() => {
    server.closeAllConnections();
    process.exit(1);
  }, 10_000);
  forceExit.unref();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await sources.close();
  clearTimeout(forceExit);
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("uncaughtException", (error) => {
  console.error("Uncaught exception", error);
  void shutdown("uncaughtException");
});
process.on("unhandledRejection", (error) => {
  console.error("Unhandled rejection", error);
  void shutdown("unhandledRejection");
});
