const test = require("node:test");
const assert = require("node:assert/strict");
const { calculateCalendar, generateFortunePackage, generateDateRange } = require("../server/lib/fortuneEngine");

test("공개 검증 기준일의 사주 월주·일주가 일치한다", () => {
  assert.deepEqual(calculateCalendar("1986-05-29"), { year: "丙寅", month: "癸巳", day: "癸酉", dayStem: 9, dayBranch: 9, korean: "병인년 · 계사월 · 계유일" });
});

test("시작일 2026-08-26의 7장·12띠·48개 생년 문구가 검수를 통과한다", () => {
  const pkg = generateFortunePackage("2026-08-26");
  assert.equal(pkg.calendar.korean, "병오년 · 병신월 · 임신일");
  assert.equal(pkg.slides.length, 7); assert.equal(pkg.readings.length, 12);
  assert.equal(pkg.readings.flatMap((reading) => reading.lines).length, 48);
  assert.equal(pkg.validation.status, "passed");
  assert.match(pkg.caption, /#팔자명가20260826/);
});

test("8월 26일부터 9월 30일까지 36일 전체가 중복 없이 통과한다", () => {
  const packages = generateDateRange("2026-08-26", "2026-09-30");
  assert.equal(packages.length, 36);
  assert.equal(new Set(packages.map((pkg) => pkg.contentHash)).size, 36);
  assert.ok(packages.every((pkg) => pkg.validation.status === "passed"));
});

test("시작일 이전과 잘못된 날짜는 생성을 차단한다", () => {
  assert.throws(() => generateFortunePackage("2026-08-25"), /시작일/);
  assert.throws(() => generateFortunePackage("2026-02-30"), /존재하지 않는/);
});
