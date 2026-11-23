import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { HttpError, requestText, type ResponseData } from "./http";

const MAX_REDIRECTS = 5;
const PRIVATE_HOST_SUFFIXES = [".localhost", ".local", ".internal", ".home", ".lan"];

function isPrivateIpv4(address: string) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return true;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateIpv6(address: string) {
  const normalized = address.toLowerCase().split("%")[0];
  if (normalized === "::" || normalized === "::1") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (/^fe[89ab]/.test(normalized) || normalized.startsWith("ff")) return true;
  if (normalized.startsWith("::ffff:")) {
    const mapped = normalized.slice("::ffff:".length);
    return isIP(mapped) === 4 ? isPrivateIpv4(mapped) : true;
  }
  return false;
}

export function isPrivateAddress(address: string) {
  const version = isIP(address);
  if (version === 4) return isPrivateIpv4(address);
  if (version === 6) return isPrivateIpv6(address);
  return true;
}

function privateHostname(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return (
    normalized === "localhost" ||
    PRIVATE_HOST_SUFFIXES.some((suffix) => normalized.endsWith(suffix))
  );
}

function hostPolicy(
  hostname: string,
  environmentKey: "SOURCE_ALLOWED_HOSTS" | "MEDIA_ALLOWED_HOSTS",
): "any" | "allowed" | "blocked" {
  const configured = (process.env[environmentKey] ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  if (!configured.length) return "any";
  return configured.some(
    (allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`),
  )
    ? "allowed"
    : "blocked";
}

async function assertPublicUrl(
  value: string | URL,
  environmentKey: "SOURCE_ALLOWED_HOSTS" | "MEDIA_ALLOWED_HOSTS",
) {
  let url: URL;
  try {
    url = value instanceof URL ? new URL(value) : new URL(value);
  } catch {
    throw new HttpError("请输入有效的 HTTP(S) 音源地址", 400);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new HttpError("音源地址必须使用 HTTP 或 HTTPS", 400);
  }
  if (url.username || url.password) {
    throw new HttpError("音源地址不能包含用户名或密码", 400);
  }
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!hostname) throw new HttpError("音源地址缺少主机名", 400);
  const policy = hostPolicy(hostname, environmentKey);
  if (policy === "blocked") {
    throw new HttpError(`域名不在 ${environmentKey} 白名单中`, 400);
  }
  if (process.env.ALLOW_PRIVATE_SOURCE_URLS === "1" || policy === "allowed") return url;
  if (privateHostname(hostname)) {
    throw new HttpError("出于安全原因，不能从本机或内网地址导入音源", 400);
  }
  if (isIP(hostname) && isPrivateAddress(hostname)) {
    throw new HttpError("出于安全原因，不能从本机或内网地址导入音源", 400);
  }
  if (!isIP(hostname)) {
    let addresses: Array<{ address: string }>;
    try {
      addresses = await lookup(hostname, { all: true, verbatim: true });
    } catch {
      throw new HttpError("无法解析音源域名", 400);
    }
    if (!addresses.length || addresses.some((item) => isPrivateAddress(item.address))) {
      throw new HttpError("音源域名解析到了内网地址，已拒绝导入", 400);
    }
  }
  return url;
}

export function assertPublicHttpUrl(value: string | URL) {
  return assertPublicUrl(value, "SOURCE_ALLOWED_HOSTS");
}

export function assertPublicMediaUrl(value: string | URL) {
  return assertPublicUrl(value, "MEDIA_ALLOWED_HOSTS");
}

export async function requestPublicText(
  sourceUrl: string,
  options: RequestInit = {},
  timeoutMs = 20_000,
  maxBytes = 9_100_000,
): Promise<ResponseData> {
  let current = await assertPublicHttpUrl(sourceUrl);
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const response = await requestText(
      current.toString(),
      { ...options, redirect: "manual" },
      timeoutMs,
      maxBytes,
    );
    if (![301, 302, 303, 307, 308].includes(response.statusCode)) return response;
    const location = response.headers.get("location");
    if (!location) throw new HttpError("音源重定向缺少目标地址", 400);
    current = await assertPublicHttpUrl(new URL(location, current));
  }
  throw new HttpError("音源重定向次数过多", 400);
}
