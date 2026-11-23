import vm from "node:vm";
import {
  constants,
  createCipheriv,
  createHash,
  publicEncrypt,
  randomBytes,
} from "node:crypto";
import zlib from "node:zlib";

let script = "";
let info = {};
let sourceStarted = false;
const EVENT_NAMES = Object.freeze({
  request: "request",
  inited: "inited",
  updateAlert: "updateAlert",
});
const validQualitys = new Set(["128k", "320k", "flac", "flac24bit"]);
const validSources = new Set(["kw", "kg", "tx", "wy", "mg", "local"]);
let requestHandler = null;
let initialized = false;

function post(message) {
  if (process.connected) process.send?.(message);
}

function sanitizeSources(value) {
  const result = {};
  if (!value || typeof value !== "object") return result;
  for (const source of validSources) {
    const item = value[source];
    if (!item || typeof item !== "object" || item.type !== "music") continue;
    const actions = Array.isArray(item.actions)
      ? item.actions.filter((action) => source === "local"
          ? ["musicUrl", "lyric", "pic"].includes(action)
          : action === "musicUrl")
      : [];
    const qualitys = Array.isArray(item.qualitys)
      ? item.qualitys.filter((quality) => validQualitys.has(quality))
      : [];
    result[source] = {
      name: typeof item.name === "string" ? item.name.slice(0, 80) : undefined,
      type: "music",
      actions,
      qualitys,
    };
  }
  return result;
}

function serializeBody(options) {
  const headers = { ...(options.headers ?? {}) };
  let body = options.body;
  if (options.form) {
    const form = new URLSearchParams();
    for (const [key, value] of Object.entries(options.form)) {
      if (Array.isArray(value)) value.forEach((item) => form.append(key, String(item)));
      else if (value != null) form.append(key, String(value));
    }
    body = form;
    if (!Object.keys(headers).some((key) => key.toLowerCase() === "content-type")) {
      headers["content-type"] = "application/x-www-form-urlencoded";
    }
  } else if (options.formData) {
    const form = new FormData();
    for (const [key, value] of Object.entries(options.formData)) {
      if (Array.isArray(value)) value.forEach((item) => form.append(key, String(item)));
      else if (value != null) form.append(key, String(value));
    }
    body = form;
  } else if (body && typeof body === "object" && !(body instanceof ArrayBuffer)) {
    body = JSON.stringify(body);
    if (!Object.keys(headers).some((key) => key.toLowerCase() === "content-type")) {
      headers["content-type"] = "application/json";
    }
  }
  return { headers, body };
}

function lxRequest(url, options = {}, callback = () => {}) {
  const controller = new AbortController();
  const timeout = Math.max(
    1,
    Math.min(Number(options.timeout) > 0 ? Number(options.timeout) : 60_000, 60_000),
  );
  const timer = setTimeout(() => controller.abort(), timeout);
  const { headers, body } = serializeBody(options);
  void fetch(url, {
    method: String(options.method || "GET").toUpperCase(),
    headers,
    body,
    signal: controller.signal,
    redirect: "follow",
  })
    .then(async (response) => {
      const raw = Buffer.from(await response.arrayBuffer());
      const text = raw.toString("utf8");
      let parsed = text;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        parsed = text;
      }
      callback(null, {
        statusCode: response.status,
        statusMessage: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        bytes: raw.length,
        raw,
        body: parsed,
      }, parsed);
    })
    .catch((error) => {
      callback(error instanceof Error ? error : new Error(String(error)), null, null);
    })
    .finally(() => clearTimeout(timer));
  return () => controller.abort();
}

const lx = {
  EVENT_NAMES,
  version: "2.0.0",
  env: "desktop",
  currentScriptInfo: {
    get name() {
      return info.name;
    },
    get description() {
      return info.description;
    },
    get version() {
      return info.version;
    },
    get author() {
      return info.author;
    },
    get homepage() {
      return info.homepage;
    },
    get rawScript() {
      return script;
    },
  },
  request: lxRequest,
  on(eventName, handler) {
    if (eventName !== EVENT_NAMES.request) {
      return Promise.reject(new Error(`不支持的事件：${eventName}`));
    }
    if (typeof handler !== "function") {
      return Promise.reject(new Error("request 事件必须提供函数"));
    }
    requestHandler = handler;
    return Promise.resolve();
  },
  send(eventName, data) {
    if (eventName === EVENT_NAMES.inited) {
      if (initialized) return Promise.reject(new Error("音源已经初始化"));
      if (!data || data.status === false) {
        post({
          type: "init",
          ok: false,
          message:
            typeof data?.message === "string" ? data.message.slice(0, 1024) : "音源初始化失败",
        });
        return Promise.resolve();
      }
      initialized = true;
      post({ type: "init", ok: true, sources: sanitizeSources(data.sources) });
      return Promise.resolve();
    }
    if (eventName === EVENT_NAMES.updateAlert) {
      post({
        type: "updateAlert",
        log: typeof data?.log === "string" ? data.log.slice(0, 1024) : "",
        updateUrl:
          typeof data?.updateUrl === "string" ? data.updateUrl.slice(0, 1024) : undefined,
      });
      return Promise.resolve();
    }
    return Promise.reject(new Error(`不支持的事件：${eventName}`));
  },
  utils: {
    buffer: {
      from(...args) {
        return Buffer.from(...args);
      },
      bufToString(buffer, format) {
        return Buffer.from(buffer).toString(format);
      },
    },
    crypto: {
      aesEncrypt(buffer, mode, key, iv) {
        const cipher = createCipheriv(mode, key, iv);
        return Buffer.concat([cipher.update(buffer), cipher.final()]);
      },
      rsaEncrypt(buffer, key) {
        const normalized = Buffer.concat([Buffer.alloc(128 - buffer.length), buffer]);
        return publicEncrypt(
          { key, padding: constants.RSA_NO_PADDING },
          normalized,
        );
      },
      randomBytes(size) {
        return randomBytes(size);
      },
      md5(value) {
        return createHash("md5").update(value).digest("hex");
      },
    },
    zlib: {
      inflate(buffer) {
        return new Promise((resolve, reject) => {
          zlib.inflate(buffer, (error, result) =>
            error ? reject(error) : resolve(result),
          );
        });
      },
      deflate(buffer) {
        return new Promise((resolve, reject) => {
          zlib.deflate(buffer, (error, result) =>
            error ? reject(error) : resolve(result),
          );
        });
      },
    },
  },
};

function startSource() {
  sourceStarted = true;
  const sandbox = {
    lx,
    console: Object.freeze({
      log() {},
      warn() {},
      error() {},
      info() {},
      debug() {},
    }),
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    queueMicrotask,
    URL,
    URLSearchParams,
    TextEncoder,
    TextDecoder,
    atob,
    btoa,
    AbortController,
  };
  const context = vm.createContext(sandbox, {
    name: `lx-source:${info.name || "unknown"}`,
    codeGeneration: { strings: true, wasm: false },
  });
  context.window = context;
  context.self = context;

  try {
    vm.runInContext(script, context, {
      filename: `${info.name || "lx-source"}.js`,
      timeout: 8_000,
    });
  } catch (error) {
    post({
      type: "init",
      ok: false,
      message: (error instanceof Error ? error.message : String(error)).slice(0, 1024),
    });
  }
}

process.on("message", async (message) => {
  if (message?.type === "init" && !sourceStarted) {
    if (
      typeof message.script !== "string" ||
      !message.info ||
      typeof message.info !== "object"
    ) {
      post({ type: "init", ok: false, message: "音源初始化数据无效" });
      return;
    }
    script = message.script;
    info = message.info;
    startSource();
  } else if (message?.type === "request") {
    if (!sourceStarted) {
      post({
        type: "response",
        requestId: message.requestId,
        ok: false,
        message: "音源尚未初始化",
      });
      return;
    }
    const requestId = message.requestId;
    if (!requestHandler) {
      post({
        type: "response",
        requestId,
        ok: false,
        message: "音源没有注册 request 事件",
      });
      return;
    }
    try {
      const result = await requestHandler.call(
        lx,
        message.data ?? {},
      );
      post({ type: "response", requestId, ok: true, result });
    } catch (error) {
      post({
        type: "response",
        requestId,
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  } else if (message?.type === "dispose") {
    process.exit(0);
  }
});

process.on("disconnect", () => process.exit(0));
