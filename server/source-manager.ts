import { fork, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isHttpUrl } from "./http";
import type {
  LxQuality,
  LxSource,
  PlaybackResolution,
  Quality,
  SourceCapability,
  SourceInfo,
  Track,
} from "./types";
import { SourceStore } from "./source-store";

interface PendingRequest {
  resolve: (value: string) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface Runtime {
  process: ChildProcess;
  status: "starting" | "ready" | "error";
  terminating?: boolean;
  message?: string;
  capabilities: Partial<Record<LxSource, SourceCapability>>;
  ready: Promise<void>;
  pending: Map<string, PendingRequest>;
  initTimer?: ReturnType<typeof setTimeout>;
  recycleTimer?: ReturnType<typeof setTimeout>;
}

const TRANSPORT_ERROR =
  /timeout|timed?\s*out|network|ECONN|ETIMEDOUT|too many requests|429|超时|无法连接|服务器繁忙|rate limit/i;
const RUNTIME_TTL_MS = 5 * 60_000;
const MAX_URL_CACHE_ENTRIES = 500;
const WORKER_PATH = fileURLToPath(new URL("./source-worker.mjs", import.meta.url));
const NODE_MAJOR = Number(process.versions.node.split(".")[0]);
const QUALITY_CHAIN: Record<Quality, LxQuality[]> = {
  standard: ["128k"],
  lossless: ["flac", "320k", "128k"],
  hires: ["flac24bit", "flac", "320k", "128k"],
  jymaster: ["flac24bit", "flac", "320k", "128k"],
};

function transportError(error: unknown) {
  return TRANSPORT_ERROR.test(error instanceof Error ? error.message : String(error));
}

function formatDuration(seconds?: number) {
  if (!seconds || !Number.isFinite(seconds)) return "";
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function toLxMusicInfo(track: Track) {
  const meta = track.platformMeta;
  return {
    name: track.title,
    singer: track.artist,
    source: meta.lxSource,
    songmid: meta.songmid,
    interval: formatDuration(track.duration),
    albumName: track.album,
    img: track.cover ?? "",
    typeUrl: {},
    types: meta.qualitys ?? [],
    _types: meta.qualityMap ?? {},
    albumId: meta.albumId ?? "",
    hash: meta.hash,
    songId: meta.songId,
    strMediaMid: meta.strMediaMid,
    albumMid: meta.albumMid,
  };
}

export class SourceManager {
  private readonly runtimes = new Map<string, Runtime>();
  private readonly urlCache = new Map<
    string,
    { url: string; sourceId: string; quality: LxQuality; expiresAt: number }
  >();

  constructor(readonly store: SourceStore) {}

  config() {
    return this.store.config();
  }

  private async terminateRuntime(runtime: Runtime) {
    runtime.terminating = true;
    if (runtime.initTimer) clearTimeout(runtime.initTimer);
    if (runtime.recycleTimer) clearTimeout(runtime.recycleTimer);
    for (const pending of runtime.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error("音源进程已终止"));
    }
    runtime.pending.clear();
    if (runtime.process.exitCode !== null) return;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 1_000);
      runtime.process.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
      if (!runtime.process.kill("SIGKILL")) {
        clearTimeout(timer);
        resolve();
      }
    });
  }

  private cacheUrl(
    key: string,
    value: { url: string; sourceId: string; quality: LxQuality; expiresAt: number },
  ) {
    this.urlCache.delete(key);
    this.urlCache.set(key, value);
    for (const [cacheKey, cached] of this.urlCache) {
      if (cached.expiresAt <= Date.now()) this.urlCache.delete(cacheKey);
    }
    while (this.urlCache.size > MAX_URL_CACHE_ENTRIES) {
      const oldest = this.urlCache.keys().next().value;
      if (typeof oldest !== "string") break;
      this.urlCache.delete(oldest);
    }
  }

  private createRuntime(info: SourceInfo): Runtime {
    const debug = process.env.DEBUG_HTTP === "1";
    if (debug) console.error(`[source-runtime] spawning ${info.id}`);
    const permissionArgs = [
      "--permission",
      ...(NODE_MAJOR >= 26 ? ["--allow-net"] : []),
      `--allow-fs-read=${WORKER_PATH}`,
    ];
    const child = fork(WORKER_PATH, [], {
      cwd: path.parse(WORKER_PATH).root,
      env: { NODE_NO_WARNINGS: "1" },
      execArgv: [
        ...permissionArgs,
        "--max-old-space-size=128",
        "--max-semi-space-size=24",
      ],
      serialization: "advanced",
      stdio: ["ignore", "ignore", "pipe", "ipc"],
    });
    if (debug) console.error(`[source-runtime] spawned ${info.id} pid=${child.pid}`);
    const stderrChunks: string[] = [];
    let stderrLength = 0;
    child.stderr?.on("data", (chunk: Buffer) => {
      if (stderrLength >= 4_000) return;
      const text = chunk.toString("utf8");
      stderrChunks.push(text);
      stderrLength += text.length;
      if (debug) console.error(`[source-runtime] stderr ${info.id}: ${text.trim()}`);
    });
    let readyResolve!: () => void;
    let readyReject!: (error: Error) => void;
    const ready = new Promise<void>((resolve, reject) => {
      readyResolve = resolve;
      readyReject = reject;
    });
    const runtime: Runtime = {
      process: child,
      status: "starting",
      capabilities: {},
      ready,
      pending: new Map(),
      initTimer: setTimeout(() => {
        if (runtime.status !== "starting") return;
        if (debug) console.error(`[source-runtime] init timeout ${info.id}`);
        runtime.status = "error";
        runtime.message = "音源初始化超时";
        this.store.setStatus(info.id, {
          state: "error",
          message: runtime.message,
          checkedAt: Date.now(),
        });
        readyReject(new Error(runtime.message));
        void this.terminateRuntime(runtime);
      }, 8_000),
    };
    const failRuntime = (message: string) => {
      if (runtime.terminating) return;
      if (debug) console.error(`[source-runtime] failed ${info.id}: ${message}`);
      runtime.status = "error";
      runtime.message = message;
      this.store.setStatus(info.id, {
        state: "error",
        message,
        checkedAt: Date.now(),
      });
      readyReject(new Error(message));
      for (const pending of runtime.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(new Error(message));
      }
      runtime.pending.clear();
      void this.terminateRuntime(runtime);
    };
    child.on("message", (message: unknown) => {
      const data =
        typeof message === "object" && message !== null
          ? (message as Record<string, unknown>)
          : {};
      if (data.type === "init") {
        if (debug) console.error(`[source-runtime] init message ${info.id} ok=${data.ok}`);
        if (runtime.initTimer) clearTimeout(runtime.initTimer);
        if (runtime.initTimer) runtime.initTimer = undefined;
        if (data.ok === true) {
          runtime.status = "ready";
          runtime.capabilities =
            (data.sources as Runtime["capabilities"] | undefined) ?? {};
          this.store.setStatus(
            info.id,
            { state: "ready", checkedAt: Date.now() },
            runtime.capabilities,
          );
          runtime.recycleTimer = setTimeout(() => {
            if (runtime.status === "ready" && runtime.pending.size === 0) {
              void this.terminateRuntime(runtime);
            }
          }, RUNTIME_TTL_MS);
          runtime.recycleTimer.unref();
          readyResolve();
        } else {
          failRuntime(
            typeof data.message === "string" ? data.message : "音源初始化失败",
          );
        }
        return;
      }
      if (data.type === "response") {
        const requestId = String(data.requestId ?? "");
        const pending = runtime.pending.get(requestId);
        if (!pending) return;
        runtime.pending.delete(requestId);
        clearTimeout(pending.timer);
        if (data.ok === true && typeof data.result === "string") {
          pending.resolve(data.result);
        } else {
          pending.reject(
            new Error(
              typeof data.message === "string"
                ? data.message
                : "音源没有返回有效播放地址",
            ),
          );
        }
      }
    });
    child.on("error", (error) => {
      if (debug) console.error(`[source-runtime] process error ${info.id}`, error);
      failRuntime(error.message);
    });
    child.on("exit", (code) => {
      if (debug) console.error(`[source-runtime] exit ${info.id} code=${code}`);
      if (runtime.initTimer) clearTimeout(runtime.initTimer);
      if (runtime.recycleTimer) clearTimeout(runtime.recycleTimer);
      if (!runtime.terminating) {
        const stderr = stderrChunks.join("").trim().slice(-2_000);
        runtime.status = "error";
        runtime.message = `音源进程退出 (${code})${stderr ? `：${stderr}` : ""}`;
        this.store.setStatus(info.id, {
          state: "error",
          message: runtime.message,
          checkedAt: Date.now(),
        });
        readyReject(new Error(runtime.message));
      }
      for (const pending of runtime.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(new Error(runtime.message));
      }
      runtime.pending.clear();
      if (this.runtimes.get(info.id) === runtime) this.runtimes.delete(info.id);
    });
    if (!child.connected) {
      failRuntime("无法启动音源进程");
    } else {
      child.send(
        {
          type: "init",
          script: this.store.getScript(info.id),
          info,
        },
        (error) => {
          if (error) failRuntime(`音源初始化失败：${error.message}`);
        },
      );
    }
    return runtime;
  }

  private async ensureRuntime(id: string) {
    const existing = this.runtimes.get(id);
    if (existing) {
      if (existing.status === "ready") return existing;
      if (existing.status === "starting") {
        await existing.ready;
        return existing;
      }
      await this.terminateRuntime(existing);
      this.runtimes.delete(id);
    }
    const info = this.store.getSource(id);
    const runtime = this.createRuntime(info);
    this.runtimes.set(id, runtime);
    if (process.env.DEBUG_HTTP === "1") {
      console.error(`[source-runtime] waiting ${id}`);
    }
    await runtime.ready;
    if (process.env.DEBUG_HTTP === "1") {
      console.error(`[source-runtime] ready ${id}`);
    }
    return runtime;
  }

  async testSource(id: string) {
    const existing = this.runtimes.get(id);
    if (existing) {
      await this.terminateRuntime(existing);
      this.runtimes.delete(id);
    }
    const runtime = await this.ensureRuntime(id);
    return {
      status: runtime.status,
      message: runtime.message,
      sources: runtime.capabilities,
    };
  }

  async removeSource(id: string) {
    const runtime = this.runtimes.get(id);
    if (runtime) {
      this.runtimes.delete(id);
      await this.terminateRuntime(runtime);
    }
    for (const [key, value] of this.urlCache) {
      if (value.sourceId === id) this.urlCache.delete(key);
    }
    return this.store.remove(id);
  }

  private async requestMusicUrl(
    sourceId: string,
    track: Track,
    quality: LxQuality,
  ) {
    const runtime = await this.ensureRuntime(sourceId);
    const requestId = `request_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const result = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        runtime.pending.delete(requestId);
        reject(new Error("音源取链超时"));
        void this.terminateRuntime(runtime);
      }, 20_000);
      runtime.pending.set(requestId, { resolve, reject, timer });
      if (!runtime.process.connected) {
        clearTimeout(timer);
        runtime.pending.delete(requestId);
        reject(new Error("音源进程不可用"));
        return;
      }
      try {
        runtime.process.send(
          {
            type: "request",
            requestId,
            data: {
              source: track.platformMeta.lxSource,
              action: "musicUrl",
              info: {
                type: quality,
                musicInfo: toLxMusicInfo(track),
              },
            },
          },
          (error) => {
            if (!error) return;
            const pending = runtime.pending.get(requestId);
            if (!pending) return;
            runtime.pending.delete(requestId);
            clearTimeout(pending.timer);
            pending.reject(new Error(`无法发送音源请求：${error.message}`));
          },
        );
      } catch (error) {
        clearTimeout(timer);
        runtime.pending.delete(requestId);
        reject(error);
      }
    });
    const normalized = result.trim();
    if (!isHttpUrl(normalized)) throw new Error("音源返回了无效播放地址");
    return normalized;
  }

  private enabledIds() {
    const config = this.store.config();
    const known = new Set(config.sources.map((source) => source.id));
    return [...new Set([config.primaryId, ...config.backupIds])].filter((id) =>
      known.has(id),
    );
  }

  async resolve(
    track: Track,
    requestedQuality: Quality,
    excludedUrls: string[] = [],
  ): Promise<PlaybackResolution> {
    const sourceKey =
      track.platformMeta.lxSource as Exclude<LxSource, "local" | "mg">;
    const ids = this.enabledIds();
    if (!ids.length) throw new Error("还没有配置播放音源");
    const excluded = new Set(excludedUrls);
    const qualities = QUALITY_CHAIN[requestedQuality] ?? QUALITY_CHAIN.standard;
    const failures: string[] = [];

    for (const sourceId of ids) {
      const cacheKey = `${sourceId}:${track.key}:${requestedQuality}`;
      const cached = this.urlCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now() && !excluded.has(cached.url)) {
        return {
          track,
          url: cached.url,
          quality: cached.quality,
          sourceId,
          sourceName: this.store.getSource(sourceId).name,
        };
      }
      let runtime: Runtime;
      try {
        runtime = await this.ensureRuntime(sourceId);
      } catch (error) {
        failures.push(`${this.store.getSource(sourceId).name}: ${(error as Error).message}`);
        continue;
      }
      const capability = runtime.capabilities[sourceKey];
      if (!capability || !capability.actions.includes("musicUrl")) continue;
      const supported = qualities.filter(
        (quality) =>
          capability.qualitys.length === 0 || capability.qualitys.includes(quality),
      );
      for (const quality of supported) {
        try {
          const url = await this.requestMusicUrl(sourceId, track, quality);
          if (excluded.has(url)) throw new Error("音源返回了已经失败的播放地址");
          this.cacheUrl(cacheKey, {
            url,
            sourceId,
            quality,
            expiresAt: Date.now() + 5 * 60_000,
          });
          return {
            track,
            url,
            quality,
            sourceId,
            sourceName: this.store.getSource(sourceId).name,
          };
        } catch (error) {
          failures.push(
            `${this.store.getSource(sourceId).name} ${quality}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          if (transportError(error)) break;
        }
      }
    }
    const summary = failures.slice(-3).join("；");
    throw new Error(summary ? `所有音源都无法播放：${summary}` : "所有音源都无法播放这首歌曲");
  }

  async close() {
    await Promise.all(
      [...this.runtimes.values()].map((runtime) => this.terminateRuntime(runtime)),
    );
    this.runtimes.clear();
  }
}
