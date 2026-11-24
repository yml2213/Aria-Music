import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { SourceManager } from "../../server/source-manager";
import { SourceStore } from "../../server/source-store";
import type { Track } from "../../server/types";

function sourceScript(name: string, requestBody: string) {
  return `/*
 * @name ${name}
 * @description test source
 * @version 1.0.0
 * @author test
 * @homepage https://example.com
 */
lx.on(lx.EVENT_NAMES.request, async () => {
${requestBody}
});
lx.send(lx.EVENT_NAMES.inited, {
  status: true,
  sources: {
    wy: {
      name: "netease",
      type: "music",
      actions: ["musicUrl"],
      qualitys: ["128k", "flac"]
    }
  }
});
`;
}

function track(): Track {
  return {
    key: "netease:test",
    provider: "netease",
    id: "test",
    title: "test",
    artist: "artist",
    album: "album",
    duration: 180,
    platformMeta: {
      lxSource: "wy",
      songmid: "test",
      qualitys: [{ type: "128k", size: "1 MB" }],
    },
  };
}

test("source processes resolve music URLs through the restricted child process", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "aria-source-test-"));
  const store = new SourceStore(directory);
  const manager = new SourceManager(store);
  try {
    store.import(
      sourceScript(
        "working source",
        '  return "https://media.example.com/audio.mp3";',
      ),
    );
    const resolved = await manager.resolve(track(), "standard");
    assert.equal(resolved.url, "https://media.example.com/audio.mp3");
    assert.equal(resolved.quality, "128k");
  } finally {
    await manager.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("source scripts cannot read host files even after escaping the VM context", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "aria-source-test-"));
  const store = new SourceStore(directory);
  const manager = new SourceManager(store);
  try {
    store.import(
      sourceScript(
        "sandbox probe",
        `  try {
    const hostProcess = lx.request.constructor("return process")();
    const fs = hostProcess.getBuiltinModule("node:fs/promises");
    await fs.readFile("/etc/hosts", "utf8");
    return "https://media.example.com/leaked.mp3";
  } catch (error) {
    throw new Error("sandbox:" + (error.code || error.message));
  }`,
      ),
    );
    await assert.rejects(
      () => manager.resolve(track(), "standard"),
      /sandbox:ERR_ACCESS_DENIED/,
    );
  } finally {
    await manager.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("source manager skips a source excluded after a media failure", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "aria-source-test-"));
  const store = new SourceStore(directory);
  const manager = new SourceManager(store);
  try {
    const primary = store.import(
      sourceScript(
        "primary source",
        '  return "https://media.example.com/primary.mp3";',
      ),
    );
    const backup = store.import(
      sourceScript(
        "backup source",
        '  return "https://media.example.com/backup.mp3";',
      ),
    );
    store.setSelection(primary.id, [backup.id]);

    const resolved = await manager.resolve(
      track(),
      "standard",
      [],
      [primary.id],
    );
    assert.equal(resolved.url, "https://media.example.com/backup.mp3");
    assert.equal(resolved.sourceId, backup.id);
  } finally {
    await manager.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("source manager promotes a successful backup in the next routing order", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "aria-source-test-"));
  const store = new SourceStore(directory);
  const manager = new SourceManager(store);
  try {
    const primary = store.import(
      sourceScript(
        "failing primary",
        '  throw new Error("primary unavailable");',
      ),
    );
    const backup = store.import(
      sourceScript(
        "healthy backup",
        '  return "https://media.example.com/backup.mp3";',
      ),
    );
    store.setSelection(primary.id, [backup.id]);

    const resolved = await manager.resolve(track(), "standard");
    assert.equal(resolved.sourceId, backup.id);

    const config = manager.config();
    assert.deepEqual(config.routing?.effectiveIds, [backup.id, primary.id]);
    assert.equal(
      config.sources.find((source) => source.id === backup.id)?.metrics?.rank,
      1,
    );
    assert.equal(
      config.sources.find((source) => source.id === primary.id)?.metrics
        ?.consecutiveFailures,
      1,
    );
  } finally {
    await manager.close();
    await rm(directory, { recursive: true, force: true });
  }
});
