import {
  AudioLines,
  ListMusic,
  LoaderCircle,
  Play,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { currentLyricIndex, parseLyrics } from "../lib/lyrics";
import type { LyricLine, Track } from "../types";
import { providerInfo } from "../types";
import { Artwork } from "./Artwork";
import { EmptyState } from "./EmptyState";

export type SidePanelTab = "queue" | "lyrics";

interface SidePanelProps {
  open: boolean;
  tab: SidePanelTab;
  queue: Track[];
  currentTrack?: Track;
  currentTime: number;
  resolving: boolean;
  onTabChange: (tab: SidePanelTab) => void;
  onClose: () => void;
  onPlayTrack: (track: Track) => void;
  onRemoveTrack: (key: string) => void;
  onClearQueue: () => void;
}

function mergeTranslations(source: string, translated: string): LyricLine[] {
  const lines = parseLyrics(source);
  const translatedLines = parseLyrics(translated);
  const translationMap = new Map(
    translatedLines.map((line) => [Math.round(line.time * 10), line.text]),
  );

  return lines.map((line) => ({
    ...line,
    translation:
      translationMap.get(Math.round(line.time * 10)) ??
      translatedLines.find((candidate) => Math.abs(candidate.time - line.time) < 0.12)
        ?.text,
  }));
}

function Lyrics({
  track,
  currentTime,
  resolving,
}: {
  track?: Track;
  currentTime: number;
  resolving: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const lines = useMemo(
    () => mergeTranslations(track?.lyric ?? "", track?.translatedLyric ?? ""),
    [track?.lyric, track?.translatedLyric],
  );
  const activeIndex = currentLyricIndex(lines, currentTime);

  useEffect(() => {
    const active = containerRef.current?.querySelector<HTMLElement>(".lyric-active");
    active?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeIndex]);

  if (!track) {
    return (
      <EmptyState
        icon={AudioLines}
        title="等待音乐开始"
        description="播放歌曲后，这里会同步显示歌词。"
      />
    );
  }

  if (resolving) {
    return (
      <div className="lyrics-loading">
        <LoaderCircle className="spin" />
        <span>正在加载歌词</span>
      </div>
    );
  }

  if (!lines.length) {
    return (
      <EmptyState
        icon={AudioLines}
        title="暂无可用歌词"
        description="这首歌曲暂时没有返回同步歌词。"
      />
    );
  }

  return (
    <div className="lyrics-scroll" ref={containerRef}>
      <div className="lyrics-track-title">
        <strong>{track.title}</strong>
        <span>{track.artist}</span>
      </div>
      {lines.map((line, index) => (
        <div
          key={`${line.time}:${line.text}`}
          className={`lyric-line ${index === activeIndex ? "lyric-active" : ""}`}
        >
          <p>{line.text}</p>
          {line.translation && <span>{line.translation}</span>}
        </div>
      ))}
    </div>
  );
}

export function SidePanel({
  open,
  tab,
  queue,
  currentTrack,
  currentTime,
  resolving,
  onTabChange,
  onClose,
  onPlayTrack,
  onRemoveTrack,
  onClearQueue,
}: SidePanelProps) {
  return (
    <aside className={`side-panel ${open ? "open" : ""}`} aria-label="播放详情">
      <div className="side-panel-header">
        <div className="side-panel-tabs" role="tablist">
          <button
            className={tab === "queue" ? "active" : ""}
            type="button"
            role="tab"
            aria-selected={tab === "queue"}
            onClick={() => onTabChange("queue")}
          >
            <ListMusic />
            播放队列
          </button>
          <button
            className={tab === "lyrics" ? "active" : ""}
            type="button"
            role="tab"
            aria-selected={tab === "lyrics"}
            onClick={() => onTabChange("lyrics")}
          >
            <AudioLines />
            歌词
          </button>
        </div>
        <button
          className="icon-button side-panel-close"
          type="button"
          title="关闭"
          aria-label="关闭"
          onClick={onClose}
        >
          <X />
        </button>
      </div>

      {tab === "queue" ? (
        <div className="queue-content">
          <div className="queue-heading">
            <span>{queue.length} 首歌曲</span>
            {queue.length > 0 && (
              <button className="text-button" type="button" onClick={onClearQueue}>
                清空
              </button>
            )}
          </div>
          {queue.length ? (
            <div className="queue-list">
              {queue.map((track, index) => {
                const active = currentTrack?.key === track.key;
                return (
                  <div
                    key={`${track.key}:${index}`}
                    className={`queue-item ${active ? "active" : ""}`}
                  >
                    <button
                      className="queue-play"
                      type="button"
                      title="播放"
                      aria-label={`播放 ${track.title}`}
                      onClick={() => onPlayTrack(track)}
                    >
                      <Artwork
                        src={track.cover}
                        alt={`${track.album} 封面`}
                        title={track.title}
                        rounded="small"
                      />
                      <span>
                        <Play fill="currentColor" />
                      </span>
                    </button>
                    <div className="queue-copy">
                      <strong>{track.title}</strong>
                      <span>{track.artist}</span>
                    </div>
                    <span className="queue-provider">{providerInfo(track.provider).shortName}</span>
                    <button
                      className="icon-button queue-remove"
                      type="button"
                      title="从队列移除"
                      aria-label="从队列移除"
                      onClick={() => onRemoveTrack(track.key)}
                    >
                      <Trash2 />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon={ListMusic}
              title="播放队列为空"
              description="从搜索结果中选择歌曲，或把整页结果加入队列。"
            />
          )}
        </div>
      ) : (
        <Lyrics track={currentTrack} currentTime={currentTime} resolving={resolving} />
      )}
    </aside>
  );
}
