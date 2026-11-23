import { AudioLines, Monitor, Moon, Search, Sun, X } from "lucide-react";
import type { FormEvent } from "react";
import type { Provider, ThemeMode, ViewName } from "../types";
import { PROVIDERS } from "../types";

interface TopBarProps {
  view: ViewName;
  query: string;
  provider: Provider;
  sourceConfigured: boolean;
  sourceStatus: "idle" | "ready" | "error";
  themeMode: ThemeMode;
  onQueryChange: (value: string) => void;
  onProviderChange: (provider: Provider) => void;
  onSearch: () => void;
  onOpenSettings: () => void;
  onCycleTheme: () => void;
}

const titles: Record<ViewName, string> = {
  home: "发现",
  search: "搜索",
  import: "导入歌单",
  library: "我的音乐",
};

export function TopBar({
  view,
  query,
  provider,
  sourceConfigured,
  sourceStatus,
  themeMode,
  onQueryChange,
  onProviderChange,
  onSearch,
  onOpenSettings,
  onCycleTheme,
}: TopBarProps) {
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSearch();
  };

  const connectionLabel =
    sourceStatus === "ready"
      ? "音源已就绪"
      : sourceStatus === "error"
        ? "音源异常"
        : sourceConfigured
          ? "音源待检测"
          : "添加音源";
  const themeLabel =
    themeMode === "system"
      ? "主题：跟随系统"
      : themeMode === "dark"
        ? "主题：暗色"
        : "主题：亮色";
  const ThemeIcon =
    themeMode === "system" ? Monitor : themeMode === "dark" ? Moon : Sun;

  return (
    <header className="topbar">
      <div className="mobile-title">{titles[view]}</div>
      <form className="global-search" onSubmit={submit}>
        <Search aria-hidden="true" />
        <input
          id="global-search-input"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="搜索歌曲、歌手或专辑"
          aria-label="搜索歌曲、歌手或专辑"
          autoComplete="off"
        />
        {query ? (
          <button
            className="search-clear"
            type="button"
            title="清除"
            aria-label="清除搜索"
            onClick={() => onQueryChange("")}
          >
            <X />
          </button>
        ) : (
          <kbd>⌘ K</kbd>
        )}
        <div className="provider-switch" role="group" aria-label="音乐平台">
          {PROVIDERS.map((item) => (
            <button
              key={item.id}
              className={provider === item.id ? "active" : ""}
              type="button"
              onClick={() => onProviderChange(item.id)}
              title={item.name}
            >
              {item.shortName}
            </button>
          ))}
        </div>
        <button className="search-submit" type="submit" title="搜索" aria-label="搜索">
          <Search />
        </button>
      </form>
      <button
        className="icon-button theme-toggle"
        type="button"
        aria-label={themeLabel}
        title={themeLabel}
        onClick={onCycleTheme}
      >
        <ThemeIcon />
      </button>
      <button
        className={`api-connection ${sourceStatus === "ready" ? "connected" : ""} ${
          sourceStatus === "error" ? "invalid" : ""
        }`}
        type="button"
        aria-label={connectionLabel}
        title={connectionLabel}
        onClick={onOpenSettings}
      >
        <span className="api-connection-dot" />
        <span>{connectionLabel}</span>
        <AudioLines />
      </button>
    </header>
  );
}
