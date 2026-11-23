import { LoaderCircle, Search, SlidersHorizontal, Sparkles } from "lucide-react";
import type { SearchState, Track } from "../types";
import { PROVIDERS } from "../types";
import { EmptyState } from "./EmptyState";
import { TrackRow } from "./TrackRow";
import { TrackTableHeader } from "./TrackTableHeader";

interface SearchViewProps {
  search: SearchState;
  favorites: Track[];
  onSearch: (query?: string) => void;
  onProviderChange: (provider: SearchState["provider"]) => void;
  onPlay: (track: Track, queue: Track[]) => void;
  onFavorite: (track: Track) => void;
  onAddAllToQueue: (tracks: Track[]) => void;
}

const suggestions = ["陈奕迅", "周杰伦", "五月天", "Taylor Swift", "City Pop", "纯音乐"];

export function SearchView({
  search,
  favorites,
  onSearch,
  onProviderChange,
  onPlay,
  onFavorite,
  onAddAllToQueue,
}: SearchViewProps) {
  const favoriteKeys = new Set(favorites.map((item) => item.key));
  const provider = PROVIDERS.find((item) => item.id === search.provider) ?? PROVIDERS[0];

  return (
    <div className="view search-view">
      <div className="view-heading">
        <div>
          <p className="eyebrow">{provider.name}</p>
          <h1>{search.query ? `“${search.query}”` : "搜索音乐"}</h1>
        </div>
        <div className="provider-tabs" role="group" aria-label="选择音乐平台">
          {PROVIDERS.map((item) => (
            <button
              key={item.id}
              className={item.id === search.provider ? "active" : ""}
              type="button"
              onClick={() => onProviderChange(item.id)}
            >
              <span style={{ backgroundColor: item.tone }} />
              {item.name}
            </button>
          ))}
        </div>
      </div>

      {!search.results.length && !search.loading && !search.error && (
        <div className="search-start">
          <div className="search-orbit">
            <Search />
            <Sparkles />
          </div>
          <h2>搜索四个平台的音乐</h2>
          <p>试试下面这些关键词，歌曲、歌手和专辑都可以搜索。</p>
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
          <span>正在搜索 {provider.name}</span>
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
                {search.results.length} 首歌曲 · 来自 {provider.name}
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
