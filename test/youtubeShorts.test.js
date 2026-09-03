const test = require("node:test");
const assert = require("node:assert/strict");
const shorts = require("../server/lib/youtubeShorts");

function sample(overrides = {}) {
  const post = { platform: "youtube", accountKey: "palja", mediaType: "SHORTS", title: "9월 계약운", text: "#Shorts", videoUrl: "https://cdn.jsdelivr.net/gh/holybullyshit-design/threads-media-host@1234567890123456789012345678901234567890/images/sample.mp4", videoSha256: "a".repeat(64), scheduledAt: "2026-09-04T02:30:00.000Z", privacyStatus: "private", validation: { status: "passed", duration: 8, width: 1080, height: 1920, screenCount: 2, audioSource: "YouTube Audio Library" }, ...overrides };
  post.contentHash = shorts.contentHash(post);
  return post;
}

test("valid reviewed private Palja Short passes", () => assert.doesNotThrow(() => shorts.assertYouTubeShort(sample())));
test("Meta Sound Collection audio is blocked on YouTube", () => assert.throws(() => shorts.assertYouTubeShort(sample({ validation: { status: "passed", duration: 8, width: 1080, height: 1920, screenCount: 2, audioSource: "Meta Sound Collection / Reality" } })), /Meta 전용 음원/));
test("public Short stays blocked until public upload audit is enabled", () => assert.throws(() => shorts.assertYouTubeShort(sample({ privacyStatus: "public" })), /공개 업로드 검증/));
