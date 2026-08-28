// 팔자궤도(@orbit_saju) 계정용 종합사주 클리프행어 스레드를 N개 생성해서 예약 등록한다.
// 팔자장인(taebaekSajuDraftWriter) 추가 때 했던 것과 같은 방식 — 계정별 페르소나(personaPresets)를
// 안 쓰고, 소재 뱅크 기반 전용 스킬(orbitSajuDraftWriter)로 직접 생성 + schedule/posts.json에
// replyChain까지 포함해서 기록한다 (updateScheduledPost API는 replyChain을 안 받아서 우회).
//
// 전제 조건: 계정 관리 탭에서 "팔자궤도" 계정이 이미 OAuth로 연결되어 있어야 한다
// (accountsStore에 label="팔자궤도"인 계정이 있어야 함).
//
// 사용법: node tools/schedule-orbit-saju.js [개수]  (기본 10개)

require("dotenv").config();
const crypto = require("crypto");
const accountsStore = require("../server/lib/accountsStore");
const { readSchedule, writeSchedule } = require("../server/lib/githubStore");
const { withJitter } = require("../server/lib/scheduleStore");
const { writeThreadDraft, pickTopicIds, pickHookFormatIds } = require("../server/skills/orbitSajuDraftWriter");

const ACCOUNT_LABEL = "팔자궤도";
const COUNT = Number(process.argv[2]) || 10;

// 팔자장인 예약 때 쓴 것과 비슷한 하루 여러 시간대 슬롯 (KST 기준 시:분) — 매번 다른 시간이 되도록
// withJitter(±15분)가 한 번 더 흔들어준다.
const DAILY_SLOTS_KST = ["10:30", "15:00", "19:30"];

function findAccount() {
  return accountsStore.listAccounts().find((a) => a.label === ACCOUNT_LABEL);
}

function kstSlotToUtc(dateStr, hhmm) {
  // dateStr: "YYYY-MM-DD" (그날의 KST 날짜), hhmm: "HH:MM" (KST)
  const [h, m] = hhmm.split(":").map(Number);
  const utcMs = Date.parse(`${dateStr}T00:00:00Z`) + (h * 60 + m) * 60 * 1000 - 9 * 60 * 60 * 1000;
  return new Date(utcMs);
}

function addDaysKstDateStr(baseDate, days) {
  const d = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const account = findAccount();
  if (!account) {
    console.error(`계정을 찾을 수 없습니다: "${ACCOUNT_LABEL}". 먼저 계정 관리 탭에서 OAuth로 연결해주세요.`);
    process.exit(1);
  }
  console.log(`계정 확인됨: ${account.label} (${account.id})`);

  const topicIds = pickTopicIds(COUNT);
  const hookFormatIds = pickHookFormatIds(COUNT);

  // 오늘 KST 날짜부터 시작해서 슬롯을 순서대로 채운다 (하루 3개씩)
  const nowKstDateStr = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const newPosts = [];

  for (let i = 0; i < COUNT; i++) {
    const dayOffset = Math.floor(i / DAILY_SLOTS_KST.length);
    const slot = DAILY_SLOTS_KST[i % DAILY_SLOTS_KST.length];
    const dateStr = addDaysKstDateStr(new Date(nowKstDateStr + "T00:00:00Z"), dayOffset);

    console.log(`[${i + 1}/${COUNT}] 생성 중... (예정: ${dateStr} ${slot} KST)`);
    const draft = await writeThreadDraft({ dateKey: dateStr, topicId: topicIds[i], hookFormatId: hookFormatIds[i] });

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
  await writeSchedule(merged, { sha, message: `chore: schedule ${COUNT} posts for ${ACCOUNT_LABEL}`, basePosts });

  console.log(`\n완료: ${ACCOUNT_LABEL} 계정에 ${COUNT}건 예약 등록함.`);
}

main().catch((err) => {
  console.error("실패:", err);
  process.exit(1);
});
