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

// 네 기준 → 척도.
//
// **폐기된 가정(2026-10-07)**: 처음엔 "득령이 가장 무거우니 가중치 2"로 뒀다. 정답지3이 이걸
// 정면으로 반증했다 — 득령 하나만 얻은 사주(1000)를 앱은 **중화신약**(신약 쪽)으로 판정한다.
// 반대로 득령 없이 나머지 셋을 얻은 사주(0111)는 **중화신강**(신강 쪽)이다. 득령 가중치 모델이면
// 1000이 신강 쪽으로 나와 용신까지 반대로 뒤집힌다(실제로 그랬다 — 앱 용신 목, 우리는 수/금/토).
// 정답지 3건은 **단순 개수**와 일치한다. 그래서 개수로 간다.
//
// 정답지로 직접 확인된 패턴(득령·득지·득시·득세 순서의 0/1 문자열):
//   "0111"(3득) → 중화신강 (1988-04-21 12:31 남)
//   "1000"(1득) → 중화신약 (1958-02-28 15:44 남)
//   "0000"(0득) → 신약     (1990-11-19 21:58 여)
//
// **이 네 기준만으로는 8단계를 다 만들 수 없다 — 숨기지 말 것.** 개수는 0~4로 다섯 값뿐인데
// 앱 척도는 여덟 단계다. 게다가 앱 화면의 분포(극약 5만·태약 16만·신약 19만·중화신약 10만·
// 중화신강 25만·신강 13만·태강 5.5만·극왕 1.3만)는 네 기준의 조합 분포와 전혀 맞지 않는다
// (극왕이 1.4%인데 "4득"은 조합상 훨씬 흔하다). 앱은 네 기준을 **화면에 따로 보여줄 뿐**
// 판정은 더 세밀한 점수로 하는 것으로 보인다.
// → 그래서 **극약·태약·태강·극왕은 이 매핑에서 아예 나오지 않는다.** 그 네 단계가 필요하면
//   정답지를 더 받아 점수 산식을 복원해야 한다. 지금 없는 걸 있는 척 만들지 않는다.
// ── 신강약 8단계: "돕는 오행(비겁+인성)" 비율 ──────────────────────────────
//
// **산식 확정(2026-10-07, 정답지 4건 4/4).** 여덟 글자를 균등하게 세면 비겁+인성 비율은
// 일간 자신이 늘 비겁이라 **12.5% ~ 100%의 정확히 8개 값**만 나온다. 그게 8단계와 1:1로 붙는다.
//   12.5 극약 / 25 태약 / 37.5 신약 / 50 중화신약 / 62.5 중화신강 / 75 신강 / 87.5 태강 / 100 극왕
//
// 정답지 대조:
//   1990-11-19 21:58 여 → 37.5% → 신약     (앱 신약)
//   1958-02-28 15:44 남 → 50%   → 중화신약 (앱 중화신약)
//   1988-04-21 12:31 남 → 62.5% → 중화신강 (앱 중화신강)
//   1966-10-26 10:00 남 → 100%  → 극왕     (앱 극왕, "1.56%의 사람")
//
// **폐기된 모델 두 개 — 되돌리지 말 것.**
//   ① "득령 가중치 2" — 정답지3이 반증(득령 하나만인데 중화신약).
//   ② "득 개수" — 정답지 3건엔 맞았지만 단계와 어긋난다(3득이 5번째, 0득이 3번째, 4득이 8번째).
//      득 개수는 0~4로 다섯 값뿐이라 애초에 8단계를 못 만든다.
// **득령·득지·득시·득세는 판정식이 아니라 화면에 같이 보여주는 참고 지표다.** 앱도 그렇게 쓴다.
//
// 남은 의문(숨기지 말 것): 앱 화면의 분포(극왕 1.56%)와 우리 표본 계산(0.19%)이 맞지 않는다.
// 앱 통계는 "앱에 입력된 사주"의 분포라 실제 출생 분포와 다를 수 있지만, 8배 차이는 다 설명되지
// 않는다. 그래도 **정답지 4건이 4/4로 맞으므로 산식은 이걸로 간다**(우연일 확률 (1/8)^4 ≈ 0.02%).
const LEVELS_BY_SUPPORT = ["극약", "태약", "신약", "중화신약", "중화신강", "신강", "태강", "극왕"];
// 정답지로 실제 확인된 비율만 confirmed로 표시한다. 나머지는 같은 산식으로 내되 확인 전이라고 밝힌다.
const CONFIRMED_SUPPORT = new Set([37.5, 50, 62.5, 100]);

function scaleFrom(criteria, supportPercent) {
  const g = criteria.득령.ok ? 1 : 0;
  const j = criteria.득지.ok ? 1 : 0;
  const si = criteria.득시.ok === null ? 0 : criteria.득시.ok ? 1 : 0;
  const se = criteria.득세.ok ? 1 : 0;
  const pattern = `${g}${j}${si}${se}`;

  const step = Math.round(supportPercent / 12.5);          // 1~8
  const idx = Math.min(LEVELS_BY_SUPPORT.length - 1, Math.max(0, step - 1));
  const level = LEVELS_BY_SUPPORT[idx];

  // 억부 기울기. 중화신강 위쪽이 신강 쪽, 중화신약 아래쪽이 신약 쪽(정답지 4건 모두 일치).
  const tendency = idx >= 4 ? "신강" : "신약";
  const coarse = ["극왕", "태강", "신강"].includes(level) ? "신강"
    : ["극약", "태약", "신약"].includes(level) ? "신약" : "중화";

  return {
    level,
    coarse,
    tendency,
    pattern,
    supportPercent,
    confirmed: CONFIRMED_SUPPORT.has(supportPercent),
    levelNote: CONFIRMED_SUPPORT.has(supportPercent)
      ? null
      : `이 비율(${supportPercent}%)은 아직 만세력 앱 화면으로 직접 확인한 적이 없습니다. 산식 자체는 확인된 네 건(37.5·50·62.5·100%)에서 전부 맞았지만, 이 단계는 그 산식을 그대로 적용한 값입니다.`,
  };
}

function analyzeStrength(chart) {
  const de = chart.dayStemElement;
  const { score, total } = countEightChars(chart);
  const pct = (v) => Math.round((v / total) * 1000) / 10;

  const elementPercent = Object.fromEntries(E.ELEMENTS.map((el) => [el, pct(score[el])]));
  const groupScore = { 비겁: 0, 식상: 0, 재성: 0, 관성: 0, 인성: 0 };
  for (const el of E.ELEMENTS) groupScore[E.elementGroupFor(de, el)] += score[el];

  const criteria = judgeFourCriteria(chart);
  // 신강약은 '돕는 오행(비겁+인성)' 비율로 정해진다 - 네 기준(득령·득지·득시·득세)이 아니다.
  const supportPercent = pct((groupScore["비겁"] || 0) + (groupScore["인성"] || 0));
  const scale = scaleFrom(criteria, supportPercent);
  // 시간을 모르면 득시를 판정할 수 없어 0으로 처리된다 → 판정이 신약 쪽으로 기운다.
  // 이걸 "신약"이라고 단정하면 틀린 말이 되므로, 확정이 아님을 명시한다.
  const timeUnknown = chart.timeUnknown === true;
  if (timeUnknown) scale.confirmed = false;

  // ── 억부 용신 후보 ────────────────────────────────────────────────────
  // **단정하지 않는다**(config.ASSERT_YONGSIN=false) - 용신 선정은 학파 차이가 가장 크다.
  //
  // 정답지 6건으로 맞춘 규칙(2026-10-08). 신강 쪽은 "무엇이 과다한가"로 갈린다 —
  // 그냥 "관성 먼저"도, "원국에 적은 것 먼저"도 둘 다 2/4밖에 못 맞췄다.
  //
  //   신약 쪽          → 돕는 오행을 **원국에 적은 쪽부터**(동점이면 인성).
  //                      1990 무토(인성 화 25 / 비겁 토 12.5) → 앱 토 ✅
  //                      1958 병화(인성 목 25 = 비겁 화 25)   → 앱 목 ✅
  //   신강 + 비겁 과다  → **관성**으로 누른다.
  //                      남진주 무토(비겁 50 / 인성 12.5) → 앱 목(관성) ✅
  //                      1988  병화(비겁 50 / 인성 12.5) → 앱 수(관성) ✅
  //   신강 + 인성 과다  → **재성**으로 인성을 극한다(재극인). 관성을 쓰면 관생인으로 더 키운다.
  //                      명태진 경금(인성 토 50 / 비겁 금 25) → 앱 목(재성) ✅
  //   극왕(종격 구간)   → **식상**으로 순세(順勢)한다. 거슬러 극하지 않는다.
  //                      맹태주 무토(인성 62.5, 극왕) → 앱 금(식상) ✅
  //
  // 6건 전부 1순위가 맞는다. 2·3순위는 정답지가 없어 명리 통설대로 둔 것이다.
  const strongSide = scale.tendency === "신강";
  const inseongHeavy = (groupScore["인성"] || 0) > (groupScore["비겁"] || 0);
  const jonggyeokZone = ["극왕", "태강"].includes(scale.level);

  let wantGroups;
  if (!strongSide) wantGroups = ["인성", "비겁"];
  else if (jonggyeokZone) wantGroups = ["식상", "재성", "관성"];
  else if (inseongHeavy) wantGroups = ["재성", "식상", "관성"];
  else wantGroups = ["관성", "재성", "식상"];

  let yongsinCandidateElements = wantGroups
    .map((g) => E.ELEMENTS.find((el) => E.elementGroupFor(de, el) === g))
    .filter(Boolean);
  if (!strongSide) {
    // 신약 쪽만 "원국에 적은 쪽 먼저"로 다시 세운다(sort가 안정 정렬이라 동점이면 인성이 앞).
    yongsinCandidateElements = yongsinCandidateElements.slice().sort((a, b) => score[a] - score[b]);
  }

  // 극왕·태강은 종격(從格) 영역이다. 앱도 이 구간에서는 **종용신을 먼저** 준다
  // (맹태주 = "화(종용신) 금(억부용신)"). 억부 1순위는 맞췄지만 종용신 자체는 미구현이라,
  // 이 구간에서는 단정하지 말라고 명시한다.
  const yongsinNote = jonggyeokZone
    ? "극왕·태강은 종격(從格)으로 보는 구간이라 억부용신만으로 단정하지 않습니다. 만세력 앱도 이 구간에서는 종용신(從用神)을 먼저 제시하는데, 종용신은 아직 엔진이 계산하지 않습니다."
    : null;

  const weighted = weightedElementScore(chart);

  return {
    dayElement: de,
    method: "여덟 글자 균등 집계(오행%) + 비겁·인성 비율 8단계(신강약). 득령·득지·득시·득세는 참고 지표",
    elementCount: score,
    elementPercent,
    groupPercent: Object.fromEntries(Object.entries(groupScore).map(([k, v]) => [k, pct(v)])),
    missingElements: E.ELEMENTS.filter((el) => score[el] === 0),
    strongestElement: E.ELEMENTS.slice().sort((a, b) => score[b] - score[a])[0],
    criteria,
    // 확인된 패턴이면 단계 이름, 아니면 **null**. null을 "신강"·"신약"으로 바꿔서 쓰지 말 것 -
    // 그 추정을 상담 답변이 그대로 단정으로 옮긴다. 이름이 없을 때 쓸 것은 criteria와 tendency다.
    verdict: scale.level,
    verdictCoarse: scale.coarse, // 3분류: 신강/중화/신약
    tendency: scale.tendency, // 억부 관점 기울기: 신강 쪽 / 신약 쪽
    verdictConfirmed: scale.confirmed, // 정답지로 직접 확인된 비율인지(시간 모름이면 항상 false)
    supportPercent: scale.supportPercent, // 비겁+인성 비율 - 이 값 하나가 단계를 정한다
    verdictNote: scale.levelNote, // 이름을 못 내는 이유(사용자에게 그대로 보여줘도 되는 문장)
    verdictCaveat: timeUnknown
      ? "태어난 시간을 몰라 득시를 판정하지 못했습니다. 시주가 일간을 돕는 자리였다면 한 단계 위(신강 쪽)로 갈 수 있어, 이 판정은 확정이 아닙니다."
      : null,
    yongsinCandidateElements,
    yongsinAsserted: CONFIG.ASSERT_YONGSIN,
    yongsinNote, // 종격 구간이면 단정하지 말라는 안내(아니면 null)
    // 조후용신은 아직 미구현이다. 앱은 월지 기준으로 따로 준다(남진주 화·맹태주 화).
    johuYongsin: null,
    basis: `일간 ${chart.dayStem}(${de}) / 득령 ${criteria.득령.ok ? "○" : "✗"} 득지 ${criteria.득지.ok ? "○" : "✗"} 득시 ${criteria.득시.ok === null ? "-" : criteria.득시.ok ? "○" : "✗"} 득세 ${criteria.득세.ok ? "○" : "✗"} → ${scale.level} (비겁+인성 ${scale.supportPercent}%)`,
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
