const crypto = require("crypto");
const { readSchedule, writeSchedule } = require("./githubStore");

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

// Instagram 오늘의 운세는 정확한 오전 6시(KST)가 브랜드 약속이므로
// Threads용 ±15분 지터를 절대 적용하지 않는다. dedupeKey로 중복 예약도 차단한다.
async function addInstagramBatch(items) {
  if (!Array.isArray(items) || items.length === 0) throw Object.assign(new Error("예약할 Instagram 콘텐츠가 없습니다."), { status: 400 });
  const { posts, sha } = await readSchedule();
  const basePosts = posts.slice(); // 새 글만 추가하므로 얕은 복사로 충분
  const existingKeys = new Set(posts.filter((post) => post.status !== "canceled").map((post) => post.dedupeKey).filter(Boolean));
  const newPosts = [];
  for (const item of items) {
    const dedupeKey = `instagram:palja-daily:${item.date}`;
    if (existingKeys.has(dedupeKey)) throw Object.assign(new Error(`${item.date} Instagram 운세가 이미 예약되어 있습니다.`), { status: 409, code: "DUPLICATE_INSTAGRAM_DATE" });
    if (item.validation?.status !== "passed") throw Object.assign(new Error(`${item.date} 콘텐츠가 검수를 통과하지 못했습니다.`), { status: 422 });
    if (!Array.isArray(item.images) || item.images.length !== 7) throw Object.assign(new Error(`${item.date} 카드가 7장이 아닙니다.`), { status: 422 });
    const scheduledAt = kstDateAndTimeToUtc(item.date, "06:00");
    const post = {
      id: crypto.randomUUID(),
      platform: "instagram",
      accountId: "saju_orbit",
      accountLabel: "팔자명가",
      text: item.caption,
      images: item.images,
      status: "scheduled",
      scheduledAt: scheduledAt.toISOString(),
      expectedLocalDate: item.date,
      exactTimeKst: "06:00",
      dedupeKey,
      contentHash: item.contentHash,
      validation: item.validation,
      createdAt: new Date().toISOString(),
      publishedAt: null,
      publishedId: null,
      error: null,
      retryCount: 0,
    };
    posts.push(post);
    newPosts.push(post);
    existingKeys.add(dedupeKey);
  }
  await writeSchedule(posts, { sha, message: `chore: schedule ${newPosts.length} Instagram daily fortunes`, basePosts });
  return newPosts;
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
  if (target.platform === "instagram") {
    const err = new Error("Instagram 운세는 검수 해시가 깨지므로 직접 수정할 수 없습니다. 취소 후 Instagram 탭에서 다시 생성해주세요.");
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

// 특정 계정의 예약(아직 발행 안 된 것만)을 날짜별로 묶어서, 하루에 정해진 시각 슬롯(예:
// 11:00/16:00/20:00)으로 다시 배분한다. 정확한 시간을 매번 고를 필요 없이 "아무 날짜"로만
// 예약해두고, 나중에 이걸로 한 번에 정리하기 위한 기능. kind로 대상 글 종류를 제한할 수 있다
// (예: 제품 홍보 글만 — 이미 자리 잡은 일상글 예약 시각은 건드리지 않기 위해).
async function rebalanceTimes({ accountId, times, kind = "all" }) {
  if (!accountId) {
    const err = new Error("accountId가 필요합니다.");
    err.status = 400;
    throw err;
  }
  if (!Array.isArray(times) || times.length === 0) {
    const err = new Error("times(시간 슬롯 배열)가 필요합니다. 예: [\"11:00\",\"16:00\",\"20:00\"]");
    err.status = 400;
    throw err;
  }
  for (const t of times) {
    if (!/^\d{1,2}:\d{2}$/.test(t)) {
      const err = new Error(`시간 형식이 올바르지 않습니다: ${t} (HH:MM 형식이어야 함)`);
      err.status = 400;
      throw err;
    }
  }

  const { posts, sha } = await readSchedule();
  const basePosts = JSON.parse(JSON.stringify(posts)); // 여러 글의 scheduledAt을 그 자리에서 고칠 거라 미리 스냅샷
  const targets = posts.filter((p) => {
    if (p.accountId !== accountId || p.status !== "scheduled") return false;
    if (kind === "product") return Boolean(p.replyText);
    if (kind === "lifestyle") return !p.replyText;
    return true;
  });

  // 날짜별로 묶고, 그 안에서는 먼저 만든(createdAt 빠른) 순서대로 슬롯을 배정한다.
  const byDate = new Map();
  for (const p of targets) {
    const key = kstDateKey(p.scheduledAt);
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key).push(p);
  }

  let updated = 0;
  for (const [dateKey, dayPosts] of byDate) {
    dayPosts.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    dayPosts.forEach((post, i) => {
      const slot = times[i % times.length];
      const base = kstDateAndTimeToUtc(dateKey, slot);
      post.scheduledAt = withJitter(base).toISOString();
      updated += 1;
    });
  }

  await writeSchedule(posts, {
    sha,
    message: `chore: rebalance schedule times for account ${accountId} (${kind})`,
    basePosts,
  });
  return { updated, days: byDate.size };
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
  rebalanceTimes,
  cancelScheduledPost,
  listRecentTextsForAccount,
  recordImmediatePublish,
  addInstagramBatch,
  kstDateAndTimeToUtc,
  withJitter,
};
