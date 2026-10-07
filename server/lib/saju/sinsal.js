// 신살을 **실제 원국 기준**으로 판정한다.
//
// 지금까지와 뭐가 다른가: 기존 콘텐츠 엔진은 "띠 하나를 랜덤으로 뽑아 → 그 띠의 도화 자리는 묘다"
// 라는 **규칙만** 설명했다. 그 사람 사주에 묘가 실제로 있는지는 아무도 모른 채 "원국에 있어야
// 성립한다"고 넘겼다. 이 모듈은 네 기둥을 실제로 뒤져서 **있다/없다, 어느 기둥에 있다**를 답한다.
//
// 판별표는 기존 sajuFacts.js의 표를 그대로 쓴다(단일 출처 유지 - 표를 두 군데 두면 언젠가 갈린다).
// 그 표는 2026-10-06에 전수 대조해서 정통 표와 일치함을 확인했고 test/sajuFactsAudit.test.js가 고정한다.

const F = require("../sajuFacts");
const N = require("./naming");
const { elementFooting } = require("./strength");

const toKoBranch = (idx) => N.BRANCH_KO[idx];

// 원국의 모든 지지를 (기둥, 지지) 목록으로 만든다.
function branchSlots(chart) {
  return chart.pillarOrder.map((key) => ({
    pillar: key,
    label: chart.pillars[key].label,
    branch: chart.pillars[key].branch,
    branchIndex: chart.pillars[key].branchIndex,
    element: chart.pillars[key].branchElement,
    meaning: chart.pillars[key].meaning,
  }));
}

function findBranches(chart, targetIndices) {
  const want = new Set(targetIndices);
  return branchSlots(chart).filter((s) => want.has(s.branchIndex));
}

// 신살 하나의 결과 모양을 통일한다. found=false면 "이 사주엔 없다"는 사실도 그대로 쓴다
// (글에서 "이 셋이라고 다 붙는 건 아니다"를 근거 있게 쓸 수 있게 하려는 것).
function result({ id, name, basis, targets, hits, strength, note }) {
  const base = {
    id,
    name,
    basis, // 어떤 기준으로 판정했는지(일간 기준/년지 삼합 기준 등)
    targetBranches: targets,
    found: hits.length > 0,
    at: hits.map((h) => ({ pillar: h.pillar, label: h.label, branch: h.branch, meaning: h.meaning })),
  };
  if (note) base.note = note;
  // 걸린 자리의 오행이 이 원국에서 힘이 있는지 - 글의 양면 구조("힘 있으면 A, 흔들리면 B")에
  // 근거를 준다. 신살이 없으면 판정할 게 없다.
  if (strength && hits.length) {
    const el = hits[0].element;
    base.footing = elementFooting(strength, el);
  }
  return base;
}

/**
 * 원국에서 성립하는 신살 전체를 판정한다.
 * @param {object} chart buildChart() 결과
 * @param {object} strength analyzeStrength() 결과 (선택 - 주면 자리의 힘까지 판정)
 * @param {object} opts { refDate } 삼재 판정 기준일(없으면 삼재는 계산하지 않는다 - 현재시각에
 *   의존하면 결정론이 깨지므로 반드시 인자로 받는다)
 */
function analyzeSinsal(chart, strength = null, opts = {}) {
  const dayStem = chart.dayStem;
  const yearBranchIndex = chart.pillars.year.branchIndex;
  const roles = F.getSamhapRoles(yearBranchIndex);
  const out = [];

  // ── 년지(띠) 삼합 기준 신살: 역마·도화·화개 ──
  const samhapName = roles.group.name;
  for (const [id, name, target] of [
    ["yeokma", "역마살", roles.역마],
    ["dohwa", "도화살", roles.도화],
    ["hwagae", "화개살", roles.화개],
  ]) {
    out.push(result({
      id, name,
      basis: `${chart.yearAnimal}띠(${samhapName}) 기준 ${name} 자리는 ${toKoBranch(target)}(${N.ANIMAL_KO[target]}띠)`,
      targets: [toKoBranch(target)],
      hits: findBranches(chart, [target]),
      strength,
    }));
  }

  // ── 일간 기준 신살 ──
  const yangin = F.YANGIN_TABLE[dayStem];
  out.push(result({
    id: "yangin", name: "양인살",
    basis: yangin === undefined
      ? `양인살은 양간(갑·병·무·경·임)에만 성립한다 - 일간 ${dayStem}은 해당 없음`
      : `일간 ${dayStem} 기준 양인 자리는 ${toKoBranch(yangin)}(${N.ANIMAL_KO[yangin]}띠)`,
    targets: yangin === undefined ? [] : [toKoBranch(yangin)],
    hits: yangin === undefined ? [] : findBranches(chart, [yangin]),
    strength,
    note: yangin === undefined ? "음간이라 양인살 자체가 성립하지 않는다" : undefined,
  }));

  const gwiin = F.CHEONEULGWIIN_TABLE[dayStem] || [];
  out.push(result({
    id: "cheoneulgwiin", name: "천을귀인",
    basis: `일간 ${dayStem} 기준 귀인 자리는 ${gwiin.map((b) => `${toKoBranch(b)}(${N.ANIMAL_KO[b]}띠)`).join(", ")}`,
    targets: gwiin.map(toKoBranch),
    hits: findBranches(chart, gwiin),
    strength,
  }));

  for (const [id, name, table] of [
    ["hongyeom", "홍염살", F.HONGYEOM_TABLE],
    ["munchang", "문창귀인", F.MUNCHANG_TABLE],
  ]) {
    const t = table[dayStem];
    out.push(result({
      id, name,
      basis: `일간 ${dayStem} 기준 ${name} 자리는 ${toKoBranch(t)}(${N.ANIMAL_KO[t]}띠)`,
      targets: [toKoBranch(t)],
      hits: findBranches(chart, [t]),
      strength,
    }));
  }

  // ── 일주 자체로 성립하는 신살: 백호·괴강 ──
  const ilju = chart.pillars.day.ko;
  for (const [id, name, list] of [
    ["baekho", "백호살", F.BAEKHO_ILJU],
    ["goegang", "괴강살", F.GOEGANG_ILJU],
  ]) {
    const hit = list.includes(ilju);
    out.push(result({
      id, name,
      basis: `${name}은 일주가 ${list.join("·")} 중 하나일 때 성립 - 이 사주의 일주는 ${ilju}`,
      targets: list,
      hits: hit ? [{ pillar: "day", label: "일주", branch: chart.pillars.day.branch, meaning: chart.pillars.day.meaning, element: chart.pillars.day.branchElement }] : [],
      strength,
    }));
  }

  // ── 공망 ── 일주 기준 순(旬)의 빈 자리. 원국에 그 지지가 있으면 그 기둥이 공망이다.
  const emptyIdx = chart.emptyBranches.map((b) => N.branchIndex(b));
  out.push(result({
    id: "gongmang", name: "공망",
    basis: `일주 ${ilju} 기준 공망은 ${chart.emptyBranches.join("·")}`,
    targets: chart.emptyBranches,
    hits: findBranches(chart, emptyIdx),
    strength: null, // 공망은 "비어 있다"는 뜻이라 자리의 힘으로 판정하지 않는다
  }));

  // ── 원진 ── 관계살이라 원국 단독으로는 "상대 띠가 무엇인지"만 알 수 있다(궁합에서 쓴다).
  const wonjinPartner = F.getWonjinPartner(yearBranchIndex);
  out.push({
    id: "wonjin", name: "원진살",
    basis: `${chart.yearAnimal}띠의 원진 상대는 ${N.ANIMAL_KO[wonjinPartner]}띠`,
    targetBranches: [toKoBranch(wonjinPartner)],
    // 원국 안에 원진 상대 지지가 같이 있으면 "내 안에서 부딪히는 구조"로 본다.
    found: findBranches(chart, [wonjinPartner]).length > 0,
    at: findBranches(chart, [wonjinPartner]).map((h) => ({ pillar: h.pillar, label: h.label, branch: h.branch, meaning: h.meaning })),
    partnerAnimal: N.ANIMAL_KO[wonjinPartner],
    note: "관계살이라 궁합(두 사주 비교)에서 주로 쓴다",
  });

  // ── 삼재 ── 기준일을 반드시 받아야 한다. 안 주면 계산하지 않는다(현재시각 의존 금지 - 결정론).
  let samjae = null;
  if (opts.refDate) {
    const info = F.getSamjaeInfo(yearBranchIndex, opts.refDate);
    samjae = {
      id: "samjae", name: "삼재",
      basis: `${chart.yearAnimal}띠(${info.samhapGroup.name})의 삼재는 ${info.samjaeBanghap.name} 3년`,
      years: `${info.startYear}~${info.endYear}`,
      status: info.status, // "current" | "future"
      nthYear: info.nthYear,
      yearsUntilStart: info.yearsUntilStart,
      prevEndYear: info.prevEndYear,
      refYear: info.refYear,
    };
  }

  const found = out.filter((s) => s.found);
  return {
    dayStem,
    yearAnimal: chart.yearAnimal,
    samhapGroup: samhapName,
    all: out,
    found,
    foundNames: found.map((s) => s.name),
    notFoundNames: out.filter((s) => !s.found).map((s) => s.name),
    samjae,
    byId: Object.fromEntries(out.map((s) => [s.id, s])),
  };
}

module.exports = { analyzeSinsal };
