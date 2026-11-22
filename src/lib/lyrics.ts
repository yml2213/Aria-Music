import type { LyricLine } from "../types";

const TIME_TAG = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;

export function parseLyrics(source = ""): LyricLine[] {
  const lines: LyricLine[] = [];

  source.split(/\r?\n/).forEach((rawLine) => {
    const tags = [...rawLine.matchAll(TIME_TAG)];
    if (!tags.length) return;

    const text = rawLine.replace(TIME_TAG, "").trim();
    if (!text) return;

    tags.forEach((tag) => {
      const minutes = Number(tag[1]);
      const seconds = Number(tag[2]);
      const fraction = Number((tag[3] ?? "0").padEnd(3, "0").slice(0, 3));
      lines.push({
        time: minutes * 60 + seconds + fraction / 1000,
        text,
      });
    });
  });

  return lines.sort((a, b) => a.time - b.time);
}

export function currentLyricIndex(lines: LyricLine[], currentTime: number) {
  if (!lines.length) return -1;

  let index = 0;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].time <= currentTime + 0.08) index = i;
    else break;
  }
  return index;
}
