const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const client = require("../server/lib/youtubeClient");

test("YouTube first test upload must remain private", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "youtube-client-"));
  const filePath = path.join(dir, "short.mp4");
  fs.writeFileSync(filePath, "video");
  assert.doesNotThrow(() => client.assertPrivateShort({ filePath, title: "test", privacyStatus: "private" }));
  assert.throws(() => client.assertPrivateShort({ filePath, title: "test", privacyStatus: "public" }), /비공개만/);
});

test("YouTube multipart body contains metadata and exact media bytes", () => {
  const media = Buffer.from([0, 1, 2, 3, 255]);
  const result = client.multipartBody({ snippet: { title: "팔자명가" } }, media);
  assert.match(result.boundary, /^codex_youtube_/);
  assert.ok(result.body.includes(Buffer.from("팔자명가")));
  assert.ok(result.body.includes(media));
  assert.ok(result.body.toString("latin1").endsWith(`--${result.boundary}--\r\n`));
});
