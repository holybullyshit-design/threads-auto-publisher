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
const { analyzeStrength, elementFooting } = require("../server/lib/saju/strength");
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

test("일간 자신은 세력 집계에서 빠진다(안 빼면 늘 신강이 된다)", () => {
  assert.strictEqual(CONFIG.STRENGTH_WEIGHTS.stem.day, 0, "일간 천간 가중치는 0이어야 한다");
  const chart = buildChart(CASES[0]);
  const s = analyzeStrength(chart);
  // 일주 천간이 세력에 들어갔다면 detail에 "일주 천간" 항목이 있을 것이다.
  assert.ok(!s.detail.some((d) => d.from.includes("일주 천간")), "일간이 세력 집계에 들어갔다");
  // 일지는 들어가야 한다(일지는 세력에 포함하는 게 표준).
  assert.ok(s.detail.some((d) => d.from.includes("일주 지지")), "일지가 세력 집계에서 빠졌다");
});

test("신강·중화·신약 판정이 임계값대로 갈린다", () => {
  const verdicts = new Set(CASES.map((c) => analyzeStrength(buildChart(c)).verdict));
  // 표본 5개에서 적어도 두 종류는 나와야 한다(전부 같게 나오면 판정이 고장난 것).
  assert.ok(verdicts.size >= 2, `판정이 한 종류뿐이다: ${[...verdicts].join(",")}`);
  for (const c of CASES) {
    const s = analyzeStrength(buildChart(c));
    const r = s.supportPercent / 100;
    if (s.verdict === "신강") assert.ok(r >= CONFIG.STRENGTH_THRESHOLD.strong - 0.005, `신강인데 비율이 낮다: ${s.supportPercent}%`);
    if (s.verdict === "신약") assert.ok(r <= CONFIG.STRENGTH_THRESHOLD.weak + 0.005, `신약인데 비율이 높다: ${s.supportPercent}%`);
    if (s.verdict === "중화") assert.ok(r > CONFIG.STRENGTH_THRESHOLD.weak - 0.005 && r < CONFIG.STRENGTH_THRESHOLD.strong + 0.005);
  }
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

test("자리의 힘 판정이 균등분 20% 기준으로 갈린다", () => {
  const s = analyzeStrength(buildChart(CASES[0]));
  for (const el of ["목", "화", "토", "금", "수"]) {
    const f = elementFooting(s, el);
    const p = s.elementPercent[el];
    if (p >= 20) assert.strictEqual(f.footing, "자리잡음", `${el} ${p}%`);
    else if (p < 10) assert.strictEqual(f.footing, "흔들림", `${el} ${p}%`);
    else assert.strictEqual(f.footing, "보통", `${el} ${p}%`);
  }
  assert.throws(() => elementFooting(s, "쇠"), /오행이 아닙니다/);
});

// ── 신살 ──

test("신살은 원국에 실제로 그 지지가 있을 때만 성립한다", () => {
  const chart = buildChart(CASES[0]); // 경오 신사 경진 계미 (말띠)
  const k = analyzeSinsal(chart, analyzeStrength(chart), { refDate: "2026-10-07" });
  // 말띠(인오술)의 도화 자리는 묘다. 이 원국 지지는 오·사·진·미라 묘가 없다 → 성립 안 함.
  assert.strictEqual(k.byId.dohwa.targetBranches[0], "묘");
  assert.strictEqual(k.byId.dohwa.found, false, "원국에 묘가 없는데 도화살이 성립했다");
  // 일주가 경진이므로 괴강살은 성립해야 한다.
  assert.strictEqual(k.byId.goegang.found, true);
  // 일간 경의 천을귀인은 축·미. 시지가 미라 성립해야 한다.
  assert.deepStrictEqual(k.byId.cheoneulgwiin.targetBranches, ["축", "미"]);
  assert.strictEqual(k.byId.cheoneulgwiin.found, true);
  assert.strictEqual(k.byId.cheoneulgwiin.at[0].label, "시주");
  // found + notFound가 전체와 같아야 한다(빠뜨린 신살 없음).
  assert.strictEqual(k.found.length + k.notFoundNames.length, k.all.length);
});

test("신살 판별 기준이 sajuFacts의 정통 표와 같다(표를 두 군데 두지 않는다)", () => {
  for (const c of CASES) {
    const chart = buildChart(c);
    const k = analyzeSinsal(chart);
    const roles = F.getSamhapRoles(chart.pillars.year.branchIndex);
    assert.strictEqual(k.byId.yeokma.targetBranches[0], N.BRANCH_KO[roles.역마]);
    assert.strictEqual(k.byId.dohwa.targetBranches[0], N.BRANCH_KO[roles.도화]);
    assert.strictEqual(k.byId.hwagae.targetBranches[0], N.BRANCH_KO[roles.화개]);
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
