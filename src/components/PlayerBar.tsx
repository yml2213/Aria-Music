import {
  AudioLines,
  ChevronDown,
  ChevronUp,
  Heart,
  ListMusic,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useMemo, useRef } from "react";
import { currentLyricIndex, parseLyrics } from "../lib/lyrics";
import { useDialogFocus } from "../lib/use-dialog-focus";
import type { RepeatMode, Track } from "../types";
import { providerInfo } from "../types";
import { Artwork } from "./Artwork";

interface PlayerBarProps {
  currentTrack?: Track;
  playing: boolean;
  resolving: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  repeat: RepeatMode;
  shuffle: boolean;
  favorite: boolean;
  sidePanelOpen: boolean;
  sidePanelTab: "queue" | "lyrics";
  onTogglePlay: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onSeek: (value: number) => void;
  onVolume: (value: number) => void;
  onToggleMute: () => void;
  onToggleRepeat: () => void;
  onToggleShuffle: () => void;
  onFavorite: () => void;
  onOpenQueue: () => void;
  onOpenLyrics: () => void;
  onOpenNowPlaying: () => void;
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

export function PlayerBar({
  currentTrack,
  playing,
  resolving,
  currentTime,
  duration,
  volume,
  muted,
  repeat,
  shuffle,
  favorite,
  sidePanelOpen,
  sidePanelTab,
  onTogglePlay,
  onPrevious,
  onNext,
  onSeek,
  onVolume,
  onToggleMute,
  onToggleRepeat,
  onToggleShuffle,
  onFavorite,
  onOpenQueue,
  onOpenLyrics,
  onOpenNowPlaying,
}: PlayerBarProps) {
  const RepeatIcon = repeat === "one" ? Repeat1 : Repeat;
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <footer className="player-bar">
      <div className="player-track">
        <button
          className="player-track-open"
          type="button"
          title="展开正在播放"
          aria-label="展开正在播放"
          onClick={onOpenNowPlaying}
          disabled={!currentTrack}
        >
          <span className="player-artwork-button">
            {currentTrack ? (
              <Artwork
                src={currentTrack.cover}
                alt={`${currentTrack.album} 封面`}
                title={currentTrack.title}
                rounded="small"
              />
            ) : (
              <span className="player-empty-artwork">
                <AudioLines />
              </span>
            )}
            <span className="player-artwork-expand">
              <ChevronUp />
            </span>
          </span>
          <span className="player-meta">
            <strong>{currentTrack?.title ?? "选择一首歌曲"}</strong>
            <span>
              {currentTrack
                ? `${currentTrack.artist} · ${providerInfo(currentTrack.provider).name}`
                : "Aria Music"}
            </span>
          </span>
        </button>
        {currentTrack && (
          <button
            className={`icon-button player-favorite ${favorite ? "is-favorite" : ""}`}
            type="button"
            title={favorite ? "取消收藏" : "收藏"}
            aria-label={favorite ? "取消收藏" : "收藏"}
            onClick={onFavorite}
          >
            <Heart fill={favorite ? "currentColor" : "none"} />
          </button>
        )}
      </div>

      <div className="player-center">
        <div className="player-controls">
          <button
            className={`icon-button player-secondary ${shuffle ? "enabled" : ""}`}
            type="button"
            title="随机播放"
            aria-label="随机播放"
            onClick={onToggleShuffle}
          >
            <Shuffle />
          </button>
          <button
            className="icon-button"
            type="button"
            title="上一首"
            aria-label="上一首"
            onClick={onPrevious}
            disabled={!currentTrack}
          >
            <SkipBack fill="currentColor" />
          </button>
          <button
            className="play-button"
            type="button"
            title={playing ? "暂停" : "播放"}
            aria-label={playing ? "暂停" : "播放"}
            onClick={onTogglePlay}
            disabled={!currentTrack || resolving}
          >
            {resolving ? (
              <span className="play-loader" />
            ) : playing ? (
              <Pause fill="currentColor" />
            ) : (
              <Play fill="currentColor" />
            )}
          </button>
          <button
            className="icon-button"
            type="button"
            title="下一首"
            aria-label="下一首"
            onClick={onNext}
            disabled={!currentTrack}
          >
            <SkipForward fill="currentColor" />
          </button>
          <button
            className={`icon-button player-secondary ${repeat !== "off" ? "enabled" : ""}`}
            type="button"
            title="循环播放"
            aria-label="循环播放"
            onClick={onToggleRepeat}
          >
            <RepeatIcon />
          </button>
        </div>
        <div className="player-timeline">
          <span>{formatTime(currentTime)}</span>
          <input
            className="range-input"
            type="range"
            min="0"
            max={duration || 0}
            step="0.1"
            value={Math.min(currentTime, duration || 0)}
            aria-label="播放进度"
            style={{ "--progress": `${progress}%` } as React.CSSProperties}
            onChange={(event) => onSeek(Number(event.target.value))}
            disabled={!currentTrack || !duration}
          />
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      <div className="player-extras">
        {currentTrack?.quality && <span className="quality-badge">{currentTrack.quality}</span>}
        <button
          className="icon-button"
          type="button"
          title="歌词"
          aria-label="歌词"
          onClick={onOpenLyrics}
        >
          <AudioLines />
        </button>
        <button
          className={`icon-button ${sidePanelOpen && sidePanelTab === "queue" ? "active" : ""}`}
          type="button"
          title="播放队列"
          aria-label="播放队列"
          onClick={onOpenQueue}
        >
          <ListMusic />
        </button>
        <button
          className="icon-button volume-button"
          type="button"
          title={muted ? "取消静音" : "静音"}
          aria-label={muted ? "取消静音" : "静音"}
          onClick={onToggleMute}
        >
          {muted || volume === 0 ? <VolumeX /> : <Volume2 />}
        </button>
        <input
          className="range-input volume-range"
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={muted ? 0 : volume}
          aria-label="音量"
          style={{ "--progress": `${(muted ? 0 : volume) * 100}%` } as React.CSSProperties}
          onChange={(event) => onVolume(Number(event.target.value))}
        />
        <button
          className="icon-button mobile-player-expand"
          type="button"
          title="展开播放器"
          aria-label="展开播放器"
          onClick={onOpenNowPlaying}
        >
          <ChevronUp />
        </button>
      </div>
    </footer>
  );
}

interface NowPlayingSheetProps {
  open: boolean;
  track?: Track;
  playing: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  resolving: boolean;
  repeat: RepeatMode;
  shuffle: boolean;
  favorite: boolean;
  onClose: () => void;
  onTogglePlay: () => void;
  onToggleRepeat: () => void;
  onToggleShuffle: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onSeek: (value: number) => void;
  onVolume: (value: number) => void;
  onToggleMute: () => void;
  onFavorite: () => void;
  onOpenLyrics: () => void;
  onOpenQueue: () => void;
}

export function NowPlayingSheet({
  open,
  track,
  playing,
  currentTime,
  duration,
  volume,
  muted,
  resolving,
  repeat,
  shuffle,
  favorite,
  onClose,
  onTogglePlay,
  onToggleRepeat,
  onToggleShuffle,
  onPrevious,
  onNext,
  onSeek,
  onVolume,
  onToggleMute,
  onFavorite,
  onOpenLyrics,
  onOpenQueue,
}: NowPlayingSheetProps) {
  const progress = duration ? (currentTime / duration) * 100 : 0;
  const dialogRef = useRef<HTMLDivElement>(null);
  const lyrics = useMemo(() => parseLyrics(track?.lyric ?? ""), [track?.lyric]);
  const activeLyricIndex = currentLyricIndex(lyrics, currentTime);
  const visibleLyrics = useMemo(() => {
    if (!lyrics.length) return [];
    const start = Math.max(0, (activeLyricIndex < 0 ? 0 : activeLyricIndex) - 2);
    return lyrics.slice(start, start + 9);
  }, [activeLyricIndex, lyrics]);
  const RepeatIcon = repeat === "one" ? Repeat1 : Repeat;
  useDialogFocus(open, onClose, dialogRef);

  return (
    <div
      className={`now-playing-sheet ${open ? "open" : ""}`}
      aria-hidden={!open}
      inert={!open}
    >
      <div className="sheet-backdrop" onClick={onClose} />
      <div
        ref={dialogRef}
        className="sheet-panel"
        role="dialog"
        aria-modal="true"
        aria-label="正在播放"
        tabIndex={-1}
      >
        <div className="sheet-handle" />
        {track ? (
          <>
            <div className="now-playing-ambient" aria-hidden="true">
              {track.cover && (
                <img src={track.cover} alt="" referrerPolicy="no-referrer" />
              )}
            </div>
            <div className="now-playing-material" aria-hidden="true" />

            <header className="now-playing-header">
              <button
                className="now-playing-close"
                type="button"
                title="收起正在播放"
                aria-label="收起正在播放"
                onClick={onClose}
              >
                <ChevronDown />
              </button>
              <div className="now-playing-header-title">
                <strong>正在播放</strong>
                <span>{providerInfo(track.provider).name}</span>
              </div>
              <div className="now-playing-header-actions">
                {track.quality && (
                  <span className="quality-badge">{track.quality}</span>
                )}
                <button
                  className={`icon-button now-playing-favorite ${favorite ? "is-favorite" : ""}`}
                  type="button"
                  title={favorite ? "取消收藏" : "收藏"}
                  aria-label={favorite ? "取消收藏" : "收藏"}
                  onClick={onFavorite}
                >
                  <Heart fill={favorite ? "currentColor" : "none"} />
                </button>
              </div>
            </header>

            <div className="now-playing-layout">
              <section className="now-playing-primary" aria-label="播放控制">
                <div className="now-playing-artwork-stage">
                  <Artwork
                    src={track.cover}
                    alt={`${track.album} 封面`}
                    title={track.title}
                    rounded="large"
                    className="now-playing-artwork"
                  />
                </div>

                <div className="now-playing-meta">
                  <p>{track.album || providerInfo(track.provider).name}</p>
                  <h1>{track.title}</h1>
                  <div>
                    <span>{track.artist}</span>
                    <span aria-hidden="true">·</span>
                    <span>{providerInfo(track.provider).name}</span>
                  </div>
                </div>

                <div className="now-playing-progress">
                  <input
                    className="range-input"
                    type="range"
                    min="0"
                    max={duration || 0}
                    step="0.1"
                    value={Math.min(currentTime, duration || 0)}
                    aria-label="播放进度"
                    style={
                      { "--progress": `${progress}%` } as React.CSSProperties
                    }
                    onChange={(event) => onSeek(Number(event.target.value))}
                    disabled={!duration}
                  />
                  <div>
                    <span>{formatTime(currentTime)}</span>
                    <span>{formatTime(duration)}</span>
                  </div>
                </div>

                <div className="now-playing-controls">
                  <button
                    className={`icon-button ${shuffle ? "enabled" : ""}`}
                    type="button"
                    title="随机播放"
                    aria-label="随机播放"
                    onClick={onToggleShuffle}
                  >
                    <Shuffle />
                  </button>
                  <button
                    className="icon-button"
                    type="button"
                    aria-label="上一首"
                    title="上一首"
                    onClick={onPrevious}
                  >
                    <SkipBack fill="currentColor" />
                  </button>
                  <button
                    className="play-button large"
                    type="button"
                    aria-label={playing ? "暂停" : "播放"}
                    title={playing ? "暂停" : "播放"}
                    onClick={onTogglePlay}
                    disabled={resolving}
                  >
                    {resolving ? (
                      <span className="play-loader" />
                    ) : playing ? (
                      <Pause fill="currentColor" />
                    ) : (
                      <Play fill="currentColor" />
                    )}
                  </button>
                  <button
                    className="icon-button"
                    type="button"
                    aria-label="下一首"
                    title="下一首"
                    onClick={onNext}
                  >
                    <SkipForward fill="currentColor" />
                  </button>
                  <button
                    className={`icon-button ${repeat !== "off" ? "enabled" : ""}`}
                    type="button"
                    title="循环播放"
                    aria-label="循环播放"
                    onClick={onToggleRepeat}
                  >
                    <RepeatIcon />
                  </button>
                </div>

                <div className="now-playing-footer">
                  <div className="now-playing-volume">
                    <button
                      className="icon-button"
                      type="button"
                      title={muted ? "取消静音" : "静音"}
                      aria-label={muted ? "取消静音" : "静音"}
                      onClick={onToggleMute}
                    >
                      {muted || volume === 0 ? <VolumeX /> : <Volume2 />}
                    </button>
                    <input
                      className="range-input"
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={muted ? 0 : volume}
                      aria-label="音量"
                      style={
                        {
                          "--progress": `${(muted ? 0 : volume) * 100}%`,
                        } as React.CSSProperties
                      }
                      onChange={(event) => onVolume(Number(event.target.value))}
                    />
                  </div>
                  <div className="now-playing-actions">
                    <button type="button" onClick={onOpenLyrics}>
                      <AudioLines />
                      <span>歌词</span>
                    </button>
                    <button type="button" onClick={onOpenQueue}>
                      <ListMusic />
                      <span>播放队列</span>
                    </button>
                  </div>
                </div>
              </section>

              <aside className="now-playing-lyrics" aria-label="同步歌词">
                <div className="now-playing-lyrics-heading">
                  <AudioLines />
                  <span>歌词</span>
                </div>
                {visibleLyrics.length ? (
                  <div className="now-playing-lyric-lines">
                    {visibleLyrics.map((line) => {
                      const active = line === lyrics[activeLyricIndex];
                      return (
                        <p
                          key={`${line.time}:${line.text}`}
                          className={active ? "active" : ""}
                        >
                          {line.text}
                        </p>
                      );
                    })}
                  </div>
                ) : (
                  <div className="now-playing-lyrics-empty">
                    <AudioLines />
                    <span>暂无同步歌词</span>
                  </div>
                )}
              </aside>
            </div>
          </>
        ) : (
          <>
            <button
              className="now-playing-close"
                type="button"
              title="收起正在播放"
              aria-label="收起正在播放"
              onClick={onClose}
            >
              <ChevronDown />
            </button>
            <div className="sheet-empty">
              <AudioLines />
              <h2>还没有正在播放的歌曲</h2>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
