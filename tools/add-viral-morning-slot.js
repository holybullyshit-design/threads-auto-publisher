// 연리지실타래/아해사주처럼 "고정 페르소나 + 댓글 유도"로 운영해온 계정에, 오전 슬롯 하나를
// 추가로 "팔자장인 스타일 바이럴 콘텐츠"로 채운다. 기존 오후 5시 댓글유도 콘텐츠는 그대로 두고,
// 이 스크립트는 새 글만 추가한다(취소/삭제 없음).
//
// 엔진은 taebaekSajuDraftWriter를 그대로 재사용하되, domainFraming/speechLevel/topicPool로
// "이 계정 컨셉(연애/육아) 렌즈로 소재를 재해석"하도록 지시한다 - 새 파일을 만들지 않고
// 이미 검증된 엔진(가독성 규칙·파트개수 검증 등 다 포함)을 그대로 쓴다.
//
// 사용법: node tools/add-viral-morning-slot.js "<계정라벨>" <종료일 YYYY-MM-DD>
// 예:     node tools/add-viral-morning-slot.js "연리지 실타래" 2026-08-31

require("dotenv").config();
const crypto = require("crypto");
const accountsStore = require("../server/lib/accountsStore");
const { readSchedule, writeSchedule } = require("../server/lib/githubStore");
const { withJitter } = require("../server/lib/scheduleStore");
const { writeThreadDraft, TOPICS, pickTopicIds, pickHookFormatIds } = require("../server/skills/taebaekSajuDraftWriter");

const MORNING_SLOT_KST = "09:00";
const RETRY_ATTEMPTS = 3;

// 계정별 프로필 - 소재는 이 계정 컨셉에 자연스럽게 연결되는 것만 남겼다(재성/관성 시기는
// 직장·재물 얘기라 연애/육아 어느 쪽에도 안 맞아서 둘 다 제외).
const CHANNEL_PROFILES = {
  "연리지 실타래": {
    topicIds: ["yeokma", "dohwa", "hwagae", "yangin", "cheoneulgwiin", "samjae"],
    speechLevel: "반말",
    domainFraming: `이 계정(연리지 실타래)은 연애·인간관계(재회/궁합/이혼/부부/결혼)를 다루는 계정입니다.
[검증된 사실]에 있는 신살을 직장/재물이 아니라 반드시 연애·인간관계 관점으로 재해석해서 씁니다.
예: 도화살="이성에게 끌리는 매력", 천을귀인="귀인 같은 인연/애인을 만남",
화개살="연애보다 자기 세계에 몰입하는 타입", 역마살="새로운 인연이 자꾸 생기는 흐름",
양인살="연애에서도 승부욕/추진력이 강한 타입", 삼재="인연·관계가 유독 흔들리는 시기".
절대 직장·이직·재물·시험 얘기로 쓰지 않습니다.`,
    extraBans: "",
  },
  "아해사주": {
    topicIds: ["yeokma", "dohwa", "hwagae", "yangin", "cheoneulgwiin"],
    speechLevel: "존댓말",
    domainFraming: `이 계정(아해사주)은 아이의 타고난 기질을 다루는 계정입니다.
[검증된 사실]에 있는 신살을 어른의 연애/직장/재물이 아니라 반드시 "아이의 타고난 기질/성향"
관점으로 재해석해서 씁니다. 예: 도화살="또래에게 인기가 많고 사람을 끄는 아이",
천을귀인="어디서든 도와주는 사람을 잘 만나는 아이", 화개살="한 가지에 깊이 몰입하는 아이",
역마살="가만히 못 있고 활동적인 아이", 양인살="승부욕이 강하고 결단력 있는 아이".
아이를 문제아처럼 단정짓거나 부정적으로 낙인찍는 표현은 쓰지 않고, 항상 이해와 가능성의
언어로 씁니다. 연애/이성 관련 표현은 절대 쓰지 않습니다(친구·또래 관계로만 표현).`,
    extraBans:
      "임신, 난임, 유산, 사산, 불임 시술(시험관/인공수정 등)은 어떤 각도로도 절대 언급하지 않는다. " +
      "이 계정이 다루는 건 이미 태어난 아이의 기질뿐이다.",
  },
};

const ACCOUNT_LABEL = process.argv[2];
const END_DATE = process.argv[3];

if (!ACCOUNT_LABEL || !END_DATE || !CHANNEL_PROFILES[ACCOUNT_LABEL]) {
  console.error('사용법: node tools/add-viral-morning-slot.js "<연리지 실타래|아해사주>" <종료일 YYYY-MM-DD>');
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

function addDaysStr(dateStr, days) {
  return new Date(Date.parse(`${dateStr}T00:00:00Z`) + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// 오늘(KST)부터 END_DATE까지, 이미 지난 오전 슬롯은 건너뛴다.
function buildMorningSlots() {
  const todayStr = nowKst().toISOString().slice(0, 10);
  const slots = [];
  let cursor = todayStr;
  while (cursor <= END_DATE) {
    const utcTime = kstSlotToUtc(cursor, MORNING_SLOT_KST);
    if (utcTime.getTime() > Date.now()) slots.push(cursor);
    cursor = addDaysStr(cursor, 1);
  }
  return slots;
}

async function writeThreadDraftWithRetry(args) {
  let lastErr;
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      return await writeThreadDraft(args);
    } catch (err) {
      lastErr = err;
      console.log(`  (시도 ${attempt}/${RETRY_ATTEMPTS} 실패: ${err.message} - 재시도)`);
    }
  }
  throw lastErr;
}

async function saveOnePost(account, draft, when) {
  const { posts, sha } = await readSchedule();
  const basePosts = posts.slice();
  const newPost = {
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
  };
  const merged = posts.concat([newPost]);
  await writeSchedule(merged, { sha, message: `chore: schedule 1 viral-morning post for ${ACCOUNT_LABEL}`, basePosts });
  return newPost;
}

async function main() {
  const account = findAccount();
  if (!account) throw new Error(`계정을 찾을 수 없습니다: "${ACCOUNT_LABEL}"`);
  const profile = CHANNEL_PROFILES[ACCOUNT_LABEL];
  const topicPool = TOPICS.filter((t) => profile.topicIds.includes(t.id));
  console.log(`계정 확인됨: ${account.label} (${account.id}) / 소재 풀: ${topicPool.map((t) => t.label).join(", ")}`);

  const slots = buildMorningSlots();
  console.log(`추가할 오전(${MORNING_SLOT_KST} KST) 슬롯: ${slots.length}개 (오늘 ~ ${END_DATE})`);
  if (slots.length === 0) {
    console.log("추가할 슬롯이 없습니다. 종료.");
    return;
  }

  const topicIds = pickTopicIds(slots.length, profile.topicIds);
  const hookFormatIds = pickHookFormatIds(slots.length);
  let savedCount = 0;

  for (let i = 0; i < slots.length; i++) {
    const dateStr = slots[i];
    console.log(`[${i + 1}/${slots.length}] 생성 중... (예정: ${dateStr} ${MORNING_SLOT_KST} KST)`);
    let draft;
    try {
      draft = await writeThreadDraftWithRetry({
        dateKey: dateStr,
        topicId: topicIds[i],
        hookFormatId: hookFormatIds[i],
        accountLabel: ACCOUNT_LABEL,
        topicPool,
        domainFraming: profile.domainFraming,
        speechLevel: profile.speechLevel,
        extraBans: profile.extraBans,
      });
    } catch (err) {
      console.log(`  -> ${RETRY_ATTEMPTS}번 다 실패, 이 슬롯은 건너뜀: ${err.message}`);
      continue;
    }
    const when = withJitter(kstSlotToUtc(dateStr, MORNING_SLOT_KST));
    await saveOnePost(account, draft, when);
    savedCount++;
    console.log(`  -> 저장됨. 소재: ${draft.topic} / 훅: ${draft.hookFormat} / 파트 ${1 + draft.replyChain.length}개`);
  }

  console.log(`\n완료: ${ACCOUNT_LABEL} 오전 슬롯 ${savedCount}/${slots.length}건 추가 (기존 오후 5시 콘텐츠는 그대로 유지).`);
}

main().catch((err) => {
  console.error("실패:", err);
  process.exit(1);
});
