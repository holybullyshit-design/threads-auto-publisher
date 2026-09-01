const test = require("node:test");
const assert = require("node:assert/strict");
const instagramOAuth = require("../server/lib/instagramOAuth");

const ENV_KEYS = ["INSTAGRAM_APP_ID", "INSTAGRAM_APP_SECRET", "INSTAGRAM_REDIRECT_URI"];

function withConfig() {
  process.env.INSTAGRAM_APP_ID = "123456";
  process.env.INSTAGRAM_APP_SECRET = "secret-value";
  process.env.INSTAGRAM_REDIRECT_URI = "http://localhost:4321/oauth/instagram/callback";
}

test.afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
});

test("Instagram 승인 URL은 게시에 필요한 최소 권한과 CSRF state를 포함한다", () => {
  withConfig();
  const url = new URL(instagramOAuth.buildAuthorizeUrl("safe-state"));
  assert.equal(url.origin, "https://www.instagram.com");
  assert.equal(url.pathname, "/oauth/authorize/");
  assert.equal(url.searchParams.get("state"), "safe-state");
  assert.equal(url.searchParams.get("scope"), "instagram_business_basic,instagram_business_content_publish");
  assert.equal(url.searchParams.get("redirect_uri"), process.env.INSTAGRAM_REDIRECT_URI);
  assert.equal(url.searchParams.get("enable_fb_login"), "0");
  assert.equal(url.searchParams.get("force_authentication"), "1");
});

test("Instagram OAuth 설정이 없으면 연결을 시작하지 않는다", () => {
  assert.equal(instagramOAuth.isConfigured(), false);
  assert.throws(() => instagramOAuth.buildAuthorizeUrl("state"), /Instagram 앱 ID/);
});

test("통계 연결에서만 통계 읽기 권한을 추가하고 게시 권한은 유지한다", () => {
  withConfig();
  const url = new URL(instagramOAuth.buildAuthorizeUrl("insights-state", { insights: true }));
  assert.deepEqual(url.searchParams.get("scope").split(","), [
    "instagram_business_basic", "instagram_business_content_publish", "instagram_business_manage_insights",
  ]);
  assert.equal(url.searchParams.get("state"), "insights-state");
  assert.equal(new URL(instagramOAuth.buildAuthorizeUrl("normal")).searchParams.get("scope"), instagramOAuth.SCOPES);
});

test("단기 토큰 응답과 60일 장기 토큰 응답을 정확히 해석한다", async () => {
  withConfig();
  const originalFetch = global.fetch;
  const responses = [
    { ok: true, json: async () => ({ data: [{ access_token: "short", user_id: "9988", permissions: instagramOAuth.SCOPES }] }) },
    { ok: true, json: async () => ({ access_token: "long", expires_in: 5184000 }) },
  ];
  global.fetch = async () => responses.shift();
  try {
    const short = await instagramOAuth.exchangeCode("one-time-code#_");
    const long = await instagramOAuth.exchangeLongToken(short.accessToken);
    assert.deepEqual(short, { accessToken: "short", userId: "9988", permissions: instagramOAuth.SCOPES });
    assert.deepEqual(long, { accessToken: "long", expiresIn: 5184000 });
  } finally {
    global.fetch = originalFetch;
  }
});

test("승인 후 계정 확인은 연결에 필요한 최소 필드만 요청한다", async () => {
  const originalFetch = global.fetch;
  global.fetch = async url => {
    assert.equal(new URL(url).searchParams.get("fields"), "user_id,username");
    return { ok: true, json: async () => ({user_id: "9988", username: "knot_saju"}) };
  };
  try { assert.equal((await instagramOAuth.fetchProfile("test-token")).username, "knot_saju"); }
  finally { global.fetch = originalFetch; }
});
