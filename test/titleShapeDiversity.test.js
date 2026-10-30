// 2026-10-30: "제목 골격 과용"이 노출 하락의 원인으로 실측된 뒤 붙인 회귀 테스트.
//
// 배경: fill-schedule.js가 공식 적용 글(전체의 80%)에 topicId/hookFormatId를 넘기지 않아서
// 엔진의 pickRandom(복원 추출)이 5소재×5훅 안에서 같은 조합을 반복해 뽑았다. 그 결과
// "<이 세 띠, OO살 TOP 3다>" 한 골격이 9월 초 2~4% → 10월 계정별 20~38%까지 올라갔고,
// 같은 기간 3,000회+ 터진 글 비율이 11% → 3%로 무너졌다.
//
// 여기서 지키는 것 두 가지:
//  (1) 셔플백은 한 바퀴 안에 같은 값을 두 번 주지 않는다 → 조합이 뭉치지 않는다
//  (2) 순위형 훅이 아니면 순위 제목을 거부한다 → 골격 하나가 과반을 먹지 못한다

const test = require("node:test");
const assert = require("node:assert");
const {
  HOOK_FORMATS,
  HIT_FORMULA_HOOK_IDS,
  HIT_FORMULA_TOPIC_IDS,
  pickTopicIds,
  pickHookFormatIds,
  findOverusedTitleShape,
} = require("../server/skills/taebaekSajuDraftWriter");

test("공식 훅 목록이 좁혀진 상태로 되돌아가지 않는다", () => {
  // 5개로 되돌리면 제목 골격이 다시 한 가지로 수렴한다.
  assert.ok(
    HIT_FORMULA_HOOK_IDS.length >= 10,
    `공식 훅이 ${HIT_FORMULA_HOOK_IDS.length}개뿐이다 - 10개 이상 유지할 것`
  );
  const known = new Set(HOOK_FORMATS.map((h) => h.id));
  for (const id of HIT_FORMULA_HOOK_IDS) {
    assert.ok(known.has(id), `알 수 없는 훅 id: ${id}`);
  }
  // themeGroup은 소재를 묶어서 띠+연도 지목이 흐려지므로 공식에 들어가면 안 된다.
  assert.ok(!HIT_FORMULA_HOOK_IDS.includes("themeGroup"));
});

test("셔플백은 한 바퀴 안에 같은 훅을 두 번 주지 않는다(= 뭉치지 않는다)", () => {
  const n = HIT_FORMULA_HOOK_IDS.length;
  const picked = pickHookFormatIds(n, HIT_FORMULA_HOOK_IDS);
  assert.strictEqual(picked.length, n);
  assert.strictEqual(new Set(picked).size, n, `한 바퀴(${n}개)에 중복이 생겼다: ${picked.join(",")}`);
});

test("공식 소재는 한 바퀴(3배 가중치 포함)에서 정확히 고르게 나온다", () => {
  // 소재 쪽 셔플백은 id를 3장씩 넣는다 - 저조 소재(재성/관성)만 1장 넣어 1/3 빈도로 쓰려고
  // 만든 가중치다. 그래서 "n개 뽑으면 전부 다르다"가 아니라 "3n개 뽑으면 각 3번"이 보장이다.
  const n = HIT_FORMULA_TOPIC_IDS.length;
  const picked = pickTopicIds(n * 3, HIT_FORMULA_TOPIC_IDS);
  const count = {};
  for (const id of picked) count[id] = (count[id] || 0) + 1;
  assert.deepStrictEqual(
    Object.fromEntries(HIT_FORMULA_TOPIC_IDS.map((id) => [id, 3])),
    count,
    `공식 소재 한 바퀴가 고르지 않다: ${JSON.stringify(count)}`
  );
});

test("25건을 뽑아도 어느 공식 소재도 전체의 30%를 넘지 않는다", () => {
  const picked = pickTopicIds(25, HIT_FORMULA_TOPIC_IDS);
  const count = {};
  for (const id of picked) count[id] = (count[id] || 0) + 1;
  const worst = Math.max(...Object.values(count));
  assert.ok(worst / 25 <= 0.3, `한 소재가 ${worst}/25건(${Math.round((worst / 25) * 100)}%)을 먹었다`);
});

test("25건을 뽑아도 어느 훅도 전체의 25%를 넘지 않는다", () => {
  // 하루 5건 × 5일 = 실제 한 번 채우는 분량.
  const picked = pickHookFormatIds(25, HIT_FORMULA_HOOK_IDS);
  const count = {};
  for (const id of picked) count[id] = (count[id] || 0) + 1;
  const worst = Math.max(...Object.values(count));
  assert.ok(worst / 25 <= 0.25, `한 훅이 ${worst}/25건(${Math.round((worst / 25) * 100)}%)을 먹었다`);
});

test("순위형이 아닌 훅에서 순위 제목은 거부된다", () => {
  const bad = "<이 세 띠, 도화살 TOP 3다>\n\n원숭이띠(2004·1992·1980)";
  assert.ok(findOverusedTitleShape(bad, "birthYear"), "TOP 3 제목을 잡아야 한다");
  assert.ok(findOverusedTitleShape("<역마살 1위 띠>", "apology"));
  assert.ok(findOverusedTitleShape("<삼재 순위로 보는 세 띠>", "list"));
});

test("순위형 훅에서는 순위 제목을 허용한다", () => {
  const ok = "<이 세 띠, 도화살 TOP 3다>\n\n원숭이띠(2004·1992·1980)";
  assert.strictEqual(findOverusedTitleShape(ok, "topRank"), null);
});

test("순위 표기가 없는 제목은 어느 훅에서도 통과한다(거짓 양성 0)", () => {
  for (const hook of HIT_FORMULA_HOOK_IDS) {
    assert.strictEqual(
      findOverusedTitleShape("<죄송하지만, 이 띠는 올해 연애가 조용합니다>", hook),
      null,
      `훅 ${hook}에서 멀쩡한 제목을 잡았다`
    );
  }
  // 본문에 "1위"가 있어도 제목이 아니면 통과한다.
  assert.strictEqual(
    findOverusedTitleShape("<역마살이 앉은 자리>\n\n우리 채널 1위 글이기도 했습니다", "list"),
    null
  );
});
