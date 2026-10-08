// 사실 블록 증명기 — 글에 적는 판별법을 **실제 사주로 엔진이 집행**하는지 고정한다.
//
// 왜(2026-10-08, 사용자 지시): 그 전까지 글의 명리 근거는 판별표를 **문장으로 렌더링한 것**이었다.
// 표가 맞아도 그 표를 실제로 돌려본 적은 없었다. 삼재 사고가 정확히 그 틈이었다 — 삼합→방합
// 매핑은 맞았는데 "그래서 몇 년이냐"를 아무도 계산하지 않아 AI가 지어냈고, 댓글 28건 중 24건이
// 틀렸다는 지적이었다. 이제 사실 블록을 만들 때마다 엔진이 그 판별법을 집행한다.

const test = require("node:test");
const assert = require("node:assert");
const P = require("../server/lib/sajuFactProver");
const F = require("../server/lib/sajuFacts");
const N = require("../server/lib/saju/naming");
const { TOPICS } = require("../server/skills/taebaekSajuDraftWriter");

test("판별표 72개 조합을 전부 실제 원국으로 증명한다", () => {
  let n = 0;
  const failed = [];
  // 역마·도화·화개: 삼합 4그룹 × 3신살 × 그룹 멤버 3띠
  for (const seed of [2, 8, 5, 11]) {
    const roles = F.getSamhapRoles(seed);
    for (const [id, key] of [["yeokma", "역마"], ["dohwa", "도화"], ["hwagae", "화개"]]) {
      for (const b of roles.group.branches) {
        n++;
        try { P.proveSamhapSinsal(id, N.BRANCH_KO[b], N.BRANCH_KO[roles[key]]); }
        catch (e) { failed.push(e.message); }
      }
    }
  }
  // 일간 기준 신살
  for (const [id, table] of [["yangin", F.YANGIN_TABLE], ["hongyeom", F.HONGYEOM_TABLE], ["munchang", F.MUNCHANG_TABLE]]) {
    for (const [stem, bi] of Object.entries(table)) {
      if (bi === undefined || bi === null) continue;
      n++;
      try { P.proveDayStemSinsal(id, stem, N.BRANCH_KO[bi]); }
      catch (e) { failed.push(e.message); }
    }
  }
  // 일주 기준 신살
  for (const ilju of F.BAEKHO_ILJU) { n++; try { P.proveIljuSinsal("baekho", ilju); } catch (e) { failed.push(e.message); } }
  for (const ilju of F.GOEGANG_ILJU) { n++; try { P.proveIljuSinsal("goegang", ilju); } catch (e) { failed.push(e.message); } }

  assert.ok(n >= 70, `증명 시도가 너무 적다: ${n}`);
  assert.deepStrictEqual(failed, [], `증명 실패 ${failed.length}건:\n${failed.slice(0, 5).join("\n")}`);
});

test("틀린 판별법은 증명 단계에서 막힌다", () => {
  // 증명기가 통과만 시킨다면 아무 의미가 없다. 일부러 틀린 값을 넣어 차단되는지 본다.
  const WRONG = [
    ["역마를 틀린 자리로", () => P.proveSamhapSinsal("yeokma", "오", "유")],
    ["도화를 틀린 자리로", () => P.proveSamhapSinsal("dohwa", "자", "인")],
    ["양인을 음간에", () => P.proveDayStemSinsal("yangin", "을", "묘")],
    ["백호가 아닌 일주로", () => P.proveIljuSinsal("baekho", "갑자")],
    ["십성을 틀리게", () => P.proveTenGod("병", "수", "재성")],
  ];
  for (const [label, fn] of WRONG) {
    assert.throws(fn, /증명 실패/, `${label} - 틀린 값이 통과했다`);
  }
});

test("13개 소재 전부 사실 블록을 만들 수 있다(증명 포함)", () => {
  // build()는 소재마다 랜덤 분기가 있다(어느 삼합/어느 일간을 고를지). 여러 번 돌려
  // **모든 분기에서** 증명이 통과하는지 본다 - 한 분기라도 깨지면 그 글은 생성되지 않는다.
  assert.strictEqual(TOPICS.length, 13, "소재 뱅크가 13개가 아니다");
  for (const t of TOPICS) {
    for (let i = 0; i < 6; i++) {
      const out = t.build("2026-10-20");
      assert.ok(typeof out === "string" && out.length > 40, `${t.id} 블록이 비었다`);
    }
  }
});

test("신살 사실 블록에는 엔진이 계산한 실제 원국이 들어간다", () => {
  // "엔진 확인" 줄이 빠지면 다시 표만 렌더링하는 옛 방식으로 돌아간 것이다.
  const WITH_PROOF = ["yeokma", "dohwa", "hwagae", "yangin", "hongyeom", "munchang", "baekho", "goegang"];
  for (const id of WITH_PROOF) {
    const t = TOPICS.find((x) => x.id === id);
    assert.ok(t, `소재 ${id}가 없다`);
    const out = t.build("2026-10-20");
    assert.match(out, /엔진 확인\(실제 원국으로 계산함\)/, `${id}에 엔진 증명 줄이 없다`);
    // 증명에 쓰인 원국은 네 기둥이 적힌 실제 명식이어야 한다.
    assert.match(out, /\d{4}-\d{2}-\d{2} [가-힣]{2} [가-힣]{2} [가-힣]{2} [가-힣]{2}/, `${id}의 증명에 원국이 없다`);
  }
});

test("증명은 결정론적이다 — 같은 조건이면 늘 같은 원국이 나온다", () => {
  const a = P.proveSamhapSinsal("yeokma", "오", "신");
  for (let i = 0; i < 5; i++) {
    assert.deepStrictEqual(P.proveSamhapSinsal("yeokma", "오", "신"), a);
  }
  assert.ok(a.provedOn, "증명에 쓴 원국이 비었다");
  assert.ok(a.counterExample, "반례가 비었다 - '이 띠라고 다 붙는 건 아니다'의 근거가 사라진다");
});
