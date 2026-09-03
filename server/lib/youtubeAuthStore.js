const fs = require("node:fs");
const path = require("node:path");

const STORE_FILE = process.env.YOUTUBE_AUTH_STORE || path.resolve(__dirname, "..", "..", "data", "youtube-auth.json");

function load() {
  try {
    const value = JSON.parse(fs.readFileSync(STORE_FILE, "utf8"));
    return value?.refreshToken && value?.channelId ? value : null;
  } catch { return null; }
}

function save(value) {
  if (!value?.refreshToken || !value?.channelId) throw Object.assign(new Error("YouTube 인증 저장값이 올바르지 않습니다."), { status: 400 });
  fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
  const next = { channelId: String(value.channelId), channelTitle: String(value.channelTitle || ""), refreshToken: String(value.refreshToken), scope: String(value.scope || ""), connectedAt: new Date().toISOString() };
  fs.writeFileSync(STORE_FILE, JSON.stringify(next, null, 2), { mode: 0o600 });
  try { fs.chmodSync(STORE_FILE, 0o600); } catch {}
  return next;
}

function publicStatus() {
  const value = load();
  return value ? { connected: true, channelId: value.channelId, channelTitle: value.channelTitle, connectedAt: value.connectedAt } : { connected: false };
}

module.exports = { load, save, publicStatus, STORE_FILE };
