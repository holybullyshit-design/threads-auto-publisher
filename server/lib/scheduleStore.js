const crypto = require("crypto");
const { readSchedule, writeSchedule } = require("./githubStore");

async function listSchedule() {
  const { posts } = await readSchedule();
  // 최신 예약이 위로 오도록 정렬
  return posts.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function addScheduledPost({ accountId, accountLabel, text, scheduledAt }) {
  if (!accountId || !text || !scheduledAt) {
    const err = new Error("accountId, text, scheduledAt은 모두 필수입니다.");
    err.status = 400;
    throw err;
  }
  const when = new Date(scheduledAt);
  if (Number.isNaN(when.getTime())) {
    const err = new Error("scheduledAt이 올바른 날짜/시간이 아닙니다.");
    err.status = 400;
    throw err;
  }

  const { posts, sha } = await readSchedule();
  const newPost = {
    id: crypto.randomUUID(),
    accountId,
    accountLabel: accountLabel || "",
    text,
    status: "scheduled", // scheduled | published | failed | canceled
    scheduledAt: when.toISOString(),
    createdAt: new Date().toISOString(),
    publishedAt: null,
    publishedId: null,
    error: null,
  };
  posts.push(newPost);
  await writeSchedule(posts, { sha, message: `chore: schedule post ${newPost.id}` });
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
async function recordImmediatePublish({ accountId, accountLabel, text, publishedId }) {
  const { posts, sha } = await readSchedule();
  const now = new Date().toISOString();
  const newPost = {
    id: crypto.randomUUID(),
    accountId,
    accountLabel: accountLabel || "",
    text,
    status: "published",
    scheduledAt: now,
    createdAt: now,
    publishedAt: now,
    publishedId: publishedId || null,
    error: null,
  };
  posts.push(newPost);
  await writeSchedule(posts, { sha, message: `chore: record immediate publish ${newPost.id}` });
  return newPost;
}

async function cancelScheduledPost(id) {
  const { posts, sha } = await readSchedule();
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
  await writeSchedule(posts, { sha, message: `chore: cancel scheduled post ${id}` });
  return target;
}

module.exports = {
  listSchedule,
  addScheduledPost,
  cancelScheduledPost,
  listRecentTextsForAccount,
  recordImmediatePublish,
};
