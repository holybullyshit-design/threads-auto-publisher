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

// 아직 원인을 못 찾은 것 — 추측으로 코드를 맞추지 않는다.
const UNRESOLVED = [
  "도화살: 앱은 생일·생시(오)에 도화살을 표시하는데, 정통 도화결(신자진見유 / 사유축見오 / 인오술見묘 / 해묘미見자)로는 년지 진→유, 일지 오→묘라 어느 쪽으로도 오가 나오지 않는다. 앱이 쓰는 기준을 확인해야 한다.",
  "협록: 앱은 생월·생시에만 표시하는데, 우리 판정(건록 사를 끼는 진·오 쌍)은 네 기둥 전부를 잡는다(년·월이 진, 일·시가 오라 조합이 여러 개). 기둥 위치 제한 규칙을 확인해야 한다.",
];

test("[정답지1] 네 기둥·십성·지장간·12운성이 앱과 일치한다", () => {
  const c = buildChart(G1.input);
  const e = G1.expect;
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
});

test("[정답지1] 오행%가 앱과 일치한다(여덟 글자 균등 집계)", () => {
  const s = analyzeStrength(buildChart(G1.input));
  assert.deepStrictEqual(s.elementPercent, G1.expect.elementPercent);
  // 내가 처음 쓰던 "지장간 배분 + 자리 가중치" 방식으로 돌아가면 이 테스트가 깨진다.
  assert.notDeepStrictEqual(s.elementPercent, s.weightedElementPercent, "두 집계가 같아지면 둘 중 하나가 고장난 것");
});

test("[정답지1] 신강약이 득령·득지·득시·득세로 앱과 일치한다", () => {
  const s = analyzeStrength(buildChart(G1.input));
  for (const k of ["득령", "득지", "득시", "득세"]) {
    assert.strictEqual(s.criteria[k].ok, G1.expect.criteria[k], `${k} (${s.criteria[k].basis})`);
  }
  assert.strictEqual(s.verdict, G1.expect.verdict);
  assert.strictEqual(s.verdictConfirmed, true, "이 패턴은 정답지로 확인된 것이어야 한다");
  assert.strictEqual(s.tendency, "신강", "중화신강은 억부 관점에서 신강 쪽이다");
  assert.strictEqual(s.yongsinCandidateElements[0], G1.expect.yongsinTop, "억부 용신 1순위");
  assert.strictEqual(s.yongsinAsserted, false, "용신은 후보로만 둔다");
});

test("[정답지1] 확인된 신살이 기둥까지 일치한다", () => {
  const c = buildChart(G1.input);
  const k = analyzeSinsal(c, analyzeStrength(c));
  for (const [name, pillars] of Object.entries(G1.expect.sinsalByPillar)) {
    const found = k.all.find((x) => x.name === name);
    assert.ok(found, `${name}을 판정하지 않는다`);
    assert.strictEqual(found.found, true, `${name}이 성립하지 않는다고 나온다`);
    assert.deepStrictEqual(found.at.map((a) => a.pillar).sort(), pillars.slice().sort(), `${name}의 기둥`);
  }
});

test("미해결 항목은 숨기지 않고 기록해둔다", () => {
  // 이 테스트는 "모르는 걸 안다고 하지 않는다"는 약속이다. 해결되면 UNRESOLVED에서 지우고
  // 위 테스트에 단언을 추가한다.
  assert.ok(UNRESOLVED.length > 0, "미해결이 없어졌다면 이 테스트를 지우고 단언으로 옮길 것");
  for (const item of UNRESOLVED) assert.match(item, /확인해야 한다/);
});
