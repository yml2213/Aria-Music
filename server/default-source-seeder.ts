import { HttpError, type ResponseData } from "./http";
import {
  DEFAULT_PRIMARY_SLUG,
  DEFAULT_SOURCES,
  type DefaultSource,
} from "./default-sources";
import { requestPublicText } from "./remote";
import { SourceManager } from "./source-manager";
import { SourceStore } from "./source-store";

type Fetcher = (
  url: string,
  options?: RequestInit,
  timeoutMs?: number,
  maxBytes?: number,
) => Promise<ResponseData>;

interface SeedOptions {
  store: SourceStore;
  manager: SourceManager;
  fetcher?: Fetcher;
  concurrency?: number;
  log?: (message: string) => void;
}

async function mapLimit<T, R>(
  values: T[],
  concurrency: number,
  operation: (value: T) => Promise<R>,
) {
  const results: R[] = [];
  let next = 0;
  const workers = Array.from(
    { length: Math.min(Math.max(concurrency, 1), values.length) },
    async () => {
      while (next < values.length) {
        const index = next;
        next += 1;
        results[index] = await operation(values[index]);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

async function downloadSource(source: DefaultSource, fetcher: Fetcher) {
  let lastError: unknown;
  for (const url of [source.url, source.mirrorUrl]) {
    try {
      const response = await fetcher(url, {}, 20_000, 9_100_000);
      if (
        response.statusCode < 200 ||
        response.statusCode >= 300 ||
        typeof response.body !== "string" ||
        !response.body.trim()
      ) {
        throw new HttpError(
          `${source.name} 下载失败：HTTP ${response.statusCode}`,
          response.statusCode,
        );
      }
      return { script: response.body, url };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`${source.name} 下载失败`);
}

export async function seedDefaultSources({
  store,
  manager,
  fetcher = requestPublicText,
  concurrency = 3,
  log = console.log,
}: SeedOptions) {
  const before = store.config();
  const existingUrls = new Set(
    before.sources.flatMap((item) => (item.sourceUrl ? [item.sourceUrl] : [])),
  );
  const missing = DEFAULT_SOURCES.filter(
    (item) => !existingUrls.has(item.url) && !existingUrls.has(item.mirrorUrl),
  );
  const importedIds: string[] = [];
  const importedSlugs = new Set<string>();

  await mapLimit(missing, concurrency, async (item) => {
    try {
      const downloaded = await downloadSource(item, fetcher);
      const stored = store.import(downloaded.script, downloaded.url);
      importedIds.push(stored.id);
      importedSlugs.add(item.slug);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("已经导入过")) {
        log(`[default-sources] ${item.name}: ${message}`);
      }
    }
  });

  const current = store.config();
  if (before.sources.length === 0 || !current.primaryId) {
    const desiredPrimary =
      DEFAULT_SOURCES.find((item) => item.slug === DEFAULT_PRIMARY_SLUG) ??
      DEFAULT_SOURCES[0];
    const primary =
      current.sources.find(
        (item) =>
          item.sourceUrl === desiredPrimary.url ||
          item.sourceUrl === desiredPrimary.mirrorUrl,
      ) ?? current.sources[0];
    if (primary) {
      const byUrl = new Map(
        current.sources.flatMap((item) =>
          item.sourceUrl ? [[item.sourceUrl, item.id] as const] : [],
        ),
      );
      const ordered = DEFAULT_SOURCES.map((item) => {
        const preferredUrl =
          importedSlugs.has(item.slug) || existingUrls.has(item.url)
            ? item.url
            : item.mirrorUrl;
        return byUrl.get(item.url) ?? byUrl.get(item.mirrorUrl) ?? byUrl.get(preferredUrl);
      }).filter((id): id is string => Boolean(id));
      const backups = [
        ...new Set([
          ...ordered,
          ...current.sources.map((item) => item.id),
          ...before.backupIds,
        ]),
      ].filter((id) => id !== primary.id);
      store.setSelection(primary.id, backups);
    }
  }

  const config = store.config();
  const sourceIds = importedIds.length
    ? importedIds
    : config.primaryId
      ? [config.primaryId]
      : [];
  if (sourceIds.length) {
    await mapLimit(sourceIds, Math.min(concurrency, 3), (sourceId) =>
      manager.testSource(sourceId).catch(() => undefined),
    );
  }

  const finalConfig = store.config();
  log(
    `[default-sources] ready: imported=${importedIds.length} total=${finalConfig.sources.length} primary=${finalConfig.primaryId} backups=${finalConfig.backupIds.length}`,
  );
  return {
    importedIds,
    sourceIds,
    config: finalConfig,
  };
}
