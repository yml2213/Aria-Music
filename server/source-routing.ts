import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import type {
  SourceMetrics,
  SourceRoutingEvent,
  SourceRoutingLogEntry,
} from "./types";

interface MetricBucket {
  attempts: number;
  successes: number;
  failures: number;
  mediaFailures: number;
  totalLatencyMs: number;
  lastLatencyMs?: number;
  consecutiveFailures: number;
  cooldownUntil?: number;
  lastError?: string;
  lastEventAt?: number;
}

interface StoredRoutingData {
  version: 1;
  metrics: Record<string, MetricBucket>;
  log: SourceRoutingLogEntry[];
}

interface SourceRouterOptions {
  now?: () => number;
}

const MAX_LOG_ENTRIES = 80;
const MAX_METRIC_SAMPLES = 80;
const EMPTY_BUCKET: MetricBucket = {
  attempts: 0,
  successes: 0,
  failures: 0,
  mediaFailures: 0,
  totalLatencyMs: 0,
  consecutiveFailures: 0,
};

function finiteNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function sanitizeBucket(value: unknown): MetricBucket {
  const item =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : {};
  return {
    attempts: Math.floor(finiteNumber(item.attempts)),
    successes: Math.floor(finiteNumber(item.successes)),
    failures: Math.floor(finiteNumber(item.failures)),
    mediaFailures: Math.floor(finiteNumber(item.mediaFailures)),
    totalLatencyMs: finiteNumber(item.totalLatencyMs),
    lastLatencyMs:
      item.lastLatencyMs === undefined
        ? undefined
        : finiteNumber(item.lastLatencyMs),
    consecutiveFailures: Math.floor(finiteNumber(item.consecutiveFailures)),
    cooldownUntil:
      item.cooldownUntil === undefined
        ? undefined
        : finiteNumber(item.cooldownUntil),
    lastError:
      typeof item.lastError === "string"
        ? item.lastError.slice(0, 240)
        : undefined,
    lastEventAt:
      item.lastEventAt === undefined
        ? undefined
        : finiteNumber(item.lastEventAt),
  };
}

function sanitizeLogEntry(value: unknown): SourceRoutingLogEntry | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const item = value as Record<string, unknown>;
  const event = item.event;
  if (
    event !== "resolve-success" &&
    event !== "resolve-failure" &&
    event !== "media-failure"
  ) {
    return undefined;
  }
  if (typeof item.sourceId !== "string" || !item.sourceId) return undefined;
  return {
    timestamp: finiteNumber(item.timestamp),
    sourceId: item.sourceId,
    event,
    score: finiteNumber(item.score),
    latencyMs:
      item.latencyMs === undefined
        ? undefined
        : finiteNumber(item.latencyMs),
    message:
      typeof item.message === "string" ? item.message.slice(0, 240) : undefined,
  };
}

export class SourceRouter {
  private readonly file: string;
  private readonly now: () => number;
  private readonly metrics = new Map<string, MetricBucket>();
  private log: SourceRoutingLogEntry[] = [];

  constructor(dataDir: string, options: SourceRouterOptions = {}) {
    mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    this.file = path.join(dataDir, "source-routing.json");
    this.now = options.now ?? Date.now;
    this.load();
  }

  private load() {
    if (!existsSync(this.file)) return;
    try {
      const parsed = JSON.parse(
        readFileSync(this.file, "utf8"),
      ) as Partial<StoredRoutingData>;
      const metrics =
        typeof parsed.metrics === "object" && parsed.metrics !== null
          ? parsed.metrics
          : {};
      for (const [sourceId, value] of Object.entries(metrics)) {
        this.metrics.set(sourceId, sanitizeBucket(value));
      }
      this.log = (Array.isArray(parsed.log) ? parsed.log : [])
        .map(sanitizeLogEntry)
        .filter((entry): entry is SourceRoutingLogEntry => Boolean(entry))
        .slice(-MAX_LOG_ENTRIES);
    } catch {
      this.metrics.clear();
      this.log = [];
    }
  }

  private save() {
    try {
      const temp = `${this.file}.tmp`;
      const data: StoredRoutingData = {
        version: 1,
        metrics: Object.fromEntries(this.metrics),
        log: this.log,
      };
      writeFileSync(temp, JSON.stringify(data, null, 2), {
        encoding: "utf8",
        mode: 0o600,
      });
      renameSync(temp, this.file);
      chmodSync(this.file, 0o600);
    } catch {
      // Routing telemetry must never interrupt playback.
    }
  }

  private bucket(sourceId: string) {
    let value = this.metrics.get(sourceId);
    if (!value) {
      value = { ...EMPTY_BUCKET };
      this.metrics.set(sourceId, value);
    }
    return value;
  }

  private trimWindow(value: MetricBucket) {
    if (
      value.attempts < MAX_METRIC_SAMPLES &&
      value.mediaFailures < MAX_METRIC_SAMPLES
    ) {
      return;
    }
    value.successes = Math.floor(value.successes * 0.6);
    value.failures = Math.floor(value.failures * 0.6);
    value.mediaFailures = Math.floor(value.mediaFailures * 0.6);
    value.attempts = value.successes + value.failures;
    value.totalLatencyMs *= 0.6;
  }

  private score(value: MetricBucket) {
    if (value.attempts === 0 && value.mediaFailures === 0) return 52;
    const usableSuccesses = Math.max(0, value.successes - value.mediaFailures);
    const successRate = value.attempts
      ? usableSuccesses / value.attempts
      : 0;
    const averageLatencyMs = value.attempts
      ? value.totalLatencyMs / value.attempts
      : 0;
    const latencyScore = averageLatencyMs
      ? Math.min(Math.max(1 - averageLatencyMs / 12_000, 0), 1)
      : 0.5;
    const stability = 1 / (1 + value.consecutiveFailures * 1.4);
    const mediaFailureRate = value.successes
      ? Math.min(value.mediaFailures / value.successes, 1)
      : value.mediaFailures > 0
        ? 1
        : 0;
    const failureAge = value.lastEventAt
      ? this.now() - value.lastEventAt
      : Infinity;
    const recentFailurePenalty =
      value.consecutiveFailures > 0 && failureAge < 120_000
        ? (1 - failureAge / 120_000) * 12
        : 0;
    const cooldownPenalty =
      value.cooldownUntil && value.cooldownUntil > this.now() ? 28 : 0;
    return Math.round(
      Math.max(
        0,
        successRate * 55 +
          latencyScore * 25 +
          stability * 15 -
          mediaFailureRate * 15 -
          recentFailurePenalty -
          cooldownPenalty,
      ),
    );
  }

  private metricsFor(
    sourceId: string,
    rank = 0,
    healthPenalty = 0,
  ): SourceMetrics {
    const value = this.metrics.get(sourceId) ?? EMPTY_BUCKET;
    const usableSuccesses = Math.max(
      0,
      value.successes - value.mediaFailures,
    );
    return {
      rank,
      score: Math.max(0, this.score(value) - healthPenalty),
      attempts: Math.floor(value.attempts),
      successes: Math.floor(value.successes),
      failures: Math.floor(value.failures),
      mediaFailures: Math.floor(value.mediaFailures),
      successRate: value.attempts ? usableSuccesses / value.attempts : 0,
      averageLatencyMs:
        value.attempts > 0
          ? Math.round(value.totalLatencyMs / value.attempts)
          : undefined,
      lastLatencyMs: value.lastLatencyMs,
      consecutiveFailures: value.consecutiveFailures,
      cooldownUntil: value.cooldownUntil,
      lastError: value.lastError,
      lastEventAt: value.lastEventAt,
    };
  }

  private append(
    sourceId: string,
    event: SourceRoutingEvent,
    details: { latencyMs?: number; message?: string } = {},
  ) {
    const entry: SourceRoutingLogEntry = {
      timestamp: this.now(),
      sourceId,
      event,
      score: this.score(this.bucket(sourceId)),
      latencyMs: details.latencyMs,
      message: details.message?.slice(0, 240),
    };
    this.log.push(entry);
    if (this.log.length > MAX_LOG_ENTRIES) {
      this.log.splice(0, this.log.length - MAX_LOG_ENTRIES);
    }
  }

  recordSuccess(sourceId: string, latencyMs: number, message?: string) {
    const now = this.now();
    const value = this.bucket(sourceId);
    this.trimWindow(value);
    value.attempts += 1;
    value.successes += 1;
    value.totalLatencyMs += Math.max(0, latencyMs);
    value.lastLatencyMs = Math.max(0, Math.round(latencyMs));
    value.consecutiveFailures = 0;
    value.cooldownUntil = undefined;
    value.lastError = undefined;
    value.lastEventAt = now;
    this.append(sourceId, "resolve-success", { latencyMs, message });
    this.save();
  }

  recordFailure(sourceId: string, latencyMs: number, message: string) {
    const now = this.now();
    const value = this.bucket(sourceId);
    this.trimWindow(value);
    value.attempts += 1;
    value.failures += 1;
    value.totalLatencyMs += Math.max(0, latencyMs);
    value.lastLatencyMs = Math.max(0, Math.round(latencyMs));
    value.consecutiveFailures += 1;
    value.cooldownUntil =
      now + (value.consecutiveFailures >= 2 ? 90_000 : 30_000);
    value.lastError = message.slice(0, 240);
    value.lastEventAt = now;
    this.append(sourceId, "resolve-failure", { latencyMs, message });
    this.save();
  }

  recordMediaFailure(sourceId: string, message = "浏览器媒体加载失败") {
    const now = this.now();
    const value = this.bucket(sourceId);
    this.trimWindow(value);
    value.mediaFailures += 1;
    value.consecutiveFailures += 1;
    value.cooldownUntil =
      now + (value.consecutiveFailures >= 2 ? 120_000 : 60_000);
    value.lastError = message.slice(0, 240);
    value.lastEventAt = now;
    this.append(sourceId, "media-failure", { message });
    this.save();
  }

  removeSource(sourceId: string) {
    this.metrics.delete(sourceId);
    this.log = this.log.filter((entry) => entry.sourceId !== sourceId);
    this.save();
  }

  snapshot(sourceIds: string[], unhealthySourceIds: Iterable<string> = []) {
    const baseline = new Map(sourceIds.map((id, index) => [id, index]));
    const unhealthy = new Set(unhealthySourceIds);
    const ordered = sourceIds
      .map((sourceId) => ({
        sourceId,
        baseline: baseline.get(sourceId) ?? Number.MAX_SAFE_INTEGER,
        metrics: this.metricsFor(sourceId, 0, unhealthy.has(sourceId) ? 30 : 0),
      }))
      .sort(
        (left, right) =>
          right.metrics.score - left.metrics.score ||
          left.baseline - right.baseline,
      );
    const metrics = ordered.map((item, index) => ({
      sourceId: item.sourceId,
      ...this.metricsFor(
        item.sourceId,
        index + 1,
        unhealthy.has(item.sourceId) ? 30 : 0,
      ),
    }));
    return {
      effectiveIds: ordered.map((item) => item.sourceId),
      metrics,
      log: this.log.slice(-30),
      updatedAt: this.now(),
    };
  }
}
