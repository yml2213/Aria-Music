import assert from "node:assert/strict";
import { test } from "node:test";
import { nextQueueTrack } from "../../src/lib/playback";
import type { Track } from "../../src/types";

function track(key: string): Track {
  return {
    key,
    provider: "netease",
    id: key,
    title: key,
    artist: "artist",
    album: "album",
    platformMeta: {
      lxSource: "wy",
      songmid: key,
    },
  };
}

const queue = [track("one"), track("two"), track("three")];

test("queue fallback advances from the failed track instead of stale current state", () => {
  assert.equal(
    nextQueueTrack({
      queue,
      currentTrack: track("two"),
      repeat: "off",
      shuffle: false,
      automatic: true,
    })?.key,
    "three",
  );
});

test("queue fallback stops at the end when repeat is off", () => {
  assert.equal(
    nextQueueTrack({
      queue,
      currentTrack: track("three"),
      repeat: "off",
      shuffle: false,
      automatic: true,
    }),
    undefined,
  );
});

test("queue fallback wraps when repeat is enabled", () => {
  assert.equal(
    nextQueueTrack({
      queue,
      currentTrack: track("three"),
      repeat: "all",
      shuffle: false,
      automatic: true,
    })?.key,
    "one",
  );
});

test("shuffle avoids repeating the current track", () => {
  assert.equal(
    nextQueueTrack({
      queue,
      currentTrack: track("one"),
      repeat: "off",
      shuffle: true,
      automatic: true,
      random: () => 0,
    })?.key,
    "two",
  );
});
