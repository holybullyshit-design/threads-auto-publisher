const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_CLIENT_FILE = path.resolve(__dirname, "..", "private", "youtube-oauth-client.json");
const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const CHANNELS_ENDPOINT = "https://www.googleapis.com/youtube/v3/channels";
const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
];

function fail(message, status = 500, code = "YOUTUBE_OAUTH_ERROR") {
  return Object.assign(new Error(message), { status, code });
}

function loadClientConfig(filePath = process.env.YOUTUBE_OAUTH_CLIENT_FILE || DEFAULT_CLIENT_FILE) {
  if (process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET) {
    return {
      clientId: String(process.env.YOUTUBE_CLIENT_ID),
      clientSecret: String(process.env.YOUTUBE_CLIENT_SECRET),
      redirectUri: String(process.env.YOUTUBE_REDIRECT_URI || "https://threads-publish-pinger.threadsautopub.workers.dev/oauth/youtube/callback"),
    };
  }
  if (!fs.existsSync(filePath)) throw fail("YouTube OAuth 클라이언트 파일이 없습니다.", 503, "YOUTUBE_OAUTH_NOT_CONFIGURED");
  let parsed;
  try { parsed = JSON.parse(fs.readFileSync(filePath, "utf8")); }
  catch { throw fail("YouTube OAuth 클라이언트 파일을 읽을 수 없습니다.", 500, "YOUTUBE_OAUTH_INVALID_CONFIG"); }
  const client = parsed.web || parsed.installed;
  if (!client?.client_id || !client?.client_secret) throw fail("YouTube OAuth 클라이언트 ID 또는 비밀키가 없습니다.", 500, "YOUTUBE_OAUTH_INVALID_CONFIG");
  const redirectUri = process.env.YOUTUBE_REDIRECT_URI || (client.redirect_uris || []).find((uri) => uri.includes("/oauth/youtube/callback"));
  if (!redirectUri) throw fail("YouTube OAuth 리디렉션 URI가 없습니다.", 500, "YOUTUBE_OAUTH_INVALID_CONFIG");
  return { clientId: String(client.client_id), clientSecret: String(client.client_secret), redirectUri: String(redirectUri) };
}

function isConfigured() {
  try { loadClientConfig(); return true; } catch { return false; }
}

function buildAuthorizeUrl(state) {
  if (!state) throw fail("OAuth state가 필요합니다.", 400);
  const config = loadClientConfig();
  const url = new URL(AUTH_ENDPOINT);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent select_account");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);
  return url.toString();
}

async function tokenRequest(body) {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(30000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw fail(`Google OAuth 토큰 처리 실패: ${data.error_description || data.error || response.status}`, 502, "YOUTUBE_TOKEN_ERROR");
  return data;
}

async function exchangeCode(code) {
  if (!code) throw fail("Google 승인 코드가 없습니다.", 400);
  const config = loadClientConfig();
  return tokenRequest({ code, client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: config.redirectUri, grant_type: "authorization_code" });
}

async function refreshAccessToken(refreshToken) {
  if (!refreshToken) throw fail("YouTube 갱신 토큰이 없습니다.", 401, "YOUTUBE_REFRESH_TOKEN_MISSING");
  const config = loadClientConfig();
  return tokenRequest({ refresh_token: refreshToken, client_id: config.clientId, client_secret: config.clientSecret, grant_type: "refresh_token" });
}

async function fetchOwnChannel(accessToken) {
  const url = new URL(CHANNELS_ENDPOINT);
  url.searchParams.set("part", "id,snippet");
  url.searchParams.set("mine", "true");
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(30000) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw fail(`YouTube 채널 확인 실패: ${data.error?.message || response.status}`, 502, "YOUTUBE_CHANNEL_LOOKUP_FAILED");
  const channel = data.items?.[0];
  if (!channel?.id) throw fail("선택한 Google 계정에 YouTube 채널이 없습니다.", 422, "YOUTUBE_CHANNEL_NOT_FOUND");
  return { id: String(channel.id), title: String(channel.snippet?.title || "") };
}

module.exports = { SCOPES, loadClientConfig, isConfigured, buildAuthorizeUrl, exchangeCode, refreshAccessToken, fetchOwnChannel };
