const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "..", "data");
const AUTH_PATH = path.join(DATA_DIR, "instagram-auth.json");
const ACCOUNTS_PATH = path.join(DATA_DIR, "instagram-accounts.json");
const OAUTH_CONFIG_PATH = path.join(DATA_DIR, "instagram-oauth-config.json");

function resolvedPaths() {
  return {
    authPath: process.env.INSTAGRAM_AUTH_PATH || AUTH_PATH,
    accountsPath: process.env.INSTAGRAM_ACCOUNTS_PATH || ACCOUNTS_PATH,
    oauthConfigPath: process.env.INSTAGRAM_OAUTH_CONFIG_PATH || OAUTH_CONFIG_PATH,
  };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function atomicWrite(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(value, null, 2), { mode: 0o600 });
  fs.renameSync(tempPath, filePath);
  try { fs.chmodSync(filePath, 0o600); } catch {}
}

function normalizeAccount(account, fallbackKey) {
  const key = String(account?.key || fallbackKey || "").trim();
  if (!/^[a-z0-9][a-z0-9_-]{1,39}$/.test(key)) throw new Error("Instagram 계정 키가 올바르지 않습니다.");
  const userId = String(account?.userId || "").trim();
  const accessToken = String(account?.accessToken || "").trim();
  if (!userId || !accessToken) throw new Error("Instagram userId와 accessToken이 필요합니다.");
  return {
    key,
    label: String(account?.label || key).trim(),
    username: String(account?.username || "").replace(/^@/, "").trim(),
    userId,
    accessToken,
    expiresAt: Number(account?.expiresAt || 0),
    savedAt: String(account?.savedAt || new Date().toISOString()),
  };
}

function applyToEnvironment(account) {
  if (!account) return;
  process.env.INSTAGRAM_USER_ID = String(account.userId);
  process.env.INSTAGRAM_ACCESS_TOKEN = String(account.accessToken);
  if (account.expiresAt) process.env.INSTAGRAM_TOKEN_EXPIRES_AT = String(account.expiresAt);
  else delete process.env.INSTAGRAM_TOKEN_EXPIRES_AT;
}

function readAccountsFile() {
  const { accountsPath } = resolvedPaths();
  try {
    const data = readJson(accountsPath);
    const accounts = data?.accounts && typeof data.accounts === "object" ? data.accounts : {};
    return { schemaVersion: 1, activeAccountKey: String(data.activeAccountKey || ""), accounts };
  } catch (error) {
    if (error.code !== "ENOENT") console.error("[warn] Instagram 다계정 인증정보 읽기 실패:", error.message);
    return null;
  }
}

function load() {
  const multi = readAccountsFile();
  if (multi) {
    const active = multi.accounts[multi.activeAccountKey];
    if (active?.userId && active?.accessToken) {
      applyToEnvironment(active);
      return {
        configured: true,
        source: "multi-account",
        accountKey: multi.activeAccountKey,
        label: active.label,
        username: active.username,
        userId: String(active.userId),
        expiresAt: Number(active.expiresAt || 0),
      };
    }
  }

  const { authPath } = resolvedPaths();
  try {
    const auth = readJson(authPath);
    if (auth.userId && auth.accessToken) {
      applyToEnvironment(auth);
      return { configured: true, source: "legacy", accountKey: "palja", label: "팔자명가", username: "saju_orbit", userId: String(auth.userId), expiresAt: Number(auth.expiresAt || 0) };
    }
  } catch (error) {
    if (error.code !== "ENOENT") console.error("[warn] Instagram 로컬 인증정보 읽기 실패:", error.message);
  }
  return { configured: false };
}

// 기존 팔자명가 저장 형식은 그대로 보존한다. 이전 코드와 복구 절차의 호환용이다.
function save({ userId, accessToken, expiresAt }) {
  const { authPath } = resolvedPaths();
  atomicWrite(authPath, { userId: String(userId), accessToken, expiresAt: Number(expiresAt), savedAt: new Date().toISOString() });
}

function initializeFromLegacy({ key = "palja", label = "팔자명가", username = "saju_orbit" } = {}) {
  const existing = readAccountsFile();
  if (existing) return { created: false, ...getPublicState(existing) };
  const { authPath, accountsPath } = resolvedPaths();
  const legacy = readJson(authPath);
  const account = normalizeAccount({ ...legacy, key, label, username });
  const data = { schemaVersion: 1, activeAccountKey: key, accounts: { [key]: account } };
  atomicWrite(accountsPath, data);
  applyToEnvironment(account);
  return { created: true, ...getPublicState(data) };
}

function saveAccount(input, { makeActive = false } = {}) {
  const account = normalizeAccount(input);
  const current = readAccountsFile() || { schemaVersion: 1, activeAccountKey: "", accounts: {} };
  current.accounts[account.key] = account;
  if (!current.activeAccountKey || makeActive) current.activeAccountKey = account.key;
  atomicWrite(resolvedPaths().accountsPath, current);
  if (current.activeAccountKey === account.key) applyToEnvironment(account);
  return getPublicAccount(account);
}

function setActiveAccount(key) {
  const current = readAccountsFile();
  if (!current?.accounts?.[key]) throw new Error(`Instagram 계정을 찾을 수 없습니다: ${key}`);
  current.activeAccountKey = key;
  atomicWrite(resolvedPaths().accountsPath, current);
  applyToEnvironment(current.accounts[key]);
  return getPublicState(current);
}

function getCredentials(key) {
  const current = readAccountsFile();
  const selectedKey = key || current?.activeAccountKey;
  const account = current?.accounts?.[selectedKey];
  if (!account) return null;
  return { key: selectedKey, userId: String(account.userId), accessToken: String(account.accessToken), expiresAt: Number(account.expiresAt || 0) };
}

function getPublicAccount(account) {
  return {
    key: account.key,
    label: account.label,
    username: account.username,
    userId: String(account.userId),
    expiresAt: Number(account.expiresAt || 0),
    configured: Boolean(account.userId && account.accessToken),
  };
}

function getPublicState(data = readAccountsFile()) {
  if (!data) return { activeAccountKey: null, accounts: [] };
  return {
    activeAccountKey: data.activeAccountKey || null,
    accounts: Object.values(data.accounts).map(getPublicAccount),
  };
}

function listAccounts() {
  return getPublicState();
}

function loadOAuthConfig() {
  const { oauthConfigPath } = resolvedPaths();
  try {
    const config = readJson(oauthConfigPath);
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
  atomicWrite(resolvedPaths().oauthConfigPath, { appId: String(appId), appSecret: String(appSecret), redirectUri: String(redirectUri) });
}

module.exports = {
  load,
  save,
  initializeFromLegacy,
  saveAccount,
  setActiveAccount,
  getCredentials,
  listAccounts,
  loadOAuthConfig,
  saveOAuthConfig,
  AUTH_PATH,
  ACCOUNTS_PATH,
  OAUTH_CONFIG_PATH,
};
