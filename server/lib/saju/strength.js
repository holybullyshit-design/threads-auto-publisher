// 오행 세력과 신강약 판정.
//
// 2026-10-07 수정: 처음엔 "지장간을 배분하고 자리별 가중치를 곱하는" 방식을 내가 임의로 정했다.
// 사용자가 실제 만세력 앱 결과(1988-04-21 12:31 남)를 정답지로 주면서 어긋난 게 드러났다:
//   오행%  내 방식 {목19 화38 토33.1 금0 수9.9}  vs  앱 {목12.5 화50 토37.5 금0 수0}
//   신강약 내 방식 "신강"                        vs  앱 "중화신강"
// 검산해보니 앱은 **여덟 글자를 균등하게 세고 지장간을 보지 않는다**(4천간+4지지, 각 12.5%).
// 그리고 신강약은 오행%가 아니라 **득령·득지·득시·득세** 네 가지로 따로 판정한다 - 이게
// 한국 실무의 정석이다. 둘 다 앱 방식으로 바꾸고, 내 임의 가중치는 버렸다.
// (원래 방식은 참고용으로 weightedElementScore에 남겨둔다 - 지장간까지 본 세력을 알고 싶을 때만 쓴다.)
//
// 결정론: 입력이 같으면 점수까지 같다. 랜덤·현재시각을 쓰지 않는다.

const CONFIG = require("./config");
const E = require("./elements");

// 일간을 "돕는" 묶음(비겁·인성)인지 판정. 신강약 네 기준이 전부 이걸 쓴다.
const HELPING_GROUPS = new Set(["비겁", "인성"]);
function helps(dayElement, otherElement) {
  return HELPING_GROUPS.has(E.elementGroupFor(dayElement, otherElement));
}

// ── 오행 집계: 여덟 글자 균등(앱 방식, 기본) ──
function countEightChars(chart) {
  const score = { 목: 0, 화: 0, 토: 0, 금: 0, 수: 0 };
  let total = 0;
  for (const key of chart.pillarOrder) {
    const p = chart.pillars[key];
    score[p.stemElement] += 1;
    score[p.branchElement] += 1;
    total += 2;
  }
  return { score, total };
}

// ── 오행 집계: 지장간 배분 + 자리 가중치(참고용) ──
function weightedElementScore(chart) {
  const W = CONFIG.STRENGTH_WEIGHTS;
  const score = { 목: 0, 화: 0, 토: 0, 금: 0, 수: 0 };
  let total = 0;
  for (const key of chart.pillarOrder) {
    const p = chart.pillars[key];
    const sw = W.stem[key] || 0;
    if (sw > 0) { score[p.stemElement] += sw; total += sw; }
    const bw = W.branch[key] || 0;
    if (bw > 0) {
      const shares = p.hiddenStems.map((h) => (h.role === "본기" ? W.hiddenStem.primary : W.hiddenStem.secondary));
      const sum = shares.reduce((a, b) => a + b, 0);
      p.hiddenStems.forEach((h, i) => { score[h.element] += (bw * shares[i]) / sum; });
      total += bw;
    }
  }
  return { score, total };
}

// ── 신강약: 득령·득지·득시·득세 (한국 실무 정석) ──
// 득령(得令): 월지가 일간을 돕는가 — 월령이 가장 세서 가중치도 가장 크다
// 득지(得地): 일지가 일간을 돕는가
// 득시(得時): 시지가 일간을 돕는가 (시간을 모르면 판정하지 않는다)
// 득세(得勢): 여덟 글자 전체에서 돕는 글자가 과반인가
function judgeFourCriteria(chart) {
  const de = chart.dayStemElement;
  const month = chart.pillars.month.branchElement;
  const day = chart.pillars.day.branchElement;
  const time = chart.pillars.time ? chart.pillars.time.branchElement : null;

  const { score, total } = countEightChars(chart);
  let supporting = 0;
  for (const el of E.ELEMENTS) if (helps(de, el)) supporting += score[el];
  // 일간 자신은 당연히 비겁이라 득세 판정에서 빼지 않으면 늘 유리해진다 - 한 글자 뺀다.
  const supportingNet = supporting - 1;
  const totalNet = total - 1;

  return {
    득령: { ok: helps(de, month), basis: `월지 ${chart.pillars.month.branch}(${month}) → ${E.elementGroupFor(de, month)}` },
    득지: { ok: helps(de, day), basis: `일지 ${chart.pillars.day.branch}(${day}) → ${E.elementGroupFor(de, day)}` },
    득시: time === null
      ? { ok: null, basis: "태어난 시간을 몰라 판정하지 않음" }
      : { ok: helps(de, time), basis: `시지 ${chart.pillars.time.branch}(${time}) → ${E.elementGroupFor(de, time)}` },
    득세: { ok: supportingNet > totalNet / 2, basis: `일간 제외 돕는 글자 ${supportingNet}/${totalNet}` },
  };
}

// 네 기준 → 8단계 척도.
// 득령이 가장 무거우므로 가중치를 2로 둔다(월령이 신강약을 가장 크게 가른다는 통설).
// 주의: 이 8단계 매핑은 **검증된 사례가 아직 하나뿐**이다(득령✗ + 나머지 3개 → 중화신강,
// 1988-04-21 12:31 남 사례로 확인). 다른 단계는 추가 정답지가 들어오면 다시 맞춰야 한다.
// 그래서 결과에 confirmed 플래그를 달아서, 검증 안 된 단계임을 숨기지 않는다.
const CONFIRMED_PATTERNS = new Set(["0111"]); // 득령·득지·득시·득세 순서의 0/1 문자열
function scaleFrom(criteria) {
  const g = criteria.득령.ok ? 1 : 0;
  const j = criteria.득지.ok ? 1 : 0;
  const s = criteria.득시.ok === null ? 0 : criteria.득시.ok ? 1 : 0;
  const se = criteria.득세.ok ? 1 : 0;
  const others = j + s + se;
  const pattern = `${g}${j}${s}${se}`;

  let level;
  if (g && others === 3) level = "극왕";
  else if (g && others === 2) level = "태강";
  else if (g && others === 1) level = "신강";
  else if (g && others === 0) level = "중화신강";
  else if (!g && others === 3) level = "중화신강"; // ← 정답지로 확인된 케이스
  else if (!g && others === 2) level = "중화신약";
  else if (!g && others === 1) level = "신약";
  else level = "극약";

  // 억부 용신은 "신강 쪽이냐 신약 쪽이냐"로 갈린다. 8단계는 전부 어느 한쪽에 속한다
  // (중화신강은 신강 쪽, 중화신약은 신약 쪽) - 중립으로 묶으면 용신 후보가 비어버린다.
  const tendency = ["극왕", "태강", "신강", "중화신강"].includes(level) ? "신강" : "신약";
  // 거친 3분류(읽기용). 중화신강/중화신약만 "중화"로 본다.
  const coarse = ["극왕", "태강", "신강"].includes(level) ? "신강"
    : ["극약", "태약", "신약"].includes(level) ? "신약" : "중화";

  return { level, coarse, tendency, pattern, confirmed: CONFIRMED_PATTERNS.has(pattern) };
}

function analyzeStrength(chart) {
  const de = chart.dayStemElement;
  const { score, total } = countEightChars(chart);
  const pct = (v) => Math.round((v / total) * 1000) / 10;

  const elementPercent = Object.fromEntries(E.ELEMENTS.map((el) => [el, pct(score[el])]));
  const groupScore = { 비겁: 0, 식상: 0, 재성: 0, 관성: 0, 인성: 0 };
  for (const el of E.ELEMENTS) groupScore[E.elementGroupFor(de, el)] += score[el];

  const criteria = judgeFourCriteria(chart);
  const scale = scaleFrom(criteria);

  // 억부 용신 후보: 신강 쪽이면 빼주는 오행, 신약 쪽이면 돕는 오행.
  // **단정하지 않는다**(config.ASSERT_YONGSIN=false) - 용신 선정은 학파 차이가 가장 크다.
  // 신강 쪽이면 빼주는 오행(관성 → 재성 → 식상 순으로 본다 - 강한 일간은 관살로 누르는 게
  // 억부의 기본), 신약 쪽이면 돕는 오행(인성 → 비겁 순). 원국에 적거나 없는 오행을 먼저 둔다.
  const wantGroups = scale.tendency === "신강" ? ["관성", "재성", "식상"] : ["인성", "비겁"];
  const yongsinCandidateElements = wantGroups
    .map((g) => E.ELEMENTS.find((el) => E.elementGroupFor(de, el) === g))
    .filter(Boolean)
    .sort((a, b) => score[a] - score[b]);

  const weighted = weightedElementScore(chart);

  return {
    dayElement: de,
    method: "여덟 글자 균등 집계(오행%) + 득령·득지·득시·득세(신강약)",
    elementCount: score,
    elementPercent,
    groupPercent: Object.fromEntries(Object.entries(groupScore).map(([k, v]) => [k, pct(v)])),
    missingElements: E.ELEMENTS.filter((el) => score[el] === 0),
    strongestElement: E.ELEMENTS.slice().sort((a, b) => score[b] - score[a])[0],
    criteria,
    verdict: scale.level, // 8단계: 극약/태약/신약/중화신약/중화신강/신강/태강/극왕
    verdictCoarse: scale.coarse, // 3분류: 신강/중화/신약
    tendency: scale.tendency, // 억부 관점 기울기: 신강 쪽 / 신약 쪽
    verdictConfirmed: scale.confirmed, // 정답지로 검증된 패턴인지
    yongsinCandidateElements,
    yongsinAsserted: CONFIG.ASSERT_YONGSIN,
    basis: `일간 ${chart.dayStem}(${de}) / 득령 ${criteria.득령.ok ? "○" : "✗"} 득지 ${criteria.득지.ok ? "○" : "✗"} 득시 ${criteria.득시.ok === null ? "-" : criteria.득시.ok ? "○" : "✗"} 득세 ${criteria.득세.ok ? "○" : "✗"} → ${scale.level}`,
    // 참고용(지장간까지 본 세력) - 기본 판정에는 쓰지 않는다.
    weightedElementPercent: Object.fromEntries(E.ELEMENTS.map((el) => [el, Math.round((weighted.score[el] / weighted.total) * 1000) / 10])),
  };
}

// 그 오행이 이 원국에서 "힘 있게 자리잡았는지". 글의 양면 구조에 근거를 준다.
// 여덟 글자 기준이라 한 글자 = 12.5%다. 2글자 이상(25%)이면 자리잡음, 0글자면 없음으로 본다.
function elementFooting(strength, element) {
  const count = strength.elementCount[element];
  if (count === undefined) throw new Error(`오행이 아닙니다: ${element}`);
  const percent = strength.elementPercent[element];
  if (count === 0) return { footing: "없음", count, percent, basis: `${element}이 원국에 한 글자도 없음` };
  if (count >= 2) return { footing: "자리잡음", count, percent, basis: `${element} ${count}글자 (${percent}%)` };
  return { footing: "흔들림", count, percent, basis: `${element} 한 글자뿐 (${percent}%)` };
}

module.exports = { analyzeStrength, elementFooting, judgeFourCriteria, countEightChars };
