// 오행 상생상극 · 지장간 · 십성 도출. 이건 명리의 "계산 가능한 뼈대"라서 라이브러리에 맡기지 않고
// 직접 표로 박고 직접 도출한다.
//
// 왜 직접 하나(2026-10-07 실측): lunar-javascript의 지장간 표가 **12지지 중 5개(자·묘·오·유·해)에서
// 한국 실무 주류 표와 다르다**. 라이브러리는 사왕지(자·묘·오·유)의 여기(餘氣)를 빼고 본기만 주고,
// 해수(亥)의 무(戊)도 뺀다. 지장간은 신강약 계산의 입력이라, 표가 다르면 신강/신약 판정이 통째로
// 달라진다. 사용자 지시가 "가장 많이 하는 명리학으로, 모든 풀이가 일치하게"이므로 한국 주류 표를
// 쓴다. 라이브러리는 만세력(네 기둥 간지)·십이운성·납음·공망·대운에만 쓴다.

const N = require("./naming");

// 오행 상생(목→화→토→금→수→목) / 상극(목→토→수→화→금→목)
const SAENG = { 목: "화", 화: "토", 토: "금", 금: "수", 수: "목" };
const GEUK = { 목: "토", 토: "수", 수: "화", 화: "금", 금: "목" };
const ELEMENTS = ["목", "화", "토", "금", "수"];

// 한국 실무 주류 지장간표. 순서는 [여기, 중기, 본기] - 본기가 그 지지의 대표 기운이다.
// 사왕지(자·묘·오·유)는 2개, 나머지는 3개. 본기는 항상 배열의 마지막.
const HIDDEN_STEMS = {
  자: ["임", "계"],
  축: ["계", "신", "기"],
  인: ["무", "병", "갑"],
  묘: ["갑", "을"],
  진: ["을", "계", "무"],
  사: ["무", "경", "병"],
  오: ["병", "기", "정"],
  미: ["정", "을", "기"],
  신: ["무", "임", "경"],
  유: ["경", "신"],
  술: ["신", "정", "무"],
  해: ["무", "갑", "임"],
};
// 역할 이름: 마지막이 본기, 3개짜리의 가운데가 중기, 첫째가 여기.
function hiddenStemRole(list, i) {
  if (i === list.length - 1) return "본기";
  if (list.length === 3 && i === 1) return "중기";
  return "여기";
}

// 십성 도출: 일간 오행·음양을 기준으로 상대 천간의 오행·음양을 비교한다.
//   같은 오행   → 음양 같으면 비견, 다르면 겁재
//   내가 생하는 → 식신 / 상관
//   내가 극하는 → 편재 / 정재
//   나를 극하는 → 편관 / 정관
//   나를 생하는 → 편인 / 정인
// (음양이 같으면 편(偏)쪽, 다르면 정(正)쪽이 되는 게 표준 규칙이다. 비겁만 반대로 같으면 비견이다.)
function tenGodOf(dayStem, otherStem) {
  const di = N.stemIndex(dayStem);
  const oi = N.stemIndex(otherStem);
  const de = N.STEM_ELEMENT[di];
  const oe = N.STEM_ELEMENT[oi];
  const same = N.STEM_YINYANG[di] === N.STEM_YINYANG[oi];
  if (de === oe) return same ? "비견" : "겁재";
  if (SAENG[de] === oe) return same ? "식신" : "상관";
  if (GEUK[de] === oe) return same ? "편재" : "정재";
  if (GEUK[oe] === de) return same ? "편관" : "정관";
  if (SAENG[oe] === de) return same ? "편인" : "정인";
  throw new Error(`십성을 도출할 수 없습니다: 일간 ${dayStem}(${de}) vs ${otherStem}(${oe})`);
}

// 오행 하나가 일간에게 어떤 묶음인지(비겁/식상/재성/관성/인성). 신강약 계산이 쓴다.
function elementGroupFor(dayElement, otherElement) {
  if (dayElement === otherElement) return "비겁";
  if (SAENG[dayElement] === otherElement) return "식상";
  if (GEUK[dayElement] === otherElement) return "재성";
  if (GEUK[otherElement] === dayElement) return "관성";
  if (SAENG[otherElement] === dayElement) return "인성";
  throw new Error(`오행 관계를 찾을 수 없습니다: ${dayElement} vs ${otherElement}`);
}

// 지지의 지장간을 역할까지 붙여서 돌려준다.
function hiddenStemsOf(branchKo) {
  const list = HIDDEN_STEMS[branchKo];
  if (!list) throw new Error(`지장간표에 없는 지지입니다: "${branchKo}"`);
  return list.map((stem, i) => ({
    stem,
    element: N.STEM_ELEMENT[N.stemIndex(stem)],
    yinYang: N.STEM_YINYANG[N.stemIndex(stem)],
    role: hiddenStemRole(list, i),
  }));
}


// 시주의 천간은 일간에서 결정된다 — 甲己일→甲子시, 乙庚일→丙子시, 丙辛일→戊子시,
// 丁壬일→庚子시, 戊癸일→壬子시에서 시작해 지지 순서대로 한 칸씩 간다.
// 왜 직접 도출하나(2026-10-07): lunar-javascript의 getTime()은 setSect를 **무시하고** 항상
// 야자시(sect 1) 기준 시주를 돌려준다. 우리는 자정 기준(sect 2)을 쓰므로 23시대 출생자에게
// "일주는 그날 / 시주 천간은 다음날 일간 기준"이라는 모순된 조합이 나왔다
// (1950~2024 전수 검사: 23시대 5,400건 전부 불일치). 규칙이 단순하고 예외가 없으니 우리가 센다.
const ZI_STEM_BY_DAY_STEM = {
  갑: "갑", 기: "갑",
  을: "병", 경: "병",
  병: "무", 신: "무",
  정: "경", 임: "경",
  무: "임", 계: "임",
};

function timeStemOf(dayStemKo, timeBranchKo) {
  const ziStem = ZI_STEM_BY_DAY_STEM[dayStemKo];
  if (!ziStem) throw new Error(`시간 천간을 도출할 수 없는 일간: ${dayStemKo}`);
  const si = N.STEM_KO.indexOf(ziStem);
  const bi = N.BRANCH_KO.indexOf(timeBranchKo);
  if (si === -1 || bi === -1) throw new Error(`시간 천간 도출 실패: 일간 ${dayStemKo}, 시지 ${timeBranchKo}`);
  return N.STEM_KO[(si + bi) % 10];
}


// 12운성 — 일간이 각 지지에서 어느 단계인가. 일간마다 장생 자리가 정해져 있고, 양간은 순행
// 음간은 역행한다. 표가 완전히 결정적이라 라이브러리에 의존할 이유가 없다.
// 왜 직접 계산하나(2026-10-07): lunar-javascript의 getYearDiShi() 같은 getter는 그 객체가 들고
// 있는 일간·지지에 묶여 있어서, 절기 보정 때문에 기둥을 다른 객체에서 가져오면 쓸 수 없다.
// 라이브러리 getter에 기대다가 setSect 무시 버그를 그대로 흘린 적이 있으니(시주) 직접 센다.
// 앱 표기를 따른다 — 네 번째 단계를 만세력 앱은 "건록"으로 쓴다(임관과 같은 단계의 다른 이름).
const TWELVE_STAGE_ORDER = ["장생", "목욕", "관대", "건록", "제왕", "쇠", "병", "사", "묘", "절", "태", "양"];
const JANGSAENG_BRANCH = { 갑: "해", 을: "오", 병: "인", 정: "유", 무: "인", 기: "유", 경: "사", 신: "자", 임: "신", 계: "묘" };
const YANG_STEMS = new Set(["갑", "병", "무", "경", "임"]);

function twelveStageOf(dayStemKo, branchKo) {
  const start = N.BRANCH_KO.indexOf(JANGSAENG_BRANCH[dayStemKo]);
  const bi = N.BRANCH_KO.indexOf(branchKo);
  if (start === -1 || bi === -1) throw new Error(`12운성 도출 실패: ${dayStemKo}, ${branchKo}`);
  const step = YANG_STEMS.has(dayStemKo) ? (bi - start + 12) % 12 : (start - bi + 12) % 12;
  return TWELVE_STAGE_ORDER[step];
}

module.exports = { SAENG, GEUK, ELEMENTS, HIDDEN_STEMS, hiddenStemsOf, tenGodOf, elementGroupFor, timeStemOf, twelveStageOf };
