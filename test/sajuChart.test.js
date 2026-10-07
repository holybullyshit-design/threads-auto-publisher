// 사주 엔진 1단계(원국 계산) 테스트.
//
// 사용자 지시(2026-10-07): "가장 많이 하는 명리학으로, 모든 사주풀이 답변이 일치하게."
// 그래서 이 테스트가 지키는 건 두 가지다:
//   ① 결정론 — 같은 입력이면 항상 똑같은 출력(유파 선택이 config.js에 고정되어 있을 때).
//   ② 판별표 무결성 — 지장간·십성·절기 경계가 한국 실무 주류 표와 같다.
//
// 만세력(네 기둥 간지) 자체는 lunar-javascript가 계산하고, 입춘·절기 경계는 실측 검증했다.
// 지장간은 라이브러리 표가 한국 주류와 5개 지지에서 달라 **우리 표를 쓴다**(elements.js 주석).

const test = require("node:test");
const assert = require("node:assert");
const { Solar } = require("lunar-javascript");
const { buildChart } = require("../server/lib/saju/chart");
const E = require("../server/lib/saju/elements");
const N = require("../server/lib/saju/naming");

const SAMPLE = { year: 1990, month: 5, day: 15, hour: 14, minute: 30, gender: "male" };

test("같은 입력은 항상 같은 원국을 낸다(결정론)", () => {
  const a = buildChart(SAMPLE);
  const b = buildChart(SAMPLE);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
  // 여러 번 돌려도 요약 문자열이 흔들리지 않아야 한다.
  const seen = new Set();
  for (let i = 0; i < 20; i++) seen.add(buildChart(SAMPLE).summary);
  assert.strictEqual(seen.size, 1, `원국이 호출마다 달라진다: ${[...seen].join(" / ")}`);
});

test("입춘·절기 경계에서 년주·월주가 바뀐다(1월 1일이 아니다)", () => {
  // 2026 입춘 = 2/4. 2/3은 아직 전년(을사년)이다.
  assert.strictEqual(buildChart({ year: 2026, month: 2, day: 3, hour: 12, gender: "male" }).pillars.year.ko, "을사");
  assert.strictEqual(buildChart({ year: 2026, month: 2, day: 4, hour: 12, gender: "male" }).pillars.year.ko, "병오");
  // 2026 경칩 = 3/6. 그 전은 인월, 그 뒤는 묘월.
  assert.strictEqual(buildChart({ year: 2026, month: 3, day: 5, hour: 12, gender: "male" }).pillars.month.branch, "인");
  assert.strictEqual(buildChart({ year: 2026, month: 3, day: 6, hour: 12, gender: "male" }).pillars.month.branch, "묘");
  // 1월 1일을 새해로 보는 실수 방지: 2026-01-15는 아직 을사년이어야 한다.
  assert.strictEqual(buildChart({ year: 2026, month: 1, day: 15, hour: 12, gender: "male" }).pillars.year.ko, "을사");
});

test("일주는 하루에 정확히 한 칸씩 60갑자를 돈다", () => {
  let prev = null;
  for (let d = 1; d <= 70; d++) {
    const s = Solar.fromYmd(2026, 1, 1).next(d);
    const c = buildChart({ year: s.getYear(), month: s.getMonth(), day: s.getDay(), hour: 12, gender: "male" });
    const idx = c.pillars.day.stemIndex + 10 * 0; // 60갑자 번호로 환산
    const no = (() => {
      // 간지 번호: 천간 i, 지지 j → 0~59 중 유일한 값
      for (let k = 0; k < 60; k++) if (k % 10 === c.pillars.day.stemIndex && k % 12 === c.pillars.day.branchIndex) return k;
      throw new Error("간지 조합이 60갑자에 없습니다(천간·지지 음양 불일치)");
    })();
    void idx;
    if (prev !== null) assert.strictEqual(no, (prev + 1) % 60, `일주가 1칸씩 가지 않는다: ${c.solarDate}`);
    prev = no;
  }
});

test("음력 입력이 양력으로 정확히 환산된다", () => {
  const c = buildChart({ year: 1990, month: 4, day: 21, hour: 14, minute: 30, gender: "male", calendar: "lunar" });
  assert.strictEqual(c.solarDate, "1990-05-15");
  // 같은 날을 양력으로 넣은 것과 원국이 같아야 한다.
  assert.strictEqual(c.summary, buildChart(SAMPLE).summary);
});

test("지장간표가 한국 실무 주류 표와 같다", () => {
  const BRANCHES = ["자", "축", "인", "묘", "진", "사", "오", "미", "신", "유", "술", "해"];
  const EXPECT = {
    자: ["임", "계"], 축: ["계", "신", "기"], 인: ["무", "병", "갑"], 묘: ["갑", "을"],
    진: ["을", "계", "무"], 사: ["무", "경", "병"], 오: ["병", "기", "정"], 미: ["정", "을", "기"],
    신: ["무", "임", "경"], 유: ["경", "신"], 술: ["신", "정", "무"], 해: ["무", "갑", "임"],
  };
  for (const b of BRANCHES) {
    const got = E.hiddenStemsOf(b);
    assert.deepStrictEqual(got.map((h) => h.stem), EXPECT[b], `${b}의 지장간이 다르다`);
    // 본기는 항상 마지막이고, 그 오행은 지지 자신의 오행과 같아야 한다.
    const primary = got[got.length - 1];
    assert.strictEqual(primary.role, "본기");
    assert.strictEqual(primary.element, N.BRANCH_ELEMENT[N.branchIndex(b)], `${b}의 본기 오행이 지지 오행과 다르다`);
    assert.ok(got.length === 2 || got.length === 3, `${b}의 지장간 개수가 2~3이 아니다`);
  }
});

test("십성 도출이 표준 규칙과 라이브러리 양쪽에 맞는다", () => {
  // 규칙: 같은 오행이면 음양 같을 때 비견 / 내가 생하면 식신·상관 / 내가 극하면 편재·정재 /
  //       나를 극하면 편관·정관 / 나를 생하면 편인·정인 (음양 같으면 편, 다르면 정)
  assert.strictEqual(E.tenGodOf("갑", "갑"), "비견");
  assert.strictEqual(E.tenGodOf("갑", "을"), "겁재");
  assert.strictEqual(E.tenGodOf("갑", "병"), "식신"); // 목생화, 양-양
  assert.strictEqual(E.tenGodOf("갑", "정"), "상관");
  assert.strictEqual(E.tenGodOf("갑", "무"), "편재"); // 목극토, 양-양
  assert.strictEqual(E.tenGodOf("갑", "기"), "정재");
  assert.strictEqual(E.tenGodOf("갑", "경"), "편관"); // 금극목, 양-양
  assert.strictEqual(E.tenGodOf("갑", "신"), "정관");
  assert.strictEqual(E.tenGodOf("갑", "임"), "편인"); // 수생목, 양-양
  assert.strictEqual(E.tenGodOf("갑", "계"), "정인");

  // 라이브러리의 천간 십성과 전수 교차검증(지장간표 차이와 무관한 영역).
  let n = 0;
  for (let y = 1950; y <= 2030; y += 3) {
    for (let m = 1; m <= 12; m += 3) {
      const ec = Solar.fromYmdHms(y, m, 15, 14, 0, 0).getLunar().getEightChar();
      const day = N.parseGanji(ec.getDay()).stem;
      for (const [g, lib] of [[ec.getYear(), ec.getYearShiShenGan()], [ec.getMonth(), ec.getMonthShiShenGan()], [ec.getTime(), ec.getTimeShiShenGan()]]) {
        assert.strictEqual(E.tenGodOf(day, N.parseGanji(g).stem), N.tenGod(lib), `${day} vs ${g}`);
        n++;
      }
    }
  }
  assert.ok(n > 300, `교차검증 건수가 너무 적다: ${n}`);
});

test("태어난 시간을 모르면 시주를 만들지 않는다", () => {
  const c = buildChart({ year: 1990, month: 5, day: 15, gender: "female" });
  assert.deepStrictEqual(c.pillarOrder, ["year", "month", "day"]);
  assert.strictEqual(c.pillars.time, undefined);
  assert.strictEqual(c.timeUnknown, true);
  assert.match(c.warnings.join(" "), /시간을 모르는/);
  // 시간을 모를 때 임의의 시주를 끼워 넣으면 안 된다(제일 위험한 실수).
  assert.strictEqual(c.summary.split(" ").length, 3);
});

test("진태양시 경고는 시지가 실제로 바뀔 때만 뜬다", () => {
  const warned = (h, mi) => buildChart({ year: 1990, month: 5, day: 15, hour: h, minute: mi, gender: "male" }).warnings.some((w) => /진태양시/.test(w));
  // 보정은 시각을 앞으로 당기므로, 경계 "직후"에 태어난 경우만 시지가 바뀐다.
  assert.strictEqual(warned(15, 10), true, "15:10(신시 직후)은 보정 시 미시가 되므로 경고해야 한다");
  assert.strictEqual(warned(23, 30), true, "23:30(자시 직후)은 보정 시 해시가 되므로 경고해야 한다");
  // 경계 "직전"은 바뀌지 않으므로 경고하면 오작동이다(처음 구현이 여기서 틀렸다).
  assert.strictEqual(warned(14, 30), false, "14:30은 보정해도 미시 그대로다");
  assert.strictEqual(warned(0, 30), false, "00:30은 보정해도 자시 그대로다");
});

test("성별을 안 주면 거부한다(대운 순역이 갈리므로)", () => {
  assert.throws(() => buildChart({ year: 1990, month: 5, day: 15, hour: 14 }), /성별/);
});

test("한글 매핑에 없는 값은 조용히 넘기지 않고 실패한다", () => {
  assert.throws(() => N.tenGod("없는값"), /매핑에 없는/);
  assert.throws(() => N.twelveStage("없는값"), /매핑에 없는/);
  assert.throws(() => N.nayin("없는값"), /매핑에 없는/);
  assert.throws(() => N.parseGanji("XX"), /천간|지지|간지/);
});
