import { LoaderCircle, Search, SlidersHorizontal, Sparkles } from "lucide-react";
import type { SearchState, Track } from "../types";
import { EmptyState } from "./EmptyState";
import { TrackRow } from "./TrackRow";
import { TrackTableHeader } from "./TrackTableHeader";

interface SearchViewProps {
  search: SearchState;
  favorites: Track[];
  onSearch: (query?: string) => void;
  onPlay: (track: Track, queue: Track[]) => void;
  onFavorite: (track: Track) => void;
  onAddAllToQueue: (tracks: Track[]) => void;
}

const suggestions = ["陈奕迅", "周杰伦", "五月天", "Taylor Swift", "City Pop", "纯音乐"];

export function SearchView({
  search,
  favorites,
  onSearch,
  onPlay,
  onFavorite,
  onAddAllToQueue,
}: SearchViewProps) {
  const favoriteKeys = new Set(favorites.map((item) => item.key));

  return (
    <div className="view search-view">
      <div className="view-heading">
        <div>
          <p className="eyebrow">联合搜索</p>
          <h1>{search.query ? `“${search.query}”` : "搜索音乐"}</h1>
        </div>
      </div>

      {!search.results.length && !search.loading && !search.error && (
        <div className="search-start">
          <div className="search-orbit">
            <Search />
            <Sparkles />
          </div>
          <h2>一次搜索四个平台</h2>
          <p>网易云、QQ、酷狗和酷我会并行返回结果。</p>
          <div className="suggestion-row">
            {suggestions.map((item) => (
              <button key={item} type="button" onClick={() => onSearch(item)}>
                {item}
              </button>
            ))}
          </div>
        </div>
      )}

      {search.error && (
        <EmptyState
          icon={SlidersHorizontal}
          title="这次搜索没有完成"
          description={search.error}
          action={{ label: "重新搜索", onClick: () => onSearch() }}
        />
      )}

      {search.loading && (
        <div className="search-loading">
          <LoaderCircle className="spin" />
          <span>正在搜索全部音乐平台</span>
          <div className="loading-lines">
            {[0, 1, 2, 3, 4].map((item) => (
              <span key={item} />
            ))}
          </div>
        </div>
      )}

      {!search.loading && search.results.length > 0 && (
        <section className="results-section">
          <div className="section-heading">
            <div>
              <h2>搜索结果</h2>
              <p>
                {search.results.length} 首歌曲 · 来自四个音乐平台
              </p>
            </div>
            <button
              className="secondary-button small"
              type="button"
              onClick={() => onAddAllToQueue(search.results)}
            >
              加入播放队列
            </button>
          </div>
          <div className="track-table">
            <TrackTableHeader />
            {search.results.map((track, index) => (
              <TrackRow
                key={track.key}
                track={track}
                index={index}
                favorite={favoriteKeys.has(track.key)}
                onPlay={() => onPlay(track, search.results)}
                onFavorite={() => onFavorite(track)}
                onAddToQueue={() => onAddAllToQueue([track])}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
