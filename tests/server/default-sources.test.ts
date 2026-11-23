import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { seedDefaultSources } from "../../server/default-source-seeder";
import {
  DEFAULT_PRIMARY_SLUG,
  DEFAULT_SOURCES,
} from "../../server/default-sources";
import { SourceManager } from "../../server/source-manager";
import { SourceStore } from "../../server/source-store";

function scriptFor(url: string, name: string) {
  return `/*
 * @name ${name}
 * @description ${url}
 * @version 1.0.0
 * @author test
 * @homepage https://example.com
 */
lx.on(lx.EVENT_NAMES.request, async () => "https://media.example.com/audio.mp3");
lx.send(lx.EVENT_NAMES.inited, {
  status: true,
  sources: {
    wy: { type: "music", actions: ["musicUrl"], qualitys: ["128k"] }
  }
});
`;
}

test("default source list excludes the removed LX source", () => {
  assert.equal(DEFAULT_SOURCES.length, 15);
  assert.equal(DEFAULT_SOURCES.some((item) => item.slug === "lx"), false);
  assert.ok(DEFAULT_SOURCES.some((item) => item.slug === DEFAULT_PRIMARY_SLUG));
});

test("fresh source stores seed all defaults with one primary and ordered backups", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "aria-defaults-test-"));
  const store = new SourceStore(directory);
  let tested = 0;
  const manager = {
    testSource: async () => {
      tested += 1;
      return {};
    },
  } as unknown as SourceManager;
  try {
    const result = await seedDefaultSources({
      store,
      manager,
      fetcher: async (url) => {
        const source = DEFAULT_SOURCES.find(
          (item) => item.url === url || item.mirrorUrl === url,
        );
        assert.ok(source);
        return {
          statusCode: 200,
          statusMessage: "OK",
          headers: new Headers(),
          raw: new Uint8Array(),
          body: scriptFor(url, source.name),
        };
      },
      concurrency: 5,
      log: () => undefined,
    });
    const config = result.config;
    const primary = config.sources.find((item) => item.id === config.primaryId);
    assert.equal(primary?.sourceUrl, DEFAULT_SOURCES[0].url);
    assert.equal(config.backupIds.length, 14);
    assert.equal(tested, 15);

    const backupNames = config.backupIds.map(
      (id) => config.sources.find((item) => item.id === id)?.name,
    );
    const expectedNames = DEFAULT_SOURCES.slice(1).map((item) => item.name);
    assert.deepEqual(backupNames, expectedNames);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("default seeding falls back to the configured mirror", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "aria-defaults-test-"));
  const store = new SourceStore(directory);
  const manager = {
    testSource: async () => ({}),
  } as unknown as SourceManager;
  try {
    const result = await seedDefaultSources({
      store,
      manager,
      fetcher: async (url) => {
        const source = DEFAULT_SOURCES.find(
          (item) => item.url === url || item.mirrorUrl === url,
        );
        assert.ok(source);
        if (source.slug === "fish" && url === source.url) {
          throw new Error("raw unavailable");
        }
        return {
          statusCode: 200,
          statusMessage: "OK",
          headers: new Headers(),
          raw: new Uint8Array(),
          body: scriptFor(url, source.name),
        };
      },
      concurrency: 5,
      log: () => undefined,
    });
    const fish = result.config.sources.find((item) => item.name === "Fish");
    const fishSource = DEFAULT_SOURCES.find((item) => item.slug === "fish");
    assert.equal(fish?.sourceUrl, fishSource?.mirrorUrl);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
