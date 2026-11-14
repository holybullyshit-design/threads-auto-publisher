const test = require("node:test");
const assert = require("node:assert/strict");
const { calculateCalendar, parseDateKey } = require("../server/lib/fortuneEngine");

// 2026-11-14: Instagram "오늘의 띠별 운세" 생성 기능을 삭제하면서 그 테스트도 같이 뺐다.
// 남은 calculateCalendar는 sajuFacts.js가 쓰는 만세력 입력이라 여기서 계속 지킨다.

test("공개 검증 기준일의 사주 월주·일주가 일치한다", () => {
  assert.deepEqual(calculateCalendar("1986-05-29"), { year: "丙寅", month: "癸巳", day: "癸酉", dayStem: 9, dayBranch: 9, korean: "병인년 · 계사월 · 계유일" });
});

test("sajuFacts가 기대하는 한자 간지와 색인을 돌려준다", () => {
  const cal = calculateCalendar("2026-08-26");
  assert.equal(cal.korean, "병오년 · 병신월 · 임신일");
  assert.equal(cal.year, "丙午");
  assert.ok(cal.dayStem >= 0 && cal.dayBranch >= 0, "간지 색인이 -1이면 사실 블록에 undefined가 샌다");
});

test("잘못된 날짜는 막는다", () => {
  assert.throws(() => parseDateKey("2026-02-30"), /존재하지 않는/);
  assert.throws(() => parseDateKey("20260826"), /YYYY-MM-DD/);
});
