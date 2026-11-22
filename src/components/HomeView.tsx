import {
  ArrowRight,
  Clock3,
  Headphones,
  Heart,
  AudioLines,
  ListMusic,
  Sparkles,
} from "lucide-react";
import type { Track } from "../types";
import { Artwork } from "./Artwork";
import { EmptyState } from "./EmptyState";

interface HomeViewProps {
  sourceConfigured: boolean;
  recent: Track[];
  favorites: Track[];
  onOpenSettings: () => void;
  onNavigateSearch: () => void;
  onNavigateLibrary: () => void;
  onQuickSearch: (query: string) => void;
  onPlay: (track: Track, queue: Track[]) => void;
}

const quickSearches = [
  { title: "华语流行", query: "华语流行", className: "coral" },
  { title: "周杰伦", query: "周杰伦", className: "blue" },
  { title: "林俊杰", query: "林俊杰", className: "green" },
  { title: "轻松爵士", query: "轻松爵士", className: "yellow" },
  { title: "晴天", query: "晴天", className: "violet" },
  { title: "Lo-fi", query: "Lo-fi", className: "slate" },
];

function greeting() {
  const hour = new Date().getHours();
  if (hour < 6) return "夜深了";
  if (hour < 12) return "早上好";
  if (hour < 18) return "下午好";
  return "晚上好";
}

export function HomeView({
  sourceConfigured,
  recent,
  favorites,
  onOpenSettings,
  onNavigateSearch,
  onNavigateLibrary,
  onQuickSearch,
  onPlay,
}: HomeViewProps) {
  return (
    <div className="view home-view">
      <div className="view-heading home-heading">
        <div>
          <p className="eyebrow">{greeting()}</p>
          <h1>今天想听什么？</h1>
        </div>
        <button className="primary-button" type="button" onClick={onNavigateSearch}>
          <Sparkles />
          开始搜索
        </button>
      </div>

      {!sourceConfigured && (
        <section className="connection-banner">
          <span className="connection-icon">
            <AudioLines />
          </span>
          <div>
            <h2>添加一个播放音源</h2>
            <p>搜索和歌词已经独立可用，导入洛雪音源后即可播放和下载。</p>
          </div>
          <button className="primary-button" type="button" onClick={onOpenSettings}>
            管理音源
            <ArrowRight />
          </button>
        </section>
      )}

      <section className="content-section">
        <div className="section-heading">
          <div>
            <h2>快速开始</h2>
            <p>选择一个方向，立即查找音乐</p>
          </div>
        </div>
        <div className="quick-grid">
          {quickSearches.map((item) => (
            <button
              key={item.title}
              className={`quick-tile ${item.className}`}
              type="button"
              onClick={() => onQuickSearch(item.query)}
            >
              <span>{item.title}</span>
              <ArrowRight />
            </button>
          ))}
        </div>
      </section>

      <section className="content-section">
        <div className="section-heading">
          <div>
            <h2>最近播放</h2>
            <p>继续上次没有听完的音乐</p>
          </div>
          {recent.length > 0 && (
            <button className="text-button" type="button" onClick={onNavigateSearch}>
              查看全部
              <ArrowRight />
            </button>
          )}
        </div>
        {recent.length ? (
          <div className="album-grid">
            {recent.slice(0, 6).map((track) => (
              <button
                key={track.key}
                className="album-tile"
                type="button"
                onClick={() => onPlay(track, recent)}
              >
                <Artwork
                  src={track.cover}
                  alt={`${track.album} 封面`}
                  title={track.title}
                  rounded="large"
                />
                <strong>{track.title}</strong>
                <span>{track.artist}</span>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Clock3}
            title="还没有播放记录"
            description="搜索一首歌，播放记录会自动保存在这里。"
            action={{ label: "搜索音乐", onClick: onNavigateSearch }}
          />
        )}
      </section>

      <section className="content-section">
        <div className="section-heading">
          <div>
            <h2>我的收藏</h2>
            <p>你标记为喜欢的歌曲</p>
          </div>
          <Heart className="section-heading-icon" />
        </div>
        {favorites.length ? (
          <div className="album-grid">
            {favorites.slice(0, 6).map((track) => (
              <button
                key={track.key}
                className="album-tile"
                type="button"
                onClick={() => onPlay(track, favorites)}
              >
                <Artwork
                  src={track.cover}
                  alt={`${track.album} 封面`}
                  title={track.title}
                  rounded="large"
                />
                <strong>{track.title}</strong>
                <span>{track.artist}</span>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Headphones}
            title="收藏会出现在这里"
            description="点击歌曲右侧的爱心，建立自己的音乐收藏。"
          />
        )}
      </section>

      <section className="content-section compact-section">
        <div className="feature-strip">
          <span className="feature-strip-icon">
            <ListMusic />
          </span>
          <div>
            <h2>把歌单带进来</h2>
            <p>使用网易云歌单 ID 导入完整曲目，和单曲一起加入播放队列。</p>
          </div>
          <button className="secondary-button" type="button" onClick={onNavigateLibrary}>
            前往我的音乐
            <ArrowRight />
          </button>
        </div>
      </section>
    </div>
  );
}
