import {
  ChevronRight,
  Disc3,
  FilePlus2,
  Heart,
  Library,
  ListPlus,
  ListMusic,
  Play,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { Playlist, Track } from "../types";
import { Artwork } from "./Artwork";
import { EmptyState } from "./EmptyState";
import { TrackRow } from "./TrackRow";
import { TrackTableHeader } from "./TrackTableHeader";

interface LibraryViewProps {
  playlists: Playlist[];
  favorites: Track[];
  recent: Track[];
  selectedPlaylist?: Playlist;
  onSelectPlaylist: (id: string) => void;
  onOpenImport: () => void;
  onPlay: (track: Track, queue: Track[]) => void;
  onFavorite: (track: Track) => void;
  onAddAllToQueue: (tracks: Track[]) => void;
}

export function LibraryView({
  playlists,
  favorites,
  recent,
  selectedPlaylist,
  onSelectPlaylist,
  onOpenImport,
  onPlay,
  onFavorite,
  onAddAllToQueue,
}: LibraryViewProps) {
  const favoriteKeys = new Set(favorites.map((item) => item.key));
  const [visibleTrackCount, setVisibleTrackCount] = useState(120);

  useEffect(() => {
    setVisibleTrackCount(120);
  }, [selectedPlaylist?.id]);

  const visibleTracks = selectedPlaylist?.tracks.slice(0, visibleTrackCount) ?? [];

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

      {playlists.length ? (
        <div className="library-workspace">
          <aside className="playlist-rail" aria-label="歌单列表">
            <div className="playlist-rail-heading">
              <div>
                <h2>我的歌单</h2>
                <p>{playlists.length} 个导入歌单</p>
              </div>
              <button
                className="icon-button"
                type="button"
                title="导入歌单"
                aria-label="导入歌单"
                onClick={onOpenImport}
              >
                <FilePlus2 />
              </button>
            </div>
            <div className="playlist-rail-list">
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
                  <span className="playlist-card-copy">
                    <strong>{playlist.title}</strong>
                    <small>
                      {playlist.trackCount} 首歌曲 · {playlist.creator}
                    </small>
                  </span>
                  <ChevronRight className="playlist-card-chevron" aria-hidden="true" />
                </button>
              ))}
            </div>
          </aside>

          <div className="playlist-stage">
            {selectedPlaylist ? (
              <section
                className="playlist-detail"
                aria-label={`${selectedPlaylist.title} 歌单详情`}
              >
                <div className="playlist-hero">
                  <div className="playlist-hero-cover">
                    <Artwork
                      src={selectedPlaylist.cover}
                      alt={`${selectedPlaylist.title} 封面`}
                      title={selectedPlaylist.title}
                      rounded="large"
                    />
                    <span>歌单</span>
                  </div>
                  <div className="playlist-hero-copy">
                    <p className="eyebrow">导入歌单</p>
                    <h2>{selectedPlaylist.title}</h2>
                    <div className="playlist-meta-row">
                      <span>{selectedPlaylist.creator}</span>
                      <span>{selectedPlaylist.trackCount} 首歌曲</span>
                    </div>
                    <div className="playlist-actions">
                      <button
                        className="primary-button small"
                        type="button"
                        onClick={() =>
                          onPlay(selectedPlaylist.tracks[0], selectedPlaylist.tracks)
                        }
                        disabled={!selectedPlaylist.tracks.length}
                      >
                        <Play fill="currentColor" />
                        播放全部
                      </button>
                      <button
                        className="secondary-button small"
                        type="button"
                        onClick={() => onAddAllToQueue(selectedPlaylist.tracks)}
                        disabled={!selectedPlaylist.tracks.length}
                      >
                        <ListPlus />
                        加入队列
                      </button>
                    </div>
                  </div>
                </div>

                <div className="playlist-track-heading">
                  <div>
                    <strong>歌曲列表</strong>
                    <span>共 {selectedPlaylist.tracks.length} 首</span>
                  </div>
                </div>
                <div className="track-table playlist-track-table">
                  <TrackTableHeader />
                  {visibleTracks.map((track, index) => (
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
                {visibleTracks.length < selectedPlaylist.tracks.length && (
                  <div className="playlist-load-more">
                    <span>
                      已显示 {visibleTracks.length} / {selectedPlaylist.tracks.length} 首
                    </span>
                    <button
                      className="secondary-button small"
                      type="button"
                      onClick={() => setVisibleTrackCount((value) => value + 120)}
                    >
                      加载更多歌曲
                    </button>
                  </div>
                )}
              </section>
            ) : (
              <div className="playlist-placeholder">
                <span>
                  <Library />
                </span>
                <strong>选择一个歌单</strong>
                <p>从左侧选择歌单后，在这里查看歌曲列表。</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <EmptyState
          icon={Library}
          title="歌单库还是空的"
          description="前往“导入歌单”页面添加网易云歌单，导入后会保存在这里。"
          action={{ label: "导入歌单", onClick: onOpenImport }}
        />
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
