// 2026-10-06 사고 회귀 테스트: 삼재 글이 "몇 년도인지"를 지어내서 틀린 글이 발행됐다.
// 원숭이·쥐·용띠(신자진) 삼재는 인묘진년 = 2022~2024에 이미 끝났는데 "내년 삼재 명단에
// 올라가 있습니다"로 발행돼, 답글 28건 중 24건이 틀렸다는 지적이었다(명리를 아는 독자가
// 정답까지 적었다: "인오술 3재가 28년이지요 내년은 해묘미 날삼재고").
// 판별표(삼합 생지와 충하는 방합)는 원래 맞았고, 빠져 있던 건 "그 방합이 서력 몇 년이냐"다.

const test = require("node:test");
const assert = require("node:assert");
const { getSamjaeInfo } = require("../server/lib/sajuFacts");

// 지지 인덱스: 자=0 … 해=11. 각 삼합의 대표 지지 하나로 조회한다.
const SHIN = 8; // 신자진(원숭이·쥐·용)
const SA = 5; // 사유축(뱀·닭·소)
const IN = 2; // 인오술(호랑이·말·개)
const HAE = 11; // 해묘미(돼지·토끼·양)

test("삼합 → 삼재 방합 매핑은 정통 판별표(삼합 생지와 충) 그대로다", () => {
  assert.match(getSamjaeInfo(SHIN, "2026-10-06").samjaeBanghap.name, /인묘진/);
  assert.match(getSamjaeInfo(SA, "2026-10-06").samjaeBanghap.name, /해자축/);
  assert.match(getSamjaeInfo(IN, "2026-10-06").samjaeBanghap.name, /신유술/);
  assert.match(getSamjaeInfo(HAE, "2026-10-06").samjaeBanghap.name, /사오미/);
});

test("2026년(병오년) 기준, 삼재 3년의 실제 서력이 정확하다", () => {
  // 2026년에 삼재를 지나는 건 해묘미(돼지·토끼·양)뿐이고, 둘째 해(눌삼재)다.
  const hae = getSamjaeInfo(HAE, "2026-10-06");
  assert.strictEqual(hae.status, "current");
  assert.strictEqual(hae.startYear, 2025);
  assert.strictEqual(hae.endYear, 2027);
  assert.strictEqual(hae.nthYear, 2);

  // 나머지 셋은 전부 미래 - "올해/내년"이 아니다.
  const cases = [
    [IN, 2028, 2030, 2, 2018],
    [SA, 2031, 2033, 5, 2021],
    [SHIN, 2034, 2036, 8, 2024], // 직전 삼재가 2024년에 끝난 게 이번 사고의 핵심
  ];
  for (const [branch, start, end, away, prevEnd] of cases) {
    const info = getSamjaeInfo(branch, "2026-10-06");
    assert.strictEqual(info.status, "future");
    assert.strictEqual(info.startYear, start);
    assert.strictEqual(info.endYear, end);
    assert.strictEqual(info.yearsUntilStart, away);
    assert.strictEqual(info.prevEndYear, prevEnd);
    assert.strictEqual(info.nthYear, null);
  }
});

test("기준일이 바뀌면 상태도 따라 바뀐다(구간 경계 검사)", () => {
  // 해묘미: 2027년은 마지막 해(날삼재), 2028년엔 끝나서 다음 주기(2037~)로 넘어간다.
  assert.strictEqual(getSamjaeInfo(HAE, "2027-06-01").nthYear, 3);
  const after = getSamjaeInfo(HAE, "2028-06-01");
  assert.strictEqual(after.status, "future");
  assert.strictEqual(after.startYear, 2037);
  assert.strictEqual(after.prevEndYear, 2027);

  // 신자진: 2024년엔 진행 중(마지막 해)이었다 - 그때 쓴 글은 맞는 글이었다.
  const during = getSamjaeInfo(SHIN, "2024-06-01");
  assert.strictEqual(during.status, "current");
  assert.strictEqual(during.nthYear, 3);
  assert.strictEqual(during.endYear, 2024);
});

test("삼재 사실 블록에 실제 연도와 '올해도 내년도 아니다'가 들어간다", () => {
  const { TOPICS } = require("../server/skills/taebaekSajuDraftWriter");
  const samjae = TOPICS.find((t) => t.id === "samjae");
  // 소재는 4개 삼합 중 무작위로 고르므로, 여러 번 돌려 네 경우 모두 확인한다.
  const seen = new Set();
  for (let i = 0; i < 80 && seen.size < 4; i++) {
    const block = samjae.build("2026-10-20");
    assert.match(block, /시기\(반드시 이대로\)/);
    if (block.includes("신자진")) {
      seen.add("신자진");
      assert.match(block, /2034년~2036년/);
      assert.match(block, /2024년에 이미 끝났/);
      assert.match(block, /올해도 내년도 아니다/);
    } else if (block.includes("해묘미")) {
      seen.add("해묘미");
      assert.match(block, /2025년에 시작해서 2027년에 끝난다/);
      assert.match(block, /눌삼재/);
    } else if (block.includes("인오술")) {
      seen.add("인오술");
      assert.match(block, /2028년~2030년/);
    } else if (block.includes("사유축")) {
      seen.add("사유축");
      assert.match(block, /2031년~2033년/);
    }
  }
  assert.strictEqual(seen.size, 4, `네 삼합 모두 확인되지 않음: ${[...seen].join(",")}`);
});
