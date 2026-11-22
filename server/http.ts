const DEFAULT_TIMEOUT_MS = 15_000;

export class HttpError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 0) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
  }
}

export interface ResponseData {
  statusCode: number;
  statusMessage: string;
  headers: Headers;
  raw: Uint8Array;
  body: unknown;
}

export async function requestText(
  url: string,
  options: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<ResponseData> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0 Safari/537.36",
        ...options.headers,
      },
    });
    const raw = new Uint8Array(await response.arrayBuffer());
    const text = new TextDecoder().decode(raw);
    let body: unknown = text;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    return {
      statusCode: response.status,
      statusMessage: response.statusText,
      headers: response.headers,
      raw,
      body,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new HttpError("请求超时", 408);
    }
    throw new HttpError(error instanceof Error ? error.message : "网络请求失败");
  } finally {
    clearTimeout(timer);
  }
}

export async function requestJson<T>(
  url: string,
  options: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  const response = await requestText(url, options, timeoutMs);
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new HttpError(`上游返回 HTTP ${response.statusCode}`, response.statusCode);
  }
  return response.body as T;
}

export function decodeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .trim();
}

export function decodeBase64Text(value: string) {
  return Buffer.from(value, "base64").toString("utf8");
}

export function sizeText(size: unknown) {
  const value = Number(size);
  if (!Number.isFinite(value) || value <= 0) return undefined;
  const units = ["B", "KB", "MB", "GB"];
  let next = value;
  let unit = 0;
  while (next >= 1024 && unit < units.length - 1) {
    next /= 1024;
    unit += 1;
  }
  return `${next.toFixed(unit === 0 ? 0 : 2)} ${units[unit]}`;
}

export function secondsFromDuration(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 10_000 ? value / 1000 : value;
  }
  const text = String(value ?? "").trim();
  if (!text) return undefined;
  if (/^\d+(?:\.\d+)?$/.test(text)) {
    const number = Number(text);
    return number > 10_000 ? number / 1000 : number;
  }
  const parts = text.split(":").map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return undefined;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

export function isHttpUrl(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 2048 &&
    /^https?:\/\/[^\s]+$/i.test(value.trim())
  );
}
