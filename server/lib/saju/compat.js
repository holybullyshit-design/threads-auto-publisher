// 궁합 — 두 원국을 나란히 놓고 관계를 계산한다.
//
// 설계 원칙(2026-10-07): **궁합 "점수"를 지어내지 않는다.** 점수는 학파마다 산식이 다르고
// 검증할 정답지도 없다. 지금까지 사고가 난 건 전부 "계산할 수 없는 걸 숫자로 단정"했기 때문이다.
// 그래서 이 모듈은 **검증 가능한 구조적 사실만** 돌려준다:
//   - 어느 기둥과 어느 기둥이 합·충·형·파·해·원진으로 얽혔는지
//   - 일지(배우자 자리)끼리 어떤 관계인지 - 궁합에서 가장 무겁게 보는 자리
//   - 서로의 부족한 오행을 채워주는지
//   - 상대가 내 용신 오행을 얼마나 갖고 있는지
// 해석("잘 맞는다/안 맞는다")은 이 사실들을 근거로 사람이 하거나 글이 쓴다.

const N = require("./naming");
const E = require("./elements");
const R = require("./relations");
const F = require("../sajuFacts");

const samePair = (a, b, pair) => (a === pair[0] && b === pair[1]) || (a === pair[1] && b === pair[0]);

// 두 지지 사이의 관계를 전부 찾는다(여러 개가 동시에 성립할 수 있다).
function branchRelation(a, b) {
  const found = [];
  const yh = R.BRANCH_YUKHAP.find((x) => samePair(a, b, x.pair));
  if (yh) found.push({ type: "육합", result: yh.result, desc: `${yh.pair.join("")}합${yh.result}`, polarity: "합" });
  for (const def of R.BRANCH_SAMHAP) {
    if (def.set.includes(a) && def.set.includes(b) && a !== b) {
      // 반합은 왕지(가운데 글자)가 있어야 성립하는 게 통설이다.
      if (a === def.set[1] || b === def.set[1]) found.push({ type: "삼합(반합)", result: def.result, desc: `${def.set.join("")} 중 ${a}·${b}`, polarity: "합" });
    }
  }
  if (R.BRANCH_CHUNG.some((p) => samePair(a, b, p))) found.push({ type: "충", desc: `${a}${b}충`, polarity: "충" });
  if (R.SANG_HYEONG.some((p) => samePair(a, b, p))) found.push({ type: "형", desc: `${a}${b}형`, polarity: "충" });
  if (a === b && R.JA_HYEONG.includes(a)) found.push({ type: "형(자형)", desc: `${a}${a}형`, polarity: "충" });
  for (const set of R.SAM_HYEONG) if (set.includes(a) && set.includes(b) && a !== b) found.push({ type: "형(삼형 일부)", desc: `${set.join("")}형 중 ${a}·${b}`, polarity: "충" });
  if (R.BRANCH_PA.some((p) => samePair(a, b, p))) found.push({ type: "파", desc: `${a}${b}파`, polarity: "충" });
  if (R.BRANCH_HAE.some((p) => samePair(a, b, p))) found.push({ type: "해", desc: `${a}${b}해`, polarity: "충" });
  if (N.BRANCH_KO[F.getWonjinPartner(N.branchIndex(a))] === b) found.push({ type: "원진", desc: `${a}${b}원진`, polarity: "충" });
  return found;
}

function stemRelation(a, b) {
  const found = [];
  const h = R.STEM_HAP.find((x) => samePair(a, b, x.pair));
  if (h) found.push({ type: "천간합", result: h.result, desc: `${h.pair.join("")}합${h.result}`, polarity: "합" });
  if (R.STEM_CHUNG.some((p) => samePair(a, b, p))) found.push({ type: "천간충", desc: `${a}${b}충`, polarity: "충" });
  return found;
}

/**
 * 두 사람의 궁합을 계산한다.
 * @param {object} a 한쪽 { chart, strength } (strength는 선택)
 * @param {object} b 다른 쪽
 * @param {object} opts { labelA, labelB }
 */
function analyzeCompatibility(a, b, opts = {}) {
  const A = a.chart || a;
  const B = b.chart || b;
  const labelA = opts.labelA || "본인";
  const labelB = opts.labelB || "상대";

  // ── 기둥 교차: 모든 조합의 지지/천간 관계 ──
  const crossBranch = [];
  const crossStem = [];
  for (const ka of A.pillarOrder) {
    for (const kb of B.pillarOrder) {
      const pa = A.pillars[ka];
      const pb = B.pillars[kb];
      for (const r of branchRelation(pa.branch, pb.branch)) {
        crossBranch.push({ ...r, from: `${labelA} ${pa.label}(${pa.branch})`, to: `${labelB} ${pb.label}(${pb.branch})`, pillars: [ka, kb] });
      }
      for (const r of stemRelation(pa.stem, pb.stem)) {
        crossStem.push({ ...r, from: `${labelA} ${pa.label}(${pa.stem})`, to: `${labelB} ${pb.label}(${pb.stem})`, pillars: [ka, kb] });
      }
    }
  }

  // ── 일지끼리 ── 배우자 자리라 궁합에서 가장 무겁게 본다.
  const dayBranch = {
    a: A.pillars.day.branch,
    b: B.pillars.day.branch,
    relations: branchRelation(A.pillars.day.branch, B.pillars.day.branch),
  };
  // ── 년지끼리 ── 흔히 말하는 "띠 궁합".
  const yearBranch = {
    a: A.pillars.year.branch,
    b: B.pillars.year.branch,
    animals: [A.yearAnimal, B.yearAnimal],
    relations: branchRelation(A.pillars.year.branch, B.pillars.year.branch),
  };
  // ── 일간끼리 ── 두 사람 자신의 관계.
  const dayStem = {
    a: A.dayStem,
    b: B.dayStem,
    relations: stemRelation(A.dayStem, B.dayStem),
    // 상대 일간이 나에게 어떤 십성으로 들어오는지(서로 다르게 나온다)
    bToA: E.tenGodOf(A.dayStem, B.dayStem),
    aToB: E.tenGodOf(B.dayStem, A.dayStem),
  };

  // ── 오행 보완 ── 내가 없는 오행을 상대가 갖고 있는지.
  let complement = null;
  if (a.strength && b.strength) {
    const fill = (me, other) => E.ELEMENTS
      .filter((el) => me.elementCount[el] === 0 && other.elementCount[el] > 0)
      .map((el) => ({ element: el, otherCount: other.elementCount[el] }));
    const yongsinSupply = (me, other) => (me.yongsinCandidateElements || []).map((el) => ({
      element: el, otherCount: other.elementCount[el], otherPercent: other.elementPercent[el],
    }));
    complement = {
      // 내가 아예 없는 오행을 상대가 채워주는가
      aMissingFilledByB: fill(a.strength, b.strength),
      bMissingFilledByA: fill(b.strength, a.strength),
      // 상대가 내 용신 후보 오행을 얼마나 갖고 있는가(용신은 단정하지 않으므로 "후보" 기준)
      aYongsinFromB: yongsinSupply(a.strength, b.strength),
      bYongsinFromA: yongsinSupply(b.strength, a.strength),
      aVerdict: a.strength.verdict,
      bVerdict: b.strength.verdict,
    };
  }

  const hap = [...crossBranch, ...crossStem].filter((x) => x.polarity === "합");
  const chung = [...crossBranch, ...crossStem].filter((x) => x.polarity === "충");

  return {
    labels: [labelA, labelB],
    charts: { a: A.summary, b: B.summary },
    dayStem, dayBranch, yearBranch,
    crossBranch, crossStem,
    counts: { 합: hap.length, 충형파해원진: chung.length },
    complement,
    // 점수를 매기지 않는다 - 아래는 "무엇이 얽혀 있는지"의 요약일 뿐이다.
    summary: `합 ${hap.length}건 / 충·형·파·해·원진 ${chung.length}건` +
      (dayBranch.relations.length ? ` · 일지(배우자 자리) ${dayBranch.relations.map((r) => r.desc).join(",")}` : " · 일지끼리는 직접 관계 없음"),
    note: "궁합 점수는 산식이 학파마다 달라 엔진이 숫자로 단정하지 않는다. 위 구조적 사실을 근거로 해석할 것.",
  };
}

module.exports = { analyzeCompatibility, branchRelation, stemRelation };
