import { createServer } from "node:http";
import { test } from "node:test";
import assert from "node:assert/strict";
import type { IncomingMessage } from "node:http";
import { requestText } from "../../server/http";
import { assertPublicHttpUrl, isPrivateAddress } from "../../server/remote";
import {
  authConfigFromEnv,
  isAuthorized,
  requestIsSameOrigin,
} from "../../server/security";

function request(
  headers: IncomingMessage["headers"],
  method = "POST",
): IncomingMessage {
  return { headers, method } as IncomingMessage;
}

test("private address detection covers common IPv4 and IPv6 ranges", () => {
  assert.equal(isPrivateAddress("127.0.0.1"), true);
  assert.equal(isPrivateAddress("10.2.3.4"), true);
  assert.equal(isPrivateAddress("172.20.0.1"), true);
  assert.equal(isPrivateAddress("192.168.1.1"), true);
  assert.equal(isPrivateAddress("169.254.169.254"), true);
  assert.equal(isPrivateAddress("::1"), true);
  assert.equal(isPrivateAddress("fd00::1"), true);
  assert.equal(isPrivateAddress("8.8.8.8"), false);
  assert.equal(isPrivateAddress("2001:4860:4860::8888"), false);
});

test("public URL validation rejects local destinations", async () => {
  await assert.rejects(() => assertPublicHttpUrl("http://127.0.0.1/source.js"));
  await assert.rejects(() => assertPublicHttpUrl("http://localhost/source.js"));
  await assert.rejects(() => assertPublicHttpUrl("file:///tmp/source.js"));
});

test("basic auth and same-origin checks reject invalid requests", () => {
  const config = authConfigFromEnv({
    REQUIRE_AUTH: "1",
    AUTH_USERNAME: "aria",
    AUTH_PASSWORD: "secret",
  });
  const authorization = `Basic ${Buffer.from("aria:secret").toString("base64")}`;
  assert.equal(isAuthorized(request({ authorization }), config), true);
  assert.equal(
    isAuthorized(
      request({
        authorization: `Basic ${Buffer.from("aria:wrong").toString("base64")}`,
      }),
      config,
    ),
    false,
  );
  assert.equal(
    requestIsSameOrigin(
      request({ origin: "https://music.example.com", host: "music.example.com" }),
    ),
    true,
  );
  assert.equal(
    requestIsSameOrigin(
      request({ origin: "https://evil.example.com", host: "music.example.com" }),
    ),
    false,
  );
  assert.equal(
    requestIsSameOrigin(
      request({
        origin: "https://music.example.com",
        host: "music.example.com",
        "sec-fetch-site": "cross-site",
      }),
    ),
    false,
  );
});

test("required auth fails closed when no password is configured", () => {
  assert.throws(() => authConfigFromEnv({ REQUIRE_AUTH: "1" }), /AUTH_PASSWORD/);
});

test("requestText aborts responses larger than the configured limit", async () => {
  const server = createServer((_request, response) => {
    response.end("x".repeat(2_000));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    await assert.rejects(
      requestText(`http://127.0.0.1:${address.port}/`, {}, 2_000, 100),
      /响应过大/,
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
