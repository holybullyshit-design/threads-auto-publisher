// 원국 기둥들 사이의 관계: 천간합·천간충 / 지지 육합·삼합·방합·충·형·파·해·원진.
//
// 왜 필요한가: 지금까지 엔진은 글자 하나하나만 봤다. 그런데 명리에서 실제 해석은 "이 글자와
// 저 글자가 어떻게 얽혔나"에서 나온다 - 합이 있으면 묶이고, 충이 있으면 흔들린다. 궁합(5단계)도
// 결국 두 원국의 지지 관계라서, 이 모듈이 그 토대가 된다.
//
// 판별표는 전부 정통 표를 그대로 박는다. 원진은 기존 sajuFacts.js 표를 쓴다(단일 출처 유지).
// 결정론: 표 조회와 조합 탐색뿐이라 랜덤·시각 의존이 없다.

const N = require("./naming");
const F = require("../sajuFacts");

// ── 천간 ──
// 천간합(合): 갑기합토, 을경합금, 병신합수, 정임합목, 무계합화
const STEM_HAP = [
  { pair: ["갑", "기"], result: "토" },
  { pair: ["을", "경"], result: "금" },
  { pair: ["병", "신"], result: "수" },
  { pair: ["정", "임"], result: "목" },
  { pair: ["무", "계"], result: "화" },
];
// 천간충(沖): 일곱 번째 천간끼리. 갑경·을신·병임·정계 (무기는 충 없음)
const STEM_CHUNG = [["갑", "경"], ["을", "신"], ["병", "임"], ["정", "계"]];

// ── 지지 ──
// 육합: 자축합토, 인해합목, 묘술합화, 진유합금, 사신합수, 오미합(화/토)
const BRANCH_YUKHAP = [
  { pair: ["자", "축"], result: "토" },
  { pair: ["인", "해"], result: "목" },
  { pair: ["묘", "술"], result: "화" },
  { pair: ["진", "유"], result: "금" },
  { pair: ["사", "신"], result: "수" },
  { pair: ["오", "미"], result: "화" },
];
// 삼합: 인오술(화), 신자진(수), 사유축(금), 해묘미(목). 두 개만 모이면 반합(半合).
const BRANCH_SAMHAP = [
  { set: ["인", "오", "술"], result: "화" },
  { set: ["신", "자", "진"], result: "수" },
  { set: ["사", "유", "축"], result: "금" },
  { set: ["해", "묘", "미"], result: "목" },
];
// 방합(계절): 인묘진(봄/목), 사오미(여름/화), 신유술(가을/금), 해자축(겨울/수)
const BRANCH_BANGHAP = [
  { set: ["인", "묘", "진"], result: "목", season: "봄" },
  { set: ["사", "오", "미"], result: "화", season: "여름" },
  { set: ["신", "유", "술"], result: "금", season: "가을" },
  { set: ["해", "자", "축"], result: "수", season: "겨울" },
];
// 충: 자오·축미·인신·묘유·진술·사해
const BRANCH_CHUNG = [["자", "오"], ["축", "미"], ["인", "신"], ["묘", "유"], ["진", "술"], ["사", "해"]];
// 형(刑): 삼형(인사신 / 축술미), 상형(자묘), 자형(진진·오오·유유·해해)
const SAM_HYEONG = [["인", "사", "신"], ["축", "술", "미"]];
const SANG_HYEONG = [["자", "묘"]];
const JA_HYEONG = ["진", "오", "유", "해"];
// 파(破): 자유·축진·인해·묘오·사신·술미
const BRANCH_PA = [["자", "유"], ["축", "진"], ["인", "해"], ["묘", "오"], ["사", "신"], ["술", "미"]];
// 해(害): 자미·축오·인사·묘진·신해·유술
const BRANCH_HAE = [["자", "미"], ["축", "오"], ["인", "사"], ["묘", "진"], ["신", "해"], ["유", "술"]];

const samePair = (a, b, pair) => (a === pair[0] && b === pair[1]) || (a === pair[1] && b === pair[0]);

function slots(chart, kind) {
  return chart.pillarOrder.map((key) => ({
    pillar: key,
    label: chart.pillars[key].label,
    value: kind === "stem" ? chart.pillars[key].stem : chart.pillars[key].branch,
  }));
}

// 두 자리씩 짝지어 검사하는 공통 루틴.
function findPairs(list, matcher) {
  const out = [];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const r = matcher(list[i].value, list[j].value);
      if (r) out.push({ between: [list[i].label, list[j].label], pillars: [list[i].pillar, list[j].pillar], values: [list[i].value, list[j].value], ...r });
    }
  }
  return out;
}

// 세 자리(또는 두 자리 반합)로 이루어지는 조합을 찾는다.
function findSets(list, defs, { allowHalf = false, halfRequires = null } = {}) {
  const out = [];
  for (const def of defs) {
    const hits = list.filter((s) => def.set.includes(s.value));
    const uniqueValues = [...new Set(hits.map((s) => s.value))];
    if (uniqueValues.length === 3) {
      out.push({ type: "완성", set: def.set, result: def.result, season: def.season, at: hits.map((h) => h.label), pillars: hits.map((h) => h.pillar) });
    } else if (allowHalf && uniqueValues.length === 2) {
      // 반합은 왕지(삼합 가운데 글자)가 들어 있어야 성립한다고 보는 게 통설이다.
      if (halfRequires && !uniqueValues.includes(def.set[halfRequires])) continue;
      out.push({ type: "반합", set: def.set, result: def.result, at: hits.map((h) => h.label), pillars: hits.map((h) => h.pillar) });
    }
  }
  return out;
}

/**
 * 원국 안의 모든 관계를 찾는다.
 * @param {object} chart buildChart() 결과
 */
function analyzeRelations(chart) {
  const stemSlots = slots(chart, "stem");
  const branchSlots = slots(chart, "branch");

  const stemHap = findPairs(stemSlots, (a, b) => {
    const d = STEM_HAP.find((x) => samePair(a, b, x.pair));
    return d ? { name: "천간합", result: d.result, desc: `${d.pair.join("")}합${d.result}` } : null;
  });
  const stemChung = findPairs(stemSlots, (a, b) => {
    const d = STEM_CHUNG.find((p) => samePair(a, b, p));
    return d ? { name: "천간충", desc: `${d.join("")}충` } : null;
  });

  const yukhap = findPairs(branchSlots, (a, b) => {
    const d = BRANCH_YUKHAP.find((x) => samePair(a, b, x.pair));
    return d ? { name: "육합", result: d.result, desc: `${d.pair.join("")}합${d.result}` } : null;
  });
  const chung = findPairs(branchSlots, (a, b) => {
    const d = BRANCH_CHUNG.find((p) => samePair(a, b, p));
    return d ? { name: "충", desc: `${d.join("")}충` } : null;
  });
  const pa = findPairs(branchSlots, (a, b) => {
    const d = BRANCH_PA.find((p) => samePair(a, b, p));
    return d ? { name: "파", desc: `${d.join("")}파` } : null;
  });
  const hae = findPairs(branchSlots, (a, b) => {
    const d = BRANCH_HAE.find((p) => samePair(a, b, p));
    return d ? { name: "해", desc: `${d.join("")}해` } : null;
  });
  const wonjin = findPairs(branchSlots, (a, b) => {
    const partner = F.getWonjinPartner(N.branchIndex(a));
    return N.BRANCH_KO[partner] === b ? { name: "원진", desc: `${a}${b}원진` } : null;
  });

  // 형: 상형(두 자리) + 자형(같은 글자 둘) + 삼형(세 자리 중 둘 이상)
  const hyeong = [];
  hyeong.push(...findPairs(branchSlots, (a, b) => {
    const d = SANG_HYEONG.find((p) => samePair(a, b, p));
    return d ? { name: "형", kind: "상형", desc: `${d.join("")}형` } : null;
  }));
  hyeong.push(...findPairs(branchSlots, (a, b) => (a === b && JA_HYEONG.includes(a) ? { name: "형", kind: "자형", desc: `${a}${a}형` } : null)));
  for (const set of SAM_HYEONG) {
    const hits = branchSlots.filter((s) => set.includes(s.value));
    const uniq = [...new Set(hits.map((s) => s.value))];
    if (uniq.length >= 2) {
      hyeong.push({
        name: "형", kind: uniq.length === 3 ? "삼형(완성)" : "삼형(일부)",
        desc: `${set.join("")}형 중 ${uniq.join("·")}`,
        between: hits.map((h) => h.label), pillars: hits.map((h) => h.pillar), values: uniq,
      });
    }
  }

  const samhap = findSets(branchSlots, BRANCH_SAMHAP, { allowHalf: true, halfRequires: 1 });
  const banghap = findSets(branchSlots, BRANCH_BANGHAP);

  const all = { 천간합: stemHap, 천간충: stemChung, 육합: yukhap, 삼합: samhap, 방합: banghap, 충: chung, 형: hyeong, 파: pa, 해: hae, 원진: wonjin };
  const summary = Object.entries(all)
    .filter(([, v]) => v.length)
    .map(([k, v]) => `${k} ${v.length}건`)
    .join(" / ") || "원국 안에 합·충·형·파·해가 없음";

  return { ...all, summary, hasAny: Object.values(all).some((v) => v.length) };
}

module.exports = {
  analyzeRelations,
  STEM_HAP, STEM_CHUNG, BRANCH_YUKHAP, BRANCH_SAMHAP, BRANCH_BANGHAP,
  BRANCH_CHUNG, SAM_HYEONG, SANG_HYEONG, JA_HYEONG, BRANCH_PA, BRANCH_HAE,
};
