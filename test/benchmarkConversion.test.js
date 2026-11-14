// 2026-11-12 벤치마크 실측 반영 회귀 테스트.
//
// 배경: 유료전환이 0이던 원인을 추적한 결과, 글(조회)은 경쟁사와 대등한데 **글 다음**이
// 끊겨 있었다. 우리 글 150건/일이 전부 "프로필에서 상담 신청하세요"로 끝나는데 그 프로필에
// 상품이 한 줄도 없었다. 벤치마크 상위 채널(@taebaek_saju 6.3만, @ihwa_saju, @saju.damda,
// @saju.han.jan)은 예외 없이 ① CTA에서 받는 것을 말하고 ② 시점을 간지로 못박고
// ③ "무엇이 갈림길인지"를 이름으로 지목한다.
//
// 이 테스트가 지키는 것:
//  1) CTA에 가격이 절대 들어가지 않는다 (사용자 지시 - 가격을 공개하면 판매 페이지로 올 이유가 사라진다)
//  2) CTA가 받는 것(감정서/구성/후기)을 말한다
//  3) 갈림길 훅(forkPath)이 살아 있고 공식 훅 목록에 포함돼 있다
//  4) "이번 달 간지" 검사가 틀린 월을 잡고, 멀쩡한 글은 절대 잡지 않는다

const test = require("node:test");
const assert = require("node:assert");

const { CTA_POOL, CTA_POOL_BANMAL, COMMENT_CTA_POOL, HOOK_FORMATS, HIT_FORMULA_HOOK_IDS } =
  require("../server/skills/taebaekSajuDraftWriter");
const { checkSajuClaims } = require("../server/lib/sajuClaimChecker");

test("CTA에 가격을 절대 쓰지 않는다", () => {
  const priced = [...CTA_POOL, ...CTA_POOL_BANMAL, ...COMMENT_CTA_POOL].filter((c) =>
    /[0-9]{1,3},[0-9]{3}\s*원|[0-9]+\s*만\s*원|[0-9]{4,}\s*원/.test(c));
  assert.deepStrictEqual(priced, [],
    `가격이 들어간 CTA가 있습니다: ${priced.join(" / ")}`);
});

test("CTA는 '무엇을 받는지'를 말한다 - 전환이 끊기던 지점", () => {
  const vague = [...CTA_POOL, ...CTA_POOL_BANMAL].filter((c) => !/감정서|구성|후기|환불|페이지|풀어/.test(c));
  assert.deepStrictEqual(vague, [],
    `상품을 말하지 않는 CTA가 있습니다: ${vague.join(" / ")}`);
  // 프로필로 보내는 경로 자체는 유지돼야 한다
  for (const c of [...CTA_POOL, ...CTA_POOL_BANMAL]) assert.match(c, /프로필/);
  // 반말 계정은 마지막 줄까지 반말이어야 톤이 안 튄다
  for (const c of CTA_POOL_BANMAL) assert.ok(!/습니다|하세요|해드립니다/.test(c), c);
});

test("'무료'는 어떤 CTA에도 들어가지 않는다 (사용자 지시)", () => {
  for (const c of [...CTA_POOL, ...CTA_POOL_BANMAL, ...COMMENT_CTA_POOL]) assert.ok(!c.includes("무료"), c);
});

test("갈림길 훅(forkPath)이 살아 있고 공식 훅에 포함된다", () => {
  const fork = HOOK_FORMATS.find((h) => h.id === "forkPath");
  assert.ok(fork, "forkPath 훅이 사라졌습니다");
  // 이 훅의 전부는 마지막 줄("무엇이 가르는지 이름으로 지목")이다. 지시문에서 빠지면 의미가 없다.
  assert.match(fork.instruction, /가릅니다|가른다|지목/);
  assert.ok(HIT_FORMULA_HOOK_IDS.includes("forkPath"));
  // 골격 과용 방지: 공식 훅이 10개 아래로 줄면 조합이 다시 뭉친다(10/30 노출 하락 원인)
  assert.ok(HIT_FORMULA_HOOK_IDS.length >= 11, `공식 훅 ${HIT_FORMULA_HOOK_IDS.length}개`);
});

// ── 이번 달 간지 검사 ───────────────────────────────────────────────
// 2026-11-16은 병오년 · 기해월 · 갑오일이다.
const DK = "2026-11-16";
const hasMonthIssue = (t) =>
  checkSajuClaims(t, { dateKey: DK }).some((r) => r.kind === "이번 달 간지");

test("이번 달을 틀린 간지로 단정하면 잡는다", () => {
  assert.ok(hasMonthIssue("지금은 경자월입니다. 갑목 일간은 이 달이 다릅니다."));
  assert.ok(hasMonthIssue("이번 달 무술월에는 결정을 미루세요."));
  assert.ok(hasMonthIssue("현재 정유월이라 금 기운이 강합니다."));
});

test("맞는 간지는 통과한다", () => {
  assert.ok(!hasMonthIssue("지금은 기해월입니다. 갑목 일간은 이 달이 다릅니다."));
  assert.ok(!hasMonthIssue("이번 달 기해월에는 물 기운이 강해집니다."));
});

test("거짓 양성 0 - 원국 얘기와 다음 달 얘기는 건드리지 않는다", () => {
  // 월주/월생은 독자의 원국 얘기지 '이번 달'이 아니다
  assert.ok(!hasMonthIssue("기해월생인 사람은 다릅니다. 지금 흐름을 보세요."));
  assert.ok(!hasMonthIssue("월주가 경자인 사람은 지금 다르게 느낍니다."));
  // '다음 달' 소속 간지를 '이번 달' 것으로 오인하지 않는다
  assert.ok(!hasMonthIssue("이번 달은 기해월이고 다음 달은 경자월로 넘어갑니다."));
  // 기준 날짜가 없으면 판정하지 않는다(애매하면 통과 - 검사기 제1원칙)
  assert.strictEqual(
    checkSajuClaims("지금은 경자월입니다.", {}).some((r) => r.kind === "이번 달 간지"), false);
});
