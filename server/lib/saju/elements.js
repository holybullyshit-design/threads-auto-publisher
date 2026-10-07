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

module.exports = { SAENG, GEUK, ELEMENTS, HIDDEN_STEMS, hiddenStemsOf, tenGodOf, elementGroupFor };
