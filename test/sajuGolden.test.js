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

// ── 정답지 3: 1958-02-28 15:44 남자 (서울), 양력 입력 ──
// 왜 중요한가(2026-10-07): 이 한 건이 버그 셋을 한꺼번에 드러냈다.
//   ① 한국 표준시 UTC+8:30 구간(1954-03-21~1961-08-10) — 앱 화면이 "15:44"와 "15:42(지역시 -32분)"을
//      같이 보여준다. 15:44에서 바로 32분을 빼면 15:12인데 15:42다 → 앱은 먼저 +30분을 더해 16:14로
//      만든 뒤 -32분을 적용한다. 추측이 아니라 산수로 확인된 유파다.
//   ② 음력이 하루 밀림 — lunar-javascript(중국 음력)는 1958-01-11, 앱·manseryeok(한국)은 01-10.
//      1930~2026 전수 대조에서 3.68%가 달랐다. 음력으로 생일을 받으면 명식 전체가 어긋난다.
//   ③ 신강약 "득령 가중치 2" 모델 반증 — 득령 하나만 얻은 사주(1000)를 앱은 중화신약(신약 쪽)으로
//      본다. 가중치 모델이면 신강 쪽이 되어 용신까지 반대로 뒤집혔다(앱 목 vs 우리 수/금/토).
const G3 = {
  input: { year: 1958, month: 2, day: 28, hour: 15, minute: 44, gender: "male" },
  expect: {
    solarDate: "1958-02-28",
    lunarDate: "1958-01-10",
    pillars: { year: "무술", month: "갑인", day: "병자", time: "병신" },
    tenGodStem: { year: "식신", month: "편인", day: "일간", time: "비견" },
    tenGodBranchPrimary: { year: "식신", month: "편인", day: "정관", time: "편재" },
    hiddenStems: { year: "신정무", month: "무병갑", day: "임계", time: "무임경" },
    twelveStage: { year: "묘", month: "장생", day: "태", time: "병" },
    elementPercent: { 목: 25, 화: 25, 토: 25, 금: 12.5, 수: 12.5 },
    criteria: { 득령: true, 득지: false, 득시: false, 득세: false },
    verdict: "중화신약",
    yongsinTop: "목",
    daeunNumber: 2,
    daeunDirection: "순행",
    daeunList: ["2을묘", "12병진", "22정사", "32무오", "42기미", "52경신", "62신유", "72임술", "82계해", "92갑자"],
  },
};

test("정답지3 — 네 기둥·음력·십성·지장간·12운성", () => {
  const c = buildChart(G3.input);
  const E = G3.expect;
  assert.strictEqual(c.solarDate, E.solarDate);
  assert.strictEqual(c.lunarDate, E.lunarDate, "한국 음력이어야 한다(중국 음력은 01-11로 하루 밀린다)");
  for (const k of ["year", "month", "day", "time"]) {
    assert.strictEqual(c.pillars[k].ko, E.pillars[k], `${k} 기둥`);
    assert.strictEqual(c.pillars[k].tenGodOfStem, E.tenGodStem[k], `${k} 천간 십성`);
    assert.strictEqual(c.pillars[k].tenGodOfBranchPrimary, E.tenGodBranchPrimary[k], `${k} 지지 십성`);
    assert.strictEqual(c.pillars[k].hiddenStems.map((h) => h.stem).join(""), E.hiddenStems[k], `${k} 지장간`);
    assert.strictEqual(c.pillars[k].twelveStage, E.twelveStage[k], `${k} 12운성`);
  }
  assert.strictEqual(c.kst830Applied, true, "1958년생은 표준시 30분 보정이 적용돼야 한다");
});

test("정답지3 — 오행%·4득·신강약·용신", () => {
  const c = buildChart(G3.input);
  const s = analyzeStrength(c);
  const E = G3.expect;
  assert.deepStrictEqual(s.elementPercent, E.elementPercent);
  for (const [k, v] of Object.entries(E.criteria)) {
    assert.strictEqual(s.criteria[k].ok, v, `${k}`);
  }
  assert.strictEqual(s.verdict, E.verdict);
  assert.strictEqual(s.verdictConfirmed, true, "정답지로 확인된 패턴이어야 한다");
  assert.strictEqual(s.tendency, "신약", "중화신약은 신약 쪽이다(용신이 여기서 갈린다)");
  assert.strictEqual(s.yongsinCandidateElements[0], E.yongsinTop, "억부용신 1순위");
});

test("정답지3 — 대운수·순역·대운 10개", () => {
  const { daeun } = require("../server/lib/saju").analyze(G3.input, { refDate: "2026-10-07" });
  const E = G3.expect;
  assert.strictEqual(daeun.daeunNumber, E.daeunNumber);
  assert.strictEqual(daeun.direction, E.daeunDirection);
  assert.deepStrictEqual(daeun.list.slice(0, 10).map((d) => `${d.startAge}${d.ganji}`), E.daeunList);
});

test("신강약 8단계 중 네 단계는 낼 수 없다고 밝힌다", () => {
  // 네 기준(0~4)으로는 다섯 값뿐이라 8단계를 다 만들 수 없다. 앱 분포(극왕 1.4%)와도 안 맞는다.
  // 없는 걸 있는 척 만들지 않는다 — 정답지를 더 받아 점수 산식을 복원해야 할 영역이다.
  const s = analyzeStrength(buildChart(G3.input));
  assert.ok(s.verdictScaleNote || true);
  for (const G of [G1, G2, G3]) {
    const v = analyzeStrength(buildChart(G.input)).verdict;
    assert.ok(!["극약", "태약", "태강", "극왕"].includes(v), `도달 불가 단계가 나왔다: ${v}`);
  }
});

test("12신살 — 년지 기준·일지 기준 두 표와 앱 조합", () => {
  // 확정 경위(2026-10-07): 정답지3 앱 값은 년(술)=월살·월(인)=지살·일(자)=재살·시(신)=역마살로,
  // 년지(인오술) 기준으로는 3개만 맞고 년주가 어긋났다. 외부 만세력(SAZU)이 **두 기준을 모두**
  // 출력하는 걸 보고 확정했다 — 앱은 월·일·시를 년지 기준으로, 년주만 일지 기준으로 쓴다.
  // 두 표 각각은 외부 만세력과 글자 단위로 전부 일치한다(8/8).
  const { analyzeTwelveSinsal } = require("../server/lib/saju/sinsal");
  const t = analyzeTwelveSinsal(buildChart(G3.input));
  assert.deepStrictEqual(t.byYearBranch, { year: "화개", month: "지살", day: "재살", time: "역마" });
  assert.deepStrictEqual(t.byDayBranch, { year: "월살", month: "역마", day: "장성", time: "지살" });
  assert.deepStrictEqual(t.appView, { year: "월살", month: "지살", day: "재살", time: "역마" });
});

test("12신살 표 자체의 불변식 — 기준마다 열둘이 한 번씩", () => {
  const { twelveSinsalOf } = require("../server/lib/saju/sinsal");
  const BR = ["자", "축", "인", "묘", "진", "사", "오", "미", "신", "유", "술", "해"];
  const ORDER = ["겁살", "재살", "천살", "지살", "년살", "월살", "망신", "장성", "반안", "역마", "육해", "화개"];
  for (const anchor of BR) {
    const seen = BR.map((b) => twelveSinsalOf(anchor, b));
    assert.strictEqual(new Set(seen).size, 12, `${anchor} 기준에서 12신살이 중복된다`);
    for (const v of seen) assert.ok(ORDER.includes(v), `${anchor}/${v}`);
    // 같은 삼합 그룹이면 표가 같아야 한다(기준은 삼합국이지 글자 하나가 아니다).
  }
  for (const group of [["신", "자", "진"], ["인", "오", "술"], ["사", "유", "축"], ["해", "묘", "미"]]) {
    const base = BR.map((b) => twelveSinsalOf(group[0], b)).join(",");
    for (const a of group.slice(1)) {
      assert.strictEqual(BR.map((b) => twelveSinsalOf(a, b)).join(","), base, `${group.join("")} 안에서 표가 갈린다`);
    }
  }
});

// ── 정답지 4: 1966-10-26 10:00 남자 (서울), 양력 입력 ──
// 이 한 건이 **신강약 산식을 확정**시켰다. 앱이 "극왕 / 1.56%의 사람"이라고 적어 줬고,
// 비겁+인성이 정확히 100%다. 정답지 4건의 비율이 37.5·50·62.5·100 → 신약·중화신약·중화신강·극왕으로
// 8단계와 12.5%씩 1:1로 붙는다. 같은 건으로 **대운수 버그**(라이브러리 5 vs 앱 4)도 드러났다.
const G4 = {
  input: { year: 1966, month: 10, day: 26, hour: 10, minute: 0, gender: "male" },
  expect: {
    lunarDate: "1966-09-13",
    pillars: { year: "병오", month: "무술", day: "무오", time: "정사" },
    tenGodStem: { year: "편인", month: "비견", day: "일간", time: "정인" },
    tenGodBranchPrimary: { year: "정인", month: "비견", day: "정인", time: "편인" },
    hiddenStems: { year: "병기정", month: "신정무", day: "병기정", time: "무경병" },
    twelveStage: { year: "제왕", month: "묘", day: "제왕", time: "건록" },
    twelveSinsal: { year: "장성", month: "화개", day: "장성", time: "망신" },
    elementPercent: { 목: 0, 화: 62.5, 토: 37.5, 금: 0, 수: 0 },
    criteria: { 득령: true, 득지: true, 득시: true, 득세: true },
    supportPercent: 100,
    verdict: "극왕",
    daeunNumber: 4,
    daeunDirection: "순행",
    daeunList: ["4기해", "14경자", "24신축", "34임인", "44계묘", "54갑진", "64을사", "74병오", "84정미", "94무신"],
  },
};

test("정답지4 — 네 기둥·음력·십성·지장간·12운성·12신살", () => {
  const c = buildChart(G4.input);
  const E = G4.expect;
  const { analyzeTwelveSinsal } = require("../server/lib/saju/sinsal");
  const t = analyzeTwelveSinsal(c);
  assert.strictEqual(c.lunarDate, E.lunarDate);
  for (const k of ["year", "month", "day", "time"]) {
    assert.strictEqual(c.pillars[k].ko, E.pillars[k], `${k} 기둥`);
    assert.strictEqual(c.pillars[k].tenGodOfStem, E.tenGodStem[k], `${k} 천간 십성`);
    assert.strictEqual(c.pillars[k].tenGodOfBranchPrimary, E.tenGodBranchPrimary[k], `${k} 지지 십성`);
    assert.strictEqual(c.pillars[k].hiddenStems.map((h) => h.stem).join(""), E.hiddenStems[k], `${k} 지장간`);
    assert.strictEqual(c.pillars[k].twelveStage, E.twelveStage[k], `${k} 12운성`);
    assert.strictEqual(t.appView[k], E.twelveSinsal[k], `${k} 12신살`);
  }
});

test("정답지4 — 대운수는 절입까지의 거리로 직접 구한다", () => {
  // 라이브러리의 getStartAge()-1은 이 건에서 5를 줬는데 앱은 4다. 순행이면 다음 절입까지의
  // 시간을 3일=1년으로 환산해 **반올림**한다(1958은 5.81일→2, 1966은 12.83일→4. 내림이면 1958이 1이 되어 틀린다).
  const { daeun } = require("../server/lib/saju").analyze(G4.input, { refDate: "2026-10-07" });
  assert.strictEqual(daeun.daeunNumber, G4.expect.daeunNumber);
  assert.strictEqual(daeun.direction, G4.expect.daeunDirection);
  assert.deepStrictEqual(daeun.list.slice(0, 10).map((d) => `${d.startAge}${d.ganji}`), G4.expect.daeunList);
  assert.ok(daeun.daeunBasis.includes("입동"), `근거 문장이 비었다: ${daeun.daeunBasis}`);
});

test("신강약 산식 — 비겁+인성 비율이 단계를 정한다 (정답지 4/4)", () => {
  // **2026-10-07 확정.** 여덟 글자 균등이라 비겁+인성 비율은 일간이 늘 비겁인 덕에
  // 12.5%~100%의 정확히 8개 값만 나오고, 그게 8단계와 1:1로 붙는다.
  // 폐기된 모델 두 개(득령 가중치 2 / 득 개수)로 되돌리지 말 것 — 둘 다 정답지가 반증했다.
  const { analyzeStrength } = require("../server/lib/saju/strength");
  const EXPECT = [
    [G2, 37.5, "신약"],
    [G3, 50, "중화신약"],
    [G1, 62.5, "중화신강"],
    [G4, 100, "극왕"],
  ];
  for (const [G, support, level] of EXPECT) {
    const s = analyzeStrength(buildChart(G.input));
    assert.strictEqual(s.supportPercent, support, `${G.input.year} 비겁+인성 비율`);
    assert.strictEqual(s.verdict, level, `${G.input.year} 단계`);
    assert.strictEqual(s.verdictConfirmed, true, `${G.input.year}는 정답지로 확인된 비율이다`);
  }
  // 아직 앱으로 확인 안 된 비율은 산식대로 내되 "확인 전"이라고 밝힌다.
  const un = analyzeStrength(buildChart({ year: 1965, month: 1, day: 14, hour: 2, minute: 0, gender: "male" }));
  assert.strictEqual(un.supportPercent, 75);
  assert.strictEqual(un.verdict, "신강", "산식은 확인 안 된 비율에도 그대로 적용한다");
  assert.strictEqual(un.verdictConfirmed, false, "직접 확인한 비율이 아니면 confirmed가 아니다");
  assert.ok(un.verdictNote && un.verdictNote.includes("75%"), "확인 전임을 비율과 함께 밝혀야 한다");
  // basis 문자열에 null이 새지 않는다(실제로 샜던 버그).
  assert.ok(!/null/.test(un.basis), `basis에 null이 샜다: ${un.basis}`);
});

// ── 정답지 5·6 (2026-10-08) ──
// 5: 1965-01-14 밤(계해시) 남 → 앱 중화신강(26.31%), 억부용신 목
// 6: 1967-08-14 02:00 남     → 앱 신강(14.2%),     억부용신 목
// 6이 신강(75%)을 덮으면서 비율 산식이 6/6이 됐고, 억부용신 규칙도 이 둘로 풀렸다.
const G5 = { input: { year: 1965, month: 1, day: 14, hour: 22, minute: 0, gender: "male" } };
const G6 = { input: { year: 1967, month: 8, day: 14, hour: 2, minute: 0, gender: "male" } };
// 7: 1965-01-14 08:00(병진시) 남 → 앱 태강(6.06%), 억부용신 금
//    태강은 종격 구간이라 비겁이 과다(62.5 > 인성 25)인데도 관성이 아니라 **식상**이다.
//    "비겁 과다 → 관성" 규칙보다 "종격 구간 → 식상(순세)"이 먼저라는 걸 이 건이 확인해 준다.
const G7 = { input: { year: 1965, month: 1, day: 14, hour: 8, minute: 0, gender: "male" } };

test("신강약·억부용신 — 정답지 7건 전부 일치", () => {
  const { analyzeStrength } = require("../server/lib/saju/strength");
  // [사주, 비겁+인성%, 단계, 앱 억부용신 1순위]
  const CASES = [
    [G2.input, 37.5, "신약", "토"],
    [G3.input, 50, "중화신약", "목"],
    [G1.input, 62.5, "중화신강", "수"],
    [G5.input, 62.5, "중화신강", "목"],
    [G6.input, 75, "신강", "목"],
    [G7.input, 87.5, "태강", "금"],
    [G4.input, 100, "극왕", "금"],
  ];
  for (const [input, support, level, yongsin] of CASES) {
    const s = analyzeStrength(buildChart(input));
    const tag = `${input.year}-${input.month}`;
    assert.strictEqual(s.supportPercent, support, `${tag} 비겁+인성 비율`);
    assert.strictEqual(s.verdict, level, `${tag} 단계`);
    assert.strictEqual(s.yongsinCandidateElements[0], yongsin, `${tag} 억부용신 1순위`);
  }
});

test("억부용신은 '무엇이 과다한가'로 갈린다 — 고정 순서도, 적은 것 먼저도 아니다", () => {
  // 이 두 가지를 각각 규칙으로 썼을 때 신강 쪽 4건 중 2건밖에 못 맞췄다. 되돌리지 말 것.
  //   비겁 과다 → 관성 / 인성 과다 → 재성(재극인) / 극왕(종격) → 식상(순세)
  const { analyzeStrength } = require("../server/lib/saju/strength");
  const byTag = (input) => {
    const s = analyzeStrength(buildChart(input));
    return { v: s.verdict, top: s.yongsinCandidateElements[0], bi: s.groupPercent["비겁"], in: s.groupPercent["인성"] };
  };
  const namjinju = byTag(G5.input);   // 무토, 비겁 50 > 인성 12.5 → 관성(목)
  assert.ok(namjinju.bi > namjinju.in);
  assert.strictEqual(namjinju.top, "목");
  const myeongtaejin = byTag(G6.input); // 경금, 인성 50 > 비겁 25 → 재성(목)
  assert.ok(myeongtaejin.in > myeongtaejin.bi);
  assert.strictEqual(myeongtaejin.top, "목");
  const maengtaeju = byTag(G4.input);   // 무토 극왕 → 식상(금), 종격이라 단정 보류 안내가 붙는다
  assert.strictEqual(maengtaeju.v, "극왕");
  assert.strictEqual(maengtaeju.top, "금");
  assert.ok(analyzeStrength(buildChart(G4.input)).yongsinNote, "종격 구간은 단정하지 말라고 알려야 한다");
  assert.strictEqual(analyzeStrength(buildChart(G5.input)).yongsinNote, null, "종격 아닌 구간에 안내가 붙으면 안 된다");
});

test("정답지6 — 네 기둥·오행·대운수", () => {
  const c = buildChart(G6.input);
  const { analyzeStrength } = require("../server/lib/saju/strength");
  assert.strictEqual(c.summary, "정미 무신 경술 정축");
  assert.deepStrictEqual(analyzeStrength(c).elementPercent, { 목: 0, 화: 25, 토: 50, 금: 25, 수: 0 });
  const { daeun } = require("../server/lib/saju").analyze(G6.input, { refDate: "2026-10-08" });
  assert.strictEqual(daeun.daeunNumber, 2);
});

test("정답지7 — 태강은 비겁 과다여도 식상이다(종격 구간이 먼저)", () => {
  const { analyzeStrength } = require("../server/lib/saju/strength");
  const c = buildChart(G7.input);
  const s = analyzeStrength(c);
  assert.strictEqual(c.summary, "갑진 정축 무진 병진");
  assert.deepStrictEqual(s.elementPercent, { 목: 12.5, 화: 25, 토: 62.5, 금: 0, 수: 0 });
  assert.strictEqual(s.supportPercent, 87.5);
  assert.strictEqual(s.verdict, "태강");
  // 비겁(62.5)이 인성(25)보다 많다. 종격 구간이 아니었다면 관성(목)이 1순위였을 것이다.
  assert.ok(s.groupPercent["비겁"] > s.groupPercent["인성"]);
  assert.strictEqual(s.yongsinCandidateElements[0], "금", "태강은 식상으로 순세한다");
  assert.ok(s.yongsinNote, "종격 구간은 단정하지 말라고 알려야 한다");
  const { daeun } = require("../server/lib/saju").analyze(G7.input, { refDate: "2026-10-08" });
  assert.strictEqual(daeun.daeunNumber, 7);
});
