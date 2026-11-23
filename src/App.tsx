import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, LoaderCircle } from "lucide-react";
import { HomeView } from "./components/HomeView";
import { ImportView } from "./components/ImportView";
import { LibraryView } from "./components/LibraryView";
import { NowPlayingSheet, PlayerBar } from "./components/PlayerBar";
import { SearchView } from "./components/SearchView";
import { Sidebar } from "./components/Sidebar";
import { SidePanel, type SidePanelTab } from "./components/SidePanel";
import { SourceManagerModal } from "./components/SourceManagerModal";
import { TopBar } from "./components/TopBar";
import {
  fetchTrackLyric,
  getSourceConfig,
  hasConfiguredSource,
  importSource as importMusicSource,
  importNeteasePlaylist,
  removeSource as removeMusicSource,
  resolveTrack,
  saveSourceSelection,
  searchTracks,
  sourceStatus as getSourceStatus,
  testSource as testMusicSource,
} from "./lib/api";
import { storage, STORAGE_ERROR_EVENT } from "./lib/storage";
import { useLibrary } from "./hooks/use-library";
import { useMediaSession } from "./hooks/use-media-session";
import type {
  Quality,
  RepeatMode,
  SearchState,
  SourceConfig,
  ThemeMode,
  Track,
  ViewName,
} from "./types";

interface Toast {
  id: number;
  message: string;
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "发生未知错误，请稍后重试";
}

const EMPTY_SOURCE_CONFIG: SourceConfig = {
  sources: [],
  primaryId: "",
  backupIds: [],
};

function App() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const playRequestRef = useRef(0);
  const searchRequestRef = useRef(0);
  const toastTimerRef = useRef<number | undefined>(undefined);
  const playbackRetryCountRef = useRef(0);
  const failedPlaybackUrlsRef = useRef<string[]>([]);

  const [view, setView] = useState<ViewName>("home");
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => storage.getTheme());
  const [sourceConfig, setSourceConfig] = useState<SourceConfig>(EMPTY_SOURCE_CONFIG);
  const [quality, setQuality] = useState<Quality>(() => storage.getQuality());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState<SearchState>({
    query: "",
    provider: "all",
    results: [],
    loading: false,
    error: "",
  });
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string>();

  const [queue, setQueue] = useState<Track[]>([]);
  const [currentTrack, setCurrentTrack] = useState<Track>();
  const [playing, setPlaying] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [lyricLoading, setLyricLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(() => storage.getVolume());
  const [muted, setMuted] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>("off");
  const [shuffle, setShuffle] = useState(false);
  const [sidePanelOpen, setSidePanelOpen] = useState(() =>
    window.matchMedia("(min-width: 1261px)").matches,
  );
  const [sidePanelTab, setSidePanelTab] = useState<SidePanelTab>("queue");
  const [nowPlayingOpen, setNowPlayingOpen] = useState(false);
  const [toast, setToast] = useState<Toast>();

  const sourceConfigured = hasConfiguredSource(sourceConfig);
  const playbackSourceStatus = getSourceStatus(sourceConfig);
  const selectedSourceName = useMemo(
    () =>
      sourceConfig.sources.find((source) => source.id === sourceConfig.primaryId)
        ?.name,
    [sourceConfig],
  );

  const showToast = useCallback((message: string) => {
    window.clearTimeout(toastTimerRef.current);
    setToast({ id: Date.now(), message });
    toastTimerRef.current = window.setTimeout(() => setToast(undefined), 3600);
  }, []);

  const {
    favorites,
    recent,
    playlists,
    ready: libraryReady,
    addRecent,
    toggleFavorite,
    upsertPlaylist,
  } = useLibrary(showToast);

  const selectedPlaylist = useMemo(
    () => playlists.find((playlist) => playlist.id === selectedPlaylistId),
    [playlists, selectedPlaylistId],
  );

  const favoriteKeys = useMemo(
    () => new Set(favorites.map((track) => track.key)),
    [favorites],
  );

  useEffect(() => {
    if (
      libraryReady &&
      view === "library" &&
      !selectedPlaylistId &&
      playlists.length > 0
    ) {
      setSelectedPlaylistId(playlists[0].id);
    }
  }, [libraryReady, playlists, selectedPlaylistId, view]);

  useEffect(
    () => () => {
      window.clearTimeout(toastTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    const reportStorageError = (event: Event) => {
      const message = (event as CustomEvent<string>).detail;
      showToast(message || "浏览器本地存储不可用");
    };
    window.addEventListener(STORAGE_ERROR_EVENT, reportStorageError);
    return () => window.removeEventListener(STORAGE_ERROR_EVENT, reportStorageError);
  }, [showToast]);

  const refreshSourceConfig = useCallback(async () => {
    try {
      const next = await getSourceConfig();
      setSourceConfig(next);
      return next;
    } catch (error) {
      showToast(errorMessage(error));
      throw error;
    }
  }, [showToast]);

  useEffect(() => {
    localStorage.removeItem("aria-music:apikey");
    void refreshSourceConfig().catch(() => undefined);
  }, [refreshSourceConfig]);

  useEffect(() => {
    storage.setTheme(themeMode);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      const resolved =
        themeMode === "system" ? (media.matches ? "dark" : "light") : themeMode;
      document.documentElement.dataset.theme = resolved;
      document.documentElement.dataset.themeMode = themeMode;
      document.documentElement.style.colorScheme = resolved;
      const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
      meta?.setAttribute("content", resolved === "dark" ? "#111113" : "#f5f5f7");
    };
    applyTheme();
    if (themeMode !== "system") return;
    media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
  }, [themeMode]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.muted = muted;
  }, [muted, volume]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        document.getElementById("global-search-input")?.focus();
      }
      if (event.key === "Escape") {
        setNowPlayingOpen(false);
        setSettingsOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const cycleTheme = () => {
    setThemeMode((current) =>
      current === "system" ? "light" : current === "light" ? "dark" : "system",
    );
  };

  const performSearch = useCallback(
    async (rawQuery = query) => {
      const keyword = rawQuery.trim();
      if (!keyword) {
        document.getElementById("global-search-input")?.focus();
        return;
      }
      const targetProvider: SearchState["provider"] = "all";
      const requestId = ++searchRequestRef.current;
      setView("search");
      setQuery(keyword);
      setSearch({
        query: keyword,
        provider: targetProvider,
        results: [],
        loading: true,
        error: "",
      });

      try {
        const response = await searchTracks(targetProvider, keyword);
        if (requestId !== searchRequestRef.current) return;
        const results = response.tracks;
        setSearch({
          query: keyword,
          provider: targetProvider,
          results,
          loading: false,
          error: results.length
            ? ""
            : response.errors?.length
              ? "部分音乐平台暂时不可用，其他平台也没有匹配结果。"
              : "没有找到匹配的歌曲，换个关键词试试。",
        });
      } catch (error) {
        if (requestId !== searchRequestRef.current) return;
        setSearch({
          query: keyword,
          provider: targetProvider,
          results: [],
          loading: false,
          error: errorMessage(error),
        });
      }
    },
    [query],
  );

  const markRecent = useCallback((track: Track) => {
    addRecent(track);
  }, [addRecent]);

  const applyResolvedPlayback = useCallback(
    async (
      originalTrack: Track,
      resolved: Awaited<ReturnType<typeof resolveTrack>>,
      requestId: number,
      remember: boolean,
    ) => {
      if (requestId !== playRequestRef.current) return false;
      const playableTrack: Track = {
        ...originalTrack,
        ...resolved.track,
        url: resolved.url,
        remoteUrl: resolved.remoteUrl,
        quality: resolved.quality,
      };
      setCurrentTrack(playableTrack);
      setCurrentTime(0);
      setDuration(playableTrack.duration ?? 0);
      setResolving(false);
      setLyricLoading(true);
      if (remember) markRecent(playableTrack);

      const audio = audioRef.current;
      if (audio) {
        audio.src = resolved.url;
        audio.load();
        await audio.play().catch(() => {
          showToast("音频已就绪，点击播放即可开始");
        });
      }

      void fetchTrackLyric(playableTrack)
        .then((lyric) => {
          if (requestId !== playRequestRef.current) return;
          setCurrentTrack((current) =>
            current?.key === playableTrack.key
              ? { ...current, ...lyric }
              : current,
          );
        })
        .catch(() => undefined)
        .finally(() => {
          if (requestId === playRequestRef.current) setLyricLoading(false);
        });
      return true;
    },
    [markRecent, showToast],
  );

  const playTrack = useCallback(
    async (track: Track, context?: Track[]) => {
      if (!sourceConfigured) {
        setSettingsOpen(true);
        showToast("请先导入一个洛雪播放音源");
        return;
      }

      const nextQueue = context?.length
        ? context
        : queue.some((item) => item.key === track.key)
          ? queue
          : [...queue, track];
      setQueue(nextQueue);

      const requestId = ++playRequestRef.current;
      setResolving(true);
      setPlaying(false);
      audioRef.current?.pause();
      failedPlaybackUrlsRef.current = [];
      playbackRetryCountRef.current = 0;

      try {
        const resolved = await resolveTrack(track, quality);
        await applyResolvedPlayback(track, resolved, requestId, true);
      } catch (error) {
        if (requestId !== playRequestRef.current) return;
        setResolving(false);
        setLyricLoading(false);
        setPlaying(false);
        showToast(errorMessage(error));
      }
    },
    [applyResolvedPlayback, quality, queue, showToast, sourceConfigured],
  );

  const findQueueIndex = useCallback(
    () => queue.findIndex((track) => track.key === currentTrack?.key),
    [currentTrack?.key, queue],
  );

  const playNext = useCallback(
    (automatic = false) => {
      if (!queue.length) return;
      const index = findQueueIndex();

      if (shuffle && queue.length > 1) {
        let nextIndex = Math.floor(Math.random() * queue.length);
        if (nextIndex === index) nextIndex = (nextIndex + 1) % queue.length;
        void playTrack(queue[nextIndex]);
        return;
      }

      const atEnd = index === queue.length - 1 || index === -1;
      if (automatic && repeat === "off" && atEnd) {
        setPlaying(false);
        return;
      }

      const nextIndex =
        atEnd && repeat !== "off" ? 0 : Math.min(Math.max(index + 1, 0), queue.length - 1);
      if (nextIndex !== index || automatic) void playTrack(queue[nextIndex]);
    },
    [findQueueIndex, playTrack, queue, repeat, shuffle],
  );

  const playPrevious = useCallback(() => {
    const audio = audioRef.current;
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    if (!queue.length) return;
    const index = findQueueIndex();
    const previousIndex = index <= 0 ? queue.length - 1 : index - 1;
    void playTrack(queue[previousIndex]);
  }, [findQueueIndex, playTrack, queue]);

  const togglePlay = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!currentTrack) {
      if (queue[0]) void playTrack(queue[0]);
      return;
    }

    if (audio.paused) {
      if (!audio.src) {
        void playTrack(currentTrack);
        return;
      }
      try {
        await audio.play();
      } catch (error) {
        showToast(errorMessage(error));
      }
    } else {
      audio.pause();
    }
  }, [currentTrack, playTrack, queue, showToast]);

  const addToQueue = useCallback(
    (tracks: Track[]) => {
      if (!tracks.length) return;
      setQueue((previous) => [...previous, ...tracks]);
      showToast(`已加入 ${tracks.length} 首歌曲`);
    },
    [showToast],
  );

  const removeFromQueue = useCallback((key: string) => {
    setQueue((previous) => previous.filter((track) => track.key !== key));
  }, []);

  const clearQueue = useCallback(() => {
    setQueue([]);
    showToast("播放队列已清空");
  }, [showToast]);

  const navigate = (nextView: ViewName) => {
    setView(nextView);
    if (nextView !== "library") setSelectedPlaylistId(undefined);
  };

  const navigateSearch = () => {
    setView("search");
    window.setTimeout(() => document.getElementById("global-search-input")?.focus(), 0);
  };

  const openPlaylist = (playlistId: string) => {
    setSelectedPlaylistId(playlistId);
    setView("library");
  };

  const importPlaylist = useCallback(
    async (id: string) => {
      try {
        const playlist = await importNeteasePlaylist(id);
        upsertPlaylist(playlist);
        setSelectedPlaylistId(playlist.id);
        showToast(`已导入“${playlist.title}”`);
        return playlist;
      } catch (error) {
        showToast(errorMessage(error));
        throw error;
      }
    },
    [showToast, upsertPlaylist],
  );

  const importSourceAndSync = useCallback(
    async (url: string) => {
      const next = await importMusicSource(url);
      setSourceConfig(next);
      showToast("音源已导入");
      return next;
    },
    [showToast],
  );

  const removeSourceAndSync = useCallback(
    async (id: string) => {
      const next = await removeMusicSource(id);
      setSourceConfig(next);
      showToast("音源已删除");
      return next;
    },
    [showToast],
  );

  const testSourceAndSync = useCallback(
    async (id: string) => {
      const next = await testMusicSource(id);
      setSourceConfig(next);
      return next;
    },
    [],
  );

  const saveSettings = async (
    primaryId: string,
    backupIds: string[],
    nextQuality: Quality,
  ) => {
    const next = await saveSourceSelection(primaryId, backupIds);
    setSourceConfig(next);
    setQuality(nextQuality);
    storage.setQuality(nextQuality);
    setSettingsOpen(false);
    showToast("音源设置已保存");
  };

  const openSidePanel = (tab: SidePanelTab) => {
    setSidePanelTab(tab);
    setSidePanelOpen(true);
    if (tab === "lyrics") setNowPlayingOpen(false);
  };

  const seek = useCallback((value: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = value;
    setCurrentTime(value);
  }, []);

  const skipNext = useCallback(() => playNext(false), [playNext]);

  useMediaSession({
    track: currentTrack,
    currentTime,
    duration,
    audioRef,
    onCurrentTime: setCurrentTime,
    onPrevious: playPrevious,
    onNext: skipNext,
  });

  const changeVolume = (value: number) => {
    const audio = audioRef.current;
    setVolume(value);
    storage.setVolume(value);
    setMuted(value === 0);
    if (audio) {
      audio.volume = value;
      audio.muted = value === 0;
    }
  };

  const toggleMute = () => {
    const nextMuted = !muted;
    setMuted(nextMuted);
    if (audioRef.current) audioRef.current.muted = nextMuted;
  };

  const onAudioEnded = () => {
    if (repeat === "one") {
      const audio = audioRef.current;
      if (audio) {
        audio.currentTime = 0;
        void audio.play();
      }
      return;
    }
    playNext(true);
  };

  const handleAudioError = () => {
    if (!currentTrack || resolving) return;
    const audio = audioRef.current;
    for (const failedUrl of [currentTrack.url, currentTrack.remoteUrl]) {
      if (failedUrl && !failedPlaybackUrlsRef.current.includes(failedUrl)) {
        failedPlaybackUrlsRef.current.push(failedUrl);
      }
    }
    const mediaCode = audio?.error?.code;
    const detail =
      mediaCode === 2
        ? "网络连接失败"
        : mediaCode === 3
          ? "音频解码失败"
          : mediaCode === 4
            ? "音频格式不受支持或地址已失效"
            : "音频地址不可用";
    if (
      !sourceConfigured ||
      playbackRetryCountRef.current >= 2 ||
      !currentTrack.url
    ) {
      setPlaying(false);
      showToast(`${detail}，请更换音源或稍后重试`);
      return;
    }

    playbackRetryCountRef.current += 1;
    const requestId = ++playRequestRef.current;
    setResolving(true);
    setPlaying(false);
    audio?.pause();
    void resolveTrack(currentTrack, quality, failedPlaybackUrlsRef.current)
      .then((resolved) =>
        applyResolvedPlayback(currentTrack, resolved, requestId, false),
      )
      .catch((error) => {
        if (requestId !== playRequestRef.current) return;
        setResolving(false);
        setLyricLoading(false);
        setPlaying(false);
        showToast(`${detail}，自动换源失败：${errorMessage(error)}`);
      });
  };

  const renderView = () => {
    if (!libraryReady) {
      return (
        <div className="view">
          <div className="search-loading">
            <LoaderCircle className="spin" />
            <span>正在读取本地音乐库</span>
          </div>
        </div>
      );
    }

    if (view === "home") {
      return (
        <HomeView
          sourceConfigured={sourceConfigured}
          recent={recent}
          favorites={favorites}
          onOpenSettings={() => setSettingsOpen(true)}
          onNavigateSearch={navigateSearch}
          onNavigateImport={() => navigate("import")}
          onNavigateLibrary={() => navigate("library")}
          onQuickSearch={(value) => void performSearch(value)}
          onPlay={(track, context) => void playTrack(track, context)}
        />
      );
    }

    if (view === "search") {
      return (
        <SearchView
          search={search}
          favorites={favorites}
          onSearch={(value) => void performSearch(value ?? query)}
          onPlay={(track, context) => void playTrack(track, context)}
          onFavorite={toggleFavorite}
          onAddAllToQueue={addToQueue}
        />
      );
    }

    if (view === "import") {
      return (
        <ImportView
          playlistCount={playlists.length}
          onBack={() => navigate("library")}
          onImportPlaylist={importPlaylist}
          onImported={() => navigate("library")}
        />
      );
    }

    return (
      <LibraryView
        playlists={playlists}
        favorites={favorites}
        recent={recent}
        selectedPlaylist={selectedPlaylist}
        quality={quality}
        onSelectPlaylist={setSelectedPlaylistId}
        onOpenImport={() => navigate("import")}
        onPlay={(track, context) => void playTrack(track, context)}
        onFavorite={toggleFavorite}
        onAddAllToQueue={addToQueue}
        onOpenSettings={() => setSettingsOpen(true)}
      />
    );
  };

  return (
    <div className={`app-shell ${sidePanelOpen ? "with-side-panel" : ""}`}>
      <Sidebar
        view={view}
        playlists={playlists}
        sourceConfigured={sourceConfigured}
        sourceStatus={playbackSourceStatus}
        sourceName={selectedSourceName}
        onNavigate={navigate}
        onOpenPlaylist={openPlaylist}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <div className="app-stage">
        <TopBar
          view={view}
          query={query}
          sourceConfigured={sourceConfigured}
          sourceStatus={playbackSourceStatus}
          themeMode={themeMode}
          onQueryChange={setQuery}
          onSearch={() => void performSearch()}
          onOpenSettings={() => setSettingsOpen(true)}
          onCycleTheme={cycleTheme}
        />
        <main className="app-content">{renderView()}</main>
      </div>

      <SidePanel
        open={sidePanelOpen}
        tab={sidePanelTab}
        queue={queue}
        currentTrack={currentTrack}
        currentTime={currentTime}
        resolving={resolving}
        lyricLoading={lyricLoading}
        onTabChange={setSidePanelTab}
        onClose={() => setSidePanelOpen(false)}
        onPlayTrack={(track) => void playTrack(track)}
        onRemoveTrack={removeFromQueue}
        onClearQueue={clearQueue}
      />

      <PlayerBar
        currentTrack={currentTrack}
        playing={playing}
        resolving={resolving}
        currentTime={currentTime}
        duration={duration}
        volume={volume}
        muted={muted}
        repeat={repeat}
        shuffle={shuffle}
        favorite={Boolean(currentTrack && favoriteKeys.has(currentTrack.key))}
        sidePanelOpen={sidePanelOpen}
        sidePanelTab={sidePanelTab}
        onTogglePlay={() => void togglePlay()}
        onPrevious={playPrevious}
        onNext={skipNext}
        onSeek={seek}
        onVolume={changeVolume}
        onToggleMute={toggleMute}
        onToggleRepeat={() =>
          setRepeat((value) => (value === "off" ? "all" : value === "all" ? "one" : "off"))
        }
        onToggleShuffle={() => setShuffle((value) => !value)}
        onFavorite={() => currentTrack && toggleFavorite(currentTrack)}
        onOpenQueue={() => openSidePanel("queue")}
        onOpenLyrics={() => openSidePanel("lyrics")}
        onOpenNowPlaying={() => setNowPlayingOpen(true)}
      />

      <NowPlayingSheet
        open={nowPlayingOpen}
        track={currentTrack}
        playing={playing}
        currentTime={currentTime}
        duration={duration}
        volume={volume}
        muted={muted}
        favorite={Boolean(currentTrack && favoriteKeys.has(currentTrack.key))}
        onClose={() => setNowPlayingOpen(false)}
        onTogglePlay={() => void togglePlay()}
        onPrevious={playPrevious}
        onNext={skipNext}
        onSeek={seek}
        onVolume={changeVolume}
        onToggleMute={toggleMute}
        onFavorite={() => currentTrack && toggleFavorite(currentTrack)}
        onOpenLyrics={() => openSidePanel("lyrics")}
        onOpenQueue={() => openSidePanel("queue")}
      />

      <SourceManagerModal
        open={settingsOpen}
        sourceConfig={sourceConfig}
        quality={quality}
        onClose={() => setSettingsOpen(false)}
        onImport={importSourceAndSync}
        onRemove={removeSourceAndSync}
        onTest={testSourceAndSync}
        onSave={saveSettings}
      />

      <audio
        ref={audioRef}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onDurationChange={(event) =>
          setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)
        }
        onEnded={onAudioEnded}
        onError={handleAudioError}
      />

      {toast && (
        <div className="toast" role="status" key={toast.id}>
          <AlertCircle />
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}

export default App;
