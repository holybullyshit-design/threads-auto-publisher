// 사주 엔진 3단계(대운·세운 / 합·충·형·파·해) 테스트.
//
// 대운은 정답지 2건으로 완전 검증했다 - 순행(1988 남)과 역행(1990 여)이 둘 다 들어 있어서,
// 방향 판정·대운수·간지 순서·나이를 전부 교차검증할 수 있는 세트였다.
// 라이브러리가 세는나이로 주는 것을 만나이로 바꿔야 앱과 맞는다(두 정답지 모두 정확히 1 차이).

const test = require("node:test");
const assert = require("node:assert");
const { buildChart } = require("../server/lib/saju/chart");
const { daeun, daeunAt, seun } = require("../server/lib/saju/luck");
const { analyzeRelations, BRANCH_CHUNG, BRANCH_YUKHAP, STEM_HAP } = require("../server/lib/saju/relations");
const N = require("../server/lib/saju/naming");

const G1 = { input: { year: 1988, month: 4, day: 21, hour: 12, minute: 31, gender: "male" },
  daeun: { number: 5, direction: "순행",
    list: ["정사", "무오", "기미", "경신", "신유", "임술", "계해", "갑자", "을축", "병인"],
    ages: [5, 15, 25, 35, 45, 55, 65, 75, 85, 95] } };
const G2 = { input: { year: 1990, month: 11, day: 19, hour: 21, minute: 58, gender: "female" },
  daeun: { number: 4, direction: "역행",
    list: ["병술", "을유", "갑신", "계미", "임오", "신사", "경진", "기묘", "무인", "정축"],
    ages: [4, 14, 24, 34, 44, 54, 64, 74, 84, 94] } };

test("[정답지] 대운수·방향·간지·나이가 앱과 일치한다(순행·역행 둘 다)", () => {
  for (const G of [G1, G2]) {
    const d = daeun(buildChart(G.input), 10);
    assert.strictEqual(d.daeunNumber, G.daeun.number, "대운수(만나이)");
    assert.strictEqual(d.direction, G.daeun.direction, "순행/역행");
    assert.deepStrictEqual(d.list.map((x) => x.ganji), G.daeun.list, "대운 간지 10개");
    assert.deepStrictEqual(d.list.map((x) => x.startAge), G.daeun.ages, "대운 시작 나이 10개");
  }
});

test("대운 방향은 연간 음양 × 성별로 갈린다", () => {
  // 1988 무진년(무=양) 남자 → 순행 / 1990 경오년(경=양) 여자 → 역행
  assert.strictEqual(buildChart(G1.input).pillars.year.stemYinYang, "양");
  assert.strictEqual(buildChart(G2.input).pillars.year.stemYinYang, "양");
  assert.strictEqual(daeun(buildChart(G1.input)).direction, "순행");
  assert.strictEqual(daeun(buildChart(G2.input)).direction, "역행");
  // 같은 사주를 성별만 바꾸면 방향이 뒤집혀야 한다.
  const flipped = daeun(buildChart({ ...G1.input, gender: "female" }));
  assert.strictEqual(flipped.direction, "역행", "성별을 바꾸면 대운 방향이 뒤집혀야 한다");
});

test("대운은 월주 다음 간지에서 출발한다", () => {
  for (const G of [G1, G2]) {
    const c = buildChart(G.input);
    const d = daeun(c, 3);
    const monthIdx = N.branchIndex(c.pillars.month.branch);
    const firstIdx = N.branchIndex(d.list[0].branch);
    const step = d.direction === "순행" ? 1 : 11;
    assert.strictEqual(firstIdx, (monthIdx + step) % 12, `${d.direction}인데 월주(${c.pillars.month.ko}) 다음이 ${d.list[0].ganji}`);
    assert.strictEqual(d.basePillar, c.pillars.month.ko);
  }
});

test("대운에 십성이 붙는다(일간 기준)", () => {
  const c = buildChart(G1.input); // 일간 병
  const d = daeun(c, 3);
  // 첫 대운 정사: 천간 정(화)은 병(화)에게 겁재
  assert.strictEqual(d.list[0].tenGodOfStem, "겁재");
  for (const x of d.list) {
    assert.ok(x.tenGodOfStem && x.tenGodOfBranch, "대운마다 십성이 있어야 한다");
  }
});

test("특정 연도의 대운을 찾을 수 있다", () => {
  const c = buildChart(G1.input);
  const at = daeunAt(c, 2026);
  assert.ok(at, "2026년 대운을 못 찾았다");
  assert.ok(2026 >= at.startYear && 2026 <= at.endYear);
});

test("세운은 기준 연도를 받아야 한다(현재시각 의존 금지 - 결정론)", () => {
  const c = buildChart(G1.input);
  assert.throws(() => seun(c), /기준 연도/);
  const s = seun(c, 2026, 3);
  assert.deepStrictEqual(s.map((x) => x.year), [2026, 2027, 2028]);
  assert.strictEqual(s[0].ganji, "병오", "2026년은 병오년");
  assert.strictEqual(s[1].ganji, "정미");
  assert.strictEqual(s[2].ganji, "무신");
});

test("대운·세운도 결정론적이다", () => {
  for (const G of [G1, G2]) {
    const a = daeun(buildChart(G.input), 10);
    const b = daeun(buildChart(G.input), 10);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
    assert.deepStrictEqual(seun(buildChart(G.input), 2026, 5), seun(buildChart(G.input), 2026, 5));
  }
});

// ── 합·충·형·파·해 ──

test("관계 판별표가 정통 표 그대로다", () => {
  // 천간합 5쌍: 갑기합토·을경합금·병신합수·정임합목·무계합화
  assert.deepStrictEqual(STEM_HAP.map((x) => x.pair.join("") + x.result), ["갑기토", "을경금", "병신수", "정임목", "무계화"]);
  // 육합 6쌍
  assert.deepStrictEqual(BRANCH_YUKHAP.map((x) => x.pair.join("")), ["자축", "인해", "묘술", "진유", "사신", "오미"]);
  // 충 6쌍 - 서로 일곱 번째(정반대) 지지끼리여야 한다
  assert.strictEqual(BRANCH_CHUNG.length, 6);
  for (const [a, b] of BRANCH_CHUNG) {
    assert.strictEqual((N.branchIndex(a) + 6) % 12, N.branchIndex(b), `${a}${b}는 충이 아니다`);
  }
});

test("[손검산] 1988 사주의 관계가 맞다", () => {
  // 무진 병진 병오 갑오 - 천간 무·병·병·갑(합·충 없음), 지지 진진·오오(자형만)
  const r = analyzeRelations(buildChart(G1.input));
  assert.deepStrictEqual(r.천간합, []);
  assert.deepStrictEqual(r.천간충, []);
  assert.deepStrictEqual(r.충, []);
  assert.deepStrictEqual(r.육합, []);
  const jahyeong = r.형.filter((x) => x.kind === "자형").map((x) => x.desc).sort();
  assert.deepStrictEqual(jahyeong, ["오오형", "진진형"]);
});

test("[손검산] 1990 사주의 관계가 맞다", () => {
  // 경오 정해 무자 계해 - 무계합화(일-시), 정계충(월-시), 자오충(년-일), 해해 자형(월-시)
  const r = analyzeRelations(buildChart(G2.input));
  assert.strictEqual(r.천간합.length, 1);
  assert.strictEqual(r.천간합[0].desc, "무계합화");
  assert.deepStrictEqual(r.천간합[0].between, ["일주", "시주"]);
  assert.strictEqual(r.천간충.length, 1);
  assert.strictEqual(r.천간충[0].desc, "정계충");
  assert.strictEqual(r.충.length, 1);
  assert.strictEqual(r.충[0].desc, "자오충");
  assert.deepStrictEqual(r.충[0].between, ["년주", "일주"]);
  assert.ok(r.형.some((x) => x.desc === "해해형"));
  // 해자축 방합은 축이 없어 성립하면 안 된다.
  assert.deepStrictEqual(r.방합, []);
});

test("관계 분석도 결정론적이고, 없는 관계를 지어내지 않는다", () => {
  for (const G of [G1, G2]) {
    const a = analyzeRelations(buildChart(G.input));
    const b = analyzeRelations(buildChart(G.input));
    assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
    // 모든 관계는 실제 원국 지지/천간으로만 이뤄져야 한다.
    const c = buildChart(G.input);
    const branches = c.pillarOrder.map((k) => c.pillars[k].branch);
    const stems = c.pillarOrder.map((k) => c.pillars[k].stem);
    for (const key of ["육합", "충", "파", "해", "원진"]) {
      for (const x of a[key]) for (const v of x.values) assert.ok(branches.includes(v), `${key}에 원국에 없는 지지 ${v}`);
    }
    for (const key of ["천간합", "천간충"]) {
      for (const x of a[key]) for (const v of x.values) assert.ok(stems.includes(v), `${key}에 원국에 없는 천간 ${v}`);
    }
  }
});
