const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const store = require("../server/lib/instagramAuthStore");

let tempDir;
let legacyPath;
let accountsPath;
let oauthPath;

function digest(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

test.beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "instagram-accounts-"));
  legacyPath = path.join(tempDir, "instagram-auth.json");
  accountsPath = path.join(tempDir, "instagram-accounts.json");
  oauthPath = path.join(tempDir, "instagram-oauth-config.json");
  process.env.INSTAGRAM_AUTH_PATH = legacyPath;
  process.env.INSTAGRAM_ACCOUNTS_PATH = accountsPath;
  process.env.INSTAGRAM_OAUTH_CONFIG_PATH = oauthPath;
  fs.writeFileSync(legacyPath, JSON.stringify({ userId: "palja-id", accessToken: "palja-token", expiresAt: 1234 }));
});

test.afterEach(() => {
  delete process.env.INSTAGRAM_AUTH_PATH;
  delete process.env.INSTAGRAM_ACCOUNTS_PATH;
  delete process.env.INSTAGRAM_OAUTH_CONFIG_PATH;
  delete process.env.INSTAGRAM_USER_ID;
  delete process.env.INSTAGRAM_ACCESS_TOKEN;
  delete process.env.INSTAGRAM_TOKEN_EXPIRES_AT;
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("기존 팔자명가 인증을 변경하지 않고 다계정 파일을 초기화한다", () => {
  const before = digest(legacyPath);
  const result = store.initializeFromLegacy();
  assert.equal(result.created, true);
  assert.equal(result.activeAccountKey, "palja");
  assert.equal(result.accounts[0].label, "팔자명가");
  assert.equal(result.accounts[0].username, "saju_orbit");
  assert.equal(digest(legacyPath), before);
  assert.equal(process.env.INSTAGRAM_ACCESS_TOKEN, "palja-token");
});

test("연리지 계정을 추가해도 팔자명가 토큰과 기본 선택을 덮어쓰지 않는다", () => {
  store.initializeFromLegacy();
  const legacyBefore = digest(legacyPath);
  store.saveAccount({ key: "yeonliji", label: "연리지 실타래", username: "yeonliji", userId: "yeonliji-id", accessToken: "yeonliji-token", expiresAt: 5678 });
  const state = store.listAccounts();
  assert.equal(state.activeAccountKey, "palja");
  assert.equal(state.accounts.length, 2);
  assert.equal(state.accounts.some((account) => Object.hasOwn(account, "accessToken")), false);
  assert.equal(store.getCredentials("palja").accessToken, "palja-token");
  assert.equal(store.getCredentials("yeonliji").accessToken, "yeonliji-token");
  assert.equal(digest(legacyPath), legacyBefore);
});

test("활성 계정 전환은 명시적으로 요청할 때만 수행한다", () => {
  store.initializeFromLegacy();
  store.saveAccount({ key: "yeonliji", label: "연리지 실타래", userId: "yeonliji-id", accessToken: "yeonliji-token" });
  const state = store.setActiveAccount("yeonliji");
  assert.equal(state.activeAccountKey, "yeonliji");
  assert.equal(process.env.INSTAGRAM_USER_ID, "yeonliji-id");
  assert.equal(process.env.INSTAGRAM_ACCESS_TOKEN, "yeonliji-token");
});
