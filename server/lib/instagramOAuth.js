// Instagram Login API OAuth helper.
// Official flow: authorize -> short-lived token -> 60-day token.

const AUTHORIZE_URL = "https://www.instagram.com/oauth/authorize/";
const TOKEN_URL = "https://api.instagram.com/oauth/access_token";
const LONG_TOKEN_URL = "https://graph.instagram.com/access_token";
const REFRESH_URL = "https://graph.instagram.com/refresh_access_token";
const PROFILE_URL = "https://graph.instagram.com/v24.0/me";
const SCOPES = "instagram_business_basic,instagram_business_content_publish";

function getConfig() {
  const appId = process.env.INSTAGRAM_APP_ID;
  const appSecret = process.env.INSTAGRAM_APP_SECRET;
  const redirectUri = process.env.INSTAGRAM_REDIRECT_URI;
  if (!appId || !appSecret || !redirectUri) {
    const error = new Error("Meta 앱의 Instagram 앱 ID·시크릿·리디렉션 URI 설정이 필요합니다.");
    error.code = "MISSING_INSTAGRAM_OAUTH_CONFIG";
    throw error;
  }
  return { appId, appSecret, redirectUri };
}

function isConfigured() {
  return Boolean(process.env.INSTAGRAM_APP_ID && process.env.INSTAGRAM_APP_SECRET && process.env.INSTAGRAM_REDIRECT_URI);
}

function buildAuthorizeUrl(state) {
  const { appId, redirectUri } = getConfig();
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("state", state);
  url.searchParams.set("enable_fb_login", "0");
  url.searchParams.set("force_authentication", "1");
  return url.toString();
}

async function exchangeCode(code) {
  const { appId, appSecret, redirectUri } = getConfig();
  const body = new FormData();
  body.set("client_id", appId);
  body.set("client_secret", appSecret);
  body.set("grant_type", "authorization_code");
  body.set("redirect_uri", redirectUri);
  body.set("code", String(code || "").replace(/#_$/, ""));
  const response = await fetch(TOKEN_URL, { method: "POST", body });
  const data = await response.json().catch(() => ({}));
  const result = Array.isArray(data.data) ? data.data[0] : data;
  if (!response.ok || !result?.access_token || !result?.user_id) {
    throw new Error("Instagram 단기 토큰 교환 실패: " + (data.error_message || data.error?.message || JSON.stringify(data)));
  }
  return { accessToken: result.access_token, userId: String(result.user_id), permissions: result.permissions || "" };
}

async function exchangeLongToken(shortToken) {
  const { appSecret } = getConfig();
  const url = new URL(LONG_TOKEN_URL);
  url.searchParams.set("grant_type", "ig_exchange_token");
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("access_token", shortToken);
  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    throw new Error("Instagram 60일 토큰 교환 실패: " + (data.error?.message || JSON.stringify(data)));
  }
  return { accessToken: data.access_token, expiresIn: Number(data.expires_in || 0) };
}

async function fetchProfile(accessToken) {
  const url = new URL(PROFILE_URL);
  url.searchParams.set("fields", "user_id,username,name,account_type");
  url.searchParams.set("access_token", accessToken);
  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.user_id) {
    throw new Error("Instagram 계정 확인 실패: " + (data.error?.message || JSON.stringify(data)));
  }
  return data;
}

async function refreshLongToken(accessToken) {
  const url = new URL(REFRESH_URL);
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", accessToken);
  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    throw new Error("Instagram 토큰 갱신 실패: " + (data.error?.message || JSON.stringify(data)));
  }
  return { accessToken: data.access_token, expiresIn: Number(data.expires_in || 0) };
}

module.exports = { isConfigured, buildAuthorizeUrl, exchangeCode, exchangeLongToken, fetchProfile, refreshLongToken, SCOPES };
