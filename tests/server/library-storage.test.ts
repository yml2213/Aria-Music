import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeLibraryData, normalizeTrack } from "../../src/lib/library-storage";

function rawTrack(key = "netease:1") {
  return {
    key,
    provider: "netease",
    id: "1",
    title: "晴天",
    artist: "周杰伦",
    album: "叶惠美",
    url: "https://temporary.example/audio.mp3",
    quality: "128k",
    lyric: "[00:00]temporary",
    platformMeta: {
      lxSource: "wy",
      songmid: "1",
      qualitys: [{ type: "128k", size: "4 MB" }],
    },
  };
}

test("persisted tracks drop transient playback data", () => {
  const track = normalizeTrack(rawTrack());
  assert.ok(track);
  assert.equal("url" in track, false);
  assert.equal("quality" in track, false);
  assert.equal("lyric" in track, false);
});

test("library normalization rejects invalid entries and deduplicates tracks", () => {
  const library = normalizeLibraryData({
    favorites: [rawTrack(), rawTrack(), { key: "broken" }],
    recent: [rawTrack("netease:2")],
    playlists: [
      {
        id: "1",
        title: "歌单",
        creator: "test",
        trackCount: 2,
        tracks: [rawTrack(), rawTrack(), { invalid: true }],
        importedAt: 1,
      },
      {
        id: "1",
        title: "重复歌单",
        creator: "test",
        trackCount: 1,
        tracks: [],
        importedAt: 2,
      },
    ],
  });
  assert.equal(library.favorites.length, 1);
  assert.equal(library.recent.length, 1);
  assert.equal(library.playlists.length, 1);
  assert.equal(library.playlists[0].tracks.length, 1);
});
