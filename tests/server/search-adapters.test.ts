import { test } from "node:test";
import assert from "node:assert/strict";
import {
  interleaveTracks,
  kugouTrack,
  kuwoTrack,
  netEaseTrack,
  qqTrack,
} from "../../server/search";
import { currentLyricIndex, parseLyrics } from "../../src/lib/lyrics";

test("provider adapters produce the shared track shape", () => {
  const netease = netEaseTrack({
    id: 1,
    name: "晴天",
    ar: [{ name: "周杰伦" }],
    al: { id: 2, name: "叶惠美", picUrl: "https://img.test/1.jpg" },
    dt: 269000,
    h: { size: 10_000_000 },
    sq: { size: 30_000_000 },
  });
  assert.equal(netease?.key, "netease:1");
  assert.equal(netease?.platformMeta.lxSource, "wy");
  assert.equal(netease?.duration, 269);

  const neteaseDetail = netEaseTrack({
    id: 11,
    name: "七里香",
    ar: [{ name: "周杰伦" }],
    al: { id: 12, name: "七里香", picUrl: "https://img.test/2.jpg" },
    duration: 299000,
  });
  assert.equal(neteaseDetail?.duration, 299);

  const qq = qqTrack({
    mid: "qq-mid",
    id: 3,
    title: "夜曲",
    singer: [{ name: "周杰伦" }],
    album: { mid: "album-mid", name: "十一月的萧邦" },
    interval: 226,
    file: { media_mid: "media-mid", size_128mp3: 3_000_000 },
  });
  assert.equal(qq?.key, "qq:qq-mid");
  assert.equal(qq?.platformMeta.lxSource, "tx");
  assert.equal(qq?.platformMeta.strMediaMid, "media-mid");

  const kugou = kugouTrack(
    {
      FileHash: "hash",
      Audioid: "audio-id",
      SongName: "稻香",
      SingerName: "周杰伦",
      AlbumName: "魔杰座",
      Duration: 223,
      FileSize: 3_000_000,
    },
    1,
  );
  assert.equal(kugou?.key, "kugou:audio-id:hash");
  assert.equal(kugou?.platformMeta.lxSource, "kg");

  const kuwo = kuwoTrack(
    {
      MUSICRID: "MUSIC_42",
      SONGNAME: "洋葱",
      ARTIST: "杨宗纬",
      ALBUM: "鸽子",
      DURATION: "260",
    },
    1,
  );
  assert.equal(kuwo?.key, "kuwo:42");
  assert.equal(kuwo?.platformMeta.lxSource, "kw");
});

test("lyrics parser handles multiple timestamps and lookup", () => {
  const lines = parseLyrics("[00:01.00][00:03.50]第一句\n[00:05.25]第二句");
  assert.deepEqual(
    lines.map((line) => [line.time, line.text]),
    [
      [1, "第一句"],
      [3.5, "第一句"],
      [5.25, "第二句"],
    ],
  );
  assert.equal(currentLyricIndex(lines, 3.6), 1);
  assert.equal(currentLyricIndex(lines, 6), 2);
});

test("combined search interleaves provider result buckets", () => {
  const tracks = ["netease", "qq", "kugou", "kuwo"].map((provider) =>
    [0, 1].map((index) => ({
      key: `${provider}:${index}`,
      provider: provider as "netease" | "qq" | "kugou" | "kuwo",
      id: String(index),
      title: `${provider}-${index}`,
      artist: "artist",
      album: "album",
      platformMeta: { lxSource: "wy" as const, songmid: String(index) },
    })),
  );
  assert.deepEqual(
    interleaveTracks(tracks, 6).map((track) => track.key),
    ["netease:0", "qq:0", "kugou:0", "kuwo:0", "netease:1", "qq:1"],
  );
});
