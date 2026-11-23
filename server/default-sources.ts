export interface DefaultSource {
  slug: string;
  name: string;
  description: string;
  url: string;
  mirrorUrl: string;
}

const RAW_BASE =
  "https://raw.githubusercontent.com/pdone/lx-music-source/main";
const MIRROR_BASE =
  "https://gh-proxy.org/raw.githubusercontent.com/pdone/lx-music-source/main";

function source(
  slug: string,
  name: string,
  description: string,
): DefaultSource {
  return {
    slug,
    name,
    description,
    url: `${RAW_BASE}/${slug}/latest.js`,
    mirrorUrl: `${MIRROR_BASE}/${slug}/latest.js`,
  };
}

// LX is intentionally excluded: upstream removed it after confirming that it
// could load child_process and execute a forced shutdown in a Node-capable host.
export const DEFAULT_SOURCES: DefaultSource[] = [
  source("changqing", "ChangQing", "长青 SVIP 音源，作为默认主音源。"),
  source("fish", "Fish", "Fish Music 音源。"),
  source("flower", "Flower", "Flower 聚合音源。"),
  source("grass", "Grass", "Grass 聚合音源。"),
  source("helloworld", "HelloWorld", "HelloWorld 聚合音源。"),
  source("huanyin", "HuanYin", "幻音音源。"),
  source("huibq", "Huibq", "Huibq 音源。"),
  source("hyw", "HYW", "HYWmusic 公益版音源。"),
  source("ikun", "ikun", "ikun 音源。"),
  source("jiexiang", "JieXiang", "JieXiang 音源。"),
  source("juhe", "JuheApi", "结构简单的聚合 API 音源。"),
  source("qdy", "QDY", "QDY 聚合音源。"),
  source("sixyin", "SixYin", "SixYin 音源。"),
  source("xinghai", "XingHai", "星海聚合音源。"),
  source("yuningxi", "YuNingXi", "YuNingXi 音源。"),
];

export const DEFAULT_PRIMARY_SLUG = "changqing";

export const DEFAULT_SOURCE_URLS = new Set(
  DEFAULT_SOURCES.flatMap((item) => [item.url, item.mirrorUrl]),
);
