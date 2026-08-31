// 계정 하나의 예약을, 오늘부터 지정한 종료일까지 "이미 채워진 날짜/슬롯은 건너뛰고" 빈 자리만
// 채운다. 취소는 절대 하지 않는다 - 기존 글은 손대지 않고 새 글만 추가한다.
//
// 2026-08-29: 예약 중복 게시 사고 이후, "이미 있는 슬롯을 다시 채워서 같은 시간대에 두 개가
// 겹치는" 실수를 만들지 않기 위해 이 스크립트는 실행 전에 항상 기존 예약을 (날짜, 계정) 기준
// 으로 먼저 조사하고, 이미 채워진 슬롯 수만큼은 건너뛴다.
//
// 사용법:
//   node tools/fill-schedule.js comprehensive "<팔자명가|팔자장인|팔자궤도>" <종료일 YYYY-MM-DD>
//   node tools/fill-schedule.js viral-morning "<연리지 실타래|아해사주>" <종료일 YYYY-MM-DD>

require("dotenv").config();
const crypto = require("crypto");
const accountsStore = require("../server/lib/accountsStore");
const { readSchedule, writeSchedule } = require("../server/lib/githubStore");
const { withJitter } = require("../server/lib/scheduleStore");
const { writeThreadDraft, TOPICS, pickTopicIds, pickHookFormatIds } = require("../server/skills/taebaekSajuDraftWriter");
const { computeOptimalSlots } = require("./lib/optimalSlots");

const RETRY_ATTEMPTS = 3;
// 2026-08-30: "몇 시에 올릴지"를 매번 새로 정하지 않고, 실제 Threads Insights 데이터에서
// 코드로 계산한다(tools/lib/optimalSlots.js - LLM 호출 없음, 토큰 비용 0). 서버가 매시간
// 백그라운드로 데이터를 갱신하니, 이 파일을 다시 실행할 때마다 자동으로 최신 데이터 기준으로
// 재계산된다 - 사람이 다시 판단할 필요도, 대화로 다시 분석할 필요도 없다.
// 하루를(새벽 제외) 5등분해서 구간마다 대표 시각을 뽑되, 그 구간 안에서 실제 조회수가 높았던
// 쪽으로 시각을 당긴다 - "하루 전체에 골고루 분산" + "데이터가 좋은 쪽으로 미세조정"을 동시에
// 만족시킨다. 표본이 아직 부족하면(계정 초기 등) 조용히 기존 안전값으로 대체된다.
const COMPREHENSIVE_ACCOUNT_LABELS = ["팔자명가", "팔자궤도", "팔자장인"];
// 2026-08-30 2차 변경: 연리지실타래/아해사주도 "바이럴(팔자장인 스타일)" 슬롯을 하루 1개에서
// 4개로 늘리고, 시간도 고정 09:00이 아니라 데이터 기반으로 하루에 분산시킨다(사용자 요청).
// 댓글 유도형(생년월일시 남기는 상담체, 오후 5시경 1개)은 이 스크립트가 만드는 게 아니라
// 완전히 별도 경로에서 생성되는 기존 글이라 - 손대지 않는다.
const VIRAL_MORNING_DAILY_SLOTS = 4;

const VIRAL_PROFILES = {
  "연리지 실타래": {
    topicIds: ["yeokma", "dohwa", "hwagae", "yangin", "cheoneulgwiin", "samjae"],
    speechLevel: "반말",
    domainFraming: `이 계정(연리지 실타래)은 연애·인간관계(재회/궁합/이혼/부부/결혼)를 다루는 계정입니다.
[검증된 사실]에 있는 신살을 직장/재물이 아니라 반드시 연애·인간관계 관점으로 재해석해서 씁니다.
예: 도화살="이성에게 끌리는 매력", 천을귀인="귀인 같은 인연/애인을 만남",
화개살="연애보다 자기 세계에 몰입하는 타입", 역마살="새로운 인연이 자꾸 생기는 흐름",
양인살="연애에서도 승부욕/추진력이 강한 타입", 삼재="인연·관계가 유독 흔들리는 시기".
절대 직장·이직·재물·시험 얘기로 쓰지 않습니다.`,
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

const MODE = process.argv[2];
const ACCOUNT_LABEL = process.argv[3];
const END_DATE = process.argv[4];

if (!["comprehensive", "viral-morning"].includes(MODE) || !ACCOUNT_LABEL || !END_DATE) {
  console.error('사용법: node tools/fill-schedule.js <comprehensive|viral-morning> "<계정라벨>" <종료일 YYYY-MM-DD>');
  process.exit(1);
}
if (MODE === "viral-morning" && !VIRAL_PROFILES[ACCOUNT_LABEL]) {
  console.error(`viral-morning 모드는 다음 계정만 지원: ${Object.keys(VIRAL_PROFILES).join(", ")}`);
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

function toKstDateHour(iso) {
  const k = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
  return { date: k.toISOString().slice(0, 10), hour: k.getUTCHours() };
}

function addDaysStr(dateStr, days) {
  return new Date(Date.parse(`${dateStr}T00:00:00Z`) + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// 이미 있는 스케줄에서, "이 날짜에 이미 몇 개가 있는지"를 구한다(시:분 정확히 일치가 아니라
// 같은 KST 날짜에 이미 채워진 슬롯 개수로 판단 - 지터 때문에 정확한 시:분은 매번 흔들리므로).
//
// viral-morning 모드에서는 "바이럴 슬롯"만 세야 한다 - 연리지실타래/아해사주는 원래 매일
// 오후 5시경 댓글유도 글이 완전히 다른 경로로 하나씩 예약돼 있는데, 이걸 그냥 "그날 이미
// N개 있음"으로 세버리면 바이럴 슬롯이 그만큼 덜 채워진다(2026-08-29 실측: 이 버그로 0개가
// 채워짐 - 다행히 저장 전에 잡음).
// 이 스크립트가 만든 글에는 viralEngine:true 표시를 남기므로 그걸로 정확히 구분하고,
// 표시가 없는 옛날 글(이 필드가 생기기 전, 전부 정오 이전에만 있었음)은 예전처럼 "정오 이전
// = 바이럴"로 집계한다(하위 호환).
function countExistingByDate(posts, accountId, mode) {
  const counts = {};
  posts
    .filter((p) => p.accountId === accountId && p.status !== "canceled" && p.platform !== "instagram")
    .filter((p) => {
      if (mode !== "viral-morning") return true;
      if (p.viralEngine === true) return true;
      if (p.viralEngine === false) return false;
      const { hour } = toKstDateHour(p.scheduledAt);
      return hour < 12; // 표시 없는 옛날 글 - 정오 이전만 "바이럴 슬롯"으로 집계
    })
    .forEach((p) => {
      const { date } = toKstDateHour(p.scheduledAt);
      counts[date] = (counts[date] || 0) + 1;
    });
  return counts;
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
    viralEngine: true, // 이 스크립트(taebaekSajuDraftWriter 엔진)로 만든 글 표시 - countExistingByDate 참고
  };
  await writeSchedule(posts.concat([newPost]), { sha, message: `chore: fill 1 slot for ${ACCOUNT_LABEL}`, basePosts });
  return newPost;
}

async function main() {
  const account = findAccount();
  if (!account) throw new Error(`계정을 찾을 수 없습니다: "${ACCOUNT_LABEL}"`);

  let dailySlotTimes;
  if (MODE === "comprehensive") {
    const { slots, usedFallback } = computeOptimalSlots(COMPREHENSIVE_ACCOUNT_LABELS, 5);
    dailySlotTimes = slots;
    console.log(
      `시간대 ${usedFallback ? "(데이터 부족 - 기본값 사용)" : "(실측 데이터 기반 자동 계산)"}: ${slots.join(", ")}`
    );
  } else {
    // 연리지실타래/아해사주의 바이럴 슬롯도 같은 계산기를 쓴다 - 팔자명가/팔자궤도/팔자장인과
    // 같은 장르(바이럴 클리프행어)라 풀링해서 표본을 늘린다.
    const { slots, usedFallback } = computeOptimalSlots(
      [...COMPREHENSIVE_ACCOUNT_LABELS, ...Object.keys(VIRAL_PROFILES)],
      VIRAL_MORNING_DAILY_SLOTS
    );
    dailySlotTimes = slots;
    console.log(
      `시간대 ${usedFallback ? "(데이터 부족 - 기본값 사용)" : "(실측 데이터 기반 자동 계산)"}: ${slots.join(", ")}`
    );
  }
  const slotsPerDay = dailySlotTimes.length;

  const { posts: currentPosts } = await readSchedule();
  const existingCounts = countExistingByDate(currentPosts, account.id, MODE);

  // 날짜별로 "이미 채워진 개수"만큼은 빼고, 부족한 만큼만 오늘 목표(slotsPerDay)에 채운다.
  const jobs = []; // { dateStr, slotTime }
  const todayStr = nowKst().toISOString().slice(0, 10);
  let cursor = todayStr;
  while (cursor <= END_DATE) {
    const already = existingCounts[cursor] || 0;
    const need = Math.max(0, slotsPerDay - already);
    for (let i = 0; i < need; i++) {
      const slotTime = dailySlotTimes[(already + i) % dailySlotTimes.length];
      const utcTime = kstSlotToUtc(cursor, slotTime);
      if (utcTime.getTime() > Date.now()) jobs.push({ dateStr: cursor, slotTime });
    }
    cursor = addDaysStr(cursor, 1);
  }

  console.log(`계정: ${account.label} / 모드: ${MODE} / 채울 슬롯: ${jobs.length}개 (오늘 ~ ${END_DATE}, 이미 있는 건 건너뜀)`);
  if (jobs.length === 0) {
    console.log("채울 슬롯이 없습니다 (이미 다 차있음). 종료.");
    return;
  }

  const profile = MODE === "viral-morning" ? VIRAL_PROFILES[ACCOUNT_LABEL] : null;
  const topicPool = profile ? TOPICS.filter((t) => profile.topicIds.includes(t.id)) : TOPICS;
  const poolIds = profile ? profile.topicIds : undefined;
  const topicIds = pickTopicIds(jobs.length, poolIds);
  const hookFormatIds = pickHookFormatIds(jobs.length);

  let saved = 0;
  for (let i = 0; i < jobs.length; i++) {
    const { dateStr, slotTime } = jobs[i];
    console.log(`[${i + 1}/${jobs.length}] 생성 중... (예정: ${dateStr} ${slotTime} KST)`);
    let draft;
    try {
      draft = await writeThreadDraftWithRetry({
        dateKey: dateStr,
        topicId: topicIds[i],
        hookFormatId: hookFormatIds[i],
        accountLabel: ACCOUNT_LABEL,
        topicPool: profile ? topicPool : undefined,
        domainFraming: profile ? profile.domainFraming : undefined,
        speechLevel: profile ? profile.speechLevel : undefined,
        extraBans: profile ? profile.extraBans : undefined,
      });
    } catch (err) {
      console.log(`  -> ${RETRY_ATTEMPTS}번 다 실패, 이 슬롯은 건너뜀: ${err.message}`);
      continue;
    }
    const when = withJitter(kstSlotToUtc(dateStr, slotTime));
    await saveOnePost(account, draft, when);
    saved++;
    console.log(`  -> 저장됨. 소재: ${draft.topic} / 훅: ${draft.hookFormat} / 파트 ${1 + draft.replyChain.length}개`);
  }

  console.log(`\n완료: ${ACCOUNT_LABEL} - ${saved}/${jobs.length}건 추가 (${END_DATE}까지).`);
}

main().catch((err) => {
  console.error("실패:", err);
  process.exit(1);
});
