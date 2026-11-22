import {
  ArrowRight,
  Disc3,
  Heart,
  Library,
  ListMusic,
  LoaderCircle,
  Plus,
  Settings2,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import type { Playlist, Quality, Track } from "../types";
import { Artwork } from "./Artwork";
import { EmptyState } from "./EmptyState";
import { TrackRow } from "./TrackRow";

interface LibraryViewProps {
  playlists: Playlist[];
  favorites: Track[];
  recent: Track[];
  selectedPlaylist?: Playlist;
  quality: Quality;
  onSelectPlaylist: (id: string) => void;
  onImportPlaylist: (id: string) => Promise<void>;
  onPlay: (track: Track, queue: Track[]) => void;
  onFavorite: (track: Track) => void;
  onAddAllToQueue: (tracks: Track[]) => void;
  onOpenSettings: () => void;
}

const qualityLabels: Record<Quality, string> = {
  standard: "标准音质",
  lossless: "无损音质",
  hires: "高解析度",
  jymaster: "超清母带",
};

export function LibraryView({
  playlists,
  favorites,
  recent,
  selectedPlaylist,
  quality,
  onSelectPlaylist,
  onImportPlaylist,
  onPlay,
  onFavorite,
  onAddAllToQueue,
  onOpenSettings,
}: LibraryViewProps) {
  const [playlistId, setPlaylistId] = useState("");
  const [importing, setImporting] = useState(false);
  const favoriteKeys = new Set(favorites.map((item) => item.key));

  const submitImport = async (event: FormEvent) => {
    event.preventDefault();
    if (!playlistId.trim() || importing) return;
    setImporting(true);
    try {
      await onImportPlaylist(playlistId.trim());
      setPlaylistId("");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="view library-view">
      <div className="view-heading">
        <div>
          <p className="eyebrow">你的音乐空间</p>
          <h1>我的音乐</h1>
        </div>
        <button className="secondary-button" type="button" onClick={onOpenSettings}>
          <Settings2 />
          {qualityLabels[quality]}
        </button>
      </div>

      <section className="library-layout">
        <div className="import-panel">
          <span className="import-panel-icon">
            <Plus />
          </span>
          <div className="import-copy">
            <h2>导入网易云歌单</h2>
            <p>粘贴歌单 ID，获取歌单信息和完整曲目。</p>
            <form onSubmit={submitImport}>
              <input
                value={playlistId}
                onChange={(event) => setPlaylistId(event.target.value)}
                inputMode="numeric"
                placeholder="例如 5202687076"
                aria-label="网易云歌单 ID"
              />
              <button
                className="primary-button small"
                type="submit"
                disabled={!playlistId.trim() || importing}
              >
                {importing ? <LoaderCircle className="spin" /> : <ArrowRight />}
                {importing ? "导入中" : "导入"}
              </button>
            </form>
          </div>
        </div>

        <div className="library-summary">
          <div>
            <Heart />
            <strong>{favorites.length}</strong>
            <span>收藏歌曲</span>
          </div>
          <div>
            <ListMusic />
            <strong>{playlists.length}</strong>
            <span>导入歌单</span>
          </div>
          <div>
            <Disc3 />
            <strong>{recent.length}</strong>
            <span>最近播放</span>
          </div>
        </div>
      </section>

      <section className="content-section">
        <div className="section-heading">
          <div>
            <h2>我的歌单</h2>
            <p>从网易云导入的完整歌单</p>
          </div>
        </div>
        {playlists.length ? (
          <div className="playlist-grid">
            {playlists.map((playlist) => (
              <button
                key={playlist.id}
                className={`playlist-card ${
                  selectedPlaylist?.id === playlist.id ? "selected" : ""
                }`}
                type="button"
                onClick={() => onSelectPlaylist(playlist.id)}
              >
                <Artwork
                  src={playlist.cover}
                  alt={`${playlist.title} 封面`}
                  title={playlist.title}
                  rounded="medium"
                />
                <span>
                  <strong>{playlist.title}</strong>
                  <small>{playlist.trackCount} 首歌曲</small>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Library}
            title="歌单库还是空的"
            description="在上方输入一个网易云歌单 ID，导入后会保存在浏览器中。"
          />
        )}
      </section>

      {selectedPlaylist && (
        <section className="content-section playlist-detail">
          <div className="playlist-hero">
            <Artwork
              src={selectedPlaylist.cover}
              alt={`${selectedPlaylist.title} 封面`}
              title={selectedPlaylist.title}
              rounded="large"
            />
            <div>
              <p className="eyebrow">导入歌单</p>
              <h2>{selectedPlaylist.title}</h2>
              <p>
                {selectedPlaylist.creator} · {selectedPlaylist.trackCount} 首歌曲
              </p>
              <button
                className="primary-button small"
                type="button"
                onClick={() => onPlay(selectedPlaylist.tracks[0], selectedPlaylist.tracks)}
                disabled={!selectedPlaylist.tracks.length}
              >
                播放全部
              </button>
            </div>
          </div>
          <div className="track-table">
            {selectedPlaylist.tracks.map((track, index) => (
              <TrackRow
                key={`${track.key}:${index}`}
                track={track}
                index={index}
                favorite={favoriteKeys.has(track.key)}
                onPlay={() => onPlay(track, selectedPlaylist.tracks)}
                onFavorite={() => onFavorite(track)}
                onAddToQueue={() => onAddAllToQueue([track])}
              />
            ))}
          </div>
        </section>
      )}

      <section className="content-section">
        <div className="section-heading">
          <div>
            <h2>收藏歌曲</h2>
            <p>你喜欢的音乐会一直留在这里</p>
          </div>
        </div>
        {favorites.length ? (
          <div className="track-table">
            {favorites.map((track, index) => (
              <TrackRow
                key={track.key}
                track={track}
                index={index}
                favorite
                onPlay={() => onPlay(track, favorites)}
                onFavorite={() => onFavorite(track)}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Heart}
            title="还没有收藏歌曲"
            description="在搜索结果或播放器中点击爱心即可收藏。"
          />
        )}
      </section>
    </div>
  );
}
