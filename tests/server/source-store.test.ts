import { mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { SourceStore } from "../../server/source-store";

const script = `/*
 * @name Test Source
 * @description test
 * @version 1.0.0
 * @author test
 * @homepage https://example.com
 */
lx.send(lx.EVENT_NAMES.inited, { status: true, sources: {} });
`;

test("source store persists selection and removes dependent backup ids", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "aria-store-test-"));
  try {
    const store = new SourceStore(directory);
    const first = store.import(script, "https://example.com/first.js");
    const second = store.import(`${script}\n// second`, "https://example.com/second.js");
    store.setSelection(first.id, [second.id, first.id, second.id]);
    assert.deepEqual(store.config().backupIds, [second.id]);
    store.remove(second.id);
    assert.deepEqual(store.config().backupIds, []);
    assert.equal(store.config().primaryId, first.id);

    if (process.platform !== "win32") {
      const mode = (await stat(path.join(directory, "sources.json"))).mode & 0o777;
      assert.equal(mode, 0o600);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("source store preserves corrupt data instead of silently deleting it", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "aria-store-test-"));
  try {
    await writeFile(path.join(directory, "sources.json"), "{not-json", "utf8");
    const store = new SourceStore(directory);
    assert.deepEqual(store.config(), { sources: [], primaryId: "", backupIds: [] });
    const files = await readdir(directory);
    assert.ok(files.some((file) => file.startsWith("sources.json.corrupt-")));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
