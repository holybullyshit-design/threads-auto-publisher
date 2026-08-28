// 좁은 카테고리 상담형 계정을 팔자장인과 똑같은 "종합사주" 클리프행어 엔진으로 전환한다.
// 2026-08-28: 팔자명가(이직운/취업운 등 커리어 상담형)가 반응이 없어서, 사용자가 팔자장인과
// 동일한 구조로 바꾸고 8/31까지만 시험 삼아 돌려보기로 결정함. 절차:
//   1) 그 계정에 걸려있던 미발행 예약(Threads만 - Instagram "오늘의 운세"는 별개 제품이라 안 건드림)을 전부 취소
//   2) taebaekSajuDraftWriter 엔진(팔자장인과 동일, accountLabel만 다름)으로 새 글을 생성해서
//      "지금부터 종료일까지" 하루 3슬롯(10:30/15:00/19:30 KST, 지난 슬롯은 건너뜀)에 채운다
//
// 사용법: node tools/convert-to-comprehensive-saju.js "<계정라벨>" <종료일 YYYY-MM-DD>
// 예:     node tools/convert-to-comprehensive-saju.js "팔자명가" 2026-08-31

require("dotenv").config();
const crypto = require("crypto");
const accountsStore = require("../server/lib/accountsStore");
const { readSchedule, writeSchedule } = require("../server/lib/githubStore");
const { withJitter } = require("../server/lib/scheduleStore");
const { writeThreadDraft, pickTopicIds, pickHookFormatIds } = require("../server/skills/taebaekSajuDraftWriter");

const ACCOUNT_LABEL = process.argv[2];
const END_DATE = process.argv[3]; // "YYYY-MM-DD" (KST 기준, 이 날짜까지 포함)
const DAILY_SLOTS_KST = ["10:30", "15:00", "19:30"];

if (!ACCOUNT_LABEL || !END_DATE) {
  console.error('사용법: node tools/convert-to-comprehensive-saju.js "<계정라벨>" <종료일 YYYY-MM-DD>');
  process.exit(1);
}

function findAccount() {
  return accountsStore.listAccounts().find((a) => a.label === ACCOUNT_LABEL);
}

function nowKst() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000);
}

function kstSlotToUtc(dateStr, hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const utcMs = Date.parse(`${dateStr}T00:00:00Z`) + (h * 60 + m) * 60 * 1000 - 9 * 60 * 60 * 1000;
  return new Date(utcMs);
}

// 오늘(KST) 날짜부터 END_DATE까지, 이미 지난 슬롯은 빼고 남은 슬롯을 순서대로 나열한다.
function buildRemainingSlots() {
  const nowK = nowKst();
  const todayStr = nowK.toISOString().slice(0, 10);
  const slots = [];
  let cursor = todayStr;
  while (cursor <= END_DATE) {
    for (const slot of DAILY_SLOTS_KST) {
      const utcTime = kstSlotToUtc(cursor, slot);
      if (utcTime.getTime() > Date.now()) slots.push({ dateStr: cursor, slot });
    }
    const next = new Date(Date.parse(`${cursor}T00:00:00Z`) + 24 * 60 * 60 * 1000);
    cursor = next.toISOString().slice(0, 10);
  }
  return slots;
}

async function cancelExistingThreadsSchedule(accountId) {
  const { posts, sha } = await readSchedule();
  const basePosts = JSON.parse(JSON.stringify(posts));
  let canceledCount = 0;
  for (const p of posts) {
    if (p.accountId === accountId && p.status === "scheduled" && p.platform !== "instagram") {
      p.status = "canceled";
      canceledCount++;
    }
  }
  if (canceledCount > 0) {
    await writeSchedule(posts, { sha, message: `chore: cancel ${canceledCount} old-format posts for ${ACCOUNT_LABEL}`, basePosts });
  }
  return canceledCount;
}

async function main() {
  const account = findAccount();
  if (!account) {
    console.error(`계정을 찾을 수 없습니다: "${ACCOUNT_LABEL}"`);
    process.exit(1);
  }
  console.log(`계정 확인됨: ${account.label} (${account.id})`);

  const canceled = await cancelExistingThreadsSchedule(account.id);
  console.log(`기존 예약 취소: ${canceled}건 (Instagram 제외)`);

  const slots = buildRemainingSlots();
  console.log(`새로 채울 슬롯: ${slots.length}개 (오늘 ~ ${END_DATE})`);
  if (slots.length === 0) {
    console.log("채울 슬롯이 없습니다 (종료일이 이미 지났을 수 있음). 종료.");
    return;
  }

  const topicIds = pickTopicIds(slots.length);
  const hookFormatIds = pickHookFormatIds(slots.length);
  const newPosts = [];

  for (let i = 0; i < slots.length; i++) {
    const { dateStr, slot } = slots[i];
    console.log(`[${i + 1}/${slots.length}] 생성 중... (예정: ${dateStr} ${slot} KST)`);
    const draft = await writeThreadDraft({
      dateKey: dateStr,
      topicId: topicIds[i],
      hookFormatId: hookFormatIds[i],
      accountLabel: ACCOUNT_LABEL,
    });
    const when = withJitter(kstSlotToUtc(dateStr, slot));
    newPosts.push({
      id: crypto.randomUUID(),
      accountId: account.id,
      accountLabel: account.label,
      text: draft.text,
      replyChain: draft.replyChain,
      status: "scheduled",
      scheduledAt: when.toISOString(),
      createdAt: new Date().toISOString(),
      publishedAt: null,
      publishedId: null,
      error: null,
    });
    console.log(`  -> 소재: ${draft.topic} / 훅: ${draft.hookFormat} / 파트 ${1 + draft.replyChain.length}개`);
  }

  const { posts, sha } = await readSchedule();
  const basePosts = posts.slice();
  const merged = posts.concat(newPosts);
  await writeSchedule(merged, { sha, message: `feat: ${ACCOUNT_LABEL} 종합사주 전환 - ${END_DATE}까지 ${newPosts.length}건 예약`, basePosts });

  console.log(`\n완료: ${ACCOUNT_LABEL} 계정 - 기존 ${canceled}건 취소, 신규 ${newPosts.length}건 예약 (${END_DATE}까지).`);
}

main().catch((err) => {
  console.error("실패:", err);
  process.exit(1);
});
