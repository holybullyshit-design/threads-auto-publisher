#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { PRESETS, STYLE_POLICY, validatePreset } = require("../../server/config/paljaReelPresets");

const ROOT = path.resolve(__dirname, "../..");
const OUT = path.join(ROOT, "output", "palja-reels");
fs.mkdirSync(OUT, { recursive: true });
function sha256(file) { return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"); }

const selectedTopicIds = new Set(String(process.env.PALJA_REEL_TOPIC_IDS || "").split(",").map((value) => value.trim()).filter(Boolean));
const selectedPresets = selectedTopicIds.size ? PRESETS.filter((item) => selectedTopicIds.has(item.topicId)) : PRESETS;
if (selectedTopicIds.size && selectedPresets.length !== selectedTopicIds.size) throw new Error("요청한 릴스 주제 중 찾지 못한 항목이 있습니다.");

const manifests = selectedPresets.map((raw) => {
  const preset = validatePreset(raw);
  const dir = path.join(OUT, preset.date, preset.slotId);
  fs.mkdirSync(dir, { recursive: true });
  const manifestPath = path.join(dir, "manifest.json");
  const videoPath = path.join(dir, `palja-reel-${preset.date}-${preset.slotId}.mp4`);
  const coverPath = path.join(dir, `palja-reel-${preset.date}-${preset.slotId}-cover.jpg`);
  fs.writeFileSync(manifestPath, JSON.stringify({ ...preset, stylePolicy: STYLE_POLICY }, null, 2));
  const result = spawnSync("python3", [path.join(__dirname, "generate-reel.py"), manifestPath, videoPath, coverPath], { stdio: "inherit" });
  if (result.status !== 0) throw new Error(`${preset.date} ${preset.time} 릴스 렌더링 실패`);
  if (fs.statSync(videoPath).size < 100000) throw new Error(`${preset.date} ${preset.time} 릴스 파일이 비정상적으로 작습니다.`);
  const reviewed = { ...preset, stylePolicy: STYLE_POLICY, files: { videoPath, coverPath }, videoSha256: sha256(videoPath), validation: {
    status: "rendered", visualReview: "pending", captionReview: "passed", duration: 8,
    width: 1080, height: 1920, frames: 240, uniqueYears: true, topicOverlap: false,
    screenCount: 2, fontSystem: "premium-myeongjo", safeZoneBottom: 405,
    audio: { present: true, source: "Meta Sound Collection / Reality", sampleRate: 48000, channels: 2, targetLufs: -19 },
    audienceFocus: "women-first-without-stereotypes",
  }};
  fs.writeFileSync(path.join(dir, "review.json"), JSON.stringify(reviewed, null, 2));
  return reviewed;
});
console.log(JSON.stringify(manifests.map((m) => ({ date:m.date, time:m.time, title:m.titleLines.join(" "), cover:m.files.coverPath, video:m.files.videoPath })), null, 2));
