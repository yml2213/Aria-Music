import { useCallback, useEffect, useState } from "react";
import { loadLibrary, saveLibrary } from "../lib/library-storage";
import type { Playlist, Track } from "../types";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "无法读取或保存本地音乐库";
}

export function useLibrary(showToast: (message: string) => void) {
  const [favorites, setFavorites] = useState<Track[]>([]);
  const [recent, setRecent] = useState<Track[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void loadLibrary()
      .then((library) => {
        setFavorites(library.favorites);
        setRecent(library.recent);
        setPlaylists(library.playlists);
      })
      .catch((error) => showToast(errorMessage(error)))
      .finally(() => setReady(true));
  }, [showToast]);

  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => {
      void saveLibrary({ favorites, recent, playlists }).catch((error) =>
        showToast(errorMessage(error)),
      );
    }, 120);
    return () => window.clearTimeout(timer);
  }, [favorites, playlists, ready, recent, showToast]);

  const addRecent = useCallback((track: Track) => {
    setRecent((previous) => [
      track,
      ...previous.filter((item) => item.key !== track.key),
    ].slice(0, 24));
  }, []);

  const toggleFavorite = useCallback(
    (track: Track) => {
      setFavorites((previous) => {
        const exists = previous.some((item) => item.key === track.key);
        showToast(exists ? "已取消收藏" : "已加入收藏");
        return exists
          ? previous.filter((item) => item.key !== track.key)
          : [track, ...previous];
      });
    },
    [showToast],
  );

  const upsertPlaylist = useCallback((playlist: Playlist) => {
    setPlaylists((previous) => [
      playlist,
      ...previous.filter((item) => item.id !== playlist.id),
    ]);
  }, []);

  return {
    favorites,
    recent,
    playlists,
    ready,
    addRecent,
    toggleFavorite,
    upsertPlaylist,
  };
}
