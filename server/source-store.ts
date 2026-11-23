import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import type {
  LxSource,
  SourceCapability,
  SourceConfig,
  SourceInfo,
  SourceStatus,
} from "./types";

interface StoredSource {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  homepage: string;
  sourceUrl?: string;
  importedAt: number;
  scriptHash: string;
  scriptGzip: string;
  capabilities: Partial<Record<LxSource, SourceCapability>>;
  status: SourceStatus;
}

interface StoredData {
  version: 1;
  sources: StoredSource[];
  primaryId: string;
  backupIds: string[];
}

const MAX_SOURCES = 20;
const HEADER_FIELDS = ["name", "description", "version", "author", "homepage"] as const;

function parseHeader(script: string) {
  const header = /^\/\*[\s\S]+?\*\//.exec(script)?.[0];
  if (!header) throw new Error("不是有效的洛雪音源脚本：缺少头部说明");
  const values: Record<(typeof HEADER_FIELDS)[number], string> = {
    name: "",
    description: "",
    version: "",
    author: "",
    homepage: "",
  };
  for (const line of header.split(/\r?\n/)) {
    const match = /^\s*\*\s*@(\w+)\s+(.+)$/.exec(line);
    if (!match) continue;
    const key = match[1] as (typeof HEADER_FIELDS)[number];
    if (HEADER_FIELDS.includes(key)) values[key] = match[2].trim();
  }
  values.name ||= `未命名音源 ${new Date().toLocaleString("zh-CN")}`;
  values.name = values.name.slice(0, 64);
  values.description = values.description.slice(0, 160);
  values.version = values.version.slice(0, 40);
  values.author = values.author.slice(0, 80);
  values.homepage = values.homepage.slice(0, 1024);
  return values;
}

function sourceInfo(source: StoredSource): SourceInfo {
  const { scriptGzip: _scriptGzip, scriptHash: _scriptHash, ...info } = source;
  return structuredClone(info);
}

function normalizeStatus(value: unknown): SourceStatus {
  const status =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : {};
  const state =
    status.state === "ready" || status.state === "error" ? status.state : "idle";
  return {
    state,
    message: typeof status.message === "string" ? status.message.slice(0, 1024) : undefined,
    checkedAt: Number.isFinite(Number(status.checkedAt))
      ? Number(status.checkedAt)
      : undefined,
  };
}

function normalizeSource(value: unknown): StoredSource | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const source = value as Record<string, unknown>;
  if (
    typeof source.id !== "string" ||
    typeof source.scriptGzip !== "string" ||
    typeof source.scriptHash !== "string"
  ) {
    return undefined;
  }
  return {
    id: source.id,
    name: typeof source.name === "string" ? source.name : "未命名音源",
    description: typeof source.description === "string" ? source.description : "",
    version: typeof source.version === "string" ? source.version : "",
    author: typeof source.author === "string" ? source.author : "",
    homepage: typeof source.homepage === "string" ? source.homepage : "",
    sourceUrl: typeof source.sourceUrl === "string" ? source.sourceUrl : undefined,
    importedAt: Number.isFinite(Number(source.importedAt))
      ? Number(source.importedAt)
      : Date.now(),
    scriptHash: source.scriptHash,
    scriptGzip: source.scriptGzip,
    capabilities:
      typeof source.capabilities === "object" && source.capabilities !== null
        ? (source.capabilities as StoredSource["capabilities"])
        : {},
    status: normalizeStatus(source.status),
  };
}

export class SourceStore {
  private readonly file: string;
  private data: StoredData;

  constructor(dataDir = process.env.MUSIC_DATA_DIR || path.join(process.cwd(), "data")) {
    mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    this.file = path.join(dataDir, "sources.json");
    this.data = this.read();
  }

  private preserveCorruptFile() {
    if (!existsSync(this.file)) return;
    const backup = `${this.file}.corrupt-${Date.now()}`;
    try {
      renameSync(this.file, backup);
      chmodSync(backup, 0o600);
    } catch {
      // A read-only data directory should not prevent the app from starting.
    }
  }

  private read(): StoredData {
    if (!existsSync(this.file)) {
      return { version: 1, sources: [], primaryId: "", backupIds: [] };
    }
    try {
      const parsed = JSON.parse(readFileSync(this.file, "utf8")) as Partial<StoredData>;
      const rawSources = Array.isArray(parsed.sources) ? parsed.sources : [];
      const sources = rawSources
        .map(normalizeSource)
        .filter((source): source is StoredSource => Boolean(source));
      const ids = new Set(sources.map((source) => source.id));
      const primaryId = ids.has(parsed.primaryId ?? "") ? parsed.primaryId! : sources[0]?.id ?? "";
      const backupIds = (Array.isArray(parsed.backupIds) ? parsed.backupIds : []).filter(
        (id, index, list) => ids.has(id) && id !== primaryId && list.indexOf(id) === index,
      );
      return { version: 1, sources, primaryId, backupIds };
    } catch {
      this.preserveCorruptFile();
      return { version: 1, sources: [], primaryId: "", backupIds: [] };
    }
  }

  private save() {
    const temp = `${this.file}.tmp`;
    writeFileSync(temp, JSON.stringify(this.data, null, 2), {
      encoding: "utf8",
      mode: 0o600,
    });
    renameSync(temp, this.file);
    chmodSync(this.file, 0o600);
  }

  list(): SourceInfo[] {
    return this.data.sources.map(sourceInfo);
  }

  config(): SourceConfig {
    return {
      sources: this.list(),
      primaryId: this.data.primaryId,
      backupIds: [...this.data.backupIds],
    };
  }

  getScript(id: string) {
    const source = this.data.sources.find((item) => item.id === id);
    if (!source) throw new Error("音源不存在");
    return gunzipSync(Buffer.from(source.scriptGzip, "base64")).toString("utf8");
  }

  getSource(id: string) {
    const source = this.data.sources.find((item) => item.id === id);
    if (!source) throw new Error("音源不存在");
    return sourceInfo(source);
  }

  import(scriptRaw: string, sourceUrl?: string) {
    const script = scriptRaw.trim();
    if (!script) throw new Error("音源脚本为空");
    if (Buffer.byteLength(script, "utf8") > 9_000_000) throw new Error("音源脚本超过 9 MB");
    if (this.data.sources.length >= MAX_SOURCES) throw new Error(`最多只能保存 ${MAX_SOURCES} 个音源`);
    const scriptHash = createHash("sha256").update(script).digest("hex");
    if (this.data.sources.some((source) => source.scriptHash === scriptHash)) {
      throw new Error("这个音源已经导入过了");
    }
    const info = parseHeader(script);
    const source: StoredSource = {
      id: `source_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      ...info,
      sourceUrl,
      importedAt: Date.now(),
      scriptHash,
      scriptGzip: gzipSync(Buffer.from(script, "utf8")).toString("base64"),
      capabilities: {},
      status: { state: "idle" },
    };
    this.data.sources.push(source);
    if (!this.data.primaryId) this.data.primaryId = source.id;
    this.save();
    return sourceInfo(source);
  }

  remove(id: string) {
    const index = this.data.sources.findIndex((source) => source.id === id);
    if (index < 0) throw new Error("音源不存在");
    this.data.sources.splice(index, 1);
    this.data.backupIds = this.data.backupIds.filter((item) => item !== id);
    if (this.data.primaryId === id) {
      this.data.primaryId = this.data.sources[0]?.id ?? "";
    }
    this.save();
    return this.config();
  }

  setSelection(primaryId: string, backupIds: string[]) {
    const known = new Set(this.data.sources.map((source) => source.id));
    if (primaryId && !known.has(primaryId)) throw new Error("主音源不存在");
    this.data.primaryId = primaryId || this.data.sources[0]?.id || "";
    this.data.backupIds = backupIds.filter(
      (id, index, list) =>
        id !== this.data.primaryId &&
        known.has(id) &&
        list.indexOf(id) === index,
    );
    this.save();
    return this.config();
  }

  setStatus(
    id: string,
    status: SourceStatus,
    capabilities: Partial<Record<LxSource, SourceCapability>> = {},
  ) {
    const source = this.data.sources.find((item) => item.id === id);
    if (!source) return;
    source.status = status;
    source.capabilities = capabilities;
    this.save();
  }
}
