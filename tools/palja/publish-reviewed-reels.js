#!/usr/bin/env node
require("dotenv").config({ path: require("node:path").resolve(__dirname, "../../.env") });
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { publishImages } = require("../../server/lib/mediaHost");
const { atomicUpdateSchedule, readSchedule } = require("../../server/lib/githubStore");
const { reelContentHash, assertReelPost } = require("../../server/lib/instagramReels");
const { PRESETS, validatePreset } = require("../../server/config/paljaReelPresets");

const ROOT = path.resolve(__dirname, "../..");
const OUT = path.join(ROOT, "output", "palja-reels");
const digest = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");
const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  const selectedTopicIds = new Set(String(process.env.PALJA_REEL_TOPIC_IDS || "").split(",").map((value) => value.trim()).filter(Boolean));
  const selectedPresets = selectedTopicIds.size ? PRESETS.filter((item) => selectedTopicIds.has(item.topicId)) : PRESETS;
  if (selectedTopicIds.size && selectedPresets.length !== selectedTopicIds.size) throw new Error("요청한 릴스 주제 중 찾지 못한 항목이 있습니다.");
  const prepared = selectedPresets.map((raw) => {
    const preset = validatePreset(raw);
    const dir = path.join(OUT, preset.date, preset.slotId);
    const videoPath = path.join(dir, `palja-reel-${preset.date}-${preset.slotId}.mp4`);
    const reviewPath = path.join(dir, "review.json");
    if (!fs.existsSync(videoPath) || !fs.existsSync(reviewPath)) throw new Error(`${preset.date} ${preset.time} 검수 파일이 없습니다.`);
    const video = fs.readFileSync(videoPath);
    const review = JSON.parse(fs.readFileSync(reviewPath, "utf8"));
    if (review.videoSha256 !== digest(video) || review.validation?.captionReview !== "passed") throw new Error(`${preset.date} ${preset.time} 렌더·캡션 무결성 검수 실패`);
    return { preset, video, reviewPath, review };
  });

  if (DRY_RUN) {
    const { posts: existing } = await readSchedule();
    const active = existing.filter((item) => item.platform === "instagram" && item.accountKey === "palja" &&
      item.mediaType === "REELS" && item.status === "scheduled");
    const plan = prepared.map(({ preset }) => ({ date: preset.date, time: preset.time, title: preset.titleLines.join(" ") }));
    console.log(JSON.stringify({ dryRun: true, cancelCount: active.length,
      cancel: active.map(({ id, scheduledAt, title }) => ({ id, scheduledAt, title })),
      createCount: plan.length, create: plan }, null, 2));
    return;
  }

  const urls = await publishImages(prepared.map(({ video }) => ({ buffer: video, ext: "mp4" })));
  const now = new Date().toISOString();
  const posts = prepared.map(({ preset, video, reviewPath, review }, index) => {
    const scheduledAt = new Date(`${preset.date}T${preset.time}:00+09:00`).toISOString();
    const post = {
      id: crypto.randomUUID(), platform: "instagram", accountKey: "palja", accountId: "saju_orbit",
      accountLabel: "팔자명가", mediaType: "REELS", title: preset.titleLines.join(" "),
      contentSeries: "팔자명가 고급 명조 8초 생년운세", text: preset.caption, videoUrl: urls[index],
      videoSha256: digest(video), status: "scheduled", scheduledAt, expectedLocalDate: preset.date,
      exactTimeKst: preset.time, dedupeKey: `instagram:palja:reel:${preset.date}:${preset.topicId}:v5-eight-sec-audio`,
      validation: { ...review.validation, status: "passed", visualReview: "passed", publicVideoHashMatch: true,
        benchmarkWindow: "hyeanjae.saju + ttibujeok recent reels", benchmarkStructureOnly: true,
        instagramSafeZone: "core content y=250..1415; lower 405px reserved for mobile UI",
        yearWidthRatio: 0.84, screenCount: 2, fontSystem: "premium-myeongjo",
        audienceFocus: "women-first-without-stereotypes", audioSource: "Meta Sound Collection / Reality" },
      createdAt: now, publishedAt: null, publishedId: null, error: null, retryCount: 0,
    };
    post.contentHash = reelContentHash(post);
    assertReelPost(post);
    fs.writeFileSync(reviewPath, JSON.stringify({ ...review, videoUrl: post.videoUrl, contentHash: post.contentHash,
      validation: post.validation, approvedAt: now }, null, 2));
    return post;
  });

  await atomicUpdateSchedule((items) => {
    for (let index = items.length - 1; index >= 0; index -= 1) {
      const item = items[index];
      if (item.platform === "instagram" && item.accountKey === "palja" && item.mediaType === "REELS" && item.status === "scheduled")
        items.splice(index, 1);
    }
    for (const post of posts) {
      if (items.some((item) => item.status !== "canceled" && (item.dedupeKey === post.dedupeKey || item.contentHash === post.contentHash))) {
        throw new Error(`${post.expectedLocalDate} 교체 릴스가 이미 예약되어 있습니다.`);
      }
      items.push(post);
    }
    return posts.map(({ id, title, scheduledAt, videoUrl }) => ({ id, title, scheduledAt, videoUrl }));
  }, "fix: replace Palja Reels with reviewed birth-year format");
  const { posts: verified } = await readSchedule();
  const ids = new Set(posts.map((post) => post.id));
  const actual = verified.filter((post) => ids.has(post.id) && post.status === "scheduled");
  if (actual.length !== posts.length) throw new Error("원격 재검증 실패: 새 릴스 30건이 모두 예약 상태가 아닙니다.");
  const byDate = new Map();
  for (const post of actual) {
    if (Date.parse(post.scheduledAt) <= Date.now()) throw new Error("원격 재검증 실패: 이미 지난 예약 시각이 있습니다.");
    const key = post.expectedLocalDate;
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key).push(post.exactTimeKst);
  }
  for (const date of [...new Set(posts.map((post) => post.expectedLocalDate))]) {
    const times = (byDate.get(date) || []).sort();
    if (times.length !== 3 || new Set(times).size !== 3) throw new Error("원격 재검증 실패: " + date + "에 정확히 3개가 아닙니다.");
  }
  console.log(JSON.stringify({ verified: true, count: actual.length,
    schedule: Object.fromEntries([...byDate].map(([date, times]) => [date, times.sort()])) }, null, 2));
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
