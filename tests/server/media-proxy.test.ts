import { createServer } from "node:http";
import { test } from "node:test";
import assert from "node:assert/strict";
import { MediaProxy } from "../../server/media-proxy";

test("media proxy forwards range requests without buffering the response", async () => {
  const upstream = createServer((request, response) => {
    assert.equal(request.headers.range, "bytes=0-3");
    response.writeHead(206, {
      "Accept-Ranges": "bytes",
      "Content-Length": "4",
      "Content-Range": "bytes 0-3/8",
      "Content-Type": "audio/wav",
    });
    response.end("abcd");
  });
  await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  const upstreamAddress = upstream.address();
  assert.ok(upstreamAddress && typeof upstreamAddress !== "string");

  const proxy = new MediaProxy();
  const proxyServer = createServer((request, response) => {
    const token = new URL(request.url ?? "/", "http://localhost").pathname.split("/").pop();
    assert.ok(token);
    void proxy.handle(request, response, token).catch(() => undefined);
  });
  await new Promise<void>((resolve) => proxyServer.listen(0, "127.0.0.1", resolve));
  const proxyAddress = proxyServer.address();
  assert.ok(proxyAddress && typeof proxyAddress !== "string");

  const previous = process.env.MEDIA_ALLOWED_HOSTS;
  process.env.MEDIA_ALLOWED_HOSTS = "127.0.0.1";
  try {
    const tokenPath = proxy.create(
      `http://127.0.0.1:${upstreamAddress.port}/audio.wav`,
    );
    const response = await fetch(
      `http://127.0.0.1:${proxyAddress.port}${tokenPath}`,
      { headers: { Range: "bytes=0-3" } },
    );
    assert.equal(response.status, 206);
    assert.equal(response.headers.get("content-range"), "bytes 0-3/8");
    assert.equal(await response.text(), "abcd");
  } finally {
    if (previous === undefined) delete process.env.MEDIA_ALLOWED_HOSTS;
    else process.env.MEDIA_ALLOWED_HOSTS = previous;
    await Promise.all([
      new Promise<void>((resolve) => upstream.close(() => resolve())),
      new Promise<void>((resolve) => proxyServer.close(() => resolve())),
    ]);
  }
});

test("media proxy closes an upstream stream that stalls after sending data", async () => {
  const upstream = createServer((_request, response) => {
    response.writeHead(200, {
      "Content-Length": "100",
      "Content-Type": "audio/mpeg",
    });
    response.write("partial");
  });
  await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  const upstreamAddress = upstream.address();
  assert.ok(upstreamAddress && typeof upstreamAddress !== "string");

  const proxy = new MediaProxy({
    headerTimeoutMs: 500,
    streamIdleTimeoutMs: 50,
  });
  const proxyServer = createServer((request, response) => {
    const token = new URL(request.url ?? "/", "http://localhost").pathname.split("/").pop();
    assert.ok(token);
    void proxy.handle(request, response, token).catch(() => undefined);
  });
  await new Promise<void>((resolve) => proxyServer.listen(0, "127.0.0.1", resolve));
  const proxyAddress = proxyServer.address();
  assert.ok(proxyAddress && typeof proxyAddress !== "string");

  const previous = process.env.MEDIA_ALLOWED_HOSTS;
  process.env.MEDIA_ALLOWED_HOSTS = "127.0.0.1";
  try {
    const tokenPath = proxy.create(
      `http://127.0.0.1:${upstreamAddress.port}/stalled.mp3`,
    );
    const response = await fetch(
      `http://127.0.0.1:${proxyAddress.port}${tokenPath}`,
    );
    assert.equal(response.status, 200);

    const drain = async () => {
      try {
        for await (const _chunk of response.body ?? []) {
          // Wait for the proxy idle timeout to terminate the stalled body.
        }
      } catch {
        // A terminated response is the expected outcome.
      }
    };
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("媒体流没有按时终止")),
        1_000,
      );
      void drain().then(
        () => {
          clearTimeout(timer);
          resolve();
        },
        (error) => {
          clearTimeout(timer);
          reject(error);
        },
      );
    });
  } finally {
    if (previous === undefined) delete process.env.MEDIA_ALLOWED_HOSTS;
    else process.env.MEDIA_ALLOWED_HOSTS = previous;
    upstream.closeAllConnections();
    proxyServer.closeAllConnections();
    await Promise.all([
      new Promise<void>((resolve) => upstream.close(() => resolve())),
      new Promise<void>((resolve) => proxyServer.close(() => resolve())),
    ]);
  }
});
