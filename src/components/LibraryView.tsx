import {
  Disc3,
  FilePlus2,
  Heart,
  Library,
  ListMusic,
  Settings2,
} from "lucide-react";
import type { Playlist, Quality, Track } from "../types";
import { Artwork } from "./Artwork";
import { EmptyState } from "./EmptyState";
import { TrackRow } from "./TrackRow";
import { TrackTableHeader } from "./TrackTableHeader";

interface LibraryViewProps {
  playlists: Playlist[];
  favorites: Track[];
  recent: Track[];
  selectedPlaylist?: Playlist;
  quality: Quality;
  onSelectPlaylist: (id: string) => void;
  onOpenImport: () => void;
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
  onOpenImport,
  onPlay,
  onFavorite,
  onAddAllToQueue,
  onOpenSettings,
}: LibraryViewProps) {
  const favoriteKeys = new Set(favorites.map((item) => item.key));

  return (
    <div className="view library-view">
      <div className="view-heading">
        <div>
          <p className="eyebrow">你的音乐空间</p>
          <h1>我的音乐</h1>
        </div>
        <div className="view-heading-actions">
          <button className="secondary-button" type="button" onClick={onOpenImport}>
            <FilePlus2 />
            导入歌单
          </button>
          <button className="secondary-button" type="button" onClick={onOpenSettings}>
            <Settings2 />
            {qualityLabels[quality]}
          </button>
        </div>
      </div>

      <section className="library-summary library-summary-wide">
        <div>
          <Heart />
          <strong>{favorites.length}</strong>
          <span>收藏歌曲</span>
        </div>
        <div>
          <ListMusic />
          <strong>{playlists.length}</strong>
          <span>我的歌单</span>
        </div>
        <div>
          <Disc3 />
          <strong>{recent.length}</strong>
          <span>最近播放</span>
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
            description="前往“导入歌单”页面添加网易云歌单，导入后会保存在这里。"
            action={{ label: "导入歌单", onClick: onOpenImport }}
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
            <TrackTableHeader />
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

      {recent.length > 0 && (
        <section className="content-section">
          <div className="section-heading">
            <div>
              <h2>最近播放</h2>
              <p>最近播放的歌曲会保留在这里</p>
            </div>
          </div>
          <div className="track-table">
            <TrackTableHeader />
            {recent.map((track, index) => (
              <TrackRow
                key={`${track.key}:${index}`}
                track={track}
                index={index}
                favorite={favoriteKeys.has(track.key)}
                onPlay={() => onPlay(track, recent)}
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
            <TrackTableHeader />
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
