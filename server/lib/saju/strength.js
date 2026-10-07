// 오행 세력 집계와 신강/신약 판정(억부법).
//
// 왜 필요한가: 우리 글은 거의 매 편에서 "원국에서 **힘 있게 자리잡으면** 매력으로 쓰이고,
// **흔들리는 상태에서** 겹치면 소모전이 된다"고 쓴다. 그런데 2026-10-07까지 그 판단의 근거가
// 코드에 **아무것도 없었다** - AI가 분위기로 쓰는 말이었다. 이 모듈이 그 문장에 근거를 준다.
//
// 방식은 가장 널리 쓰이는 억부법이다: 일간을 **돕는 세력(비겁+인성)** 과 **빼는 세력(식상+재성+관성)**
// 을 오행 세력으로 집계해 비교한다. 자리별 가중치와 임계값은 유파마다 조금씩 다르므로 전부
// config.js에 못 박혀 있고, 이 파일에서 즉흥적으로 바꾸지 않는다.
//
// 결정론: 입력이 같으면 점수까지 똑같이 나온다. 랜덤·현재시각을 쓰지 않는다.

const CONFIG = require("./config");
const N = require("./naming");
const E = require("./elements");

// 지지 하나의 세력을 지장간에 배분한다. 본기가 가장 무겁고, 나머지는 가볍게 본다.
// (본기 0.5 / 그 외 0.3 — config.STRENGTH_WEIGHTS.hiddenStem)
function distributeBranch(weight, hiddenStems) {
  const w = CONFIG.STRENGTH_WEIGHTS.hiddenStem;
  const shares = hiddenStems.map((h) => (h.role === "본기" ? w.primary : w.secondary));
  const total = shares.reduce((a, b) => a + b, 0);
  // 가중치 합으로 정규화해서, 지지 하나의 총 세력이 weight와 정확히 같게 유지한다
  // (지장간 개수가 2개인 지지와 3개인 지지가 불공평해지지 않도록).
  return hiddenStems.map((h, i) => ({ element: h.element, score: (weight * shares[i]) / total }));
}

/**
 * 원국의 오행 세력과 신강약을 계산한다.
 * @param {object} chart buildChart()의 결과
 */
function analyzeStrength(chart) {
  const W = CONFIG.STRENGTH_WEIGHTS;
  const dayElement = chart.dayStemElement;
  const elementScore = { 목: 0, 화: 0, 토: 0, 금: 0, 수: 0 };
  const detail = [];

  for (const key of chart.pillarOrder) {
    const p = chart.pillars[key];
    // 천간 — 일간 자신은 기준점이라 세력 집계에서 뺀다(자기를 자기 편으로 또 세면 늘 신강이 된다).
    const stemWeight = W.stem[key] || 0;
    if (stemWeight > 0) {
      elementScore[p.stemElement] += stemWeight;
      detail.push({ from: `${p.label} 천간 ${p.stem}`, element: p.stemElement, score: stemWeight });
    }
    // 지지 — 지장간으로 쪼개서 배분한다(지지 자체 오행만 세면 지장간이 가진 세력을 놓친다).
    const branchWeight = W.branch[key] || 0;
    if (branchWeight > 0) {
      for (const part of distributeBranch(branchWeight, p.hiddenStems)) {
        elementScore[part.element] += part.score;
        detail.push({ from: `${p.label} 지지 ${p.branch} 지장간`, element: part.element, score: part.score });
      }
    }
  }

  const total = Object.values(elementScore).reduce((a, b) => a + b, 0);
  if (total <= 0) throw new Error("오행 세력 합이 0입니다 - 가중치 설정을 확인하세요.");

  // 오행 세력을 다섯 묶음(비겁/식상/재성/관성/인성)으로 환산한다.
  const groupScore = { 비겁: 0, 식상: 0, 재성: 0, 관성: 0, 인성: 0 };
  for (const el of E.ELEMENTS) groupScore[E.elementGroupFor(dayElement, el)] += elementScore[el];

  const supporting = groupScore.비겁 + groupScore.인성; // 일간을 돕는 세력
  const draining = groupScore.식상 + groupScore.재성 + groupScore.관성; // 일간을 빼는 세력
  const supportRatio = supporting / total;

  let verdict;
  if (supportRatio >= CONFIG.STRENGTH_THRESHOLD.strong) verdict = "신강";
  else if (supportRatio <= CONFIG.STRENGTH_THRESHOLD.weak) verdict = "신약";
  else verdict = "중화";

  // 가장 센 오행 / 가장 약한 오행(없는 오행 포함)
  const sorted = E.ELEMENTS.slice().sort((a, b) => elementScore[b] - elementScore[a]);
  const missing = E.ELEMENTS.filter((el) => elementScore[el] === 0);

  // 억부 기준 용신 후보 — 신강이면 빼주는 쪽(식상·재성·관성), 신약이면 돕는 쪽(비겁·인성)이
  // 후보가 된다. **단정하지 않는다**(config.ASSERT_YONGSIN=false). 용신 선정은 학파 차이가 가장
  // 큰 영역이라, 엔진은 후보만 내고 글에서는 단정하지 않는다.
  const yongsinCandidateGroups = verdict === "신강" ? ["식상", "재성", "관성"] : verdict === "신약" ? ["비겁", "인성"] : [];
  const yongsinCandidateElements = E.ELEMENTS.filter((el) => yongsinCandidateGroups.includes(E.elementGroupFor(dayElement, el)));

  const pct = (v) => Math.round((v / total) * 1000) / 10; // 소수 한 자리까지 - 반올림도 결정론적

  return {
    dayElement,
    total: Math.round(total * 10) / 10,
    elementScore: Object.fromEntries(E.ELEMENTS.map((el) => [el, Math.round(elementScore[el] * 10) / 10])),
    elementPercent: Object.fromEntries(E.ELEMENTS.map((el) => [el, pct(elementScore[el])])),
    groupScore: Object.fromEntries(Object.entries(groupScore).map(([k, v]) => [k, Math.round(v * 10) / 10])),
    groupPercent: Object.fromEntries(Object.entries(groupScore).map(([k, v]) => [k, pct(v)])),
    supporting: Math.round(supporting * 10) / 10,
    draining: Math.round(draining * 10) / 10,
    supportPercent: pct(supporting),
    verdict, // "신강" | "중화" | "신약"
    strongestElement: sorted[0],
    weakestElement: sorted[sorted.length - 1],
    missingElements: missing,
    yongsinCandidateElements, // 후보일 뿐 - 사실로 단정 금지
    yongsinAsserted: CONFIG.ASSERT_YONGSIN,
    // 글에서 "힘 있게 자리잡았는지"를 말할 때 쓸 한 줄. 근거 숫자를 같이 들고 다닌다.
    basis: `일간 ${chart.dayStem}(${dayElement}) 기준 돕는 세력 ${pct(supporting)}% / 빼는 세력 ${pct(draining)}% → ${verdict}`,
    detail,
  };
}

// 특정 오행(또는 신살이 걸린 지지의 오행)이 이 원국에서 "힘 있게 자리잡았는지" 판정.
// 글이 매번 쓰는 양면 구조("힘 있으면 A, 흔들리면 B")에 근거를 주는 함수다.
// 기준: 그 오행 세력이 전체의 1/5(균등분) 이상이면 "자리잡음", 그 절반 미만이면 "흔들림".
function elementFooting(strength, element) {
  const pctValue = strength.elementPercent[element];
  if (pctValue === undefined) throw new Error(`오행이 아닙니다: ${element}`);
  const even = 20; // 오행 5개 균등분
  if (pctValue >= even) return { footing: "자리잡음", percent: pctValue, basis: `${element} 세력 ${pctValue}% (균등분 20% 이상)` };
  if (pctValue < even / 2) return { footing: "흔들림", percent: pctValue, basis: `${element} 세력 ${pctValue}% (균등분 절반 미만)` };
  return { footing: "보통", percent: pctValue, basis: `${element} 세력 ${pctValue}%` };
}

module.exports = { analyzeStrength, elementFooting };
