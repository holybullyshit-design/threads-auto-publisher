const crypto = require("crypto");
const { readSchedule, writeSchedule, atomicUpdateSchedule } = require("./githubStore");

// 매일 정확히 같은 분·초에 게시되면 "자동화 패턴"으로 감지될 위험이 있다(Threads 스팸 정책 —
// 봇처럼 보이는 규칙적인 패턴을 스팸 신호로 본다). 그래서 예약 시각에 ±15분 랜덤 오차를 자동으로 준다.
// 사용자가 화면에서 "오후 1시"를 골라도 실제로는 12:47이나 13:09처럼 살짝 흔들려서 저장된다.
const JITTER_RANGE_MS = 15 * 60 * 1000;

function withJitter(date) {
  const offset = Math.floor((Math.random() * 2 - 1) * JITTER_RANGE_MS); // -15분 ~ +15분
  return new Date(date.getTime() + offset);
}

async function listSchedule() {
  const { posts } = await readSchedule();
  // 최신 예약이 위로 오도록 정렬
  return posts.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function addScheduledPost({ accountId, accountLabel, text, scheduledAt, images, replyText }) {
  if (!accountId || !text || !scheduledAt) {
    const err = new Error("accountId, text, scheduledAt은 모두 필수입니다.");
    err.status = 400;
    throw err;
  }
  const requested = new Date(scheduledAt);
  if (Number.isNaN(requested.getTime())) {
    const err = new Error("scheduledAt이 올바른 날짜/시간이 아닙니다.");
    err.status = 400;
    throw err;
  }
  const when = withJitter(requested);

  const { posts, sha } = await readSchedule();
  const basePosts = posts.slice(); // 새 글만 추가하므로 얕은 복사로 충분(기존 글은 안 건드림)
  const newPost = {
    id: crypto.randomUUID(),
    accountId,
    accountLabel: accountLabel || "",
    text,
    images: Array.isArray(images) && images.length ? images : undefined, // 파트너스: 공개 이미지 URL 배열
    replyText: replyText || undefined, // 파트너스: 본문 게시 직후 답글로 자동으로 달 텍스트(제휴 링크)
    status: "scheduled", // scheduled | published | failed | canceled
    scheduledAt: when.toISOString(),
    createdAt: new Date().toISOString(),
    publishedAt: null,
    publishedId: null,
    error: null,
  };
  posts.push(newPost);
  await writeSchedule(posts, { sha, message: `chore: schedule post ${newPost.id}`, basePosts });
  return newPost;
}

// 계정별로 최근에 이미 만든 글 목록 (게시완료 + 예약중, 취소/실패 제외)
// -> 초안 생성 시 "이거랑 겹치지 않게" 참고용으로 넘겨준다.
async function listRecentTextsForAccount(accountId, { limit = 15 } = {}) {
  const { posts } = await readSchedule();
  return posts
    .filter((p) => p.accountId === accountId && (p.status === "published" || p.status === "scheduled"))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit)
    .map((p) => p.text);
}

// "지금 게시"로 즉시 올린 글도 기록에 남겨서, 다음 초안 생성 때 중복을 피할 수 있게 한다.
async function recordImmediatePublish({ accountId, accountLabel, text, publishedId, images, replyText }) {
  const { posts, sha } = await readSchedule();
  const basePosts = posts.slice(); // 새 글만 추가하므로 얕은 복사로 충분
  const now = new Date().toISOString();
  const newPost = {
    id: crypto.randomUUID(),
    accountId,
    accountLabel: accountLabel || "",
    text,
    images: Array.isArray(images) && images.length ? images : undefined,
    replyText: replyText || undefined,
    status: "published",
    scheduledAt: now,
    createdAt: now,
    publishedAt: now,
    publishedId: publishedId || null,
    error: null,
  };
  posts.push(newPost);
  await writeSchedule(posts, { sha, message: `chore: record immediate publish ${newPost.id}`, basePosts });
  return newPost;
}

// 예약 중(scheduled)이거나 실패(failed)한 글의 내용/시각을 수정한다. 발행됐거나 취소된 글은
// 수정할 수 없다 — 그건 새로 작성해야 한다. scheduledAt을 새로 지정한 경우에만 새로 지터를 준다
// (텍스트만 고칠 땐 이미 지터가 적용된 기존 시각을 그대로 유지). 실패한 글을 수정하면, 그
// 자체로 "다시 시도해달라"는 뜻으로 보고 자동으로 예약 대기열(scheduled)에 다시 올린다.
async function updateScheduledPost(id, { text, scheduledAt, images, replyText } = {}) {
  const { posts, sha } = await readSchedule();
  const basePosts = JSON.parse(JSON.stringify(posts)); // target을 그 자리에서 바로 고칠 거라, 그 전 스냅샷을 떠둔다
  const target = posts.find((p) => p.id === id);
  if (!target) {
    const err = new Error(`예약 글을 찾을 수 없습니다: ${id}`);
    err.status = 404;
    throw err;
  }
  if (target.status !== "scheduled" && target.status !== "failed") {
    const err = new Error("이미 발행되었거나 취소된 글은 수정할 수 없습니다.");
    err.status = 400;
    throw err;
  }
  const wasFailed = target.status === "failed";
  if (wasFailed) {
    target.status = "scheduled";
    target.error = null;
    target.retryCount = 0;
  }

  if (text !== undefined) {
    if (!text) {
      const err = new Error("본문(text)은 비워둘 수 없습니다.");
      err.status = 400;
      throw err;
    }
    target.text = text;
  }
  if (scheduledAt !== undefined) {
    const requested = new Date(scheduledAt);
    if (Number.isNaN(requested.getTime())) {
      const err = new Error("scheduledAt이 올바른 날짜/시간이 아닙니다.");
      err.status = 400;
      throw err;
    }
    target.scheduledAt = withJitter(requested).toISOString();
  }
  if (images !== undefined) {
    target.images = Array.isArray(images) && images.length ? images : undefined;
  }
  if (replyText !== undefined) {
    target.replyText = replyText || undefined;
  }

  await writeSchedule(posts, { sha, message: `chore: update scheduled post ${id}`, basePosts });
  return target;
}

// KST 기준 "YYYY-MM-DD" 날짜 키. 예약 목록을 날짜별로 묶을 때 쓴다.
function kstDateKey(isoString) {
  const kst = new Date(new Date(isoString).getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

// "YYYY-MM-DD"(KST 날짜) + "HH:MM"(KST 시각)을 실제 UTC Date로 변환.
function kstDateAndTimeToUtc(dateKeyKST, hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const utc = new Date(`${dateKeyKST}T00:00:00.000Z`);
  utc.setUTCHours(utc.getUTCHours() - 9 + h, m, 0, 0);
  return utc;
}

async function cancelScheduledPost(id) {
  const { posts, sha } = await readSchedule();
  const basePosts = JSON.parse(JSON.stringify(posts)); // target을 그 자리에서 바로 고칠 거라, 그 전 스냅샷을 떠둔다
  const target = posts.find((p) => p.id === id);
  if (!target) {
    const err = new Error(`예약 글을 찾을 수 없습니다: ${id}`);
    err.status = 404;
    throw err;
  }
  if (target.status !== "scheduled") {
    const err = new Error("이미 처리된 글은 취소할 수 없습니다.");
    err.status = 400;
    throw err;
  }
  target.status = "canceled";
  await writeSchedule(posts, { sha, message: `chore: cancel scheduled post ${id}`, basePosts });
  return target;
}

module.exports = {
  listSchedule,
  addScheduledPost,
  updateScheduledPost,
  cancelScheduledPost,
  listRecentTextsForAccount,
  recordImmediatePublish,
  kstDateAndTimeToUtc,
  withJitter,
};
