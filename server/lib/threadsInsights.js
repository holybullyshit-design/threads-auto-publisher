// Threads 공식 Insights API로 계정별 실제 조회수/좋아요/답글/리포스트/팔로워 수를 가져와
// data/insights-cache.json에 캐싱한다. (관제탑 "성과 분석" 섹션이 이 캐시를 읽어서 보여준다)
//
// - 계정 레벨: GET /{threadsUserId}/threads_insights (조회수 일별 시계열 + 좋아요/답글/리포스트/인용/팔로워 총합)
// - 글 레벨:   GET /{publishedId}/insights (그 글의 조회수/좋아요/답글/리포스트/인용/공유)
//
// threads_manage_insights 스코프를 OAuth 요청에 명시하지 않았어도, 이 앱은 각 계정이 전부
// "이 Meta 개발자 앱의 테스터/관리자"이기 때문에(자기 계정으로 자기 앱을 씀) 개발 모드에서
// 바로 호출이 된다 - 실측 확인함(2026-08-30). 그래서 재연결/재인증 없이 바로 쓸 수 있다.
//
// API 호출량을 줄이려고:
//   - 계정 레벨은 1시간, 글 레벨은 6시간 지나야 다시 가져온다.
//   - 글 레벨은 계정당 최근 발행 글 12개까지만 추적한다(무한정 늘어나지 않게).
//   - 계정 하나 끝날 때마다 캐시 파일에 바로 써서, 중간에 하나 실패해도 앞서 받은 건 남는다.

const fs = require("fs");
const path = require("path");
const accountsStore = require("./accountsStore");
const scheduleStore = require("./scheduleStore");

const DATA_DIR = path.join(__dirname, "..", "..", "data");
const CACHE_FILE = path.join(DATA_DIR, "insights-cache.json");

const GRAPH_BASE = "https://graph.threads.net/v1.0";
const ACCOUNT_METRICS = "views,likes,replies,reposts,quotes,followers_count";
const MEDIA_METRICS = "views,likes,replies,reposts,quotes,shares";

const ACCOUNT_MAX_AGE_MS = 60 * 60 * 1000; // 1시간
const MEDIA_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6시간
const MEDIA_LOOKBACK_COUNT = 12;

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(CACHE_FILE)) fs.writeFileSync(CACHE_FILE, "{}", "utf8");
}

function readCache() {
  ensureFile();
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
  } catch {
    return {};
  }
}

function writeCache(cache) {
  ensureFile();
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), "utf8");
}

async function callGraph(pathSuffix, params) {
  const url = new URL(GRAPH_BASE + pathSuffix);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    const err = new Error(data?.error?.message || `Threads Insights API 오류 (${res.status})`);
    err.code = data?.error?.code;
    throw err;
  }
  return data;
}

// total_value 형태(합계형)와 values[] 시계열 형태(views처럼 day별로 오는 것) 둘 다 지원.
function metricValue(entry) {
  if (!entry) return 0;
  if (typeof entry.total_value?.value === "number") return entry.total_value.value;
  if (Array.isArray(entry.values) && entry.values.length) {
    return entry.values.reduce((sum, v) => sum + (Number(v.value) || 0), 0);
  }
  return 0;
}

function seriesValues(entry) {
  if (!entry || !Array.isArray(entry.values)) return [];
  return entry.values.map((v) => ({
    date: v.end_time ? v.end_time.slice(0, 10) : null,
    value: Number(v.value) || 0,
  }));
}

async function fetchAccountInsights(account, { days = 14 } = {}) {
  const until = Math.floor(Date.now() / 1000);
  const since = until - days * 86400;
  const data = await callGraph(`/${account.threadsUserId}/threads_insights`, {
    metric: ACCOUNT_METRICS,
    since,
    until,
    access_token: account.accessToken,
  });
  const byName = {};
  (data.data || []).forEach((m) => {
    byName[m.name] = m;
  });
  return {
    fetchedAt: new Date().toISOString(),
    viewsDaily: seriesValues(byName.views),
    likes: metricValue(byName.likes),
    replies: metricValue(byName.replies),
    reposts: metricValue(byName.reposts),
    quotes: metricValue(byName.quotes),
    followersCount: byName.followers_count?.total_value?.value ?? null,
  };
}

async function fetchMediaInsights(account, mediaId) {
  const data = await callGraph(`/${mediaId}/insights`, {
    metric: MEDIA_METRICS,
    access_token: account.accessToken,
  });
  const byName = {};
  (data.data || []).forEach((m) => {
    byName[m.name] = m;
  });
  return {
    fetchedAt: new Date().toISOString(),
    views: metricValue(byName.views),
    likes: metricValue(byName.likes),
    replies: metricValue(byName.replies),
    reposts: metricValue(byName.reposts),
    quotes: metricValue(byName.quotes),
    shares: metricValue(byName.shares),
  };
}

async function refreshAccount(account, posts, { force = false } = {}) {
  const cache = readCache();
  const entry = cache[account.id] || {};
  entry.media = entry.media || {};

  const accountStale =
    force || !entry.account || Date.now() - new Date(entry.account.fetchedAt).getTime() > ACCOUNT_MAX_AGE_MS;
  if (accountStale) {
    try {
      entry.account = await fetchAccountInsights(account);
      entry.accountError = null;
    } catch (err) {
      entry.accountError = err.message;
    }
  }

  const recentPublished = posts
    .filter((p) => p.accountId === account.id && p.platform !== "instagram" && p.status === "published" && p.publishedId)
    .sort((a, b) => new Date(b.publishedAt || b.scheduledAt) - new Date(a.publishedAt || a.scheduledAt))
    .slice(0, MEDIA_LOOKBACK_COUNT);

  // 최대 12개 글을 순차로 가져오면 계정 하나에도 몇 초씩 걸린다 - 동시에 가져온다.
  // 글 하나 실패해도 나머지는 계속 진행되고(Promise.allSettled), 기존 캐시가 있으면 그대로 둔다.
  const toFetch = recentPublished.filter((post) => {
    const cached = entry.media[post.publishedId];
    return force || !cached || Date.now() - new Date(cached.fetchedAt).getTime() > MEDIA_MAX_AGE_MS;
  });
  const fetched = await Promise.allSettled(toFetch.map((post) => fetchMediaInsights(account, post.publishedId)));
  fetched.forEach((result, i) => {
    if (result.status !== "fulfilled") return;
    const post = toFetch[i];
    entry.media[post.publishedId] = {
      ...result.value,
      postId: post.id,
      text: String(post.text || "").replace(/\s+/g, " ").slice(0, 60),
      scheduledAt: post.scheduledAt,
      publishedAt: post.publishedAt,
    };
  });

  cache[account.id] = entry;
  writeCache(cache);
  return entry;
}

async function refreshAll({ force = false } = {}) {
  const accounts = accountsStore
    .listAccounts({ includeSecrets: true })
    .filter((a) => a.threadsUserId && a.accessToken);
  const posts = await scheduleStore.listSchedule();
  const results = {};
  for (const account of accounts) {
    results[account.id] = await refreshAccount(account, posts, { force });
  }
  return results;
}

function getCache() {
  return readCache();
}

module.exports = { fetchAccountInsights, fetchMediaInsights, refreshAccount, refreshAll, getCache };
