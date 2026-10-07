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

// 건록(建祿): 일간이 가장 힘을 받는 지지. 협록 판정에 쓴다.
// 갑→인, 을→묘, 병·무→사, 정·기→오, 경→신, 신→유, 임→해, 계→자
const GEONROK_BY_STEM = { 갑: 2, 을: 3, 병: 5, 무: 5, 정: 6, 기: 6, 경: 8, 신: 9, 임: 11, 계: 0 };
// 현침살: 글자 모양이 바늘처럼 뾰족하다고 보는 간지.
const HYEONCHIM_STEMS = ["갑", "신"];
const HYEONCHIM_BRANCHES = ["묘", "오", "신", "미"];

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

  // ── 역마·도화·화개 ──
  // 2026-10-07: 정답지 2건(1988-04-21 남 / 1990-11-19 여)으로 확인한 결과, 사용자가 쓰는 만세력
  // 앱은 이 셋을 **삼합 기준이 아니라 "글자 자체"로** 판정한다. 6/6 전부 일치했다:
  //   역마 = 인·신·사·해(사생지) / 도화 = 자·오·묘·유(사왕지) / 화개 = 진·술·축·미(사고지)
  // 정통 삼합 기준(신자진見유 등)과는 결과가 다르다 - 우리 Threads 글은 지금까지 삼합 기준으로
  // 써 왔으므로(sajuFacts.js), 둘 다 계산해서 따로 돌려준다. 기본(found)은 **앱 방식**이고,
  // 삼합 기준 결과는 samhapBased에 담는다. 어느 쪽으로 글을 쓸지는 사용자가 정한다.
  const LITERAL_SETS = {
    yeokma: { name: "역마살", branches: ["인", "신", "사", "해"], label: "사생지" },
    dohwa: { name: "도화살", branches: ["자", "오", "묘", "유"], label: "사왕지" },
    hwagae: { name: "화개살", branches: ["진", "술", "축", "미"], label: "사고지" },
  };
  const samhapName = roles.group.name;
  for (const [id, def] of Object.entries(LITERAL_SETS)) {
    const targetIdx = def.branches.map((b) => N.branchIndex(b));
    const samhapTarget = roles[def.name.replace("살", "")];
    const entry = result({
      id, name: def.name,
      basis: `${def.name}은 ${def.label}(${def.branches.join("·")})가 원국에 있으면 성립`,
      targets: def.branches,
      hits: findBranches(chart, targetIdx),
      strength,
    });
    // 정통 삼합 기준 결과도 같이 담아둔다(우리 Threads 글이 쓰는 방식).
    const samhapHits = findBranches(chart, [samhapTarget]);
    entry.samhapBased = {
      basis: `${chart.yearAnimal}띠(${samhapName}) 기준 ${def.name} 자리는 ${toKoBranch(samhapTarget)}(${N.ANIMAL_KO[samhapTarget]}띠)`,
      targetBranches: [toKoBranch(samhapTarget)],
      found: samhapHits.length > 0,
      at: samhapHits.map((h) => ({ pillar: h.pillar, label: h.label, branch: h.branch })),
    };
    out.push(entry);
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

  // ── 간지 자체로 성립하는 신살: 백호·괴강 ──
  // 2026-10-07 수정: 처음엔 일주만 봤는데, 정답지(1988-04-21 12:31 남)에서 앱이 **생년 무진**에
  // 백호대살을 표시했다. 백호·괴강은 일주에서 가장 세게 보지만 다른 기둥에서도 성립한다 -
  // 네 기둥 전부에서 찾되, 어느 기둥인지 같이 돌려준다.
  for (const [id, name, list] of [
    ["baekho", "백호살", F.BAEKHO_ILJU],
    ["goegang", "괴강살", F.GOEGANG_ILJU],
  ]) {
    const hits = chart.pillarOrder
      .filter((key) => list.includes(chart.pillars[key].ko))
      .map((key) => ({
        pillar: key, label: chart.pillars[key].label, branch: chart.pillars[key].branch,
        meaning: chart.pillars[key].meaning, element: chart.pillars[key].branchElement,
      }));
    out.push(result({
      id, name,
      basis: `${name}은 간지가 ${list.join("·")} 중 하나일 때 성립 - 이 사주의 기둥은 ${chart.pillarOrder.map((k) => chart.pillars[k].ko).join("·")}`,
      targets: list,
      hits,
      strength,
      note: hits.some((h) => h.pillar === "day") ? "일주에 걸린 백호·괴강을 가장 세게 본다" : undefined,
    }));
  }

  // ── 협록(夾祿) ── 일간의 건록 자리를 **월지와 시지가 앞뒤로 끼고 있을 때** 성립한다.
  // 2026-10-07: 처음엔 "네 기둥 중 어느 두 지지든 끼면 성립"으로 만들었는데, 정답지1(1988)에서
  // 앱은 생월·생시에만 표시했다(지지가 진·진·오·오라 내 방식은 네 기둥 전부를 잡았다).
  // 일지를 사이에 둔 월지·시지가 건록을 끼는 구조로 좁히니 정답지 2건과 모두 맞는다
  //   1988: 월지 진 - [건록 사] - 시지 오 → 성립, 생월·생시 ✓
  //   1990: 월지 해 - 시지 해 → 건록 사를 끼지 못함 → 미성립 ✓
  const geonrok = GEONROK_BY_STEM[dayStem];
  const hyeoprokHits = [];
  if (geonrok !== undefined && chart.pillars.time) {
    const m = chart.pillars.month.branchIndex;
    const t = chart.pillars.time.branchIndex;
    const brackets = (a, b) => (a + 1) % 12 === geonrok && (geonrok + 1) % 12 === b;
    if (brackets(m, t) || brackets(t, m)) {
      for (const key of ["month", "time"]) {
        const p = chart.pillars[key];
        hyeoprokHits.push({ pillar: key, label: p.label, branch: p.branch, meaning: p.meaning, element: p.branchElement });
      }
    }
  }
  out.push(result({
    id: "hyeoprok", name: "협록",
    basis: geonrok === undefined
      ? `일간 ${dayStem}의 건록을 찾을 수 없음`
      : `일간 ${dayStem}의 건록은 ${toKoBranch(geonrok)} - 월지와 시지가 그 앞뒤에서 끼고 있으면 성립`,
    targets: geonrok === undefined ? [] : [toKoBranch(geonrok)],
    hits: hyeoprokHits,
    strength,
  }));

  // ── 현침살(懸針殺) ── 글자 모양이 바늘처럼 뾰족한 간지(갑·신(辛)·묘·오·신(申)·미)가 원국에 있으면 성립.
  const hyeonchimHits = [];
  for (const key of chart.pillarOrder) {
    const p = chart.pillars[key];
    const marks = [];
    if (HYEONCHIM_STEMS.includes(p.stem)) marks.push(`천간 ${p.stem}`);
    if (HYEONCHIM_BRANCHES.includes(p.branch)) marks.push(`지지 ${p.branch}`);
    if (marks.length) hyeonchimHits.push({ pillar: key, label: p.label, branch: p.branch, meaning: p.meaning, element: p.branchElement, marks });
  }
  out.push(result({
    id: "hyeonchim", name: "현침살",
    basis: `현침살 글자는 천간 ${HYEONCHIM_STEMS.join("·")} / 지지 ${HYEONCHIM_BRANCHES.join("·")}`,
    targets: [...HYEONCHIM_STEMS, ...HYEONCHIM_BRANCHES],
    hits: hyeonchimHits,
    strength,
  }));

  // ── 관귀학관(官貴學館) ── 일간 기준. 정답지 2건으로 확인했다(1988 병→신 미성립 / 1990 무→해 성립).
  const GWANGWI = { 갑: "사", 을: "사", 병: "신", 정: "신", 무: "해", 기: "해", 경: "인", 신: "인", 임: "신", 계: "신" };
  const gwTarget = GWANGWI[dayStem];
  out.push(result({
    id: "gwangwihakgwan", name: "관귀학관",
    basis: `일간 ${dayStem} 기준 관귀학관 자리는 ${gwTarget}`,
    targets: [gwTarget],
    hits: findBranches(chart, [N.branchIndex(gwTarget)]),
    strength,
  }));

  // ── 천문성(天文星) ── 묘·술·해·미. 정답지 2건과 모순은 없지만(1990 해에만 성립, 1988 미성립),
  // 술·미가 들어간 사주로는 아직 확인하지 못했다 - 확정된 게 아니라고 표시해둔다.
  const CHEONMUN = ["묘", "술", "해", "미"];
  const cheonmun = result({
    id: "cheonmunseong", name: "천문성",
    basis: `천문성 글자는 ${CHEONMUN.join("·")}`,
    targets: CHEONMUN,
    hits: findBranches(chart, CHEONMUN.map((b) => N.branchIndex(b))),
    strength,
  });
  cheonmun.unverified = "묘·해로만 확인했고 술·미가 들어간 정답지가 아직 없다";
  out.push(cheonmun);

  // ── 공망 ── 일주 기준 순(旬)의 빈 자리. 원국에 그 지지가 있으면 그 기둥이 공망이다.
  const emptyIdx = chart.emptyBranches.map((b) => N.branchIndex(b));
  out.push(result({
    id: "gongmang", name: "공망",
    basis: `일주 ${chart.pillars.day.ko} 기준 공망은 ${chart.emptyBranches.join("·")}`,
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
