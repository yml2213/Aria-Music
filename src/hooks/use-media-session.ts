import { useEffect, type RefObject } from "react";
import type { Track } from "../types";

interface Options {
  track?: Track;
  currentTime: number;
  duration: number;
  audioRef: RefObject<HTMLAudioElement | null>;
  onCurrentTime: (value: number) => void;
  onPrevious: () => void;
  onNext: () => void;
}

export function useMediaSession({
  track,
  currentTime,
  duration,
  audioRef,
  onCurrentTime,
  onPrevious,
  onNext,
}: Options) {
  useEffect(() => {
    if (!track || !("mediaSession" in navigator)) return;
    if ("MediaMetadata" in window) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist,
        album: track.album,
        artwork: track.cover ? [{ src: track.cover, sizes: "500x500" }] : undefined,
      });
    }
    const setHandler = (
      action: MediaSessionAction,
      handler: MediaSessionActionHandler | null,
    ) => {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        // Unsupported actions vary by browser.
      }
    };
    setHandler("play", () => void audioRef.current?.play());
    setHandler("pause", () => audioRef.current?.pause());
    setHandler("previoustrack", onPrevious);
    setHandler("nexttrack", onNext);
    setHandler("seekto", (details) => {
      if (typeof details.seekTime !== "number") return;
      const audio = audioRef.current;
      if (!audio) return;
      audio.currentTime = details.seekTime;
      onCurrentTime(details.seekTime);
    });
    return () => {
      navigator.mediaSession.metadata = null;
      for (const action of [
        "play",
        "pause",
        "previoustrack",
        "nexttrack",
        "seekto",
      ] as MediaSessionAction[]) {
        setHandler(action, null);
      }
    };
  }, [audioRef, onCurrentTime, onNext, onPrevious, track]);

  useEffect(() => {
    if (!("mediaSession" in navigator) || !Number.isFinite(duration) || duration <= 0) {
      return;
    }
    try {
      navigator.mediaSession.setPositionState({
        duration,
        position: Math.min(Math.max(currentTime, 0), duration),
        playbackRate: 1,
      });
    } catch {
      // Some browsers reject position updates for unsupported media streams.
    }
  }, [currentTime, duration]);
}
