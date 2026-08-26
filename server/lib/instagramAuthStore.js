const fs = require("fs");
const path = require("path");

const AUTH_PATH = path.join(__dirname, "..", "..", "data", "instagram-auth.json");
const OAUTH_CONFIG_PATH = path.join(__dirname, "..", "..", "data", "instagram-oauth-config.json");

function load() {
  try {
    const auth = JSON.parse(fs.readFileSync(AUTH_PATH, "utf8"));
    if (auth.userId && auth.accessToken) {
      process.env.INSTAGRAM_USER_ID = String(auth.userId);
      process.env.INSTAGRAM_ACCESS_TOKEN = String(auth.accessToken);
      if (auth.expiresAt) process.env.INSTAGRAM_TOKEN_EXPIRES_AT = String(auth.expiresAt);
      return { configured: true, userId: String(auth.userId), expiresAt: Number(auth.expiresAt || 0) };
    }
  } catch (error) {
    if (error.code !== "ENOENT") console.error("[warn] Instagram 로컬 인증정보 읽기 실패:", error.message);
  }
  return { configured: false };
}

function save({ userId, accessToken, expiresAt }) {
  fs.mkdirSync(path.dirname(AUTH_PATH), { recursive: true });
  const tempPath = `${AUTH_PATH}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify({ userId: String(userId), accessToken, expiresAt: Number(expiresAt), savedAt: new Date().toISOString() }, null, 2), { mode: 0o600 });
  fs.renameSync(tempPath, AUTH_PATH);
  try { fs.chmodSync(AUTH_PATH, 0o600); } catch {}
}

function loadOAuthConfig() {
  try {
    const config = JSON.parse(fs.readFileSync(OAUTH_CONFIG_PATH, "utf8"));
    if (config.appId && config.appSecret) {
      process.env.INSTAGRAM_APP_ID = String(config.appId);
      process.env.INSTAGRAM_APP_SECRET = String(config.appSecret);
      process.env.INSTAGRAM_REDIRECT_URI = String(config.redirectUri || "https://threads-publish-pinger.threadsautopub.workers.dev/oauth/instagram/callback");
      return { configured: true, appId: String(config.appId) };
    }
  } catch (error) {
    if (error.code !== "ENOENT") console.error("[warn] Instagram OAuth 설정 읽기 실패:", error.message);
  }
  return { configured: false };
}

function saveOAuthConfig({ appId, appSecret, redirectUri }) {
  fs.mkdirSync(path.dirname(OAUTH_CONFIG_PATH), { recursive: true });
  const tempPath = `${OAUTH_CONFIG_PATH}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify({ appId: String(appId), appSecret: String(appSecret), redirectUri: String(redirectUri) }, null, 2), { mode: 0o600 });
  fs.renameSync(tempPath, OAUTH_CONFIG_PATH);
  try { fs.chmodSync(OAUTH_CONFIG_PATH, 0o600); } catch {}
}

module.exports = { load, save, loadOAuthConfig, saveOAuthConfig, AUTH_PATH, OAUTH_CONFIG_PATH };
