const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");

const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || "0.0.0.0";
const ROOT = __dirname;
const SNAPSHOT_FILE = path.join(ROOT, "data", "snapshots.json");

const platformSearchUrls = {
  微博: (title) => `https://s.weibo.com/weibo?q=${encodeURIComponent(title)}`,
  公众号: (title) => `https://weixin.sogou.com/weixin?type=2&query=${encodeURIComponent(title)}`,
  小红书: (title) => `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(title)}`,
  抖音: (title) => `https://www.douyin.com/search/${encodeURIComponent(title)}`,
};

const industryRules = [
  {
    name: "影视剧集",
    keywords: [
      "电影",
      "影院",
      "院线",
      "票房",
      "预售",
      "剧",
      "剧集",
      "网剧",
      "电视剧",
      "短剧",
      "演员",
      "导演",
      "定档",
      "杀青",
      "上映",
      "首映",
      "大结局",
    ],
  },
  {
    name: "音乐演出",
    keywords: ["音乐", "歌手", "演唱会", "巡演", "专辑", "新歌", "舞台", "音乐节", "乐队", "票务", "开票"],
  },
  {
    name: "综艺艺人",
    keywords: ["综艺", "艺人", "明星", "嘉宾", "偶像", "路透", "粉丝", "直播", "红毯", "颁奖", "代言"],
  },
  {
    name: "游戏动漫",
    keywords: ["游戏", "手游", "电竞", "动漫", "动画", "漫画", "IP", "二次元", "联动", "预约", "公测"],
  },
];

const fallbackSeeds = [
  "暑期档新片预售热度快速升温",
  "热门剧集大结局带动角色话题霸榜",
  "头部歌手巡演官宣新增城市",
  "音乐节阵容公布后讨论度走高",
  "热门游戏联动动画 IP 带动预约增长",
];

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".png": "image/png",
};

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "content-type",
  });
  response.end(JSON.stringify(payload));
}

function sendText(response, status, text, type = "text/plain; charset=utf-8") {
  response.writeHead(status, { "content-type": type });
  response.end(text);
}

function normalizeTitle(title) {
  return String(title || "")
    .replace(/^#|#$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseHotValue(value, rank = 50) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = String(value || "");
  const numeric = Number(text.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(numeric)) return Math.max(10000, (80 - rank) * 10000);
  if (text.includes("亿")) return numeric * 100000000;
  if (text.includes("万")) return numeric * 10000;
  return numeric;
}

function detectIndustry(title) {
  const hits = industryRules
    .map((rule) => ({
      name: rule.name,
      count: rule.keywords.filter((keyword) => title.includes(keyword)).length,
    }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count);

  return hits[0]?.name || "文化娱乐";
}

function calcFit(title) {
  const totalHits = industryRules.reduce(
    (sum, rule) => sum + rule.keywords.filter((keyword) => title.includes(keyword)).length,
    0,
  );
  return Math.min(100, totalHits * 26);
}

function buildReason(item) {
  const sourceText = item.platforms.join("、");
  const fitText = item.fit >= 70 ? "行业匹配度较高" : "命中文娱相关词，需继续观察";
  return `${sourceText}出现相关热度信号，${fitText}；当前按平台覆盖、热度值、上升速度和新鲜度综合推荐。`;
}

function calcScore(item) {
  const coverage = (item.platforms.length / Object.keys(platformSearchUrls).length) * 100;
  const interactionScore = Math.min(100, Math.round(item.interactions / 120000));
  return Math.round(
    coverage * 0.24 +
      interactionScore * 0.26 +
      item.rise * 0.22 +
      item.freshness * 0.14 +
      item.fit * 0.14,
  );
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      accept: "application/json,text/plain,*/*",
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
    },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

async function fetchWeibo() {
  const data = await fetchJson("https://api.xhus.cn/api/rweibo?encode=json");
  return (data.data || []).map((item, index) => {
    const title = normalizeTitle(item.title || item.word || item.note || item.word_scheme);
    return {
      title,
      platform: "微博",
      rank: Number(item.realpos || item.rank || index + 1),
      interactions: parseHotValue(item.num || item.hot || item.hot_value, index + 1),
      url: item.url || platformSearchUrls.微博(title),
      fetchedAt: Date.now(),
    };
  });
}

async function fetchDouyin() {
  const data = await fetchJson("https://api.xhus.cn/api/rdouyin?encode=json");
  return (data.data || []).map((item, index) => {
    const title = normalizeTitle(item.word || item.sentence || item.title || item.label);
    return {
      title,
      platform: "抖音",
      rank: Number(item.position || item.rank || index + 1),
      interactions: parseHotValue(item.hot_value || item.hotValue, index + 1),
      url: item.share_url || platformSearchUrls.抖音(title),
      fetchedAt: item.event_time ? Number(item.event_time) * 1000 : Date.now(),
    };
  });
}

async function readPreviousSnapshot() {
  try {
    return JSON.parse(await fs.readFile(SNAPSHOT_FILE, "utf8"));
  } catch {
    return {};
  }
}

async function writeSnapshot(items) {
  const snapshot = {};
  items.forEach((item) => {
    snapshot[item.title] = {
      rank: item.bestRank,
      score: item.score,
      interactions: item.interactions,
      platforms: item.platforms,
      savedAt: Date.now(),
    };
  });
  await fs.mkdir(path.dirname(SNAPSHOT_FILE), { recursive: true });
  await fs.writeFile(SNAPSHOT_FILE, JSON.stringify(snapshot, null, 2));
}

function mergeItems(rawItems, previousSnapshot) {
  const merged = new Map();
  rawItems
    .filter((item) => item.title)
    .forEach((item) => {
      const key = item.title.toLowerCase();
      const current = merged.get(key) || {
        title: item.title,
        industry: detectIndustry(item.title),
        platforms: [],
        sourceUrls: {},
        interactions: 0,
        bestRank: 99,
        latestAt: 0,
      };
      if (!current.platforms.includes(item.platform)) current.platforms.push(item.platform);
      current.sourceUrls[item.platform] = item.url || platformSearchUrls[item.platform](item.title);
      current.interactions += item.interactions;
      current.bestRank = Math.min(current.bestRank, item.rank || 99);
      current.latestAt = Math.max(current.latestAt, item.fetchedAt || Date.now());
      merged.set(key, current);
    });

  return [...merged.values()]
    .map((item) => {
      const previous = previousSnapshot[item.title];
      const rankRise = previous ? Math.max(0, previous.rank - item.bestRank) * 8 : 0;
      const rankSignal = Math.max(18, 100 - item.bestRank * 2);
      const freshness = Math.max(55, 100 - Math.floor((Date.now() - item.latestAt) / 3600000) * 8);
      const fit = calcFit(item.title);
      const rise = Math.min(100, Math.round(rankSignal + rankRise));
      const withSignals = { ...item, rise, freshness: Math.min(100, freshness), fit };
      return { ...withSignals, score: calcScore(withSignals), reason: buildReason(withSignals) };
    })
    .filter((item) => item.fit > 0)
    .sort((a, b) => b.score - a.score);
}

function buildFallbackItems() {
  return fallbackSeeds.map((title, index) => {
    const itemPlatforms = index % 2 === 0 ? ["微博", "抖音"] : ["微博", "公众号", "小红书"];
    const item = {
      title,
      industry: detectIndustry(title),
      platforms: itemPlatforms,
      sourceUrls: Object.fromEntries(
        itemPlatforms.map((platform) => [platform, platformSearchUrls[platform](title)]),
      ),
      interactions: 300000 + index * 68000,
      bestRank: index + 1,
      rise: 80 - index * 3,
      freshness: 76,
      fit: Math.max(78, calcFit(title)),
    };
    return {
      ...item,
      score: calcScore(item),
      reason: "实时数据源暂时不可用，当前展示本地兜底热点，并保留各平台搜索入口。",
    };
  });
}

async function getHotItems() {
  const previousSnapshot = await readPreviousSnapshot();
  const settled = await Promise.allSettled([fetchWeibo(), fetchDouyin()]);
  const sources = settled.map((result, index) => ({
    platform: index === 0 ? "微博" : "抖音",
    ok: result.status === "fulfilled",
    error: result.status === "rejected" ? result.reason.message : "",
    count: result.status === "fulfilled" ? result.value.length : 0,
  }));
  const rawItems = settled.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
  const mergedItems = mergeItems(rawItems, previousSnapshot);
  const items = mergedItems.length ? mergedItems : buildFallbackItems();

  if (mergedItems.length) await writeSnapshot(items);

  return {
    updatedAt: new Date().toISOString(),
    live: mergedItems.length > 0,
    sources: [
      ...sources,
      { platform: "公众号", ok: false, error: "需要授权数据源或登录采集配置", count: 0 },
      { platform: "小红书", ok: false, error: "需要授权数据源或登录采集配置", count: 0 },
    ],
    items,
  };
}

async function serveStatic(request, response) {
  const url = new URL(request.url, `http://localhost:${PORT}`);
  const pathname = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const fullPath = path.normalize(path.join(ROOT, pathname));

  if (!fullPath.startsWith(ROOT)) {
    sendText(response, 403, "Forbidden");
    return;
  }

  try {
    const body = await fs.readFile(fullPath);
    response.writeHead(200, {
      "content-type": mimeTypes[path.extname(fullPath)] || "application/octet-stream",
      "cache-control": pathname === "/index.html" ? "no-store" : "public, max-age=3600",
    });
    response.end(body);
  } catch {
    sendText(response, 404, "Not found");
  }
}

const server = http.createServer(async (request, response) => {
  try {
    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, OPTIONS",
        "access-control-allow-headers": "content-type",
      });
      response.end();
      return;
    }

    if (request.url.startsWith("/api/hot")) {
      sendJson(response, 200, await getHotItems());
      return;
    }
    await serveStatic(request, response);
  } catch (error) {
    sendJson(response, 500, { error: error.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`每日行业热讯已启动：http://${HOST}:${PORT}`);
});
