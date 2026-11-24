import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { SourceRouter } from "../../server/source-routing";

test("routing prefers a fast successful source over a failed primary", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "aria-routing-test-"));
  let now = 1_000_000;
  const router = new SourceRouter(directory, { now: () => now });
  try {
    assert.deepEqual(router.snapshot(["primary", "backup"]).effectiveIds, [
      "primary",
      "backup",
    ]);

    router.recordFailure("primary", 2_400, "音源取链超时");
    now += 100;
    router.recordSuccess("backup", 120, "128k");
    const snapshot = router.snapshot(["primary", "backup"]);

    assert.deepEqual(snapshot.effectiveIds, ["backup", "primary"]);
    const backup = snapshot.metrics.find((item) => item.sourceId === "backup");
    const primary = snapshot.metrics.find((item) => item.sourceId === "primary");
    assert.equal(backup?.rank, 1);
    assert.equal(backup?.successRate, 1);
    assert.equal(backup?.averageLatencyMs, 120);
    assert.equal(primary?.rank, 2);
    assert.equal(primary?.successRate, 0);
    assert.equal(primary?.consecutiveFailures, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("media failures lower effective success and are persisted with routing logs", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "aria-routing-test-"));
  let now = 2_000_000;
  const router = new SourceRouter(directory, { now: () => now });
  try {
    router.recordSuccess("source-a", 90, "flac");
    now += 50;
    router.recordMediaFailure("source-a", "浏览器媒体加载失败");
    const current = router.snapshot(["source-a", "source-b"]);
    const sourceA = current.metrics.find((item) => item.sourceId === "source-a");

    assert.equal(sourceA?.successes, 1);
    assert.equal(sourceA?.mediaFailures, 1);
    assert.equal(sourceA?.successRate, 0);
    assert.equal(sourceA?.consecutiveFailures, 1);
    assert.ok((sourceA?.cooldownUntil ?? 0) > now);
    assert.equal(current.log.at(-1)?.event, "media-failure");

    const restored = new SourceRouter(directory, { now: () => now });
    const persisted = restored.snapshot(["source-a", "source-b"]);
    assert.equal(
      persisted.metrics.find((item) => item.sourceId === "source-a")?.mediaFailures,
      1,
    );
    assert.equal(persisted.log.at(-1)?.sourceId, "source-a");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
