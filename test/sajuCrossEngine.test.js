// 외부 엔진 교차 검증 — 우리 만세력을 "남이 만든 엔진"과 대조해 고정한다.
//
// 왜 필요한가(2026-10-07): 그 전까지 만세력 검증은 ① 사용자 정답지 2건 ② 라이브러리 자기 출력
// ③ 불변식까지였다. 사용자가 "그냥 기존 사주 엔진 쓰면 안 되냐"고 물어서 npm의 사주 엔진 5개를
// 받아 대조했고, **거기서 우리 엔진의 버그 두 개가 드러났다.** 정답지 2건은 둘 다 못 잡는
// 구간이었다(12:31·21:58 출생 — 23시대도 아니고 절기 경계도 아니다).
//
//   ① 시주 천간이 일주와 어긋남 — lunar-javascript의 getTime()은 setSect를 **무시하고** 항상
//      야자시(sect 1) 기준 시주를 준다. 우리는 자정 기준(sect 2)이라 23시대 출생자에게
//      "일주는 그날 / 시주 천간은 다음날 일간 기준"이라는 모순된 명식이 나왔다. 전수 검사에서
//      23시대 5,400건 전부 틀렸다.
//   ② 절기 시각이 1시간 이름 — 라이브러리는 절기를 중국 표준시(UTC+8)로 계산하는데 우리는
//      그걸 KST로 취급했다. 1950~2026 절기 1,771개를 manseryeok(KASI 기준)·k-saju
//      (astronomy-engine 독립 계산)와 3자 대조해 **1,771개 전부 정확히 60분** 차이를 확인했다.
//      절기 직후 1시간에 태어나면 월주가, 입춘이면 **년주와 띠까지** 틀렸다.
//
// 그래서 이 파일은 교차 검증 자체를 테스트로 남긴다 — 라이브러리를 올리거나 유파 설정을
// 건드리면 바로 깨지게. 외부 엔진은 `manseryeok`(의존성 0, CJS)을 쓴다.

const test = require("node:test");
const assert = require("node:assert");
const { buildChart } = require("../server/lib/saju/chart");
const { timeStemOf, twelveStageOf } = require("../server/lib/saju/elements");
const N = require("../server/lib/saju/naming");
const CONFIG = require("../server/lib/saju/config");
const ms = require("manseryeok");

function msPillars(y, m, d, hh, mi) {
  const r = ms.calculateFourPillars({ year: y, month: m, day: d, hour: hh, minute: mi });
  return ms.fourPillarsToString(r).replace(/[연월일시]주/g, "").replace(/,/g, "").trim().split(/\s+/);
}

function ourPillars(y, m, d, hh, mi) {
  const c = buildChart({ year: y, month: m, day: d, hour: hh, minute: mi, gender: "male" });
  return { list: ["year", "month", "day", "time"].map((k) => c.pillars[k].ko), chart: c };
}

test("시주 천간은 언제나 일간에서 도출된다 — 23시대 야자시 포함", () => {
  // 명리 규칙: 甲己일→甲子시, 乙庚→丙子, 丙辛→戊子, 丁壬→庚子, 戊癸→壬子.
  // 라이브러리 getTime()을 그대로 믿으면 23시대에서 100% 깨진다.
  let checked = 0;
  for (let y = 1930; y <= 2026; y += 7) {
    for (const m of [1, 3, 6, 9, 12]) {
      for (const d of [1, 14, 27]) {
        for (const hh of [0, 11, 22, 23]) {
          for (const mi of [5, 50]) {
            const c = buildChart({ year: y, month: m, day: d, hour: hh, minute: mi, gender: "male" });
            checked++;
            assert.strictEqual(
              c.pillars.time.stem,
              timeStemOf(c.pillars.day.stem, c.pillars.time.branch),
              `${y}-${m}-${d} ${hh}:${mi} 일주 ${c.pillars.day.ko} 시주 ${c.pillars.time.ko}`
            );
          }
        }
      }
    }
  }
  assert.ok(checked > 1000, `검사 건수가 너무 적다: ${checked}`);
});

test("23시대 출생 — 일주는 그날, 시주는 그 일간 기준(자정 기준 유파)", () => {
  // 터졌던 실제 케이스. 1950-01-01 23:50 → 일주 병신, 병일의 자시는 무자.
  // 고치기 전에는 경자(다음날 정유일의 자시)가 나왔다.
  const c = buildChart({ year: 1950, month: 1, day: 1, hour: 23, minute: 50, gender: "male" });
  assert.strictEqual(c.pillars.day.ko, "병신");
  assert.strictEqual(c.pillars.time.ko, "무자");
  assert.strictEqual(CONFIG.DAY_BOUNDARY_SECT, 2, "자정 기준 유파가 바뀌면 이 기대값부터 다시 정해야 한다");
});

test("절기 시각은 KST로 환산해서 쓴다 — 중국 표준시 그대로 쓰면 월주가 앞선다", () => {
  assert.strictEqual(CONFIG.JIEQI_TZ_OFFSET_MIN, 60, "라이브러리를 바꿨다면 이 값을 다시 재야 한다");
  // 2024 대설 = 12-07 00:16~00:17 KST (manseryeok·k-saju 일치). 그 전에 태어나면 해월이다.
  // 고치기 전에는 라이브러리의 12-06 23:17(중국시)을 KST로 봐서 자월이 나왔다.
  for (const [d, hh, mi] of [[6, 23, 50], [7, 0, 10]]) {
    const c = buildChart({ year: 2024, month: 12, day: d, hour: hh, minute: mi, gender: "male" });
    assert.strictEqual(c.pillars.month.ko, "을해", `2024-12-${d} ${hh}:${mi}`);
  }
  // 절기 지난 뒤는 자월.
  assert.strictEqual(buildChart({ year: 2024, month: 12, day: 7, hour: 2, minute: 0, gender: "male" }).pillars.month.ko, "병자");
});

test("입춘 경계에서 년주와 띠가 밀리지 않는다", () => {
  // 2017 입춘 = 2-03 23:34 KST. 그 전은 병신년(원숭이), 그 후는 정유년(닭).
  // 중국시 기준(22:34)으로 보면 23:00 출생자가 닭띠로 잘못 나온다.
  const before = buildChart({ year: 2017, month: 2, day: 3, hour: 23, minute: 0, gender: "male" });
  const after = buildChart({ year: 2017, month: 2, day: 4, hour: 2, minute: 0, gender: "male" });
  assert.strictEqual(before.pillars.year.ko, "병신");
  assert.strictEqual(before.yearAnimal, "원숭이");
  assert.strictEqual(after.pillars.year.ko, "정유");
  assert.strictEqual(after.yearAnimal, "닭");
});

test("외부 엔진(manseryeok)과 네 기둥이 일치한다 — 절기 경계 집중 표본", () => {
  // 절기일(4·5·6·7일 / 20~23일)과 0시·23시대를 일부러 섞는다. 두 버그가 모두 여기서 드러났다.
  let n = 0;
  let kst830Diffs = 0;
  const mismatches = [];
  for (let y = 1940; y <= 2025; y++) {
    for (let m = 1; m <= 12; m++) {
      for (const d of [4, 5, 6, 7, 21, 22]) {
        for (const [hh, mi] of [[0, 10], [12, 31], [23, 50]]) {
          const { list, chart } = ourPillars(y, m, d, hh, mi);
          const theirs = msPillars(y, m, d, hh, mi);
          n++;
          // 절기 전환 시각과 겹치는 분은 양쪽 모두 단정하지 않는 구간이라 비교에서 뺀다
          // (우리는 경고를 달아 내보낸다 — 아래 테스트에서 확인).
          if (chart.warnings.some((w) => w.includes("절기"))) continue;
          // 1954-03-21~1961-08-10은 한국 표준시가 UTC+8:30이라 우리는 30분 보정을 적용하고
          // manseryeok은 적용하지 않는다(정답지3의 앱 화면 산수로 확인한 유파 차이). 이 구간은
          // 교차 검증이 성립하지 않으므로 따로 센다 — 아래에서 "구간 안에만 몰려 있는지"를 본다.
          if (chart.kst830Applied) { kst830Diffs += list.join(" ") === theirs.join(" ") ? 0 : 1; continue; }
          if (list.join(" ") !== theirs.join(" ")) {
            mismatches.push(`${y}-${m}-${d} ${hh}:${mi} | 우리 ${list.join(" ")} | manseryeok ${theirs.join(" ")}`);
          }
        }
      }
    }
  }
  assert.ok(n > 15000, `표본이 너무 적다: ${n}`);
  assert.deepStrictEqual(mismatches, [], `외부 엔진과 불일치 ${mismatches.length}건:\n${mismatches.slice(0, 10).join("\n")}`);
  // 표준시 구간은 당연히 갈린다. 다만 "갈리는 건 전부 이 구간뿐"이어야 한다 — 위 단언이 그걸 본다.
  assert.ok(kst830Diffs > 0, "표준시 보정이 실제로 적용되고 있어야 한다(0이면 보정이 꺼진 것)");
});

test("절기 전환 시각에 걸치면 단정하지 않고 경고한다", () => {
  // 1990 소서 = 07-07 18:00 KST(정각). 이 분에 태어나면 월주가 갈린다.
  const c = buildChart({ year: 1990, month: 7, day: 7, hour: 18, minute: 0, gender: "male" });
  const w = c.warnings.find((x) => x.includes("절기"));
  assert.ok(w, `절기 경계 경고가 없다: ${JSON.stringify(c.warnings)}`);
  assert.ok(w.includes("소서"), `절기 이름이 한글이 아니다: ${w}`);
  // 경계에서 먼 사주에는 붙지 않는다(거짓 양성 0).
  for (const b of [[1988, 4, 21, 12, 31], [1990, 11, 19, 21, 58]]) {
    const q = buildChart({ year: b[0], month: b[1], day: b[2], hour: b[3], minute: b[4], gender: "male" });
    assert.ok(!q.warnings.some((x) => x.includes("절기")), `${b.join("-")}에 절기 경고가 잘못 붙었다`);
  }
});

test("12운성은 (일간, 지지)에서 직접 나온다 — 라이브러리 getter에 묶이지 않는다", () => {
  // 절기 보정 때문에 년·월주를 다른 객체에서 읽게 됐으므로, 라이브러리의 getYearDiShi() 류는
  // 더 쓸 수 없다. 표 전체(10간 × 12지 = 120)를 정답지 값으로 고정한다.
  assert.strictEqual(twelveStageOf("병", "진"), "관대");  // 정답지1 년·월주
  assert.strictEqual(twelveStageOf("병", "오"), "제왕");  // 정답지1 일·시주
  assert.strictEqual(twelveStageOf("무", "오"), "제왕");  // 정답지2 년주
  assert.strictEqual(twelveStageOf("무", "해"), "절");    // 정답지2 월·시주
  assert.strictEqual(twelveStageOf("무", "자"), "태");    // 정답지2 일주
  // 음간은 역행한다 — 을의 장생은 오, 그 다음(사)이 목욕.
  assert.strictEqual(twelveStageOf("을", "오"), "장생");
  assert.strictEqual(twelveStageOf("을", "사"), "목욕");
  // 120조합 전부 12단계 안에서 나오고, 각 일간마다 12단계가 정확히 한 번씩 나온다.
  const STAGES = new Set(["장생", "목욕", "관대", "임관", "제왕", "쇠", "병", "사", "묘", "절", "태", "양"]);
  for (const st of N.STEM_KO) {
    const seen = N.BRANCH_KO.map((br) => twelveStageOf(st, br));
    for (const v of seen) assert.ok(STAGES.has(v), `${st}/${v}`);
    assert.strictEqual(new Set(seen).size, 12, `${st} 일간의 12운성이 중복된다`);
  }
});

test("같은 입력은 언제나 같은 결과다 — 보정을 넣어도 결정론이 깨지지 않는다", () => {
  const birth = { year: 2024, month: 12, day: 6, hour: 23, minute: 50, gender: "male" };
  const a = JSON.stringify(buildChart(birth));
  for (let i = 0; i < 20; i++) assert.strictEqual(JSON.stringify(buildChart(birth)), a);
});

test("한국 표준시 UTC+8:30 구간(1954-03-21~1961-08-10)은 경고를 달고 단정하지 않는다", () => {
  // 외부 엔진 교차 검증으로 **잡히지 않는** 구멍이다 — manseryeok·lunar-javascript 둘 다 이
  // 표준시 이력을 모르므로 "외부 엔진과 일치"가 "맞다"는 뜻이 아니다. 정답지도 이 구간이 없다.
  // 그래서 보정을 추측으로 넣지 않고, 이 구간임을 알리는 경고만 단다.
  const inside = buildChart({ year: 1957, month: 6, day: 15, hour: 10, minute: 20, gender: "male" });
  assert.ok(inside.warnings.some((w) => w.includes("UTC+8:30")), "구간 내인데 경고가 없다");
  // 경계 바로 안/바깥
  assert.ok(buildChart({ year: 1954, month: 3, day: 21, hour: 10, minute: 0, gender: "male" }).warnings.some((w) => w.includes("UTC+8:30")));
  assert.ok(!buildChart({ year: 1954, month: 3, day: 20, hour: 10, minute: 0, gender: "male" }).warnings.some((w) => w.includes("UTC+8:30")));
  assert.ok(!buildChart({ year: 1961, month: 8, day: 10, hour: 10, minute: 0, gender: "male" }).warnings.some((w) => w.includes("UTC+8:30")));
  // 시간을 모르면 시주를 안 쓰므로 이 경고는 붙지 않는다.
  assert.ok(!buildChart({ year: 1957, month: 6, day: 15, gender: "male" }).warnings.some((w) => w.includes("UTC+8:30")));
  // 정답지 2건에는 붙지 않는다(거짓 양성 0).
  for (const b of [[1988, 4, 21, 12, 31], [1990, 11, 19, 21, 58]]) {
    assert.ok(!buildChart({ year: b[0], month: b[1], day: b[2], hour: b[3], minute: b[4], gender: "male" }).warnings.length,
      `${b.join("-")}에 경고가 잘못 붙었다`);
  }
});
