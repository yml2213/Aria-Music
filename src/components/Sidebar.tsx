import {
  Compass,
  Library,
  ListMusic,
  Music2,
  Search,
  Settings2,
} from "lucide-react";
import type { Playlist, ViewName } from "../types";

interface SidebarProps {
  view: ViewName;
  playlists: Playlist[];
  sourceConfigured: boolean;
  sourceStatus: "idle" | "ready" | "error";
  sourceName?: string;
  onNavigate: (view: ViewName) => void;
  onOpenPlaylist: (playlistId: string) => void;
  onOpenSettings: () => void;
}

const navigation = [
  { id: "home" as const, label: "发现", icon: Compass },
  { id: "search" as const, label: "搜索", icon: Search },
  { id: "library" as const, label: "我的音乐", icon: Library },
];

export function Sidebar({
  view,
  playlists,
  sourceConfigured,
  sourceStatus,
  sourceName,
  onNavigate,
  onOpenPlaylist,
  onOpenSettings,
}: SidebarProps) {
  const accountLabel =
    sourceStatus === "ready"
      ? "音源已就绪"
      : sourceStatus === "error"
        ? "音源异常"
        : sourceConfigured
          ? "音源待检测"
          : "添加播放音源";
  const accountDetail =
    sourceStatus === "ready"
      ? sourceName || "洛雪自定义音源"
      : sourceStatus === "error"
        ? "打开设置检查音源"
        : sourceConfigured
          ? "打开设置检测音源"
          : "导入洛雪自定义音源";

  return (
    <aside className="sidebar">
      <button className="brand" type="button" onClick={() => onNavigate("home")}>
        <span className="brand-mark">
          <Music2 />
        </span>
        <span>Aria Music</span>
      </button>

      <nav className="sidebar-nav" aria-label="主导航">
        <p className="sidebar-label">浏览</p>
        {navigation.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              className={`nav-item ${view === item.id ? "active" : ""}`}
              type="button"
              onClick={() => onNavigate(item.id)}
            >
              <Icon />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="sidebar-playlists">
        <div className="sidebar-section-heading">
          <p className="sidebar-label">歌单</p>
          <button
            className="icon-button subtle"
            type="button"
            title="导入歌单"
            aria-label="导入歌单"
            onClick={() => onNavigate("library")}
          >
            <ListMusic />
          </button>
        </div>
        {playlists.length ? (
          playlists.slice(0, 6).map((playlist) => (
            <button
              key={playlist.id}
              className="nav-item playlist-nav-item"
              type="button"
              onClick={() => onOpenPlaylist(playlist.id)}
            >
              <span className="playlist-nav-icon">
                <Music2 />
              </span>
              <span className="truncate">{playlist.title}</span>
            </button>
          ))
        ) : (
          <p className="sidebar-empty">导入网易云歌单后会显示在这里</p>
        )}
      </div>

      <div className="sidebar-footer">
        <button className="account-button" type="button" onClick={onOpenSettings}>
          <span
            className={`account-status ${sourceStatus === "ready" ? "online" : ""} ${
              sourceStatus === "error" ? "invalid" : ""
            }`}
          />
          <span>
            <strong>{accountLabel}</strong>
            <small>{accountDetail}</small>
          </span>
          <Settings2 />
        </button>
      </div>
    </aside>
  );
}
