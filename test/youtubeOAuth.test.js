const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

test("YouTube OAuth URL은 오프라인 토큰과 최소 업로드 권한을 요청한다", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "youtube-oauth-"));
  const file = path.join(dir, "client.json");
  fs.writeFileSync(file, JSON.stringify({ web: { client_id: "client-id", client_secret: "secret", redirect_uris: ["https://example.com/oauth/youtube/callback"] } }));
  const before = process.env.YOUTUBE_OAUTH_CLIENT_FILE;
  process.env.YOUTUBE_OAUTH_CLIENT_FILE = file;
  delete require.cache[require.resolve("../server/lib/youtubeOAuth")];
  const oauth = require("../server/lib/youtubeOAuth");
  const url = new URL(oauth.buildAuthorizeUrl("state-123"));
  assert.equal(url.searchParams.get("state"), "state-123");
  assert.equal(url.searchParams.get("access_type"), "offline");
  assert.match(url.searchParams.get("prompt"), /consent/);
  assert.match(url.searchParams.get("scope"), /youtube\.upload/);
  assert.equal(url.searchParams.get("redirect_uri"), "https://example.com/oauth/youtube/callback");
  if (before === undefined) delete process.env.YOUTUBE_OAUTH_CLIENT_FILE; else process.env.YOUTUBE_OAUTH_CLIENT_FILE = before;
});
