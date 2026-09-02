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

const RETRY_ATTEMPTS = 3;
// 2026-09-02: 시간대 배치는 데이터 기반 계산(computeSlotsWithMorningAnchor, tools/lib/optimalSlots.js)
// 대신 사용자가 준 명시적 규칙(generateDailySlots 참고 - 07~08시 시작, 글당 2~3시간 간격,
// 22시 마지노선, 매일 새로 랜덤)을 쓴다. optimalSlots.js 자체는 남겨뒀다(다른 곳에서 참고용).
// 댓글 유도형(생년월일시 남기는 상담체, 연리지실타래/아해사주 하루 1개)은 이 스크립트가 만드는
// 게 아니라 완전히 별도 경로에서 생성되는 기존 글이라 - 손대지 않는다(시간도 고정 가정 안 함).
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
절대 직장·이직·재물·시험 얘기로 쓰지 않습니다.
분위기 자체도 이 계정 톤에 맞춰야 합니다 — 헤어짐의 미련, 권태기, 이혼 후 감정, 짝사랑,
재회에 대한 기대와 불안처럼 "연애 감정"이 묻어나는 장면/문장으로 씁니다. 신살을 건조하게
설명만 하고 끝내지 말고, 그 신살을 가진 사람이 연애에서 실제로 겪는 구체적인 순간(예: "연락처
지웠다 다시 저장하기", "호칭이 '여보'에서 '저기'로 바뀜")으로 체감되게 씁니다.`,
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
언어로 씁니다. 연애/이성 관련 표현은 절대 쓰지 않습니다(친구·또래 관계로만 표현).
이 계정을 실제로 읽는 사람은 아이가 아니라 부모(주로 엄마)입니다 — 후킹의 핵심은 "우리 아이도
혹시?" 하는 즉각적인 자기 자녀 대입과 궁금증입니다. 그래서 도입부는 아이 자체를 설명하기 전에,
부모가 일상에서 실제로 목격했을 법한 아주 구체적인 행동/장면(예: "장난감 정리 안 한다고 혼내면
꼭 한마디 더 하는 아이")부터 던져서 "어, 우리 애 얘기인가?" 싶게 만들고, 그다음에 그 행동이
사주적으로 어떤 기질인지 풀어줍니다. 아이 행동 묘사 없이 신살 설명부터 바로 시작하지 않습니다.`,
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

// 계정의 "그 날짜에 이미 예약된 실제 시:분" 목록 - 댓글유도 글처럼 완전히 다른 경로로 생긴
// 글까지 전부 포함한다(viralEngine 플래그나 상태와 무관하게, canceled만 제외). 아래
// MIN_GAP_MINUTES 충돌 회피에서 쓴다.
function buildExistingTimesByDate(posts, accountId) {
  const byDate = {};
  posts
    .filter((p) => p.accountId === accountId && p.status !== "canceled" && p.platform !== "instagram" && p.scheduledAt)
    .forEach((p) => {
      const { date } = toKstDateHour(p.scheduledAt);
      (byDate[date] = byDate[date] || []).push(new Date(p.scheduledAt).getTime());
    });
  return byDate;
}

// 2026-09-02 실측: 연리지실타래/아해사주가 매일 오후 5시경 댓글유도 글과 바이럴 4번째 슬롯이
// 같은 17시대를 노려서, 1분~15분 간격으로 두 글이 거의 붙어서 나가고 있었다(심한 날은 18초
// 차이). 팔자궤도도 같은 시각이 두 번 겹친 사례 1건 발견 - 서로 다른 실행이 같은 계산 결과를
// 검증 없이 그대로 써서 생긴 우연. 그래서 새 슬롯 시각을 정할 때, 그 날짜에 이미 있는 실제
// 시각들(댓글유도 글 포함)과 최소 간격을 강제한다 - 너무 가까우면 뒤로 밀어낸다.
const MIN_GAP_MINUTES = 45;
function resolveCollisionFreeTime(candidateUtcMs, existingTimesMs) {
  let t = candidateUtcMs;
  const minGapMs = MIN_GAP_MINUTES * 60 * 1000;
  for (let guard = 0; guard < 20; guard++) {
    const clash = existingTimesMs.find((e) => Math.abs(e - t) < minGapMs);
    if (!clash) return t;
    t += minGapMs; // 겹치면 최소 간격만큼 뒤로 민다 - 같은 방향으로만 밀어야 순서가 안 꼬인다
  }
  return t; // 20번 밀어도 안 풀리면(사실상 불가능한 밀집) 마지막 값 그대로 반환
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

function minutesToHHMM(totalMinutes) {
  const m = Math.round(totalMinutes);
  const h = Math.floor(m / 60);
  return `${String(h).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

// 2026-09-02 사용자 지시: 데이터 기반 시간대 계산(computeSlotsWithMorningAnchor) 대신, 하루
// 5개 기준 명시적 규칙을 쓴다 - 첫 글은 아침 7~8시 사이(출근하는 사람도 보게), 마지막 글은
// 오후 10시(22:00)를 절대 넘기지 않고, 글과 글 사이는 최소 2시간~최대 3시간. "매일 새로
// 랜덤 계산"하라는 지시도 있어서, 실행할 때마다 한 번 계산해서 모든 날짜에 재사용하지 않고
// 이 함수를 날짜마다 새로 호출한다(호출부 참고) - 매일 리듬이 조금씩 달라진다.
function generateDailySlots(count = 5) {
  const DAY_START_MIN = 7 * 60; // 07:00
  const DAY_START_SPAN_MIN = 60; // ~08:00까지
  const MAX_END_MIN = 22 * 60; // 22:00 마지노선
  const MIN_GAP_MIN = 120;
  const MAX_GAP_MIN = 180;
  const slots = [DAY_START_MIN + Math.random() * DAY_START_SPAN_MIN];
  for (let i = 1; i < count; i++) {
    const gap = MIN_GAP_MIN + Math.random() * (MAX_GAP_MIN - MIN_GAP_MIN);
    slots.push(Math.min(slots[slots.length - 1] + gap, MAX_END_MIN));
  }
  return slots.map(minutesToHHMM);
}

async function main() {
  const account = findAccount();
  if (!account) throw new Error(`계정을 찾을 수 없습니다: "${ACCOUNT_LABEL}"`);

  // viral-morning(연리지실타래/아해사주)은 하루 5개 중 1개(댓글유도 글)가 완전히 다른 경로에서
  // 생기므로, 목표 개수는 4로 고정하되 시간 슬롯 자체는 매일 5개를 계산한 뒤 그 날 이미 있는
  // "바이럴이 아닌" 글(=댓글유도 글, 어떤 시각이든 무관 - 17시라고 고정하지 않는다)과 가장
  // 가까운 슬롯 하나를 버리고 나머지 4개를 쓴다. 그 날 댓글유도 글이 아직 없으면 그냥 마지막
  // (가장 늦은) 슬롯을 버린다.
  const targetSlotsPerDay = MODE === "comprehensive" ? 5 : VIRAL_MORNING_DAILY_SLOTS;

  const { posts: currentPosts } = await readSchedule();
  const existingCounts = countExistingByDate(currentPosts, account.id, MODE);
  const existingTimesByDate = buildExistingTimesByDate(currentPosts, account.id);
  // viral-morning 전용: "바이럴 아닌" 글(댓글유도 등)만 날짜별로 따로 뽑아둔다.
  const nonViralTimesByDate = {};
  if (MODE === "viral-morning") {
    currentPosts
      .filter((p) => p.accountId === account.id && p.status !== "canceled" && p.platform !== "instagram" && p.scheduledAt)
      .filter((p) => !(p.viralEngine === true || (p.viralEngine === undefined && toKstDateHour(p.scheduledAt).hour < 12)))
      .forEach((p) => {
        const { date } = toKstDateHour(p.scheduledAt);
        (nonViralTimesByDate[date] = nonViralTimesByDate[date] || []).push(new Date(p.scheduledAt).getTime());
      });
  }

  // 날짜별로 "이미 채워진 개수"만큼은 빼고, 부족한 만큼만 오늘 목표(targetSlotsPerDay)에 채운다.
  const jobs = []; // { dateStr, slotTime, utcTime }
  const todayStr = nowKst().toISOString().slice(0, 10);
  let cursor = todayStr;
  while (cursor <= END_DATE) {
    const already = existingCounts[cursor] || 0;
    const need = Math.max(0, targetSlotsPerDay - already);
    if (need > 0) {
      let dayLabels = generateDailySlots(5); // "07:12" 같은 라벨 5개, 매일 새로 뽑음
      if (MODE === "viral-morning") {
        const nonViral = nonViralTimesByDate[cursor] || [];
        const dayMs = dayLabels.map((hhmm) => kstSlotToUtc(cursor, hhmm).getTime());
        let dropIdx = dayLabels.length - 1; // 기본값: 댓글유도 글이 아직 없으면 제일 늦은 슬롯을 버림
        if (nonViral.length > 0) {
          let best = Infinity;
          dayMs.forEach((ms, idx) => {
            const dist = Math.min(...nonViral.map((n) => Math.abs(n - ms)));
            if (dist < best) { best = dist; dropIdx = idx; }
          });
        }
        dayLabels = dayLabels.filter((_, idx) => idx !== dropIdx);
      }
      console.log(`  ${cursor} 슬롯: ${dayLabels.join(", ")}`);

      const dayExisting = (existingTimesByDate[cursor] = existingTimesByDate[cursor] || []);
      for (let i = 0; i < need; i++) {
        const slotTime = dayLabels[(already + i) % dayLabels.length];
        // 지터(±15분)를 먼저 적용한 뒤에 충돌 회피를 해야, 지터가 다시 다른 글과 가깝게 만드는
        // 걸 막을 수 있다 - 순서를 반대로 하면(회피 먼저, 지터 나중) 지터가 회피 결과를 무효화함.
        const jitteredMs = withJitter(kstSlotToUtc(cursor, slotTime)).getTime();
        const utcMs = resolveCollisionFreeTime(jitteredMs, dayExisting);
        dayExisting.push(utcMs); // 같은 날짜의 다음 잡(job)도 이 시각을 피해가도록 바로 등록
        const utcTime = new Date(utcMs);
        if (utcTime.getTime() > Date.now()) jobs.push({ dateStr: cursor, slotTime, utcTime });
      }
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
    const { dateStr, slotTime, utcTime: plannedUtcTime } = jobs[i];
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
    // 이미 지터+충돌회피까지 끝낸 시각을 그대로 쓴다 - 여기서 다시 계산하면(kstSlotToUtc를
    // 다시 부르면) 위에서 구한 충돌회피 결과가 통째로 날아간다.
    await saveOnePost(account, draft, plannedUtcTime);
    saved++;
    console.log(`  -> 저장됨. 소재: ${draft.topic} / 훅: ${draft.hookFormat} / 파트 ${1 + draft.replyChain.length}개`);
  }

  console.log(`\n완료: ${ACCOUNT_LABEL} - ${saved}/${jobs.length}건 추가 (${END_DATE}까지).`);
}

main().catch((err) => {
  console.error("실패:", err);
  process.exit(1);
});
