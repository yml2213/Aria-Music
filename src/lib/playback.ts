import type { RepeatMode, Track } from "../types";

interface NextQueueTrackOptions {
  queue: Track[];
  currentTrack?: Track;
  repeat: RepeatMode;
  shuffle: boolean;
  automatic: boolean;
  random?: () => number;
}

export function nextQueueTrack({
  queue,
  currentTrack,
  repeat,
  shuffle,
  automatic,
  random = Math.random,
}: NextQueueTrackOptions) {
  if (!queue.length) return undefined;
  const currentIndex = queue.findIndex(
    (track) => track.key === currentTrack?.key,
  );

  if (shuffle && queue.length > 1) {
    let nextIndex = Math.floor(random() * queue.length);
    if (nextIndex === currentIndex) nextIndex = (nextIndex + 1) % queue.length;
    return queue[nextIndex];
  }

  const atEnd = currentIndex === queue.length - 1 || currentIndex === -1;
  if (automatic && repeat === "off" && atEnd) return undefined;

  const nextIndex =
    atEnd && repeat !== "off"
      ? 0
      : Math.min(Math.max(currentIndex + 1, 0), queue.length - 1);
  return nextIndex === currentIndex ? undefined : queue[nextIndex];
}
