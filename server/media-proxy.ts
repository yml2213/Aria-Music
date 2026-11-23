import { randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { assertPublicMediaUrl } from "./remote";

interface MediaEntry {
  url: string;
  expiresAt: number;
}

const MEDIA_TTL_MS = 2 * 60 * 60_000;
const MAX_MEDIA_ENTRIES = 500;
const REDIRECTS = new Set([301, 302, 303, 307, 308]);

export class MediaProxy {
  private readonly entries = new Map<string, MediaEntry>();

  private prune() {
    const now = Date.now();
    for (const [token, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(token);
    }
    while (this.entries.size >= MAX_MEDIA_ENTRIES) {
      const oldest = this.entries.keys().next().value;
      if (typeof oldest !== "string") break;
      this.entries.delete(oldest);
    }
  }

  create(sourceUrl: string) {
    this.prune();
    const token = randomBytes(18).toString("base64url");
    this.entries.set(token, {
      url: sourceUrl,
      expiresAt: Date.now() + MEDIA_TTL_MS,
    });
    return `/api/media/${token}`;
  }

  async handle(request: IncomingMessage, response: ServerResponse, token: string) {
    const entry = this.entries.get(token);
    if (!entry || entry.expiresAt <= Date.now()) {
      this.entries.delete(token);
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("媒体地址不存在或已过期");
      return;
    }
    entry.expiresAt = Date.now() + MEDIA_TTL_MS;

    let current = await assertPublicMediaUrl(entry.url);
    for (let redirect = 0; redirect <= 5; redirect += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20_000);
      let upstream: Response;
      try {
        upstream = await fetch(current, {
          method: request.method === "HEAD" ? "HEAD" : "GET",
          redirect: "manual",
          signal: controller.signal,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0 Safari/537.36",
            ...(request.headers.range ? { Range: request.headers.range } : {}),
          },
        });
      } catch {
        response.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("媒体源连接失败");
        return;
      } finally {
        clearTimeout(timer);
      }

      if (REDIRECTS.has(upstream.status)) {
        const location = upstream.headers.get("location");
        if (!location) break;
        current = await assertPublicMediaUrl(new URL(location, current));
        continue;
      }
      if (![200, 206, 416].includes(upstream.status)) {
        response.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
        response.end(`媒体源返回 HTTP ${upstream.status}`);
        return;
      }

      const headers: Record<string, string> = {
        "Accept-Ranges": upstream.headers.get("accept-ranges") ?? "bytes",
        "Cache-Control": "private, max-age=300",
        "Content-Type": upstream.headers.get("content-type") ?? "audio/mpeg",
      };
      for (const name of ["content-length", "content-range"]) {
        const value = upstream.headers.get(name);
        if (value) headers[name] = value;
      }
      response.writeHead(upstream.status, headers);
      if (!upstream.body || request.method === "HEAD") {
        response.end();
        return;
      }
      const stream = Readable.fromWeb(
        upstream.body as unknown as import("node:stream/web").ReadableStream,
      );
      response.on("close", () => stream.destroy());
      await pipeline(stream, response);
      return;
    }
    response.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("媒体源重定向次数过多");
  }
}
