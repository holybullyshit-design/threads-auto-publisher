// 사주 엔진 5단계(궁합) + 공개 API 테스트.
//
// 설계 원칙: **궁합 점수를 지어내지 않는다.** 점수는 학파마다 산식이 다르고 검증할 정답지도 없다.
// 지금까지 사고가 난 건 전부 "계산할 수 없는 걸 숫자로 단정"했기 때문이라, 궁합은 검증 가능한
// 구조적 사실(어느 기둥끼리 합·충·형·파·해로 얽혔는지, 오행을 서로 채워주는지)만 돌려준다.

const test = require("node:test");
const assert = require("node:assert");
const S = require("../server/lib/saju");

const A = { year: 1988, month: 4, day: 21, hour: 12, minute: 31, gender: "male" };   // 무진 병진 병오 갑오
const B = { year: 1990, month: 11, day: 19, hour: 21, minute: 58, gender: "female" }; // 경오 정해 무자 계해

test("공개 API가 한 번에 전부 계산한다", () => {
  const r = S.analyze(A, { refDate: "2026-10-07" });
  assert.strictEqual(r.chart.summary, "무진 병진 병오 갑오");
  assert.strictEqual(r.strength.verdict, "중화신강");
  assert.ok(r.sinsal.found.length > 0);
  assert.ok(r.relations.hasAny);
  assert.strictEqual(r.daeun.daeunNumber, 5);
  assert.ok(r.currentDaeun, "기준일을 주면 현재 대운이 나와야 한다");
  assert.ok(r.seun && r.seun.length === 10);
  assert.strictEqual(r.seun[0].year, 2026);
});

test("기준일을 안 주면 시점 의존 계산을 하지 않는다(결정론)", () => {
  const r = S.analyze(A);
  assert.strictEqual(r.currentDaeun, null);
  assert.strictEqual(r.seun, null);
  assert.strictEqual(r.sinsal.samjae, null);
  // 원국·신강약·대운 자체는 시점과 무관하므로 계산된다.
  assert.ok(r.chart.summary && r.strength.verdict && r.daeun.list.length);
});

test("[정답지] 대운 십성이 앱과 일치한다", () => {
  // 1990 여: 앱이 보여준 대운 십성 10개
  const r = S.analyze(B, { refDate: "2026-10-07" });
  assert.deepStrictEqual(
    r.daeun.list.map((d) => d.tenGodOfStem),
    ["편인", "정관", "편관", "정재", "편재", "상관", "식신", "겁재", "비견", "정인"]
  );
  // 세운 십성도 같은 규칙으로 나온다(일간 무 기준, 1993 계유 = 정재)
  const s = S.seun(r.chart, 1993, 3);
  assert.deepStrictEqual(s.map((x) => `${x.ganji}/${x.tenGodOfStem}`), ["계유/정재", "갑술/편관", "을해/정관"]);
});

test("공망은 일주 순(旬) 기준으로 나온다", () => {
  // 무자 일주는 갑신순(甲申旬)이라 공망이 오·미다.
  assert.deepStrictEqual(S.analyze(B).chart.emptyBranches, ["오", "미"]);
});

test("궁합은 두 원국의 구조적 관계를 돌려준다", () => {
  const g = S.compatibility(A, B, { labelA: "남", labelB: "여" });
  // 일지(배우자 자리): 남 오 ↔ 여 자 → 자오충
  assert.strictEqual(g.dayBranch.a, "오");
  assert.strictEqual(g.dayBranch.b, "자");
  assert.ok(g.dayBranch.relations.some((r) => r.type === "충"), "오-자는 충이어야 한다");
  // 일간: 남 병 ↔ 여 무. 무(토)는 병(화)에게 식신, 병(화)은 무(토)에게 편인
  assert.strictEqual(g.dayStem.bToA, "식신");
  assert.strictEqual(g.dayStem.aToB, "편인");
  // 교차 관계에 실제로 존재하는 것만 들어가야 한다
  assert.ok(g.crossStem.some((x) => x.desc === "무계합화"), "남 년간 무 ↔ 여 시간 계");
  assert.ok(g.crossStem.some((x) => x.desc === "갑경충"), "남 시간 갑 ↔ 여 년간 경");
  assert.ok(g.crossBranch.some((x) => x.desc === "진해원진"));
  // 신자진 반합: 남 진 ↔ 여 자(왕지가 있어야 반합 성립)
  assert.ok(g.crossBranch.some((x) => x.type === "삼합(반합)"));
});

test("궁합 점수를 지어내지 않는다", () => {
  const g = S.compatibility(A, B);
  assert.strictEqual(g.score, undefined, "점수를 매기면 안 된다(산식이 학파마다 다르고 검증할 정답지가 없다)");
  assert.strictEqual(g.percent, undefined);
  assert.match(g.note, /숫자로 단정하지 않는다/);
  // 대신 셀 수 있는 것만 센다.
  assert.strictEqual(typeof g.counts.합, "number");
  assert.strictEqual(typeof g.counts.충형파해원진, "number");
});

test("오행 보완은 실제 글자 수로 판정한다", () => {
  const a = S.analyze(A); // 목1 화4 토3 금0 수0
  const b = S.analyze(B); // 목0 화2 토1 금1 수4
  const g = S.compatibility(a, b, { labelA: "남", labelB: "여" });
  // 남에게 없는 금·수를 여가 갖고 있다
  assert.deepStrictEqual(g.complement.aMissingFilledByB.map((x) => x.element).sort(), ["금", "수"]);
  // 여에게 없는 목을 남이 갖고 있다
  assert.deepStrictEqual(g.complement.bMissingFilledByA.map((x) => x.element), ["목"]);
  // 남 용신 후보 1순위가 수인데 여가 수를 50% 갖고 있다
  assert.strictEqual(g.complement.aYongsinFromB[0].element, "수");
  assert.strictEqual(g.complement.aYongsinFromB[0].otherPercent, 50);
});

test("궁합도 결정론적이다", () => {
  const one = S.compatibility(A, B);
  const two = S.compatibility(A, B);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(one)), JSON.parse(JSON.stringify(two)));
});

test("검사기가 천간합·충과 지장간 오류를 잡는다", () => {
  const { checkSajuClaims } = require("../server/lib/sajuClaimChecker");
  const REF = { dateKey: "2026-10-07" };
  // 틀린 것
  assert.ok(checkSajuClaims("갑을합토라 묶입니다.", REF).length, "존재하지 않는 천간합");
  assert.ok(checkSajuClaims("무계합목이에요.", REF).length, "합화 오행 오류");
  assert.ok(checkSajuClaims("경을충이라 부딪혀요.", REF).length, "을경은 합이지 충이 아니다");
  assert.ok(checkSajuClaims("진의 지장간은 병기정입니다.", REF).length, "진의 지장간은 을계무");
  // 맞는 것은 잡으면 안 된다
  for (const t of ["무계합화라 묶입니다.", "갑경충이라 부딪혀요.", "진의 지장간은 을계무입니다.", "오의 지장간은 병기정이에요.", "해의 지장간은 무갑임입니다."]) {
    assert.deepStrictEqual(checkSajuClaims(t, REF), [], `오탐: ${t}`);
  }
});
