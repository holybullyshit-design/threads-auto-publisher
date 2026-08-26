const crypto = require("crypto");
const { Solar } = require("lunar-javascript");

const STEMS = [..."甲乙丙丁戊己庚辛壬癸"];
const BRANCHES = [..."子丑寅卯辰巳午未申酉戌亥"];
const STEMS_KO = ["갑", "을", "병", "정", "무", "기", "경", "신", "임", "계"];
const BRANCHES_KO = ["자", "축", "인", "묘", "진", "사", "오", "미", "신", "유", "술", "해"];
const ANIMALS = ["쥐", "소", "호랑이", "토끼", "용", "뱀", "말", "양", "원숭이", "닭", "개", "돼지"];
const HANJA_ANIMALS = [..."鼠牛虎兔龍蛇馬羊猴鷄犬豕"];

const RELATION_PAIRS = {
  "인연운 상승": [[0, 1], [2, 11], [3, 10], [4, 9], [5, 8], [6, 7]],
  "오해 조심": [[0, 7], [1, 6], [2, 5], [3, 4], [8, 11], [9, 10]],
  "정리하면 풀림": [[0, 9], [1, 4], [2, 11], [3, 6], [5, 8], [7, 10]],
};
const TRIADS = [[0, 4, 8], [1, 5, 9], [2, 6, 10], [3, 7, 11]];
const TENSION = [[2, 5], [5, 8], [8, 2], [1, 10], [10, 7], [7, 1], [0, 3]];

const RELATION_INFO = {
  "인연운 상승": "사람과 기회가 자연스럽게 이어져요",
  "기회운 활짝": "움직일수록 좋은 연결이 따라와요",
  "변화 앞 신중": "서두르지 않으면 오히려 길이 보여요",
  "오해 조심": "짐작보다 확인이 마음을 지켜줘요",
  "정리하면 풀림": "비우고 고칠수록 흐름이 가벼워져요",
  "속도 조절": "완벽보다 내 리듬을 지키는 날이에요",
  "내가 주도할 날": "자신감은 살리고 고집은 조금 덜어내요",
  "잔잔한 안정운": "평범한 선택이 편안한 복을 만들어요",
};

const ROW_COPY = {
  "인연운 상승": ["반가운 연락엔 오늘 먼저 답장해보세요", "마음에 둔 약속은 오후에 잡는 게 좋아요", "작은 선물이 관계의 온도를 높여줘요", "혼자 끌던 일은 도움을 청하면 풀려요", "진심 어린 칭찬이 내 편을 만들어줘요"],
  "기회운 활짝": ["새 모임과 약속에서 좋은 인연이 들어와요", "미뤄둔 지원과 신청은 오늘 넣어보세요", "평소보다 화사한 색이 기분을 끌어올려요", "필요한 곳에 쓴 돈은 좋은 흐름을 만들어요", "오래 망설인 선택은 작게라도 시작해보세요"],
  "변화 앞 신중": ["감정 섞인 답장은 잠시 저장해두세요", "큰 결제와 계약은 조건을 다시 확인하세요", "몸이 무거우면 약속 하나를 줄여도 좋아요", "예상 밖 일정엔 여유 시간을 남겨두세요", "재촉하는 사람에게는 오늘 답을 미뤄도 괜찮아요"],
  "오해 조심": ["친한 사이일수록 짐작보다 질문이 필요해요", "서운한 마음은 혼자 키우지 말고 풀어보세요", "오늘 들은 소문은 바로 믿지 않는 게 좋아요", "온라인 쇼핑은 결제 전 장바구니를 살펴보세요", "답이 느리다고 마음까지 멀어진 건 아니에요"],
  "정리하면 풀림": ["옷장이나 가방을 정리하면 기분이 맑아져요", "밀린 송금과 예약은 오늘 바로 챙겨보세요", "충동구매보다 오래 쓸 물건을 골라보세요", "익숙한 루틴 하나를 바꾸면 활력이 생겨요", "연락처와 사진을 정리하면 마음도 가벼워져요"],
  "속도 조절": ["완벽하게 하려는 마음을 조금 내려놓으세요", "강한 말보다 부드러운 한마디가 더 통해요", "목과 어깨가 무거우면 가볍게 몸을 풀어주세요", "무리한 약속보다 나만의 시간을 지켜보세요", "일정 사이 쉬는 틈이 오늘의 운을 살려줘요"],
  "내가 주도할 날": ["오늘의 주인공은 나, 원하는 걸 말해보세요", "할 일이 많아도 가장 중요한 하나부터 끝내세요", "내 취향을 믿으면 선택이 훨씬 쉬워져요", "주도권은 잡되 가까운 사람의 말도 들어보세요", "사소한 자신감이 매력을 반짝이게 해줘요"],
  "잔잔한 안정운": ["좋아하는 음악으로 하루의 리듬을 만들어보세요", "익숙한 일을 정확히 끝내면 마음이 편안해져요", "작은 약속을 지키는 일이 좋은 운을 부릅니다", "평범한 저녁 한 끼가 오늘의 최고 휴식이에요", "익숙한 길에서 작은 행운을 발견하게 돼요"],
};

function parseDateKey(dateKey) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey || "")) throw Object.assign(new Error("날짜는 YYYY-MM-DD 형식이어야 합니다."), { status: 400 });
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.toISOString().slice(0, 10) !== dateKey) throw Object.assign(new Error("존재하지 않는 날짜입니다."), { status: 400 });
  return { year, month, day, date };
}

function ganzhiKo(value) {
  return `${STEMS_KO[STEMS.indexOf(value[0])]}${BRANCHES_KO[BRANCHES.indexOf(value[1])]}`;
}

function calculateCalendar(dateKey) {
  const { year, month, day } = parseDateKey(dateKey);
  // 절입 당일은 시간에 따라 월주가 바뀌므로 게시 약속 시각인 06:00 KST를 기준으로 계산한다.
  const lunar = Solar.fromYmdHms(year, month, day, 6, 0, 0).getLunar();
  const eightChar = lunar.getEightChar();
  const result = {
    year: eightChar.getYear(),
    month: eightChar.getMonth(),
    day: eightChar.getDay(),
  };
  result.dayStem = STEMS.indexOf(result.day[0]);
  result.dayBranch = BRANCHES.indexOf(result.day[1]);
  result.korean = `${ganzhiKo(result.year)}년 · ${ganzhiKo(result.month)}월 · ${ganzhiKo(result.day)}일`;
  if (result.dayStem < 0 || result.dayBranch < 0) throw new Error("만세력 계산 결과를 해석할 수 없습니다.");
  return result;
}

function hasPair(pairs, a, b) { return pairs.some(([x, y]) => (x === a && y === b) || (x === b && y === a)); }
function getRelation(zodiacBranch, dayBranch) {
  if (zodiacBranch === dayBranch) return "내가 주도할 날";
  if (hasPair(RELATION_PAIRS["인연운 상승"], zodiacBranch, dayBranch)) return "인연운 상승";
  if (TRIADS.some((triad) => triad.includes(zodiacBranch) && triad.includes(dayBranch))) return "기회운 활짝";
  if ((zodiacBranch - dayBranch + 12) % 12 === 6) return "변화 앞 신중";
  if (hasPair(RELATION_PAIRS["오해 조심"], zodiacBranch, dayBranch)) return "오해 조심";
  if (hasPair(RELATION_PAIRS["정리하면 풀림"], zodiacBranch, dayBranch)) return "정리하면 풀림";
  if (hasPair(TENSION, zodiacBranch, dayBranch)) return "속도 조절";
  return "잔잔한 안정운";
}

function hashIndex(input, length) {
  return crypto.createHash("sha256").update(input).digest().readUInt32BE(0) % length;
}

function yearsFor(branch, baseYear) {
  const years = [];
  for (let year = baseYear - 20; year >= baseYear - 90 && years.length < 4; year -= 1) {
    if (((year - 4) % 12 + 12) % 12 === branch) years.push(year);
  }
  return years;
}

function buildCaption(dateKey, readings, variant = 0) {
  const { month, day } = parseDateKey(dateKey);
  const hooks = [
    "오늘, 내 띠에게 들어온 한 줄을 찾아보세요.",
    "지금 눈에 들어온 문장이 오늘의 힌트일 수 있어요.",
    "서두르기 전, 내 띠의 오늘 흐름부터 확인하세요.",
  ];
  const top = readings.filter((r) => ["인연운 상승", "기회운 활짝"].includes(r.easyTitle)).map((r) => `${r.animal}띠`).join(" · ");
  const marker = `#팔자명가${String(dateKey).replaceAll("-", "")}`;
  return `${month}월 ${day}일 오늘의 띠별 운세\n\n${hooks[variant % hooks.length]}\n\n✨ 오늘 흐름이 부드러운 띠\n${top || "모든 띠가 속도를 조절하면 좋은 날"}\n\n내 생년의 한 줄을 저장해두고, 오늘의 선택 전에 다시 보세요.\n가족과 지인의 띠도 함께 살펴보면 대화가 한결 부드러워집니다.\n\n댓글에 “인간만사 새옹지마”를 남겨 오늘의 복을 지어보세요.\n\n※ 1~2월생은 입춘 시각에 따라 전년도 띠일 수 있어요.\n\n#오늘의운세 #띠별운세 #생년운세 #사주 #만세력 #팔자명가 ${marker}`;
}

function generateFortunePackage(dateKey, { startDate = "2026-08-26" } = {}) {
  const parsed = parseDateKey(dateKey);
  if (dateKey < startDate) throw Object.assign(new Error(`시작일(${startDate}) 이전 콘텐츠는 생성하지 않습니다.`), { status: 400 });
  const calendar = calculateCalendar(dateKey);
  const readings = ANIMALS.map((animal, branch) => {
    const easyTitle = getRelation(branch, calendar.dayBranch);
    const years = yearsFor(branch, parsed.year);
    const source = ROW_COPY[easyTitle];
    const offset = hashIndex(`${dateKey}:${branch}`, source.length);
    const lines = years.map((_, index) => source[(offset + index) % source.length]);
    return { animal, hanja: HANJA_ANIMALS[branch], branch: BRANCHES[branch], easyTitle, easyWhy: RELATION_INFO[easyTitle], years, lines };
  });
  const title = `${parsed.month}월 ${parsed.day}일`;
  const slides = [
    { type: "cover", title, cal: calendar },
    ...[0, 3, 6, 9].map((offset) => ({ type: "list", title, cal: calendar, items: readings.slice(offset, offset + 3) })),
    { type: "message", title, cal: calendar, fixed: true },
    { type: "promo", title, cal: calendar, fixed: true },
  ];
  const result = { schemaVersion: 1, brand: "팔자명가", platform: "instagram", date: dateKey, publishTimeKst: "06:00", calendar, readings, slides, caption: buildCaption(dateKey, readings, hashIndex(dateKey, 3)), generatedAt: new Date().toISOString() };
  const validation = validateFortunePackage(result);
  result.validation = validation;
  result.contentHash = crypto.createHash("sha256").update(JSON.stringify({ date: result.date, calendar: result.calendar, readings: result.readings, caption: result.caption })).digest("hex");
  return result;
}

function validateFortunePackage(pkg) {
  const errors = [];
  try { parseDateKey(pkg.date); } catch (error) { errors.push(error.message); }
  if (pkg.slides?.length !== 7) errors.push("카드는 정확히 7장이어야 합니다.");
  if (pkg.readings?.length !== 12) errors.push("운세는 12띠 모두 있어야 합니다.");
  if (new Set((pkg.readings || []).map((r) => r.animal)).size !== 12) errors.push("띠가 중복되었거나 누락되었습니다.");
  for (const [index, reading] of (pkg.readings || []).entries()) {
    if (reading.years?.length !== 4 || reading.lines?.length !== 4) errors.push(`${reading.animal || index}띠의 생년/문구는 각 4개여야 합니다.`);
    for (const year of reading.years || []) if (((year - 4) % 12 + 12) % 12 !== index) errors.push(`${year}년을 ${reading.animal}띠로 배정한 것이 잘못되었습니다.`);
    if (new Set(reading.lines || []).size !== (reading.lines || []).length) errors.push(`${reading.animal}띠 문구가 중복됩니다.`);
  }
  const recalculated = calculateCalendar(pkg.date);
  if (JSON.stringify(recalculated) !== JSON.stringify(pkg.calendar)) errors.push("날짜와 만세력 결과가 일치하지 않습니다.");
  if (!pkg.caption?.includes("인간만사 새옹지마")) errors.push("댓글 유도 문구가 누락되었습니다.");
  if ((pkg.caption || "").length > 2200) errors.push("인스타그램 캡션 2,200자를 초과했습니다.");
  if (errors.length) throw Object.assign(new Error(`게시 차단: ${errors.join(" ")}`), { code: "FORTUNE_VALIDATION_FAILED", status: 422, errors });
  return { status: "passed", checkedAt: new Date().toISOString(), checks: 8 };
}

function generateDateRange(startDate, endDate) {
  const start = parseDateKey(startDate).date;
  const end = parseDateKey(endDate).date;
  if (start > end) throw Object.assign(new Error("시작일은 종료일보다 빠를 수 없습니다."), { status: 400 });
  const packages = [];
  for (let cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) packages.push(generateFortunePackage(cursor.toISOString().slice(0, 10)));
  return packages;
}

module.exports = { ANIMALS, BRANCHES, calculateCalendar, generateFortunePackage, generateDateRange, validateFortunePackage, parseDateKey };
