import {
  ArrowDown,
  ArrowUp,
  AudioLines,
  CircleAlert,
  CircleCheck,
  ExternalLink,
  LoaderCircle,
  Plus,
  RefreshCw,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { getSourceRecommendations } from "../lib/api";
import { useDialogFocus } from "../lib/use-dialog-focus";
import type {
  LxSource,
  Quality,
  SourceConfig,
  SourceInfo,
  SourceRecommendation,
} from "../types";

interface SourceManagerModalProps {
  open: boolean;
  sourceConfig: SourceConfig;
  quality: Quality;
  onClose: () => void;
  onImport: (url: string) => Promise<SourceConfig>;
  onRemove: (id: string) => Promise<SourceConfig>;
  onTest: (id: string) => Promise<SourceConfig>;
  onSave: (
    primaryId: string,
    backupIds: string[],
    quality: Quality,
  ) => Promise<void>;
}

const qualityOptions: Array<{ value: Quality; label: string; detail: string }> = [
  { value: "standard", label: "标准音质", detail: "128K，优先保证速度" },
  { value: "lossless", label: "无损音质", detail: "优先 FLAC，失败自动降级" },
  { value: "hires", label: "高解析度", detail: "优先 24bit，失败自动降级" },
  { value: "jymaster", label: "超清母带", detail: "有则使用，没有则逐档降级" },
];

const platformNames: Partial<Record<LxSource, string>> = {
  wy: "网易云",
  tx: "QQ",
  kg: "酷狗",
  kw: "酷我",
  mg: "咪咕",
  local: "本地",
};

function sourceStatusLabel(source: SourceInfo) {
  if (source.status.state === "ready") return "可用";
  if (source.status.state === "error") return source.status.message || "异常";
  return "待初始化";
}

function SourceRow({
  source,
  primary,
  backup,
  backupIndex,
  testing,
  onSetPrimary,
  onToggleBackup,
  onMove,
  onTest,
  onRemove,
}: {
  source: SourceInfo;
  primary: boolean;
  backup: boolean;
  backupIndex: number;
  testing: boolean;
  onSetPrimary: () => void;
  onToggleBackup: () => void;
  onMove: (offset: number) => void;
  onTest: () => void;
  onRemove: () => void;
}) {
  const platforms = Object.entries(source.capabilities)
    .filter(([, value]) => Boolean(value))
    .map(([key]) => platformNames[key as LxSource] ?? key);
  const qualitys = [
    ...new Set(
      Object.values(source.capabilities).flatMap((value) => value?.qualitys ?? []),
    ),
  ];

  return (
    <article className={`source-row ${primary ? "primary" : ""}`}>
      <div className="source-row-main">
        <div className="source-title-line">
          <button
            className={`source-primary-toggle ${primary ? "selected" : ""}`}
            type="button"
            title={primary ? "当前主音源" : "设为主音源"}
            aria-label={primary ? "当前主音源" : `将 ${source.name} 设为主音源`}
            onClick={onSetPrimary}
          >
            {primary ? <CircleCheck /> : <span />}
          </button>
          <strong>{source.name}</strong>
          {source.version && <small>{source.version}</small>}
          <span className={`source-health ${source.status.state}`}>
            {testing ? <LoaderCircle className="spin" /> : <i />}
            {testing ? "检测中" : sourceStatusLabel(source)}
          </span>
        </div>
        <p>{source.description || "洛雪自定义音源"}</p>
        <div className="source-meta">
          {source.author && <span>作者 {source.author}</span>}
          {platforms.length > 0 && <span>{platforms.join(" / ")}</span>}
          {qualitys.length > 0 && <span>{qualitys.join(" / ")}</span>}
        </div>
      </div>

      <div className="source-row-actions">
        {primary ? (
          <span className="source-primary-label">主音源</span>
        ) : (
          <label className="source-backup-toggle">
            <input type="checkbox" checked={backup} onChange={onToggleBackup} />
            <span>{backup ? `备用 ${backupIndex + 1}` : "设为备用"}</span>
          </label>
        )}
        {backup && (
          <div className="source-order-buttons">
            <button
              className="icon-button subtle"
              type="button"
              title="提高备用顺序"
              aria-label="提高备用顺序"
              onClick={() => onMove(-1)}
            >
              <ArrowUp />
            </button>
            <button
              className="icon-button subtle"
              type="button"
              title="降低备用顺序"
              aria-label="降低备用顺序"
              onClick={() => onMove(1)}
            >
              <ArrowDown />
            </button>
          </div>
        )}
        <button
          className="icon-button subtle"
          type="button"
          title="重新检测音源"
          aria-label={`检测 ${source.name}`}
          onClick={onTest}
          disabled={testing}
        >
          <RefreshCw />
        </button>
        <button
          className="icon-button subtle source-remove"
          type="button"
          title="删除音源"
          aria-label={`删除 ${source.name}`}
          onClick={onRemove}
        >
          <Trash2 />
        </button>
      </div>
    </article>
  );
}

export function SourceManagerModal({
  open,
  sourceConfig,
  quality,
  onClose,
  onImport,
  onRemove,
  onTest,
  onSave,
}: SourceManagerModalProps) {
  const [config, setConfig] = useState(sourceConfig);
  const [primaryId, setPrimaryId] = useState(sourceConfig.primaryId);
  const [backupIds, setBackupIds] = useState(sourceConfig.backupIds);
  const [draftQuality, setDraftQuality] = useState<Quality>(quality);
  const [recommendations, setRecommendations] = useState<SourceRecommendation[]>([]);
  const [sourceUrl, setSourceUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState("");
  const [feedback, setFeedback] = useState("");
  const dialogRef = useRef<HTMLElement>(null);

  useDialogFocus(open, onClose, dialogRef);

  const syncConfig = (next: SourceConfig) => {
    setConfig(next);
    setPrimaryId(next.primaryId);
    setBackupIds(next.backupIds);
  };

  useEffect(() => {
    if (!open) return;
    setConfig(sourceConfig);
    setPrimaryId(sourceConfig.primaryId);
    setBackupIds(sourceConfig.backupIds);
    setDraftQuality(quality);
    setSourceUrl("");
    setFeedback("");
    setImporting(false);
    setSaving(false);
    void getSourceRecommendations()
      .then(setRecommendations)
      .catch(() => setRecommendations([]));
  }, [open]);

  if (!open) return null;

  const orderedSources = [...config.sources].sort((left, right) => {
    const order = [primaryId, ...backupIds];
    const leftIndex = order.indexOf(left.id);
    const rightIndex = order.indexOf(right.id);
    return (leftIndex < 0 ? order.length : leftIndex) -
      (rightIndex < 0 ? order.length : rightIndex);
  });

  const setPrimary = (id: string) => {
    const previous = primaryId;
    setPrimaryId(id);
    setBackupIds((current) => {
      const next = current.filter((item) => item !== id);
      if (previous && previous !== id) next.unshift(previous);
      return next;
    });
  };

  const toggleBackup = (id: string) => {
    setBackupIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  };

  const moveBackup = (id: string, offset: number) => {
    setBackupIds((current) => {
      const index = current.indexOf(id);
      const nextIndex = index + offset;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  };

  const submitImport = async (url: string, fallbackUrl?: string) => {
    if (!url.trim() || importing) return;
    setImporting(true);
    setFeedback("");
    try {
      let next: SourceConfig;
      try {
        next = await onImport(url.trim());
      } catch (error) {
        if (!fallbackUrl || fallbackUrl === url) throw error;
        next = await onImport(fallbackUrl);
      }
      syncConfig(next);
      const imported = next.sources.find(
        (source) => !config.sources.some((current) => current.id === source.id),
      );
      if (imported) {
        if (!next.primaryId) setPrimaryId(imported.id);
        else if (imported.id !== next.primaryId) {
          setBackupIds((current) =>
            current.includes(imported.id) ? current : [...current, imported.id],
          );
        }
      }
      setSourceUrl("");
      setFeedback("音源已导入并完成初始化");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "音源导入失败");
    } finally {
      setImporting(false);
    }
  };

  const submitOnlineSource = (event: FormEvent) => {
    event.preventDefault();
    void submitImport(sourceUrl);
  };

  const remove = async (source: SourceInfo) => {
    if (!window.confirm(`删除音源“${source.name}”？`)) return;
    setFeedback("");
    try {
      syncConfig(await onRemove(source.id));
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "删除音源失败");
    }
  };

  const test = async (source: SourceInfo) => {
    setTestingId(source.id);
    setFeedback("");
    try {
      syncConfig(await onTest(source.id));
      setFeedback(`音源“${source.name}”检测完成`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "音源检测失败");
    } finally {
      setTestingId("");
    }
  };

  const submit = async () => {
    if (saving) return;
    setSaving(true);
    setFeedback("");
    try {
      await onSave(primaryId, backupIds, draftQuality);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "保存音源设置失败");
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        className="settings-modal source-settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-heading">
          <span className="modal-icon">
            <AudioLines />
          </span>
          <div>
            <p className="eyebrow">播放与音源</p>
            <h2 id="settings-title">洛雪音源管理</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            title="关闭"
            aria-label="关闭"
            onClick={onClose}
          >
            <X />
          </button>
        </div>

        <div className="source-warning">
          <ShieldAlert />
          <span>
            自定义音源是第三方 JavaScript。脚本在受限子进程中运行，但仍建议只导入你信任的来源。
          </span>
        </div>

        <div className="source-section-heading">
          <div>
            <h3>已导入音源</h3>
            <p>选择一个主音源，并按顺序添加备用音源。</p>
          </div>
          <span>{config.sources.length} / 20</span>
        </div>

        <div className="source-list">
          {orderedSources.length ? (
            orderedSources.map((source) => (
              <SourceRow
                key={source.id}
                source={source}
                primary={source.id === primaryId}
                backup={backupIds.includes(source.id)}
                backupIndex={backupIds.indexOf(source.id)}
                testing={testingId === source.id}
                onSetPrimary={() => setPrimary(source.id)}
                onToggleBackup={() => toggleBackup(source.id)}
                onMove={(offset) => moveBackup(source.id, offset)}
                onTest={() => void test(source)}
                onRemove={() => void remove(source)}
              />
            ))
          ) : (
            <div className="source-empty">
              <CircleAlert />
              <strong>还没有播放音源</strong>
              <span>从推荐音源添加一个，或粘贴洛雪音源脚本地址。</span>
            </div>
          )}
        </div>

        <form className="source-import" onSubmit={submitOnlineSource}>
          <label className="field-label" htmlFor="source-url">
            在线导入音源
          </label>
          <div className="key-field">
            <input
              id="source-url"
              type="url"
              value={sourceUrl}
              onChange={(event) => setSourceUrl(event.target.value)}
              placeholder="https://.../latest.js"
              autoComplete="off"
            />
            <button
              className="primary-button small"
              type="submit"
              disabled={!sourceUrl.trim() || importing}
            >
              {importing ? <LoaderCircle className="spin" /> : <Plus />}
              {importing ? "导入中" : "导入"}
            </button>
          </div>
        </form>

        {recommendations.length > 0 && (
          <div className="source-recommendations">
            <p>推荐音源</p>
            <div>
              {recommendations.map((source) => (
                <button
                  key={source.id}
                  type="button"
                  title={source.description}
                  disabled={importing}
                  onClick={() => void submitImport(source.url, source.mirrorUrl)}
                >
                  <span>{source.name}</span>
                  <Plus />
                </button>
              ))}
            </div>
          </div>
        )}

        <fieldset className="quality-picker source-quality-picker">
          <legend>默认音质</legend>
          {qualityOptions.map((option) => (
            <label
              key={option.value}
              className={draftQuality === option.value ? "selected" : ""}
            >
              <input
                type="radio"
                name="source-quality"
                value={option.value}
                checked={draftQuality === option.value}
                onChange={() => setDraftQuality(option.value)}
              />
              <span>
                <strong>{option.label}</strong>
                <small>{option.detail}</small>
              </span>
            </label>
          ))}
        </fieldset>

        <p className="source-doc-link">
          <ExternalLink />
          音源脚本遵循洛雪自定义源协议，只负责返回播放地址。
        </p>

        <div className="modal-actions">
          <span className="modal-actions-spacer" />
          <button className="secondary-button" type="button" onClick={onClose}>
            取消
          </button>
          <button
            className="primary-button"
            type="button"
            disabled={saving}
            onClick={() => void submit()}
          >
            {saving ? "保存中..." : "保存设置"}
          </button>
        </div>

        {feedback && (
          <p
            className={`connection-feedback ${
              /完成|成功|已导入/.test(feedback) ? "success" : ""
            }`}
            role="status"
          >
            {feedback}
          </p>
        )}
      </section>
    </div>
  );
}
