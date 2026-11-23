import { createHash, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

const INLINE_THEME_SCRIPT_HASH = "sha256-z24+aUxm0el06OcB5mfYUqQSuk65jjleMpj/oQWoi98=";

export interface AuthConfig {
  enabled: boolean;
  required: boolean;
  username: string;
  password: string;
}

function digest(value: string) {
  return createHash("sha256").update(value).digest();
}

function equalText(left: string, right: string) {
  return timingSafeEqual(digest(left), digest(right));
}

export function authConfigFromEnv(env = process.env): AuthConfig {
  const password = env.AUTH_PASSWORD ?? "";
  const required = env.REQUIRE_AUTH === "1";
  if (required && !password) {
    throw new Error("REQUIRE_AUTH=1 时必须设置 AUTH_PASSWORD");
  }
  return {
    enabled: Boolean(password),
    required,
    username: env.AUTH_USERNAME || "aria",
    password,
  };
}

export function applySecurityHeaders(response: ServerResponse) {
  response.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      `script-src 'self' '${INLINE_THEME_SCRIPT_HASH}'`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https: http:",
      "media-src 'self' blob: https: http:",
      "connect-src 'self'",
      "font-src 'self' data:",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "worker-src 'none'",
    ].join("; "),
  );
  response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
}

export function isAuthorized(request: IncomingMessage, config: AuthConfig) {
  if (!config.enabled) return true;
  const header = request.headers.authorization;
  if (!header || !/^Basic\s+/i.test(header)) return false;
  let decoded = "";
  try {
    decoded = Buffer.from(header.replace(/^Basic\s+/i, ""), "base64").toString("utf8");
  } catch {
    return false;
  }
  const separator = decoded.indexOf(":");
  if (separator < 0) return false;
  const usernameMatches = equalText(decoded.slice(0, separator), config.username);
  const passwordMatches = equalText(decoded.slice(separator + 1), config.password);
  return usernameMatches && passwordMatches;
}

export function requestIsSameOrigin(request: IncomingMessage) {
  const method = request.method?.toUpperCase() ?? "GET";
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return true;
  if (request.headers["sec-fetch-site"] === "cross-site") return false;
  const origin = request.headers.origin;
  if (!origin) return true;
  if (origin === "null") return false;
  try {
    const originHost = new URL(origin).host;
    const forwardedHost = request.headers["x-forwarded-host"];
    const host = Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost;
    return originHost === (host || request.headers.host);
  } catch {
    return false;
  }
}
