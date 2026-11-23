import { expect, test, type Page } from "@playwright/test";

function makeSilentWav(seconds = 2) {
  const sampleRate = 8000;
  const sampleCount = sampleRate * seconds;
  const dataSize = sampleCount * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  return buffer;
}

const sourceConfig = {
  primaryId: "source_test",
  backupIds: [],
  sources: [
    {
      id: "source_test",
      name: "测试音源",
      description: "Playwright 音源",
      version: "1.0.0",
      author: "Aria",
      homepage: "",
      importedAt: Date.now(),
      capabilities: {
        wy: { type: "music", actions: ["musicUrl"], qualitys: ["128k", "flac"] },
        tx: { type: "music", actions: ["musicUrl"], qualitys: ["128k", "flac"] },
        kg: { type: "music", actions: ["musicUrl"], qualitys: ["128k", "flac"] },
        kw: { type: "music", actions: ["musicUrl"], qualitys: ["128k", "flac"] },
      },
      status: { state: "ready", checkedAt: Date.now() },
    },
  ],
};

function track(provider: string, id: string, title: string, artist: string) {
  const lxSource = {
    netease: "wy",
    qq: "tx",
    kugou: "kg",
    kuwo: "kw",
  }[provider] as "wy" | "tx" | "kg" | "kw";
  return {
    key: `${provider}:${id}`,
    provider,
    id,
    title,
    artist,
    album: title === "晴天" ? "叶惠美" : "测试专辑",
    cover: `https://images.test/${provider}.jpg`,
    duration: 180,
    platformMeta: {
      lxSource,
      songmid: id,
      songId: id,
      hash: provider === "kugou" ? `${id}-hash` : undefined,
      qualitys: [
        { type: "128k", size: "4 MB" },
        { type: "flac", size: "30 MB" },
      ],
      qualityMap: {
        "128k": { size: "4 MB" },
        flac: { size: "30 MB" },
      },
    },
  };
}

async function mockMusicServices(page: Page) {
  const audio = makeSilentWav();
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/config") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(sourceConfig),
      });
      return;
    }
    if (url.pathname === "/api/sources/catalog") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ sources: [] }),
      });
      return;
    }
    if (url.pathname === "/api/search") {
      const provider = url.searchParams.get("provider") || "netease";
      const tracks =
        provider === "all"
          ? [
              track("netease", "186016", "晴天", "周杰伦"),
              track("netease", "186017", "七里香", "周杰伦"),
              track("qq", "qq-id", "夜曲", "周杰伦"),
              track("kugou", "kugou-id", "稻香", "周杰伦"),
              track("kuwo", "kuwo-id", "洋葱", "周杰伦"),
            ]
          : provider === "netease"
          ? [
              track("netease", "186016", "晴天", "周杰伦"),
              track("netease", "186017", "七里香", "周杰伦"),
            ]
          : [
              track(
                provider,
                `${provider}-id`,
                provider === "qq" ? "夜曲" : provider === "kugou" ? "稻香" : "洋葱",
                "周杰伦",
              ),
            ];
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ tracks }),
      });
      return;
    }
    if (url.pathname === "/api/track/resolve") {
      const body = route.request().postDataJSON();
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          track: body.track,
          url: "https://media.test/audio.wav",
          quality: "128k",
          sourceId: "source_test",
          sourceName: "测试音源",
        }),
      });
      return;
    }
    if (url.pathname === "/api/track/lyric") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          lyric: "[00:00.00]故事的小黄花\n[00:03.00]从出生那年就飘着",
          translatedLyric: "",
        }),
      });
      return;
    }
    if (url.pathname === "/api/playlists/netease/5202687076") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          id: "5202687076",
          title: "华语经典",
          creator: "Aria",
          trackCount: 2,
          importedAt: Date.now(),
          tracks: [
            track("netease", "186016", "晴天", "周杰伦"),
            track("netease", "186018", "稻香", "周杰伦"),
          ],
        }),
      });
      return;
    }
    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ message: "not mocked" }),
    });
  });
  await page.route("https://images.test/**", async (route) => {
    await route.fulfill({ status: 404, body: "" });
  });
  await page.route("https://media.test/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "audio/wav",
      headers: { "Accept-Ranges": "bytes" },
      body: audio,
    });
  });
}

test("configured source opens the existing source manager design", async ({ page }) => {
  await mockMusicServices(page);
  await page.goto("/");
  await expect(page.getByRole("button", { name: /音源已就绪/ }).first()).toBeVisible();
  await page.getByRole("button", { name: /音源已就绪/ }).first().click();
  await expect(page.getByRole("heading", { name: "洛雪音源管理" })).toBeVisible();
  await expect(page.locator(".source-row").first()).toContainText("测试音源");
  await expect(page.locator(".source-row").first()).toContainText("主音源");
});

test("search, playback, lyrics, and playlist import", async ({ page }) => {
  await mockMusicServices(page);
  await page.goto("/");
  await page.locator("#global-search-input").fill("晴天");
  await page.locator(".search-submit").click();
  await expect(page.locator(".track-row")).toHaveCount(5);
  await expect(page.locator(".track-row").first()).toContainText("晴天");

  await page.locator(".track-row").first().click();
  await expect(page.locator(".player-meta strong")).toHaveText("晴天");
  await expect
    .poll(() => page.locator("audio").evaluate((element: HTMLAudioElement) => element.paused))
    .toBe(false);

  await page.getByRole("tab", { name: "歌词" }).click();
  await expect(page.getByText("故事的小黄花")).toBeVisible();

  await page.locator(".sidebar-nav").getByRole("button", { name: "导入歌单" }).click();
  await expect(page.getByRole("heading", { name: "导入歌单" })).toBeVisible();
  await page.getByLabel("网易云歌单 ID 或链接").fill("5202687076");
  await page.getByRole("button", { name: "开始导入", exact: true }).click();
  await expect(page.getByRole("heading", { name: "华语经典" })).toBeVisible();
});

test("mobile layout still avoids horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockMusicServices(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "今天想听什么？" })).toBeVisible();
  await expect(page.locator(".side-panel")).not.toBeInViewport();

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);
});

test("combined search returns all providers through the shared player", async ({ page }) => {
  await mockMusicServices(page);
  await page.goto("/");
  await page.locator("#global-search-input").fill("周杰伦");
  await page.locator(".search-submit").click();
  await expect(page.locator(".track-row")).toHaveCount(5);
  for (const text of ["网易云", "QQ", "酷狗", "酷我"]) {
    await expect(page.locator(".track-table")).toContainText(text);
  }
  const qqRow = page.locator(".track-row").filter({ hasText: "夜曲" });
  await qqRow.click();
  await expect(page.locator(".player-meta strong")).toHaveText("夜曲");
});

test("theme toggle follows system preference and persists explicit modes", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await mockMusicServices(page);
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.getByRole("button", { name: "主题：跟随系统" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(await page.evaluate(() => localStorage.getItem("aria-music:theme"))).toBe('"light"');

  await page.getByRole("button", { name: "主题：亮色" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});
