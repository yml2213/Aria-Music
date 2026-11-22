import { Heart, MoreHorizontal, Pause, Play } from "lucide-react";
import type { Track } from "../types";
import { providerInfo } from "../types";
import { Artwork } from "./Artwork";

interface TrackRowProps {
  track: Track;
  index: number;
  active?: boolean;
  playing?: boolean;
  favorite?: boolean;
  compact?: boolean;
  onPlay: () => void;
  onFavorite: () => void;
  onAddToQueue?: () => void;
}

function formatDuration(seconds?: number) {
  if (!seconds) return "—";
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

export function TrackRow({
  track,
  index,
  active = false,
  playing = false,
  favorite = false,
  compact = false,
  onPlay,
  onFavorite,
  onAddToQueue,
}: TrackRowProps) {
  const provider = providerInfo(track.provider);

  return (
    <div
      className={`track-row ${active ? "active" : ""} ${compact ? "compact" : ""}`}
      role="button"
      tabIndex={0}
      onClick={onPlay}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onPlay();
        }
      }}
    >
      <span className="track-number">
        <span className="track-index">{(index + 1).toString().padStart(2, "0")}</span>
        <span className="track-play">
          {active && playing ? <Pause /> : <Play fill="currentColor" />}
        </span>
      </span>
      <Artwork
        src={track.cover}
        alt={`${track.album} 封面`}
        title={track.title}
        className="track-artwork"
        rounded="small"
      />
      <span className="track-main">
        <strong>{track.title}</strong>
        <span>{track.artist}</span>
      </span>
      {!compact && <span className="track-album truncate">{track.album}</span>}
      <span
        className="track-provider"
        style={{ "--provider-color": provider.tone } as React.CSSProperties}
      >
        {provider.shortName}
      </span>
      <span className="track-duration">{formatDuration(track.duration)}</span>
      <span className="track-actions" onClick={(event) => event.stopPropagation()}>
        <button
          className={`icon-button ${favorite ? "is-favorite" : ""}`}
          type="button"
          title={favorite ? "取消收藏" : "收藏"}
          aria-label={favorite ? "取消收藏" : "收藏"}
          onClick={onFavorite}
        >
          <Heart fill={favorite ? "currentColor" : "none"} />
        </button>
        {onAddToQueue && (
          <button
            className="icon-button desktop-only-action"
            type="button"
            title="加入播放队列"
            aria-label="加入播放队列"
            onClick={onAddToQueue}
          >
            <MoreHorizontal />
          </button>
        )}
      </span>
    </div>
  );
}
