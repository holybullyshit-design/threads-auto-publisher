// 댓글 답글 작성기 테스트 (4단계: 사주 엔진 ↔ 콘텐츠 연결).
//
// 이 도구의 목적은 "신뢰는 주고 결론은 주지 않는 답글"이다. 주간 조회 26만인데 유료 전환이
// 거의 없던 원인 중 하나가, 답글로 받는 풀이가 충분하게 느껴지면 거기서 끝난다는 것이었다.
// 그래서 계산된 포인트 하나만 짚고 나머지는 상담으로 넘긴다.
//
// AI 호출(runSkill)은 가짜로 바꿔 API 없이 돌린다 - 검증 대상은 "사실을 제대로 넘기는가,
// 틀린 생성물을 거부하는가"이지 AI의 글솜씨가 아니다.

const test = require("node:test");
const assert = require("node:assert");
const Module = require("node:module");

let fakeReply = "";
const origLoad = Module._load;
Module._load = function (request) {
  if (request.endsWith("claudeCliEngine")) return { runSkill: async () => fakeReply };
  return origLoad.apply(this, arguments);
};
delete require.cache[require.resolve("../server/skills/sajuReplyWriter")];
const { writeSajuReply, pickHighlight, TONES } = require("../server/skills/sajuReplyWriter");
Module._load = origLoad;

const S = require("../server/lib/saju");
const BIRTH = { year: 1990, month: 11, day: 19, hour: 21, minute: 58, gender: "female" };
const OK_TEXT = "일주에 도화살이 있어. 사람을 끄는 기운이야.\n\n근데 언제 어느 쪽으로 쓰이는지는 전체 원국과 대운을 같이 봐야 나와.\n프로필에서 상담 신청해줘.\n\n꼬인 실타래를 풀어볼게🧶";

test("짚을 포인트는 고정이다(같은 사주면 같은 답)", () => {
  const seen = new Set();
  for (let i = 0; i < 20; i++) seen.add(JSON.stringify(pickHighlight(S.analyze(BIRTH))));
  assert.strictEqual(seen.size, 1, "포인트가 호출마다 달라진다 - 같은 사람에게 매번 다른 답을 주면 안 된다");
  // 일지에 걸린 신살을 1순위로 고른다(배우자/자신 자리라 체감이 가장 크다).
  assert.strictEqual(pickHighlight(S.analyze(BIRTH)).where, "일주(나 자신·배우자 자리)");
});

test("정상 답글은 통과하고, 계산된 사실이 AI에게 넘어간다", async () => {
  fakeReply = OK_TEXT;
  const r = await writeSajuReply(BIRTH, { accountLabel: "연리지 실타래", refDate: "2026-10-07" });
  assert.strictEqual(r.text, OK_TEXT);
  assert.ok(r.facts.includes("원국: 경오 정해 무자 계해"), "사실 블록에 계산된 원국이 있어야 한다");
  assert.ok(r.facts.includes("신약"), "사실 블록에 신강약이 있어야 한다");
  assert.ok(/지어내지 말 것/.test(r.facts), "사실 블록에 '지어내지 말 것' 지시가 있어야 한다");
});

test('"무료"가 들어간 답글은 거부한다', async () => {
  fakeReply = OK_TEXT.replace("프로필에서", "무료로 더 봐줄게. 프로필에서");
  await assert.rejects(() => writeSajuReply(BIRTH, { accountLabel: "연리지 실타래" }), /무료/);
});

test("틀린 명리 주장이 들어가면 거부한다", async () => {
  // 진의 지장간은 을계무인데 병기정이라고 쓴 경우
  fakeReply = "진의 지장간은 병기정이야.\n전체 원국을 봐야 해. 프로필에서 상담 신청해줘.\n\n꼬인 실타래를 풀어볼게🧶";
  await assert.rejects(() => writeSajuReply(BIRTH, { accountLabel: "연리지 실타래" }), /명리 사실 검증 실패/);
});

test("계정 고유 클로징이 빠지면 거부한다", async () => {
  fakeReply = OK_TEXT.replace("\n\n꼬인 실타래를 풀어볼게🧶", "");
  await assert.rejects(() => writeSajuReply(BIRTH, { accountLabel: "연리지 실타래" }), /클로징/);
});

test("길이 제한을 넘기면 거부한다", async () => {
  fakeReply = "가".repeat(600) + "\n\n꼬인 실타래를 풀어볼게🧶";
  await assert.rejects(() => writeSajuReply(BIRTH, { accountLabel: "연리지 실타래" }), /제한 초과/);
});

test("말투를 모르는 계정은 거부한다", async () => {
  fakeReply = OK_TEXT;
  await assert.rejects(() => writeSajuReply(BIRTH, { accountLabel: "없는계정" }), /말투를 모르는/);
});

test("계정마다 어체와 클로징이 정해져 있다", () => {
  assert.strictEqual(TONES["연리지 실타래"].speech, "반말");
  assert.strictEqual(TONES["아해사주"].speech, "존댓말");
  assert.ok(TONES["아해사주"].closing.includes("기질"));
  for (const [label, t] of Object.entries(TONES)) {
    assert.ok(["반말", "존댓말"].includes(t.speech), `${label}의 어체가 이상하다`);
  }
});

test("시간을 모르면 신강약을 확정으로 말하지 않는다", () => {
  // 득시를 판정할 수 없어 신약 쪽으로 기운다 - 이걸 단정하면 틀린 말이 된다.
  const known = S.analyze({ year: 1988, month: 4, day: 21, hour: 12, minute: 31, gender: "male" });
  const unknown = S.analyze({ year: 1988, month: 4, day: 21, gender: "male" });
  assert.strictEqual(known.strength.verdictCaveat, null);
  assert.strictEqual(known.strength.verdictConfirmed, true);
  assert.ok(unknown.strength.verdictCaveat, "시간 모름이면 단서를 달아야 한다");
  assert.strictEqual(unknown.strength.verdictConfirmed, false);
  assert.match(unknown.strength.verdictCaveat, /확정이 아닙니다/);
});
