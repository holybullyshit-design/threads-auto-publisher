#!/usr/bin/env node
require("dotenv").config({ path: require("node:path").resolve(__dirname, "../../.env") });
const fs = require("node:fs");
const path = require("node:path");
const youtubeOAuth = require("../../server/lib/youtubeOAuth");
const youtubeAuthStore = require("../../server/lib/youtubeAuthStore");
const { uploadPrivateShort, fetchVideo } = require("../../server/lib/youtubeClient");

const EXPECTED_CHANNEL_ID = "UCUsStA-7a8TNT0ENBVNcxWQ";

async function main() {
  const filePath = path.resolve(String(process.env.YOUTUBE_TEST_VIDEO || ""));
  if (!process.env.YOUTUBE_TEST_VIDEO || !fs.existsSync(filePath)) throw new Error("YOUTUBE_TEST_VIDEO에 검증할 무음 MP4 경로를 지정해주세요.");
  const auth = youtubeAuthStore.load();
  if (!auth?.refreshToken || auth.channelId !== EXPECTED_CHANNEL_ID) throw new Error("팔자명가 YouTube 연결 정보가 없거나 채널이 다릅니다.");
  const token = await youtubeOAuth.refreshAccessToken(auth.refreshToken);
  const uploaded = await uploadPrivateShort({
    filePath,
    title: "[비공개 테스트] 팔자명가 Shorts 자동화 점검",
    description: "팔자명가 YouTube 자동 업로드 연결을 확인하는 비공개 테스트입니다. 공개되지 않습니다.",
    tags: ["팔자명가", "사주", "Shorts"],
    privacyStatus: "private",
  }, token.access_token);
  if (uploaded.channelId && uploaded.channelId !== EXPECTED_CHANNEL_ID) throw new Error("업로드된 채널이 팔자명가와 일치하지 않습니다.");
  const verified = await fetchVideo(uploaded.videoId, token.access_token);
  if (!verified || verified.snippet?.channelId !== EXPECTED_CHANNEL_ID || verified.status?.privacyStatus !== "private") {
    throw new Error("YouTube 비공개 업로드 후 채널·공개 상태 재검증에 실패했습니다.");
  }
  console.log(JSON.stringify({ verified: true, videoId: uploaded.videoId, channelTitle: verified.snippet?.channelTitle, privacyStatus: verified.status?.privacyStatus, duration: verified.contentDetails?.duration, processingStatus: verified.processingDetails?.processingStatus || "processing" }, null, 2));
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
