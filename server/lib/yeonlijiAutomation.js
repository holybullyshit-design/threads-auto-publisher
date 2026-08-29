const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const mediaHost = require("./mediaHost");
const scheduleStore = require("./scheduleStore");
const instagramAuthStore = require("./instagramAuthStore");

const OUTPUT_DIR = path.join(__dirname, "..", "..", "output");
const CHARACTER_BIBLE = Object.freeze({
  status: "locked",
  heroine: "연지 · 20대 후반 한국 여성, 어깨 길이의 짙은 머리, 크림 블라우스와 차분한 자두색 카디건",
  companion: "타래 · 느슨한 붉은 실 매듭으로 이루어진 작은 관계 요정",
  art: "정제된 한국 감성 웹툰 · 과슈와 색연필 질감 · 성숙하고 따뜻한 표정",
  palette: "크림 · 코랄 · 버건디 · 자두색",
  audience: "재회·연애·궁합에 관심 있는 20~40대 여성",
  rules: ["주인공 얼굴·머리·의상 고정", "이미지 생성 시 글자 제외", "한글은 검수 가능한 코드 렌더링", "유아풍·3D·과한 점술 공포 표현 금지"],
});

function safeDraftId(value) {
  const id = String(value || "");
  if (!/^yeonliji-\d{4}-\d{2}-\d{2}(?:-[a-z0-9_-]+)?$/.test(id)) throw Object.assign(new Error("올바르지 않은 연리지 시안입니다."), { status: 400 });
  return id;
}

function draftDirectory(id) { return path.join(OUTPUT_DIR, safeDraftId(id)); }
function readManifest(id) {
  const dir = draftDirectory(id);
  const manifestPath = path.join(dir, "manifest.json");
  if (!fs.existsSync(manifestPath)) throw Object.assign(new Error("연리지 시안을 찾을 수 없습니다."), { status: 404 });
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  return { id, dir, manifest };
}

async function inspectDraft(id, posts) {
  const { manifest } = readManifest(id);
  const imageFiles = Array.from({ length: 7 }, (_, index) => path.join(draftDirectory(id), `card-${String(index + 1).padStart(2, "0")}.jpg`));
  const existing = posts.find((post) => post.platform === "instagram" && post.accountKey === "yeonliji" && post.contentHash === manifest.contentHash && post.status !== "canceled");
  return {
    id, title: manifest.title, series: manifest.series, date: manifest.date, time: manifest.time,
    caption: manifest.caption, contentHash: manifest.contentHash, cards: manifest.cards || [],
    validation: manifest.validation, imageCount: imageFiles.filter(fs.existsSync).length,
    scheduled: Boolean(existing), schedule: existing ? { id: existing.id, status: existing.status, scheduledAt: existing.scheduledAt, publishedAt: existing.publishedAt } : null,
  };
}

async function getStudio() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const posts = await scheduleStore.listSchedule();
  const ids = fs.readdirSync(OUTPUT_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^yeonliji-\d{4}-\d{2}-\d{2}/.test(entry.name) && fs.existsSync(path.join(OUTPUT_DIR, entry.name, "manifest.json")))
    .map((entry) => entry.name).sort().reverse();
  const drafts = await Promise.all(ids.map((id) => inspectDraft(id, posts)));
  const credentials = instagramAuthStore.getCredentials("yeonliji");
  return { account: { key: "yeonliji", label: "연리지 실타래", username: credentials?.username || "knot_saju", connected: Boolean(credentials) }, characterBible: CHARACTER_BIBLE, drafts };
}

function readCard(id, page) {
  const number = Number(page);
  if (!Number.isInteger(number) || number < 1 || number > 7) throw Object.assign(new Error("카드 번호는 1~7이어야 합니다."), { status: 400 });
  const file = path.join(draftDirectory(id), `card-${String(number).padStart(2, "0")}.jpg`);
  if (!fs.existsSync(file)) throw Object.assign(new Error("카드 이미지를 찾을 수 없습니다."), { status: 404 });
  return file;
}

async function verifyFiles(id, manifest) {
  const buffers = [];
  const hashes = new Set();
  for (let page = 1; page <= 7; page += 1) {
    const file = readCard(id, page);
    const buffer = fs.readFileSync(file);
    const meta = await sharp(buffer).metadata();
    if (meta.width !== 1080 || meta.height !== 1350) throw Object.assign(new Error(`${page}장 크기가 1080×1350이 아닙니다.`), { status: 422 });
    hashes.add(crypto.createHash("sha256").update(buffer).digest("hex"));
    buffers.push({ buffer, ext: "jpg" });
  }
  if (hashes.size !== 7) throw Object.assign(new Error("동일한 이미지가 반복되어 예약을 중단했습니다."), { status: 422 });
  if (manifest.validation?.status !== "passed") throw Object.assign(new Error("최종 검수를 통과하지 않은 시안입니다."), { status: 422 });
  if (!manifest.caption || !manifest.contentHash) throw Object.assign(new Error("캡션 또는 검수 해시가 없습니다."), { status: 422 });
  return buffers;
}

async function scheduleApprovedDraft(id) {
  const { manifest } = readManifest(id);
  const posts = await scheduleStore.listSchedule();
  const existing = posts.find((post) => post.platform === "instagram" && post.accountKey === "yeonliji" && post.contentHash === manifest.contentHash && post.status !== "canceled");
  if (existing) return { duplicatePrevented: true, post: existing };
  const credentials = instagramAuthStore.getCredentials("yeonliji");
  if (!credentials) throw Object.assign(new Error("연리지 실타래 Instagram 계정을 먼저 연결해주세요."), { status: 409 });
  const buffers = await verifyFiles(id, manifest);
  const images = await mediaHost.publishImages(buffers);
  const post = await scheduleStore.addInstagramPost({
    accountKey: "yeonliji", accountId: credentials.username || "knot_saju", accountLabel: "연리지 실타래",
    caption: manifest.caption, title: manifest.title, contentSeries: manifest.series,
    date: manifest.date, time: manifest.time, contentHash: manifest.contentHash,
    dedupeKey: `instagram:yeonliji:${manifest.date}:${manifest.contentHash}`, images, validation: manifest.validation,
  });
  return { duplicatePrevented: false, post };
}

module.exports = { CHARACTER_BIBLE, getStudio, readCard, scheduleApprovedDraft };
