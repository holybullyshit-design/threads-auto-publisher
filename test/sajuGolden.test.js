// 골든 픽스처 — 사용자가 실제 만세력 앱에서 뽑아 준 정답지로 엔진을 검증한다.
//
// 왜 필요한가(2026-10-07): 그 전까지 검증은 "라이브러리 출력 + 내가 만든 표 + 불변식"까지였다.
// 그건 자기 확인이지 검증이 아니다. 실제 정답지를 받고 나서야 두 가지가 틀렸다는 게 드러났다:
//   ① 오행% — 나는 지장간을 배분하고 자리 가중치를 곱했는데(내가 임의로 정한 방식),
//      앱은 여덟 글자를 균등하게 센다. {목19 화38 토33.1 금0 수9.9} → {목12.5 화50 토37.5 금0 수0}
//   ② 신강약 — 나는 비율 임계값으로 3분류했는데, 앱은 득령·득지·득시·득세로 8단계를 매긴다.
//      "신강" → "중화신강"
// 둘 다 앱 방식으로 바꿨고, 이 파일이 다시는 어긋나지 않게 고정한다.
//
// ⚠ 정답지가 아직 **1건뿐**이다. 아래 UNRESOLVED에 적힌 두 항목은 원인을 못 찾았고,
// 추측으로 코드를 맞추지 않았다(추측으로 메우는 짓 때문에 이미 세 번 사고가 났다).
// 정답지가 더 들어오면 그때 맞춘다.

const test = require("node:test");
const assert = require("node:assert");
const { buildChart } = require("../server/lib/saju/chart");
const { analyzeStrength } = require("../server/lib/saju/strength");
const { analyzeSinsal } = require("../server/lib/saju/sinsal");

// ── 정답지 1: 1988-04-21 12:31 남자 (서울), 양력 입력 ──
// 출처: 사용자가 쓰는 만세력 앱 화면(2026-10-07 제공)
const G1 = {
  input: { year: 1988, month: 4, day: 21, hour: 12, minute: 31, gender: "male" },
  expect: {
    solarDate: "1988-04-21",
    lunarDate: "1988-03-06",
    pillars: { year: "무진", month: "병진", day: "병오", time: "갑오" },
    tenGodStem: { year: "식신", month: "비견", day: "일간", time: "편인" },
    tenGodBranchPrimary: { year: "식신", month: "식신", day: "겁재", time: "겁재" },
    hiddenStems: { year: "을계무", month: "을계무", day: "병기정", time: "병기정" },
    twelveStage: { year: "관대", month: "관대", day: "제왕", time: "제왕" },
    elementPercent: { 목: 12.5, 화: 50, 토: 37.5, 금: 0, 수: 0 },
    criteria: { 득령: false, 득지: true, 득시: true, 득세: true },
    verdict: "중화신강",
    yongsinTop: "수", // 앱: "수(억부용신)"
    // 기둥까지 확인된 신살
    sinsalByPillar: {
      화개살: ["year", "month"],
      양인살: ["day", "time"],
      백호살: ["year"],
      현침살: ["day", "time"],
    },
  },
};

// ── 정답지 2: 1990-11-19 21:58 여자 (경기도), 양력 입력 ──
// 신약 사주 + 여자(대운 역행) 케이스. 정답지1이 못 덮던 구간을 메운다.
const G2 = {
  input: { year: 1990, month: 11, day: 19, hour: 21, minute: 58, gender: "female" },
  expect: {
    solarDate: "1990-11-19",
    lunarDate: "1990-10-03",
    pillars: { year: "경오", month: "정해", day: "무자", time: "계해" },
    tenGodStem: { year: "식신", month: "정인", day: "일간", time: "정재" },
    tenGodBranchPrimary: { year: "정인", month: "편재", day: "정재", time: "편재" },
    hiddenStems: { year: "병기정", month: "무갑임", day: "임계", time: "무갑임" },
    twelveStage: { year: "제왕", month: "절", day: "태", time: "절" },
    elementPercent: { 목: 0, 화: 25, 토: 12.5, 금: 12.5, 수: 50 },
    criteria: { 득령: false, 득지: false, 득시: false, 득세: false },
    verdict: "신약",
    yongsinTop: "토",
    sinsalByPillar: {
      도화살: ["year", "day"],
      현침살: ["year"],
      양인살: ["year"],
      관귀학관: ["month", "time"],
      역마살: ["month", "time"],
      천문성: ["month", "time"],
    },
  },
};

// 정답지 2건으로 풀린 것 — 앱은 역마·도화·화개를 **삼합 기준이 아니라 "글자 자체"로** 판정한다.
//   역마 = 인·신·사·해(사생지) / 도화 = 자·오·묘·유(사왕지) / 화개 = 진·술·축·미(사고지)
// 두 사주 6/6 전부 일치했다. 정통 삼합 기준(신자진見유 등)과는 결과가 다르므로, 엔진은 둘 다
// 계산하고 삼합 기준은 samhapBased에 따로 담는다(우리 Threads 글은 지금까지 삼합 기준을 썼다).
// 협록도 "월지와 시지가 건록을 끼는 경우"로 좁혀서 2건 모두 맞췄다.

function assertPillars(G) {
  const c = buildChart(G.input);
  const e = G.expect;
  assert.strictEqual(c.solarDate, e.solarDate);
  assert.strictEqual(c.lunarDate, e.lunarDate);
  for (const key of ["year", "month", "day", "time"]) {
    const p = c.pillars[key];
    assert.strictEqual(p.ko, e.pillars[key], `${key} 기둥`);
    assert.strictEqual(p.tenGodOfStem, e.tenGodStem[key], `${key} 천간 십성`);
    assert.strictEqual(p.tenGodOfBranchPrimary, e.tenGodBranchPrimary[key], `${key} 지지 십성(본기)`);
    assert.strictEqual(p.hiddenStems.map((h) => h.stem).join(""), e.hiddenStems[key], `${key} 지장간`);
    assert.strictEqual(p.twelveStage, e.twelveStage[key], `${key} 12운성`);
  }
}
test("[정답지] 네 기둥·십성·지장간·12운성이 앱과 일치한다", () => {
  assertPillars(G1);
  assertPillars(G2);
});

test("[정답지] 오행%가 앱과 일치한다(여덟 글자 균등 집계)", () => {
  for (const G of [G1, G2]) {
    assert.deepStrictEqual(analyzeStrength(buildChart(G.input)).elementPercent, G.expect.elementPercent);
  }
  const s = analyzeStrength(buildChart(G1.input));
  // 내가 처음 쓰던 "지장간 배분 + 자리 가중치" 방식으로 돌아가면 이 테스트가 깨진다.
  assert.notDeepStrictEqual(s.elementPercent, s.weightedElementPercent, "두 집계가 같아지면 둘 중 하나가 고장난 것");
});

test("[정답지] 신강약이 득령·득지·득시·득세로 앱과 일치한다", () => {
  for (const G of [G1, G2]) {
    const s = analyzeStrength(buildChart(G.input));
    for (const k of ["득령", "득지", "득시", "득세"]) {
      assert.strictEqual(s.criteria[k].ok, G.expect.criteria[k], `${k} (${s.criteria[k].basis})`);
    }
    assert.strictEqual(s.verdict, G.expect.verdict, "8단계 판정");
    assert.strictEqual(s.verdictConfirmed, true, "두 정답지의 패턴은 확인된 것으로 표시돼야 한다");
    assert.strictEqual(s.yongsinCandidateElements[0], G.expect.yongsinTop, "억부 용신 1순위");
    assert.strictEqual(s.yongsinAsserted, false, "용신은 후보로만 둔다");
  }
  // 중화신강은 억부 관점에서 신강 쪽, 신약은 신약 쪽
  assert.strictEqual(analyzeStrength(buildChart(G1.input)).tendency, "신강");
  assert.strictEqual(analyzeStrength(buildChart(G2.input)).tendency, "신약");
});

test("[정답지] 신살이 기둥까지 일치한다", () => {
  for (const G of [G1, G2]) assertSinsal(G);
});
function assertSinsal(G) {
  const c = buildChart(G.input);
  const k = analyzeSinsal(c, analyzeStrength(c));
  for (const [name, pillars] of Object.entries(G.expect.sinsalByPillar)) {
    const found = k.all.find((x) => x.name === name);
    assert.ok(found, `${name}을 판정하지 않는다`);
    assert.strictEqual(found.found, true, `${name}이 성립하지 않는다고 나온다`);
    assert.deepStrictEqual(found.at.map((a) => a.pillar).sort(), pillars.slice().sort(), `${name}의 기둥`);
  }
}

test("역마·도화·화개는 글자 기준(앱 방식)과 삼합 기준을 둘 다 들고 있다", () => {
  // 두 방식은 결과가 다르다. 앱 방식을 기본(found)으로 쓰되, 우리 Threads 글이 써 온 삼합
  // 기준도 버리지 않고 samhapBased에 남긴다 - 어느 쪽으로 글을 쓸지는 사용자가 정한다.
  const c = buildChart(G1.input); // 무진 병진 병오 갑오 (년지 진 = 신자진)
  const k = analyzeSinsal(c, analyzeStrength(c));
  const dohwa = k.byId.dohwa;
  assert.deepStrictEqual(dohwa.targetBranches, ["자", "오", "묘", "유"], "앱 방식은 사왕지 전체");
  assert.strictEqual(dohwa.found, true, "지지에 오가 있으므로 앱 방식으로는 성립");
  assert.deepStrictEqual(dohwa.samhapBased.targetBranches, ["유"], "삼합 기준은 신자진→유");
  assert.strictEqual(dohwa.samhapBased.found, false, "원국에 유가 없으므로 삼합 기준으로는 미성립");
});

test("천문성은 아직 확정 아님을 표시한다", () => {
  // 묘·해로만 확인했고 술·미가 들어간 정답지가 없다. 모르는 걸 안다고 하지 않는다.
  const c = buildChart(G2.input);
  const k = analyzeSinsal(c, analyzeStrength(c));
  assert.ok(k.byId.cheonmunseong.unverified, "확인 안 된 판별표는 그렇다고 표시해야 한다");
});
