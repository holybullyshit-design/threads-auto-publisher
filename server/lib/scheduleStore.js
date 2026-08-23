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

module.exports = { listSchedule, addScheduledPost, cancelScheduledPost };
