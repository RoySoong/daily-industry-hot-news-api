const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");

const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || "0.0.0.0";
const ROOT = __dirname;
const SNAPSHOT_FILE = path.join(ROOT, "data", "snapshots.json");
const TOUTIAO_HOT_ENDPOINTS = (
  process.env.TOUTIAO_HOT_ENDPOINTS ||
  process.env.TOUTIAO_HOT_ENDPOINT ||
  "https://api.vvhan.com/api/hotlist/toutiao,https://api.52vmy.cn/api/wl/hot?type=toutiao,https://api.cenguigui.cn/api/hotlist.php?type=toutiao"
)
  .split(",")
  .map((endpoint) => endpoint.trim())
  .filter(Boolean);
const UPSTREAM_TIMEOUT_MS = Number(process.env.UPSTREAM_TIMEOUT_MS || 9000);
const HOT_CACHE_TTL_MS = Number(process.env.HOT_CACHE_TTL_MS || 180000);
const USER_AGENTS = {
  desktop:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  mobile:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  tablet:
    "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
};
let hotCache = {};
let mediaCache = {};
const REDFOX_API_KEY = process.env.REDFOX_API_KEY || "";
const REDFOX_BASE_URL = process.env.REDFOX_BASE_URL || "https://redfox.hk";
const REDFOX_ENDPOINTS = {
  douyinSearchUser: "/story/api/dyData/searchUser",
  douyinSearchArticle: "/story/api/dyData/searchArticle",
  xhsSearchUser: "/story/api/xhsUser/searchUser",
  xhsSearchArticle: "/story/api/xhsUser/searchArticle",
  gzhSearchUser: "/story/api/gzhData/searchUser",
  gzhWorkList: "/story/api/gzhData/queryWorkList",
};

const platformSearchUrls = {
  微博: (title) => `https://s.weibo.com/weibo?q=${encodeURIComponent(title)}`,
  公众号: (title) => `https://weixin.sogou.com/weixin?type=2&query=${encodeURIComponent(title)}`,
  小红书: (title) => `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(title)}`,
  抖音: (title) => `https://www.douyin.com/search/${encodeURIComponent(title)}`,
  今日头条: (title) => `https://so.toutiao.com/search?keyword=${encodeURIComponent(title)}`,
};

const industryRules = [
  {
    name: "艺术",
    keywords: [
      "艺术",
      "美术",
      "美学",
      "画展",
      "画廊",
      "书画",
      "绘画",
      "雕塑",
      "装置",
      "影像艺术",
      "艺术家",
      "艺术节",
      "双年展",
      "文艺",
      "展览",
      "展演",
      "戏剧",
      "舞台剧",
      "话剧",
      "戏曲",
      "舞蹈",
      "影展",
      "电影节",
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
      "综艺",
      "艺人",
      "明星",
      "嘉宾",
      "游戏",
      "动漫",
      "动画",
    ],
  },
  {
    name: "文化",
    keywords: [
      "博物馆",
      "文博",
      "文物",
      "考古",
      "文化",
      "文旅",
      "公共文化",
      "文化遗产",
      "历史",
      "人文",
      "民俗",
      "民间艺术",
      "展陈",
      "馆藏",
      "策展",
      "展品",
      "非遗",
      "遗址",
      "古籍",
      "艺术馆",
      "美术馆",
      "图书",
      "出版",
      "阅读",
      "读书",
      "全民阅读",
      "荐书",
      "好书",
      "书评",
      "书香",
      "图书馆",
      "文学",
      "作家",
      "作者",
      "新书",
      "书店",
      "书展",
      "书籍",
      "小说",
      "绘本",
      "书单",
      "版权",
    ],
  },
  {
    name: "音乐演出",
    keywords: [
      "音乐",
      "演出",
      "演艺",
      "歌手",
      "演唱会",
      "巡演",
      "专辑",
      "新歌",
      "舞台",
      "音乐节",
      "乐队",
      "票务",
      "开票",
      "音乐会",
      "交响乐",
      "民乐",
      "音乐剧",
      "live",
      "Live",
      "现场",
      "巡回",
      "开唱",
    ],
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

function detectClientProfile(request) {
  const url = new URL(request.url, `http://localhost:${PORT}`);
  const override = url.searchParams.get("device");
  const rawUserAgent = String(request.headers["user-agent"] || "");
  const isTablet = /ipad|tablet|playbook|silk/i.test(rawUserAgent);
  const isMobile = /mobile|iphone|ipod|android.*mobile|windows phone/i.test(rawUserAgent);
  const type = ["desktop", "mobile", "tablet"].includes(override)
    ? override
    : isTablet
      ? "tablet"
      : isMobile
        ? "mobile"
        : "desktop";

  return {
    type,
    rawUserAgent,
    upstreamUserAgent: USER_AGENTS[type] || USER_AGENTS.desktop,
  };
}

function normalizeTitle(title) {
  return String(title || "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
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
  if (
    /博物馆|文博|文物|考古|文化|文旅|公共文化|文化遗产|历史|人文|民俗|民间艺术|展陈|馆藏|策展|展品|非遗|遗址|美术馆|艺术馆|图书|出版|阅读|读书|全民阅读|荐书|好书|书评|书香|图书馆|文学|作家|作者|新书|书店|书展|书籍|小说|绘本|书单|版权/.test(
      title,
    )
  ) {
    return "文化";
  }
  if (/音乐|演出|演艺|歌手|演唱会|巡演|专辑|新歌|舞台|音乐节|乐队|票务|开票|音乐会|交响乐|民乐|音乐剧|live|Live|现场|巡回|开唱/.test(title)) return "音乐演出";

  const hits = industryRules
    .map((rule) => ({
      name: rule.name,
      count: rule.keywords.filter((keyword) => title.includes(keyword)).length,
    }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count);

  return hits[0]?.name || "艺术";
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
  const fitText = item.fit >= 70 ? "行业匹配度较高" : "命中艺术文化相关词，需继续观察";
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

function extractList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.notes)) return payload.notes;
  if (Array.isArray(payload?.feeds)) return payload.feeds;
  if (Array.isArray(payload?.list)) return payload.list;
  if (Array.isArray(payload?.data?.data)) return payload.data.data;
  if (Array.isArray(payload?.data?.list)) return payload.data.list;
  if (Array.isArray(payload?.data?.notes)) return payload.data.notes;
  if (Array.isArray(payload?.data?.items)) return payload.data.items;
  if (Array.isArray(payload?.data?.feeds)) return payload.data.feeds;
  if (Array.isArray(payload?.data?.result?.items)) return payload.data.result.items;
  if (Array.isArray(payload?.data?.result?.notes)) return payload.data.result.notes;
  if (Array.isArray(payload?.data?.result?.feeds)) return payload.data.result.feeds;
  if (Array.isArray(payload?.data?.words)) return payload.data.words;
  if (Array.isArray(payload?.result)) return payload.result;
  if (Array.isArray(payload?.result?.list)) return payload.result.list;
  if (Array.isArray(payload?.result?.items)) return payload.result.items;
  if (Array.isArray(payload?.result?.notes)) return payload.result.notes;
  if (Array.isArray(payload?.result?.newslist)) return payload.result.newslist;
  if (Array.isArray(payload?.newslist)) return payload.newslist;
  return [];
}

function findObjectList(value, depth = 0) {
  if (!value || depth > 6) return [];

  if (Array.isArray(value)) {
    const objectItems = value.filter((item) => item && typeof item === "object");
    if (objectItems.length) return objectItems;
    return [];
  }

  if (typeof value !== "object") return [];

  const preferredKeys = [
    "items",
    "notes",
    "feeds",
    "list",
    "data",
    "result",
    "results",
    "docs",
    "records",
    "contents",
  ];

  for (const key of preferredKeys) {
    const found = findObjectList(value[key], depth + 1);
    if (found.length) return found;
  }

  for (const key of Object.keys(value)) {
    const found = findObjectList(value[key], depth + 1);
    if (found.length) return found;
  }

  return [];
}

function getList(payload) {
  const direct = extractList(payload);
  return direct.length ? direct : findObjectList(payload);
}

function pickTitle(item) {
  const noteCard = item.note_card || item.noteCard || item.note || {};
  const note = item.note || {};
  return normalizeTitle(
    item.title ||
      noteCard.title ||
      noteCard.display_title ||
      noteCard.desc ||
      note.title ||
      note.display_title ||
      note.desc ||
      item.display_title ||
      item.desc ||
      item.word ||
      item.keyword ||
      item.query ||
      item.name ||
      item.hotword ||
      item.topic ||
      item.desc ||
      item.content,
  );
}

function pickUrl(item, platform, title) {
  const noteCard = item.note_card || item.noteCard || item.note || {};
  const noteId = item.id || item.note_id || item.noteId || item.note?.note_id || noteCard.id || noteCard.note_id;
  if (platform === "小红书" && noteId) {
    return `https://www.xiaohongshu.com/explore/${noteId}`;
  }

  return (
    item.url ||
    item.link ||
    item.share_url ||
    item.note_url ||
    item.article_url ||
    item.source_url ||
    platformSearchUrls[platform](title)
  );
}

function pickHotValue(item, fallbackRank) {
  const noteCard = item.note_card || item.noteCard || item.note || {};
  const interactInfo = item.interact_info || item.interactInfo || noteCard.interact_info || noteCard.interactInfo || {};
  return parseHotValue(
    item.hot ||
      item.hotnum ||
      item.hot_value ||
      item.hotValue ||
      item.score ||
      item.heat ||
      item.view_count ||
      item.count ||
      item.readnum ||
      item.read ||
      item.like_count ||
      item.liked_count ||
      interactInfo.liked_count ||
      interactInfo.likedCount ||
      interactInfo.collected_count ||
      interactInfo.comment_count ||
      interactInfo.share_count,
    fallbackRank,
  );
}

async function fetchJsonWithRetry(url, options = {}, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetchJson(url, options);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
      }
    }
  }
  throw lastError;
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      accept: "application/json,text/plain,*/*",
      "user-agent": options.userAgent || USER_AGENTS.desktop,
      ...(options.headers || {}),
    },
    body: options.body,
    signal: controller.signal,
  });
  clearTimeout(timeoutId);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

async function fetchWeibo(clientProfile = {}) {
  const data = await fetchJson("https://api.xhus.cn/api/rweibo?encode=json", {
    userAgent: clientProfile.upstreamUserAgent,
  });
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

async function fetchDouyin(clientProfile = {}) {
  const data = await fetchJson("https://api.xhus.cn/api/rdouyin?encode=json", {
    userAgent: clientProfile.upstreamUserAgent,
  });
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

async function fetchToutiao(clientProfile = {}) {
  const errors = [];

  for (const endpoint of TOUTIAO_HOT_ENDPOINTS) {
    try {
      const data = await fetchJsonWithRetry(
        endpoint,
        {
          userAgent: clientProfile.upstreamUserAgent,
        },
        2,
      );

      const items = getList(data)
        .map((item, index) => {
          const title = pickTitle(item);
          return {
            title,
            platform: "今日头条",
            rank: Number(item.rank || item.index || item.position || item.order || index + 1),
            interactions: pickHotValue(item, index + 1),
            url: pickUrl(item, "今日头条", title),
            fetchedAt: item.event_time
              ? Number(item.event_time) * 1000
              : item.timestamp
                ? Number(item.timestamp) * 1000
                : Date.now(),
          };
        })
        .filter((item) => item.title);

      if (items.length) return items;
      errors.push(`${endpoint}: empty`);
    } catch (error) {
      errors.push(`${endpoint}: ${error.message}`);
    }
  }

  throw new Error(`今日头条热榜源暂不可用：${errors.join("；")}`);
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

function compactItem(item) {
  return {
    title: item.title,
    industry: item.industry,
    platforms: item.platforms,
    sourceUrls: item.sourceUrls,
    interactions: item.interactions,
    bestRank: item.bestRank,
    latestAt: item.latestAt,
    rise: item.rise,
    freshness: item.freshness,
    fit: item.fit,
    score: item.score,
    reason: item.reason,
  };
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

async function getHotItems(clientProfile = { type: "desktop", upstreamUserAgent: USER_AGENTS.desktop }) {
  const cacheKey = clientProfile.type || "desktop";
  const cached = hotCache[cacheKey];
  if (cached && Date.now() - cached.cachedAt < HOT_CACHE_TTL_MS) {
    return { ...cached.payload, cached: true };
  }

  const previousSnapshot = await readPreviousSnapshot();
  const sourceFetchers = [
    ["微博", fetchWeibo],
    ["抖音", fetchDouyin],
    ["今日头条", fetchToutiao],
  ];
  const settled = await Promise.allSettled(sourceFetchers.map(([, fetcher]) => fetcher(clientProfile)));
  const sources = settled.map((result, index) => ({
    platform: sourceFetchers[index][0],
    ok: result.status === "fulfilled",
    error: result.status === "rejected" ? result.reason.message : "",
    count: result.status === "fulfilled" ? result.value.length : 0,
  }));
  const rawItems = settled.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
  const mergedItems = mergeItems(rawItems, previousSnapshot);
  const items = (mergedItems.length ? mergedItems : buildFallbackItems()).map(compactItem);

  if (mergedItems.length) await writeSnapshot(items);

  const payload = {
    updatedAt: new Date().toISOString(),
    clientDevice: clientProfile.type,
    live: mergedItems.length > 0,
    sources,
    items,
  };

  hotCache[cacheKey] = {
    cachedAt: Date.now(),
    payload,
  };

  return payload;
}

function normalizeMediaName(name) {
  return normalizeTitle(name).replace(/\s+/g, "").replace(/微信公众号|公众号|新闻客户端|客户端$/g, "");
}

function getPublishedAt(item) {
  const value = item.publish_time || item.publishTime || item.create_time || item.time || item.timestamp;
  if (!value) return 0;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return Date.parse(value) || 0;
  return numeric > 1000000000000 ? numeric : numeric * 1000;
}

function formatDateForRedfox(date) {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const pick = (type) => parts.find((part) => part.type === type)?.value || "";
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

function isWithinRecentDays(timestamp, days = 7) {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return false;
  return Date.now() - timestamp <= days * 24 * 60 * 60 * 1000;
}

function getAccountCandidateName(item, platform) {
  if (platform === "抖音") return normalizeTitle(item.nickname || item.accountName || item.accountId || item.uid);
  if (platform === "小红书") return normalizeTitle(item.accountName || item.nickname || item.accountId || item.userId);
  return normalizeTitle(item.accountName || item.nickname || item.account || item.name);
}

function getAccountCandidateId(item, platform) {
  if (platform === "抖音") return normalizeTitle(item.accountId || item.displayId || item.uid || item.shortId);
  if (platform === "小红书") return normalizeTitle(item.accountId || item.userId);
  return normalizeTitle(item.account || item.accountName);
}

function pickAccountCandidate(list, accountName, platform) {
  const normalizedTarget = normalizeMediaName(accountName);
  return (
    list.find((item) => normalizeMediaName(getAccountCandidateName(item, platform)) === normalizedTarget) ||
    list.find((item) => normalizeMediaName(getAccountCandidateName(item, platform)).includes(normalizedTarget)) ||
    list[0] ||
    null
  );
}

function isSameAccountWork(item, accountName, accountId, platform) {
  const target = normalizeMediaName(accountName);
  const id = normalizeMediaName(accountId);
  const names =
    platform === "抖音"
      ? [item.accountName, item.authorId, item.authorLink]
      : [item.accountNickname, item.accountUserid, item.accountName, item.authorId];
  const normalizedNames = names.map(normalizeMediaName).filter(Boolean);
  return normalizedNames.some((value) => value === target || value.includes(target) || value === id || value.includes(id));
}

function getAccountWorkTime(item, platform) {
  if (platform === "小红书") return getPublishedAt({ publishTime: item.workPublishTime });
  return getPublishedAt(item);
}

function mapRedfoxWork(item, platform, accountName) {
  const title = normalizeTitle(
    platform === "小红书"
      ? item.workTitle || item.workDesc
      : item.title || item.content || item.summary,
  );
  const publishedAt = getAccountWorkTime(item, platform);
  const mediaName = normalizeTitle(
    platform === "抖音"
      ? item.accountName || accountName
      : platform === "小红书"
        ? item.accountNickname || accountName
        : item.author || item.accountName || accountName,
  );
  return {
    title,
    platform,
    mediaName,
    mediaLevel: "",
    industry: detectIndustry(`${title} ${item.content || ""} ${item.summary || ""} ${item.workDesc || ""}`),
    publishedAt,
    url: item.workUrl || item.sourceUrl || item.url || getPlatformUrl(platform, title),
    matchReason: `${platform}账号「${mediaName}」近一周发布内容`,
    rank: 0,
    readCount: item.readCount || item.workReadedCount || item.playCount || 0,
    likeCount: item.likeCount || item.workLikedCount || 0,
    commentCount: item.commentCount || item.workCommentsCount || 0,
    coverUrl: item.coverUrl || "",
  };
}

async function postRedfox(endpoint, body, clientProfile) {
  if (!REDFOX_API_KEY) throw new Error("未配置 REDFOX_API_KEY");
  return fetchJsonWithRetry(
    `${REDFOX_BASE_URL}${endpoint}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        REDFOX_API_KEY,
      },
      body: JSON.stringify(body),
      userAgent: clientProfile.upstreamUserAgent,
    },
    2,
  );
}

async function fetchRedfoxAccountSearch(platform, accountName, clientProfile) {
  const endpoint =
    platform === "抖音"
      ? REDFOX_ENDPOINTS.douyinSearchUser
      : platform === "小红书"
        ? REDFOX_ENDPOINTS.xhsSearchUser
        : REDFOX_ENDPOINTS.gzhSearchUser;
  const sortType = platform === "公众号" ? "_0" : "default";
  const data = await postRedfox(endpoint, { keyword: accountName, offset: 0, sortType }, clientProfile);
  return getList(data);
}

async function fetchRedfoxSearchWorks(platform, accountName, accountId, clientProfile) {
  const endpoint = platform === "抖音" ? REDFOX_ENDPOINTS.douyinSearchArticle : REDFOX_ENDPOINTS.xhsSearchArticle;
  const data = await postRedfox(endpoint, { keyword: accountName, offset: 0, sortType: "default" }, clientProfile);
  return getList(data)
    .filter((item) => isSameAccountWork(item, accountName, accountId, platform))
    .filter((item) => isWithinRecentDays(getAccountWorkTime(item, platform), 7))
    .map((item) => mapRedfoxWork(item, platform, accountName));
}

async function fetchRedfoxGzhWorks(accountCandidate, accountName, clientProfile) {
  const end = new Date();
  const start = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const account = accountCandidate?.account || accountCandidate?.accountName || accountName;
  const data = await postRedfox(
    REDFOX_ENDPOINTS.gzhWorkList,
    {
      account,
      accountName: accountCandidate?.accountName || accountName,
      offset: 0,
      sortType: "_2",
      publishTimeStart: formatDateForRedfox(start),
      publishTimeEnd: formatDateForRedfox(end),
    },
    clientProfile,
  );
  return getList(data)
    .filter((item) => isWithinRecentDays(getAccountWorkTime(item, "公众号"), 7))
    .map((item) => mapRedfoxWork(item, "公众号", accountCandidate?.accountName || accountName));
}

async function fetchAccountPlatformFeed(platform, accountName, clientProfile) {
  const accountList = await fetchRedfoxAccountSearch(platform, accountName, clientProfile);
  const accountCandidate = pickAccountCandidate(accountList, accountName, platform);
  if (!accountCandidate) {
    return {
      platform,
      ok: false,
      error: "未找到匹配账号",
      account: null,
      items: [],
    };
  }

  const resolvedName = getAccountCandidateName(accountCandidate, platform) || accountName;
  const accountId = getAccountCandidateId(accountCandidate, platform);
  const items =
    platform === "公众号"
      ? await fetchRedfoxGzhWorks(accountCandidate, resolvedName, clientProfile)
      : await fetchRedfoxSearchWorks(platform, resolvedName, accountId, clientProfile);

  return {
    platform,
    ok: true,
    error: "",
    account: {
      name: resolvedName,
      id: accountId,
      avatar: accountCandidate.avatarUrl || accountCandidate.accountAvatar || "",
      followers: accountCandidate.followerCount || accountCandidate.accountFans || 0,
    },
    items,
  };
}

async function fetchAccountFeed(clientProfile, filters = {}) {
  const accountName = normalizeTitle(filters.account || "");
  const platforms = String(filters.platforms || "抖音,小红书,公众号")
    .split(",")
    .map((platform) => platform.trim())
    .filter((platform) => ["抖音", "小红书", "公众号"].includes(platform));
  const cacheKey = `account:${clientProfile.type}:${accountName}:${platforms.join("|")}`;
  const cached = mediaCache[cacheKey];
  if (cached && Date.now() - cached.cachedAt < HOT_CACHE_TTL_MS) {
    return { ...cached.payload, cached: true };
  }

  if (!accountName) {
    return {
      updatedAt: new Date().toISOString(),
      clientDevice: clientProfile.type,
      live: false,
      sources: [],
      items: [],
      message: "请输入账号名称后再保存监测。",
    };
  }

  if (!REDFOX_API_KEY) {
    return {
      updatedAt: new Date().toISOString(),
      clientDevice: clientProfile.type,
      live: false,
      sources: [],
      items: [],
      message: "未配置 REDFOX_API_KEY。请在 Render 环境变量中添加后重新部署。",
    };
  }

  const settled = await Promise.allSettled(
    platforms.map((platform) => fetchAccountPlatformFeed(platform, accountName, clientProfile)),
  );
  const sources = settled.map((result, index) =>
    result.status === "fulfilled"
      ? {
          platform: result.value.platform,
          ok: result.value.ok,
          error: result.value.error,
          account: result.value.account,
          count: result.value.items.length,
        }
      : {
          platform: platforms[index],
          ok: false,
          error: result.reason?.message || "接口请求失败",
          account: null,
          count: 0,
        },
  );
  const items = settled
    .flatMap((result) => (result.status === "fulfilled" ? result.value.items : []))
    .filter((item) => item.title && item.url)
    .sort((a, b) => b.publishedAt - a.publishedAt)
    .filter((item, index, list) => list.findIndex((other) => other.platform === item.platform && other.url === item.url) === index)
    .slice(0, 120)
    .map((item, index) => ({ ...item, rank: index + 1 }));

  const payload = {
    updatedAt: new Date().toISOString(),
    clientDevice: clientProfile.type,
    account: accountName,
    platforms,
    live: items.length > 0,
    sources,
    items,
    message: items.length
      ? ""
      : "暂未匹配到该账号近一周内容。抖音/小红书第一版通过作品搜索按作者过滤，若账号名不唯一，可后续改为保存账号 ID。",
  };

  mediaCache[cacheKey] = {
    cachedAt: Date.now(),
    payload,
  };
  return payload;
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
      sendJson(response, 200, await getHotItems(detectClientProfile(request)));
      return;
    }

    if (request.url.startsWith("/api/account-feed")) {
      const url = new URL(request.url, `http://localhost:${PORT}`);
      sendJson(
        response,
        200,
        await fetchAccountFeed(detectClientProfile(request), {
          account: url.searchParams.get("account") || "",
          platforms: url.searchParams.get("platforms") || "",
        }),
      );
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
