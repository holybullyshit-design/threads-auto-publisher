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
//   (끝에 --dry-run을 붙이면 날짜별 시각 계획만 출력하고 글은 만들지 않는다)

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

const DRY_RUN = process.argv.includes("--dry-run");
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

// 절대 시각(ms)을 KST 기준 "하루 중 몇 분째"로 바꾼다 - generateDailySlots의 앵커 회피에 씀.
function msToKstMinuteOfDay(ms) {
  const k = new Date(ms + 9 * 60 * 60 * 1000);
  return k.getUTCHours() * 60 + k.getUTCMinutes();
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
// 2026-09-02 재조정: 규칙 자체가 "글마다 2~3시간"으로 확정된 뒤에도 이 값이 45분에 머물러
// 있어서, "이미 4/5 채워진 날에 1개만 추가로 채우기" 같은 부분 재실행에서 57~118분짜리
// 위반이 실측으로 남아있었다(generateDailySlots의 앵커 회피는 그 날 새로 뽑는 슬롯끼리만
// 알고, 이전 실행에서 이미 저장된 슬롯은 여기 45분 안전장치로만 걸러졌기 때문). 규칙과
// 맞춰서 120분으로 올림 - 이제 부분 재실행을 몇 번을 해도 최종 결과가 2시간 미만으로
// 붙을 수 없다.
const MIN_GAP_MINUTES = 120;
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

// 2026-09-02 사용자 지시(3차 - 간격 엄수 우선): "코어 시간대(오전 7~9시/저녁 19~21시) 커버"와
// "글마다 2~3시간 간격 엄수" 둘 다 채우려 했더니 산수상 불가능했다(4개 구간, 최대 3시간씩이면
// 최대 12시간 - 07~08시 시작이면 아무리 늦어도 19~20시가 한계라 21시 이후 마감과 충돌).
// 사용자에게 우선순위를 확인한 결과 - "간격 2~3시간 엄수"가 우선이고, 저녁 코어(19~21시)는
// "간격을 최대(3시간)쪽으로 당기면 자주 걸리는" 정도로 충분하다고 결정됨. 그래서 1번째 글만
// 오전 코어(07:00~09:00)에 고정하고, 나머지는 그냥 2~3시간 간격을 순서대로 쌓는다.
// "매일 새로 랜덤 계산"하라는 지시도 있어서, 이 함수를 날짜마다 새로 호출한다(호출부 참고).
//
// 2026-09-02 4차 개정: 연리지실타래/아해사주는 댓글유도 글(다른 경로, 내가 시각을 못 바꿈)이
// 하루 안 어딘가에 이미 박혀있는데, 예전엔 "5개 생성 후 그 글과 가장 가까운 걸 버리는" 방식을
// 썼다 - 그런데 이러면 "버리고 남은 두 슬롯 사이" 간격은 안 보장돼서, 댓글유도 글 바로 옆
// 슬롯이 2시간 미만으로 붙는 사고가 실측 9건 나왔다. 그래서 "장애물 회피" 방식으로 바꿨다:
// 시퀀스를 순서대로 쌓다가 앵커(댓글유도 글) 시각과 2시간 미만으로 가까워지면, 그 슬롯을
// 아예 "앵커 시각 + 2시간"으로 건너뛰고 이어간다 - 앵커 자체는 절대 건드리지 않고, 내가
// 만드는 슬롯만 앵커를 피해서 최소 2시간 여유를 항상 확보한다.
function generateDailySlots(count = 5, anchorMin = null) {
  const AM_CORE_START = 7 * 60, AM_CORE_END = 9 * 60; // 07:00~09:00
  const MIN_GAP_MIN = 120, MAX_GAP_MIN = 180; // 2~3시간, 예외 없이 매 구간 적용
  const ANCHOR_MARGIN_MIN = 120; // 앵커와의 최소 여유도 동일하게 2시간

  const slots = [AM_CORE_START + Math.random() * (AM_CORE_END - AM_CORE_START)];
  while (slots.length < count) {
    let next = slots[slots.length - 1] + MIN_GAP_MIN + Math.random() * (MAX_GAP_MIN - MIN_GAP_MIN);
    if (anchorMin !== null && Math.abs(next - anchorMin) < ANCHOR_MARGIN_MIN) {
      next = anchorMin + ANCHOR_MARGIN_MIN; // 앵커에 너무 가까우면 앵커 이후로 넘겨서 순서를 지킨다
    }
    slots.push(next);
  }
  return slots.map(minutesToHHMM);
}

// 2026-09-15 실측 사고(직전 차단): 그 날에 이미 글이 "오후에만" 있는 부분일(예: 14:49, 17:11)을
// 채울 때, 예전 방식은 새로 뽑은 슬롯 중 뒤쪽 칸(dayLabels[already + i])을 골랐다 - 기존 글이
// 앞쪽 칸을 차지했다고 가정한 것. 그러면 새 글이 기존 글과 부딪혀 충돌 회피로 계속 뒤로만 밀려서
// 아침은 비고 21시·23시·새벽에 글이 몰렸다(13:17 예정 -> 21:03 저장). 그래서 부분일은 기존 시각
// 전부를 "고정점"으로 두고, 07~09시 시작 / 모든 간격 2~3시간 / 22시 이전 조건을 만족하는
// 새 시각 조합을 무작위로 여러 번 시도해서 찾는다. 빈 날(고정점 없음)도 같은 함수로 처리한다.
// 반환: 새 글 시각(UTC ms) need개 배열, 조건을 만족하는 조합을 못 찾으면 null(그 날은 건너뜀).
function planDayTimes(dateStr, fixedUtcMs, need) {
  const DAY_START = 7 * 60, FIRST_LATEST = 9 * 60, DAY_END = 22 * 60;
  // 최소 간격을 122분으로 둔다 - 기존 글 시각에 초가 붙어 있으면(예: 17:09:40) 분 단위 반올림
  // 때문에 실제 간격이 119.x분이 되는 경우가 실측으로 나와서, 2분 여유를 둬서 항상 120분 이상 보장.
  const MIN_GAP = 122, MAX_GAP = 180;
  const dayZeroUtc = Date.parse(`${dateStr}T00:00:00Z`) - 9 * 60 * 60 * 1000; // KST 00:00의 UTC ms
  const fixed = fixedUtcMs.map((ms) => Math.round((ms - dayZeroUtc) / 60000)).sort((a, b) => a - b);
  const rand = (lo, hi) => lo + Math.random() * (hi - lo);

  for (let attempt = 0; attempt < 8000; attempt++) {
    const seq = []; // {min, isNew}
    let fi = 0;
    // 첫 글: 고정점이 09시 이전에 있으면 그게 첫 글, 아니면 07~09시(다음 고정점과 2시간 여유) 사이 새 글
    if (fixed.length && fixed[0] <= FIRST_LATEST) {
      seq.push({ min: fixed[0], isNew: false });
      fi = 1;
    } else {
      const hi = Math.min(FIRST_LATEST, fixed.length ? fixed[0] - MIN_GAP : FIRST_LATEST);
      if (hi < DAY_START) break; // 고정점이 너무 이르면 이 방식으로는 불가
      seq.push({ min: rand(DAY_START, hi), isNew: true });
    }
    let newCount = seq.filter((s) => s.isNew).length;
    let ok = true;
    while (fi < fixed.length || newCount < need) {
      const prev = seq[seq.length - 1].min;
      const nextFixed = fi < fixed.length ? fixed[fi] : null;
      // 다음 고정점까지 새 글을 하나 끼울 공간(앞뒤 2시간)이 있고, 아직 새 글이 더 필요하면 무작위로 끼울지 결정
      const canInsert = newCount < need && (nextFixed === null || nextFixed - prev >= MIN_GAP * 2);
      const mustInsert = newCount < need && nextFixed !== null && nextFixed - prev > MAX_GAP && canInsert;
      if (canInsert && (nextFixed === null || mustInsert || Math.random() < 0.5)) {
        const hi = Math.min(prev + MAX_GAP, nextFixed !== null ? nextFixed - MIN_GAP : prev + MAX_GAP);
        if (hi < prev + MIN_GAP) { ok = false; break; }
        seq.push({ min: rand(prev + MIN_GAP, hi), isNew: true });
        newCount++;
        continue;
      }
      if (nextFixed === null) { ok = false; break; }
      if (nextFixed - prev < MIN_GAP) { ok = false; break; } // 고정점끼리/직전 새 글과 2시간 미만이면 실패
      seq.push({ min: nextFixed, isNew: false });
      fi++;
    }
    if (!ok || newCount !== need) continue;
    const mins = seq.map((s) => Math.round(s.min));
    if (mins[mins.length - 1] > DAY_END) continue;
    let gapsOk = true;
    for (let i = 1; i < mins.length; i++) {
      const g = mins[i] - mins[i - 1];
      if (g < MIN_GAP) gapsOk = false;
      // 2026-09-15 실측: 댓글유도 앵커 앞에서 새 글끼리 일찍 끝나 앵커까지 214~235분이 벌어짐.
      // 처음 4000번은 "새 글이 끼인 간격은 3시간 이하"까지 요구하고, 그래도 못 찾을 때만
      // 최소 간격(2시간)만 지키는 조합을 허용한다(규칙상 최소 간격이 최우선).
      if (attempt < 4000 && g > MAX_GAP && (seq[i].isNew || seq[i - 1].isNew)) gapsOk = false;
    }
    if (!gapsOk) continue;
    return seq.filter((s) => s.isNew).map((s) => dayZeroUtc + Math.round(s.min) * 60000);
  }
  return null;
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
      // 그 날 이미 있는 모든 글 시각(댓글유도 글 포함)을 고정점으로 두고 새 시각을 계획한다
      // (planDayTimes 주석 참고 - 예전 dayLabels[already + i] 방식의 뒤로 밀림 사고 대응).
      const dayExisting = existingTimesByDate[cursor] || [];
      const planned = planDayTimes(cursor, dayExisting, need);
      if (!planned) {
        console.log(`  ${cursor}: 기존 글 사이에 규칙(07~09시 시작/2시간 이상 간격/22시 이전)에 맞는 자리가 없어 건너뜀 - 확인 필요`);
      } else {
        const labels = planned.map((ms) => minutesToHHMM(msToKstMinuteOfDay(ms)));
        const fixedLabels = dayExisting.map((ms) => minutesToHHMM(msToKstMinuteOfDay(ms))).sort();
        console.log(`  ${cursor} 기존: ${fixedLabels.join(", ") || "없음"} / 새로: ${labels.join(", ")}`);
        planned.forEach((utcMs, i) => {
          if (utcMs > Date.now() + 15 * 60 * 1000) jobs.push({ dateStr: cursor, slotTime: labels[i], utcTime: new Date(utcMs) });
        });
      }
    }
    cursor = addDaysStr(cursor, 1);
  }

  console.log(`계정: ${account.label} / 모드: ${MODE} / 채울 슬롯: ${jobs.length}개 (오늘 ~ ${END_DATE}, 이미 있는 건 건너뜀)`);
  if (DRY_RUN) {
    console.log("[dry-run] 시각 계획만 출력하고 종료 - 글 생성/저장 안 함.");
    return;
  }
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
