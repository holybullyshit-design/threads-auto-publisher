const DEFAULT_GRAPH_BASE = "https://graph.instagram.com";
const DEFAULT_GRAPH_VERSION = "v24.0";
const MAX_CAPTION_LENGTH = 2200;

function getConfig(overrides = {}) {
  const userId = overrides.userId || process.env.INSTAGRAM_USER_ID;
  const accessToken = overrides.accessToken || process.env.INSTAGRAM_ACCESS_TOKEN;
  const graphBase = (overrides.graphBase || process.env.INSTAGRAM_GRAPH_BASE || DEFAULT_GRAPH_BASE).replace(/\/$/, "");
  const graphVersion = overrides.graphVersion || process.env.INSTAGRAM_GRAPH_VERSION || DEFAULT_GRAPH_VERSION;
  if (!userId || !accessToken) throw Object.assign(new Error("INSTAGRAM_USER_ID / INSTAGRAM_ACCESS_TOKEN이 설정되지 않았습니다."), { code: "MISSING_INSTAGRAM_CONFIG" });
  return { userId, accessToken, graphBase, graphVersion };
}

function endpoint(config, pathname) {
  return `${config.graphBase}/${config.graphVersion}/${String(pathname).replace(/^\//, "")}`;
}

async function graphRequest(config, pathname, { method = "GET", params = {} } = {}) {
  const values = new URLSearchParams({ ...params, access_token: config.accessToken });
  const url = method === "GET" ? `${endpoint(config, pathname)}?${values}` : endpoint(config, pathname);
  const response = await fetch(url, {
    method,
    headers: method === "GET" ? undefined : { "Content-Type": "application/x-www-form-urlencoded" },
    body: method === "GET" ? undefined : values,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.error) {
    const error = new Error(body.error?.message || `Instagram API ${response.status}`);
    error.code = body.error?.code || `HTTP_${response.status}`;
    error.subcode = body.error?.error_subcode;
    error.status = response.status;
    error.isTransient = Boolean(body.error?.is_transient) || response.status === 429 || response.status >= 500;
    throw error;
  }
  return body;
}

function assertCarousel({ imageUrls, caption }) {
  if (!Array.isArray(imageUrls) || imageUrls.length < 2 || imageUrls.length > 10) throw Object.assign(new Error("인스타그램 캐러셀은 2~10장이어야 합니다."), { code: "INVALID_CAROUSEL" });
  if (caption?.length > MAX_CAPTION_LENGTH) throw Object.assign(new Error("캡션이 2,200자를 초과했습니다."), { code: "INVALID_CAPTION" });
  for (const url of imageUrls) if (!/^https:\/\//.test(url || "")) throw Object.assign(new Error("이미지는 HTTPS 공개 URL이어야 합니다."), { code: "INVALID_IMAGE_URL" });
}

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function waitForContainer(config, id, { timeoutMs = 120000, intervalMs = 2500 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = await graphRequest(config, id, { params: { fields: "status_code,status" } });
    if (status.status_code === "FINISHED") return status;
    if (["ERROR", "EXPIRED"].includes(status.status_code)) throw Object.assign(new Error(`Instagram 미디어 처리 실패: ${status.status || status.status_code}`), { code: "CONTAINER_FAILED" });
    await delay(intervalMs);
  }
  throw Object.assign(new Error("Instagram 미디어 처리 대기 시간을 초과했습니다."), { code: "CONTAINER_TIMEOUT", isTransient: true });
}

async function preflightInstagram(overrides = {}) {
  const config = getConfig(overrides);
  const account = await graphRequest(config, "me", { params: { fields: "id,user_id,username,name,account_type" } });
  const publishingUserId = String(account.user_id || config.userId);
  let publishingLimit = null;
  try { publishingLimit = await graphRequest(config, `${publishingUserId}/content_publishing_limit`, { params: { fields: "quota_usage,config" } }); } catch (error) { publishingLimit = { unavailable: true, reason: error.message }; }
  return { configured: true, account, publishingUserId, publishingLimit, graphVersion: config.graphVersion };
}

async function findPublishedByMarker(marker, overrides = {}) {
  const config = getConfig(overrides);
  const recent = await graphRequest(config, `${config.userId}/media`, { params: { fields: "id,caption,timestamp,permalink", limit: "25" } });
  const match = (recent.data || []).find((media) => (media.caption || "").includes(marker));
  return match || null;
}

async function publishCarousel({ imageUrls, caption, ...overrides }) {
  assertCarousel({ imageUrls, caption });
  const config = getConfig(overrides);
  const children = [];
  for (const imageUrl of imageUrls) {
    const child = await graphRequest(config, `${config.userId}/media`, { method: "POST", params: { media_type: "IMAGE", image_url: imageUrl, is_carousel_item: "true" } });
    await waitForContainer(config, child.id);
    children.push(child.id);
  }
  const parent = await graphRequest(config, `${config.userId}/media`, { method: "POST", params: { media_type: "CAROUSEL", children: children.join(","), caption: caption || "" } });
  await waitForContainer(config, parent.id);
  const published = await graphRequest(config, `${config.userId}/media_publish`, { method: "POST", params: { creation_id: parent.id } });
  return { publishedId: published.id, containerId: parent.id, childContainerIds: children };
}

module.exports = { MAX_CAPTION_LENGTH, assertCarousel, preflightInstagram, publishCarousel, findPublishedByMarker, waitForContainer, graphRequest, getConfig };
