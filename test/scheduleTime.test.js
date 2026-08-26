const test = require("node:test");
const assert = require("node:assert/strict");
const { kstDateAndTimeToUtc } = require("../server/lib/scheduleStore");

test("2026-08-26 06:00 KST를 2026-08-25 21:00 UTC로 오차 없이 변환한다", () => {
  assert.equal(kstDateAndTimeToUtc("2026-08-26", "06:00").toISOString(), "2026-08-25T21:00:00.000Z");
});
