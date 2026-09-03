const crypto = require("node:crypto");
const youtubeOAuth = require("./youtubeOAuth");
const { uploadVideo, fetchVideo } = require("./youtubeClient");

const EXPECTED_CHANNEL_ID = "UCUsStA-7a8TNT0ENBVNcxWQ";
const digest = (value) => crypto.createHash("sha256").update(value).digest("hex");
const fail = (message, code = "INVALID_YOUTUBE_SHORT") => Object.assign(new Error(message), { code });

function contentHash(post) {
  return digest(JSON.stringify({ platform: post.platform, accountKey: post.accountKey, mediaType: post.mediaType,
    title: post.title, text: post.text, videoUrl: post.videoUrl, videoSha256: post.videoSha256,
    scheduledAt: post.scheduledAt, privacyStatus: post.privacyStatus }));
}

function assertYouTubeShort(post) {
  if (post.platform !== "youtube" || post.accountKey !== "palja" || post.mediaType !== "SHORTS") throw fail("팔자명가 YouTube Shorts 예약이 아닙니다.");
  if (!/^https:\/\/cdn\.jsdelivr\.net\/gh\/holybullyshit-design\/threads-media-host@[a-f0-9]{40}\/images\/[a-zA-Z0-9-]+\.mp4$/.test(post.videoUrl || "")) throw fail("검수한 고정 버전 영상 주소가 아닙니다.");
  if (!/^[a-f0-9]{64}$/.test(post.videoSha256 || "") || post.contentHash !== contentHash(post)) throw fail("YouTube 예약 내용의 무결성 검증에 실패했습니다.", "YOUTUBE_SHORT_INTEGRITY");
  if (post.validation?.status !== "passed" || post.validation?.duration !== 8 || post.validation?.width !== 1080 || post.validation?.height !== 1920 || post.validation?.screenCount !== 2) throw fail("8초·2화면·세로형 검수 증거가 없습니다.", "YOUTUBE_VALIDATION_REQUIRED");
  if (/Meta Sound Collection|Reality/i.test(String(post.validation?.audioSource || ""))) throw fail("Meta 전용 음원은 YouTube에 게시할 수 없습니다.", "YOUTUBE_AUDIO_LICENSE_BLOCKED");
  if (post.privacyStatus === "public" && process.env.YOUTUBE_PUBLIC_UPLOAD_ENABLED !== "1") throw fail("YouTube 공개 업로드 검증이 완료되지 않아 공개 게시를 차단했습니다.", "YOUTUBE_PUBLIC_NOT_ENABLED");
  if (!['private','public'].includes(post.privacyStatus)) throw fail("YouTube 공개 상태가 올바르지 않습니다.");
}

async function publishScheduledShort(post) {
  assertYouTubeShort(post);
  const refreshToken = process.env.YOUTUBE_REFRESH_TOKEN;
  if (!refreshToken) throw fail("YOUTUBE_REFRESH_TOKEN이 없습니다.", "MISSING_YOUTUBE_CONFIG");
  const source = await fetch(post.videoUrl, { signal: AbortSignal.timeout(45000) });
  if (!source.ok) throw fail(`YouTube 원본 영상 접근 실패: HTTP ${source.status}`);
  const video = Buffer.from(await source.arrayBuffer());
  if (digest(video) !== post.videoSha256) throw fail("YouTube 원본 영상이 검수본과 다릅니다.", "YOUTUBE_SHORT_INTEGRITY");
  const token = await youtubeOAuth.refreshAccessToken(refreshToken);
  const result = await uploadVideo({ video, title: post.title, description: post.text, tags: post.tags || [], privacyStatus: post.privacyStatus }, token.access_token);
  const verified = await fetchVideo(result.videoId, token.access_token);
  if (!verified || verified.snippet?.channelId !== EXPECTED_CHANNEL_ID || verified.status?.privacyStatus !== post.privacyStatus) throw fail("YouTube 게시 후 채널·공개 상태 확인에 실패했습니다.", "YOUTUBE_RESULT_UNCERTAIN");
  return { publishedId: result.videoId };
}

module.exports = { EXPECTED_CHANNEL_ID, contentHash, assertYouTubeShort, publishScheduledShort };
