import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FilePlus2,
  LoaderCircle,
  Music2,
  ShieldCheck,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import type { Playlist } from "../types";

interface ImportViewProps {
  playlistCount: number;
  onBack: () => void;
  onImportPlaylist: (id: string) => Promise<Playlist>;
  onImported: (playlist: Playlist) => void;
}

function normalizePlaylistId(value: string) {
  const input = value.trim();
  if (/^\d+$/.test(input)) return input;
  return (
    /(?:playlist\?id=|\/playlist\/)(\d+)/.exec(input)?.[1] ??
    /[?&]id=(\d+)/.exec(input)?.[1] ??
    ""
  );
}

export function ImportView({
  playlistCount,
  onBack,
  onImportPlaylist,
  onImported,
}: ImportViewProps) {
  const [playlistInput, setPlaylistInput] = useState("");
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (importing) return;
    const id = normalizePlaylistId(playlistInput);
    if (!id) {
      setError("请输入网易云歌单 ID，或粘贴完整的歌单链接。");
      return;
    }
    setImporting(true);
    setError("");
    try {
      const playlist = await onImportPlaylist(id);
      setPlaylistInput("");
      onImported(playlist);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "歌单导入失败，请稍后重试。");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="view import-view">
      <div className="view-heading">
        <div>
          <p className="eyebrow">添加音乐收藏</p>
          <h1>导入歌单</h1>
        </div>
        <button className="secondary-button" type="button" onClick={onBack}>
          <ArrowLeft />
          返回歌单
        </button>
      </div>

      <section className="import-workspace">
        <div className="import-form-panel">
          <span className="import-form-icon">
            <FilePlus2 />
          </span>
          <div className="import-form-copy">
            <p className="eyebrow">网易云音乐</p>
            <h2>把歌单导入到 Aria Music</h2>
            <p>
              粘贴歌单 ID 或歌单链接。导入完成后，完整曲目会保存到本地歌单库。
            </p>
          </div>

          <form className="import-form" onSubmit={submit}>
            <label htmlFor="playlist-import-input">歌单 ID 或链接</label>
            <div className="import-form-row">
              <input
                id="playlist-import-input"
                value={playlistInput}
                onChange={(event) => setPlaylistInput(event.target.value)}
                placeholder="例如 5202687076 或 https://music.163.com/#/playlist?id=..."
                aria-label="网易云歌单 ID 或链接"
                autoComplete="off"
              />
              <button
                className="primary-button"
                type="submit"
                disabled={!playlistInput.trim() || importing}
              >
                {importing ? <LoaderCircle className="spin" /> : <ArrowRight />}
                {importing ? "正在导入" : "开始导入"}
              </button>
            </div>
            {error && (
              <p className="import-error" role="alert">
                {error}
              </p>
            )}
          </form>
        </div>

        <aside className="import-guide">
          <div className="import-guide-heading">
            <Music2 />
            <div>
              <strong>导入说明</strong>
              <span>当前歌单库已有 {playlistCount} 个歌单</span>
            </div>
          </div>
          <ul>
            <li>
              <CheckCircle2 />
              <span>支持公开网易云歌单，导入后保存完整曲目信息。</span>
            </li>
            <li>
              <CheckCircle2 />
              <span>重复导入同一歌单时会更新原有数据，不会重复创建。</span>
            </li>
            <li>
              <ShieldCheck />
              <span>歌单保存在当前浏览器中，播放时再通过音源解析地址。</span>
            </li>
          </ul>
        </aside>
      </section>
    </div>
  );
}
