const fs = require("node:fs");

const UPLOAD_ENDPOINT = "https://www.googleapis.com/upload/youtube/v3/videos";
const VIDEOS_ENDPOINT = "https://www.googleapis.com/youtube/v3/videos";

function fail(message, code = "YOUTUBE_UPLOAD_ERROR", status = 500) {
  return Object.assign(new Error(message), { code, status });
}

function assertPrivateShort(input) {
  if (!input?.filePath || !fs.existsSync(input.filePath)) throw fail("YouTube 시험 영상 파일이 없습니다.", "YOUTUBE_VIDEO_MISSING", 400);
  if (!String(input.title || "").trim()) throw fail("YouTube 제목이 없습니다.", "YOUTUBE_TITLE_MISSING", 400);
  if (input.privacyStatus !== "private") throw fail("최초 시험 업로드는 비공개만 허용합니다.", "YOUTUBE_PRIVATE_REQUIRED", 400);
}

function multipartBody(metadata, video) {
  const boundary = `codex_youtube_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const head = Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: video/mp4\r\n\r\n`);
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return { boundary, body: Buffer.concat([head, video, tail]) };
}

async function uploadVideo(input, accessToken) {
  if (!Buffer.isBuffer(input?.video) || !input.video.length) throw fail("YouTube 영상 데이터가 없습니다.", "YOUTUBE_VIDEO_MISSING", 400);
  if (!String(input.title || "").trim()) throw fail("YouTube 제목이 없습니다.", "YOUTUBE_TITLE_MISSING", 400);
  if (!['private','public','unlisted'].includes(input.privacyStatus)) throw fail("YouTube 공개 상태가 올바르지 않습니다.", "YOUTUBE_PRIVACY_INVALID", 400);
  if (!accessToken) throw fail("YouTube 액세스 토큰이 없습니다.", "YOUTUBE_ACCESS_TOKEN_MISSING", 401);
  const metadata = {
    snippet: {
      title: String(input.title).trim().slice(0, 100),
      description: String(input.description || "").trim().slice(0, 5000),
      tags: Array.isArray(input.tags) ? input.tags.map(String).filter(Boolean).slice(0, 30) : [],
      categoryId: "22",
    },
    status: { privacyStatus: input.privacyStatus, selfDeclaredMadeForKids: false },
  };
  const { boundary, body } = multipartBody(metadata, input.video);
  const url = new URL(UPLOAD_ENDPOINT);
  url.searchParams.set("uploadType", "multipart");
  url.searchParams.set("part", "snippet,status");
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": `multipart/related; boundary=${boundary}`, "Content-Length": String(body.length) },
    body,
    signal: AbortSignal.timeout(120000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.id) throw fail(`YouTube 비공개 업로드 실패: ${data.error?.message || response.status}`);
  return { videoId: String(data.id), privacyStatus: String(data.status?.privacyStatus || input.privacyStatus), channelId: String(data.snippet?.channelId || "") };
}

async function uploadPrivateShort(input, accessToken) {
  assertPrivateShort(input);
  return uploadVideo({ ...input, video: fs.readFileSync(input.filePath), privacyStatus: "private" }, accessToken);
}

async function fetchVideo(videoId, accessToken) {
  const url = new URL(VIDEOS_ENDPOINT);
  url.searchParams.set("part", "id,snippet,status,contentDetails,processingDetails");
  url.searchParams.set("id", String(videoId || ""));
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(30000) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw fail(`YouTube 영상 확인 실패: ${data.error?.message || response.status}`, "YOUTUBE_VIDEO_LOOKUP_FAILED");
  return data.items?.[0] || null;
}

module.exports = { assertPrivateShort, multipartBody, uploadVideo, uploadPrivateShort, fetchVideo };
