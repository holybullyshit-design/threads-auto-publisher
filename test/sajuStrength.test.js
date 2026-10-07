// 사주 엔진 2단계(신강약·신살) 테스트.
//
// 신강약이 왜 중요한가: 우리 글은 거의 매 편에서 "원국에서 힘 있게 자리잡으면 매력으로 쓰이고,
// 흔들리는 상태면 소모전이 된다"고 쓴다. 2026-10-07까지 그 판단의 근거가 코드에 아무것도
// 없었다(AI가 분위기로 쓰는 말이었다). 이 테스트는 그 근거가 **숫자로 재현 가능**한지를 지킨다.
//
// 신살이 왜 중요한가: 기존 엔진은 "말띠의 도화 자리는 묘다"라는 규칙만 설명하고, 그 사주에 묘가
// 실제로 있는지는 아무도 몰랐다. 이제 네 기둥을 뒤져서 있다/없다·어느 기둥인지를 답한다.

const test = require("node:test");
const assert = require("node:assert");
const { buildChart } = require("../server/lib/saju/chart");
const { analyzeStrength, elementFooting, judgeFourCriteria } = require("../server/lib/saju/strength");
const { analyzeSinsal } = require("../server/lib/saju/sinsal");
const F = require("../server/lib/sajuFacts");
const N = require("../server/lib/saju/naming");
const CONFIG = require("../server/lib/saju/config");

const CASES = [
  { year: 1990, month: 5, day: 15, hour: 14, minute: 30, gender: "male" },
  { year: 1985, month: 11, day: 3, hour: 7, minute: 0, gender: "female" },
  { year: 2001, month: 2, day: 20, hour: 22, minute: 10, gender: "male" },
  { year: 1977, month: 8, day: 9, hour: 3, minute: 45, gender: "female" },
  { year: 1996, month: 12, day: 31, hour: 11, minute: 0, gender: "male" },
];

test("오행 세력 합은 항상 100%다", () => {
  for (const c of CASES) {
    const s = analyzeStrength(buildChart(c));
    const sum = Object.values(s.elementPercent).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 100) < 0.5, `오행% 합이 100이 아니다: ${sum} (${JSON.stringify(s.elementPercent)})`);
    const gsum = Object.values(s.groupPercent).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(gsum - 100) < 0.5, `묶음% 합이 100이 아니다: ${gsum}`);
  }
});

test("같은 입력은 항상 같은 점수를 낸다(결정론)", () => {
  for (const c of CASES) {
    const chart = buildChart(c);
    const a = analyzeStrength(chart);
    const b = analyzeStrength(buildChart(c));
    assert.deepStrictEqual(a.elementPercent, b.elementPercent);
    assert.strictEqual(a.verdict, b.verdict);
    assert.strictEqual(a.basis, b.basis);
  }
});

test("득세 판정에서 일간 한 글자를 뺀다(안 빼면 늘 유리해진다)", () => {
  // 일간은 당연히 자기 자신(비겁)이라, 그대로 세면 돕는 세력이 항상 한 글자 많아진다.
  const chart = buildChart(CASES[0]);
  const c = judgeFourCriteria(chart);
  assert.match(c.득세.basis, /일간 제외/, "득세 근거에 일간 제외가 명시되어야 한다");
  const m = c.득세.basis.match(/(\d+)\/(\d+)/);
  assert.ok(m, `득세 근거에서 숫자를 못 읽었다: ${c.득세.basis}`);
  assert.strictEqual(Number(m[2]), 7, "여덟 글자에서 일간을 뺀 7이어야 한다");
});

test("신강약은 득령·득지·득시·득세로 8단계가 매겨진다", () => {
  const levels = ["극약", "태약", "신약", "중화신약", "중화신강", "신강", "태강", "극왕"];
  for (const c of CASES) {
    const s = analyzeStrength(buildChart(c));
    assert.ok(levels.includes(s.verdict), `알 수 없는 단계: ${s.verdict}`);
    assert.ok(["신강", "신약"].includes(s.tendency), "기울기는 신강 쪽/신약 쪽 둘 중 하나여야 한다");
    // 네 기준이 모두 판정돼 있어야 한다(시간을 아는 사주이므로 득시도 true/false).
    for (const k of ["득령", "득지", "득시", "득세"]) {
      assert.ok(typeof s.criteria[k].ok === "boolean", `${k}이 판정되지 않았다`);
      assert.ok(s.criteria[k].basis.length > 0, `${k}의 근거가 비어 있다`);
    }
    // 득령은 월지가 비겁·인성일 때만 성립한다.
    const chart = buildChart(c);
    const monthGroup = require("../server/lib/saju/elements").elementGroupFor(chart.dayStemElement, chart.pillars.month.branchElement);
    assert.strictEqual(s.criteria.득령.ok, ["비겁", "인성"].includes(monthGroup), `득령 판정이 월지 묶음(${monthGroup})과 어긋난다`);
  }
  // 표본에서 적어도 두 단계는 나와야 한다(전부 같으면 판정이 고장난 것).
  const seen = new Set(CASES.map((c) => analyzeStrength(buildChart(c)).verdict));
  assert.ok(seen.size >= 2, `단계가 한 종류뿐이다: ${[...seen].join(",")}`);
});

test("검증 안 된 8단계 패턴은 그렇다고 표시한다", () => {
  // 정답지가 아직 1건이라, 확인된 패턴은 "득령✗ + 나머지 3개"뿐이다. 나머지를 확인된 것처럼
  // 속이지 않는다(모르는 걸 안다고 하지 않기).
  const confirmedCount = CASES.filter((c) => analyzeStrength(buildChart(c)).verdictConfirmed).length;
  assert.ok(confirmedCount < CASES.length, "전부 검증됐다고 나오면 confirmed 플래그가 고장난 것");
});

test("용신은 후보만 내고 사실로 단정하지 않는다", () => {
  assert.strictEqual(CONFIG.ASSERT_YONGSIN, false, "용신 단정은 학파 차이가 가장 큰 영역이라 켜면 안 된다");
  for (const c of CASES) {
    const s = analyzeStrength(buildChart(c));
    assert.strictEqual(s.yongsinAsserted, false);
    // 신강이면 빼주는 쪽(식상·재성·관성), 신약이면 돕는 쪽(비겁·인성)이 후보여야 한다.
    if (s.verdict === "중화") assert.deepStrictEqual(s.yongsinCandidateElements, []);
    else assert.ok(s.yongsinCandidateElements.length > 0);
  }
});

test("자리의 힘은 글자 수로 판정한다(여덟 글자 기준)", () => {
  const s = analyzeStrength(buildChart(CASES[0]));
  for (const el of ["목", "화", "토", "금", "수"]) {
    const f = elementFooting(s, el);
    const n = s.elementCount[el];
    if (n === 0) assert.strictEqual(f.footing, "없음", `${el} ${n}글자`);
    else if (n >= 2) assert.strictEqual(f.footing, "자리잡음", `${el} ${n}글자`);
    else assert.strictEqual(f.footing, "흔들림", `${el} ${n}글자`);
    assert.strictEqual(f.count, n);
  }
  assert.throws(() => elementFooting(s, "쇠"), /오행이 아닙니다/);
});

test("오행 글자 수 합은 항상 8이다(시간을 알 때)", () => {
  for (const c of CASES) {
    const s = analyzeStrength(buildChart(c));
    const sum = Object.values(s.elementCount).reduce((a, b) => a + b, 0);
    assert.strictEqual(sum, 8, `글자 수 합이 8이 아니다: ${sum}`);
  }
});

// ── 신살 ──

test("신살은 원국에 실제로 그 지지가 있을 때만 성립한다", () => {
  const chart = buildChart(CASES[0]); // 경오 신사 경진 계미 (지지 오·사·진·미)
  const k = analyzeSinsal(chart, analyzeStrength(chart), { refDate: "2026-10-07" });
  // 도화(앱 방식) = 사왕지 자·오·묘·유. 지지에 오가 있으므로 성립한다.
  assert.deepStrictEqual(k.byId.dohwa.targetBranches, ["자", "오", "묘", "유"]);
  assert.strictEqual(k.byId.dohwa.found, true);
  // 삼합 기준으로는 말띠(인오술)의 도화가 묘인데 원국에 묘가 없어 미성립 - 두 방식이 갈린다.
  assert.strictEqual(k.byId.dohwa.samhapBased.found, false);
  // 화개(앱 방식) = 사고지 진·술·축·미. 지지에 진·미가 있으므로 성립.
  assert.strictEqual(k.byId.hwagae.found, true);
  // 일주가 경진이므로 괴강살은 성립해야 한다.
  assert.strictEqual(k.byId.goegang.found, true);
  // 일간 경의 천을귀인은 축·미. 시지가 미라 성립해야 한다.
  assert.deepStrictEqual(k.byId.cheoneulgwiin.targetBranches, ["축", "미"]);
  assert.strictEqual(k.byId.cheoneulgwiin.found, true);
  assert.strictEqual(k.byId.cheoneulgwiin.at[0].label, "시주");
  // found + notFound가 전체와 같아야 한다(빠뜨린 신살 없음).
  assert.strictEqual(k.found.length + k.notFoundNames.length, k.all.length);
});

test("신살 판별 기준이 단일 출처를 유지한다(표를 두 군데 두지 않는다)", () => {
  const LITERAL = { yeokma: ["인", "신", "사", "해"], dohwa: ["자", "오", "묘", "유"], hwagae: ["진", "술", "축", "미"] };
  for (const c of CASES) {
    const chart = buildChart(c);
    const k = analyzeSinsal(chart);
    // 앱 방식(기본)은 고정된 글자 집합이다.
    for (const [id, set] of Object.entries(LITERAL)) {
      assert.deepStrictEqual(k.byId[id].targetBranches, set, `${id} 글자 집합`);
    }
    // 삼합 기준은 sajuFacts의 정통 표에서 그대로 와야 한다(표를 복제하지 않는다).
    const roles = F.getSamhapRoles(chart.pillars.year.branchIndex);
    assert.deepStrictEqual(k.byId.yeokma.samhapBased.targetBranches, [N.BRANCH_KO[roles.역마]]);
    assert.deepStrictEqual(k.byId.dohwa.samhapBased.targetBranches, [N.BRANCH_KO[roles.도화]]);
    assert.deepStrictEqual(k.byId.hwagae.samhapBased.targetBranches, [N.BRANCH_KO[roles.화개]]);
    // 일주 기반 신살도 sajuFacts의 목록을 그대로 쓴다.
    assert.deepStrictEqual(k.byId.baekho.targetBranches, F.BAEKHO_ILJU);
    assert.deepStrictEqual(k.byId.goegang.targetBranches, F.GOEGANG_ILJU);
  }
});

test("양인살은 양간에만 성립한다", () => {
  // 일간이 음간(을·정·기·신·계)인 사주를 찾아 양인살이 아예 성립 불가로 처리되는지 확인
  let checkedYin = 0;
  let checkedYang = 0;
  for (let d = 1; d <= 20; d++) {
    const chart = buildChart({ year: 1990, month: 5, day: d, hour: 12, gender: "male" });
    const k = analyzeSinsal(chart);
    const isYang = chart.dayStemYinYang === "양";
    if (isYang) {
      checkedYang++;
      assert.strictEqual(k.byId.yangin.targetBranches.length, 1, `양간 ${chart.dayStem}인데 양인 자리가 없다`);
    } else {
      checkedYin++;
      assert.deepStrictEqual(k.byId.yangin.targetBranches, [], `음간 ${chart.dayStem}인데 양인 자리가 생겼다`);
      assert.strictEqual(k.byId.yangin.found, false);
      assert.match(k.byId.yangin.note, /음간/);
    }
  }
  assert.ok(checkedYin > 0 && checkedYang > 0, "양간·음간 둘 다 확인되지 않았다");
});

test("삼재는 기준일을 줘야만 계산한다(현재시각 의존 금지 - 결정론)", () => {
  const chart = buildChart(CASES[0]);
  assert.strictEqual(analyzeSinsal(chart).samjae, null, "기준일 없이 삼재를 계산하면 결정론이 깨진다");
  const k = analyzeSinsal(chart, null, { refDate: "2026-10-07" });
  // 말띠(인오술) 삼재는 신유술년 = 2028~2030
  assert.strictEqual(k.samjae.years, "2028~2030");
  assert.strictEqual(k.samjae.status, "future");
  assert.strictEqual(k.samjae.prevEndYear, 2018);
});

test("신살 판정도 결정론적이다", () => {
  for (const c of CASES) {
    const chart = buildChart(c);
    const a = analyzeSinsal(chart, analyzeStrength(chart), { refDate: "2026-10-07" });
    const b = analyzeSinsal(buildChart(c), analyzeStrength(buildChart(c)), { refDate: "2026-10-07" });
    assert.deepStrictEqual(a.foundNames, b.foundNames);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(a.byId)), JSON.parse(JSON.stringify(b.byId)));
  }
});
