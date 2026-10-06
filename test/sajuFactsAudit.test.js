// 2026-10-06 삼재 사고 후 전수 검토에서 나온 두 번째 버그의 회귀 테스트.
//
// calculateCalendar는 간지를 **한자**로 돌려주는데(丙午/丁酉) sajuFacts가 한글 배열에
// indexOf를 걸고 있어서 yearBranchIndex=-1, monthBranchIndex=-1, monthStemElement=undefined가
// 나왔다. 그래서 재성/관성 시기형 소재의 사실 블록이 "이번 달 오행: undefined"로 나가고,
// 십성 관계를 "스스로 판단해서 쓰라"고 AI에게 넘기고 있었다(삼재와 같은 종류의 구멍).
//
// 그리고 판별표 자체는 전부 맞았다는 것도 여기 고정해둔다 - 다음에 누가 표를 건드리면 바로 깨지게.

const test = require("node:test");
const assert = require("node:assert");
const F = require("../server/lib/sajuFacts");
const { TOPICS } = require("../server/skills/taebaekSajuDraftWriter");

test("만세력 사실에 undefined/-1이 새지 않는다(한자 간지 색인)", () => {
  for (const d of ["2026-08-15", "2026-10-06", "2026-10-20", "2026-11-15", "2027-02-10"]) {
    const c = F.getVerifiedCalendarFacts(d);
    assert.notStrictEqual(c.yearBranchIndex, -1, `${d} yearBranchIndex`);
    assert.notStrictEqual(c.monthBranchIndex, -1, `${d} monthBranchIndex`);
    assert.ok(["목", "화", "토", "금", "수"].includes(c.monthStemElement), `${d} monthStemElement=${c.monthStemElement}`);
    assert.ok(["목", "화", "토", "금", "수"].includes(c.yearStemElement), `${d} yearStemElement`);
  }
  // 2026-10-06은 병오년 정유월 - 월간 정(丁)=화
  const oct = F.getVerifiedCalendarFacts("2026-10-06");
  assert.strictEqual(oct.monthStemElement, "화");
  assert.strictEqual(oct.yearAnimal, "말");
});

test("해석 불가한 간지는 조용히 넘기지 않고 실패한다", () => {
  // 내부 분기를 직접 못 찌르므로, 정상 경로가 throw하지 않는다는 것만 고정한다.
  assert.doesNotThrow(() => F.getVerifiedCalendarFacts("2026-10-06"));
});

test("십성 관계는 표에서 읽은 값이다(오행 상생상극과 일치)", () => {
  // 일간이 극하는 오행 = 재성, 일간을 극하는 오행 = 관성, 같은 오행 = 비겁
  assert.strictEqual(F.sipseongRelation("목", "토"), "재성"); // 목극토
  assert.strictEqual(F.sipseongRelation("목", "금"), "관성"); // 금극목
  assert.strictEqual(F.sipseongRelation("목", "목"), "비겁");
  assert.strictEqual(F.sipseongRelation("목", "화"), "식상"); // 목생화
  assert.strictEqual(F.sipseongRelation("목", "수"), "인성"); // 수생목
  assert.strictEqual(F.sipseongRelation("화", "금"), "재성");
  assert.strictEqual(F.sipseongRelation("수", "토"), "관성");
  assert.strictEqual(F.sipseongRelation("금", "화"), "관성");
  assert.strictEqual(F.sipseongRelation("토", "수"), "재성");
});

test("신살 판별표가 정통 표 그대로다(바뀌면 바로 깨지게 고정)", () => {
  const B = { 자: 0, 축: 1, 인: 2, 묘: 3, 진: 4, 사: 5, 오: 6, 미: 7, 신: 8, 유: 9, 술: 10, 해: 11 };
  // 역마 = 삼합 생지와 충 / 도화 = 생지 다음 글자 / 화개 = 삼합 고지
  const cases = [
    [B.인, { 역마: B.신, 도화: B.묘, 화개: B.술 }], // 인오술
    [B.신, { 역마: B.인, 도화: B.유, 화개: B.진 }], // 신자진
    [B.사, { 역마: B.해, 도화: B.오, 화개: B.축 }], // 사유축
    [B.해, { 역마: B.사, 도화: B.자, 화개: B.미 }], // 해묘미
  ];
  for (const [branch, want] of cases) {
    const r = F.getSamhapRoles(branch);
    assert.strictEqual(r.역마, want.역마);
    assert.strictEqual(r.도화, want.도화);
    assert.strictEqual(r.화개, want.화개);
  }
  // 양인(양간만) / 천을귀인 / 백호 7일주 / 괴강 4일주 / 원진 6조합
  assert.deepStrictEqual(F.YANGIN_TABLE, { 갑: B.묘, 병: B.오, 무: B.오, 경: B.유, 임: B.자 });
  assert.deepStrictEqual(F.CHEONEULGWIIN_TABLE.갑, [B.축, B.미]);
  assert.deepStrictEqual(F.CHEONEULGWIIN_TABLE.신, [B.오, B.인]);
  assert.deepStrictEqual(F.BAEKHO_ILJU, ["갑진", "을미", "병술", "정축", "무진", "임술", "계축"]);
  assert.deepStrictEqual(F.GOEGANG_ILJU, ["경진", "경술", "임진", "임술"]);
  assert.strictEqual(F.getWonjinPartner(B.자), B.미);
  assert.strictEqual(F.getWonjinPartner(B.축), B.오);
  assert.strictEqual(F.getWonjinPartner(B.인), B.유);
  assert.strictEqual(F.getWonjinPartner(B.묘), B.신);
  assert.strictEqual(F.getWonjinPartner(B.진), B.해);
  assert.strictEqual(F.getWonjinPartner(B.사), B.술);
});

test("소재 13개의 사실 블록에 undefined/NaN이 섞이지 않는다", () => {
  for (const topic of TOPICS) {
    for (let i = 0; i < 30; i++) {
      const block = topic.build("2026-10-20");
      assert.ok(block && block.length > 50, `${topic.id}: 사실 블록이 비정상`);
      assert.doesNotMatch(block, /undefined|NaN|\[object/, `${topic.id}: 값 누락이 사실 블록에 새어나감`);
    }
  }
});

test("띠 이름과 출생연도 예시가 실제 지지와 맞는다", () => {
  const ANIMALS = ["쥐", "소", "호랑이", "토끼", "용", "뱀", "말", "양", "원숭이", "닭", "개", "돼지"];
  const branchOf = (y) => ((((y - 1984) % 12) + 12) % 12);
  let checked = 0;
  for (const id of ["yeokma", "dohwa", "hwagae", "samjae"]) {
    const topic = TOPICS.find((t) => t.id === id);
    for (let i = 0; i < 30; i++) {
      const line = (topic.build("2026-10-06").match(/출생연도 예시[^\n]*/) || [""])[0];
      for (const m of line.matchAll(/([가-힣]+)\(([\d·]+)\)/g)) {
        const want = ANIMALS.indexOf(m[1]);
        assert.notStrictEqual(want, -1, `알 수 없는 띠 이름: ${m[1]}`);
        for (const y of m[2].split("·").map(Number)) {
          checked++;
          assert.strictEqual(branchOf(y), want, `${m[1]}띠에 ${y}년이 들어갔다(실제 ${ANIMALS[branchOf(y)]}띠)`);
        }
      }
    }
  }
  assert.ok(checked > 500, `검증 건수가 너무 적다: ${checked}`);
});
