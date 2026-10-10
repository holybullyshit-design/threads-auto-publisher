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

// ── 명리 주장 검증기(sajuClaimChecker) ──
// 2026-10-06: 소재별 "검증된 사실 블록"을 잘 만드는 것만으로 두 번 깨졌다(삼재 시기, 만세력
// 한자 색인). 그래서 완성된 글 자체를 판별표와 대조하는 층을 따로 뒀고, 두 생성 엔진 모두
// 저장 직전에 이걸 통과해야 한다. 연리지/아해사주의 댓글유도 글 경로(sajuDraftWriter)는
// 사실 블록이 아예 없으므로 이 검사기가 유일한 방어선이다.
//
// 이 테스트의 핵심은 **거짓 양성 0**이다 - 멀쩡한 글을 틀렸다고 하면 생성이 재시도만 돌다 막힌다.

const { checkSajuClaims } = require("../server/lib/sajuClaimChecker");
const REF = { dateKey: "2026-10-06" }; // 병오년

test("틀린 명리 주장을 잡는다", () => {
  const cases = [
    ["삼재 시기", "원숭이·쥐·용띠는 내년 삼재 명단에 올라가 있습니다."],
    ["삼재 방합", "호랑이·말·개띠는 인묘진 3년이 삼재입니다."],
    ["띠-연도(괄호)", "호랑이띠(1999·1986·1974)"],
    ["띠-연도(년생)", "돼지띠는 2007·1995·1984년생"],
    ["오행 상극", "목극금이라 부딪힙니다."],
    ["오행 상생", "목생토라서 흐릅니다."],
    ["지지 충", "자축충이라 부딪혀요."],
    ["삼합", "인오진 삼합은 불입니다."],
    ["방합", "해묘미 방합은 겨울입니다."],
    ["십성", "목 일간입니다.\n\n목 일간의 관성은 토입니다."],
    ["천간-오행", "갑(화) 일간은 추진력이 강합니다."],
    ["지지-띠", "묘(원숭이띠) 글자가 있으면 도화살입니다."],
    ["양인", "갑 일간인데 사주에 오(말띠) 글자가 있으면 양인살입니다."],
    ["천을귀인", "갑 일간은 사주에 해(돼지띠)가 있으면 천을귀인입니다."],
    ["도화", "호랑이·말·개띠인데 사주에 유(닭띠) 글자가 있으면 도화살이에요."],
    ["역마", "돼지·토끼·양띠는 신(원숭이띠) 자리가 역마살입니다."],
    ["원진", "쥐띠와 소띠는 원진 관계입니다."],
    ["괴강", "갑자일주는 괴강살입니다."],
  ];
  for (const [name, text] of cases) {
    assert.ok(checkSajuClaims(text, REF).length > 0, `놓쳤다: ${name}`);
  }
});

test("맞는 글은 절대 잡지 않는다(거짓 양성 0)", () => {
  const cases = [
    // 순위형 글은 한 편에서 5개 일간을 다 다룬다 - 첫 일간으로 전부 대조하면 멀쩡한 글이 걸린다
    ["순위형 다중 일간", "<관성이 오면 흔들리는 일간>\n\n1위. 갑을목(甲乙木) 일간\n관성은 금(金).\n\n2위. 병정화(丙丁火) 일간\n관성은 수(水).\n\n3위. 무기토(戊己土) 일간\n관성은 목(木).\n\n4위. 경신금(庚辛金) 일간\n관성은 화(火).\n\n5위. 임계수(壬癸水) 일간\n관성은 토(土)."],
    // 줄을 넘어 매칭하면 "…1983년생\n토끼띠는…"에서 1983을 토끼띠로 오인한다
    ["띠 목록 나열", "돼지띠는 2007·1995·1983년생\n토끼띠는 1999·1987·1975년생\n양띠는 2003·1991·1979년생."],
    ["띠 괄호 나열", "호랑이띠(1998·1986·1974)\n말띠(2002·1990·1978)\n개띠(2006·1994·1982)"],
    ["정상 십성", "목 일간이라 관성이 금이에요.\n금이 목을 극(剋)하거든요."],
    ["정상 삼재", "호랑이·말·개띠는 인오술 한 묶음이에요.\n이 묶음이 신유술을 지나는 3년이 삼재예요.\n직전 삼재는 2018년에 끝났어요. 이번 삼재는 2028년부터예요."],
    ["정상 도화", "호랑이·말·개띠인데 사주에 묘(토끼띠) 글자가 있으면 도화살이에요."],
    ["정상 양인", "무(토) 일간인데 사주에 오(말띠) 글자가 있으면 양인살입니다."],
    ["정상 천을귀인", "갑 일간은 사주에 축(소띠)이나 미(양띠)가 있으면 천을귀인입니다."],
    ["정상 괴강", "경진일주는 괴강살입니다."],
    ["정상 원진", "쥐띠와 양띠는 원진 관계입니다."],
    ["정상 방합", "사오미 방합은 여름입니다."],
    ["정상 육합", "자축합이라 묶이는 자리예요."],
    ["명리 주장 없는 글", "결혼반지, 서랍에 넣어둔 지 언젠지 기억도 안 나는 부부.\n\n성별 + 생년월일시 + 고민 두 줄 남겨봐."],
  ];
  for (const [name, text] of cases) {
    const r = checkSajuClaims(text, REF);
    assert.deepStrictEqual(r, [], `오탐: ${name} → ${r.join(" / ")}`);
  }
});

test("엔진이 만든 글은 검증기를 통과하는 구조다(사실 블록 자체 검사)", () => {
  // 사실 블록에 적힌 판별 내용이 검증기와 모순되면, 생성물이 영원히 재시도만 돌게 된다.
  // 블록을 문장처럼 읽혀도 모순이 안 나오는지 확인한다.
  for (const topic of TOPICS) {
    for (let i = 0; i < 20; i++) {
      const block = topic.build("2026-10-20");
      const r = checkSajuClaims(block, { dateKey: "2026-10-20" });
      assert.deepStrictEqual(r, [], `${topic.id}의 사실 블록이 검증기와 모순된다 → ${r.join(" / ")}`);
    }
  }
});

// ── 2026-10-07 돌연변이 테스트로 드러난 구멍들의 회귀 테스트 ──
// 실제 예약글 181건에 오류를 하나씩 심어서 검사기가 잡는지 측정했더니 87.6%였다(217건 중 27건 놓침).
// 아래는 그때 뚫렸던 정확한 패턴들이다. 전부 메우고 100%를 만들었다.

test("[회귀] 1~2글자 띠 이름도 잡는다(정규식이 '양띠'를 통째로 먹던 버그)", () => {
  // 예전 정규식은 `([가-힣]{1,3})띠?\s*\(` 였는데 띠도 한글이라 그룹1이 "양띠"가 돼버렸다.
  // 그래서 3글자 띠(호랑이·원숭이)만 걸리고 나머지는 전부 빠져나갔다.
  const REF = { dateKey: "2026-10-08" };
  for (const [text, why] of [
    ["쥐띠(1997·2008·1984)", "1997은 소띠"],
    ["용띠(2001·1988·1976)", "2001은 뱀띠"],
    ["뱀띠(2002·1989·1977)", "2002는 말띠"],
    ["개띠(2007·1994·1982)", "2007은 돼지띠"],
    ["양띠(1992·2003·1979)", "1992는 원숭이띠"],
  ]) {
    assert.ok(checkSajuClaims(text, REF).length > 0, `놓침: ${text} (${why})`);
  }
  // 한 줄에 띠가 둘이어도 각각 검사해야 한다(예전엔 이런 줄을 통째로 건너뛰었다).
  assert.ok(checkSajuClaims("양띠(1992·2003·1979)랑 쥐띠(1996·2008·1984)는", REF).length > 0);
  assert.deepStrictEqual(checkSajuClaims("양띠(1991·2003·1979)랑 쥐띠(1996·2008·1984)는", REF), []);
});

test("[회귀] 삼합·방합은 '삼합'이란 단어 없이 써도 한 글자 틀리면 잡는다", () => {
  const REF = { dateKey: "2026-10-07" };
  // 글은 "인오술(寅午戌)", "신자진(申子辰) 삼합"처럼 단어 없이 쓰는 경우가 많다.
  for (const t of ["신자사 삼합이라", "인오해(寅午亥), 화의 기운", "원숭이·쥐·용은 신자인이라는 묶음", "사오신 방합은 여름"]) {
    assert.ok(checkSajuClaims(t, REF).length > 0, `놓침: ${t}`);
  }
  // 그렇다고 "지지 3글자 연속"을 다 잡으면 정상 한국어가 걸린다(실측 9건) - 전부 통과해야 한다.
  for (const t of [
    "친구가 인사해도 눈만 마주친 채", "자기도 축축해져요.", "유유자형(酉酉自刑)은 남의 방해보다",
    "축오해와 자오충이 강하면", "진술충과 유술해는 묵은 문제를", "오오자형은 추진력이 강해질수록",
    "인오술(寅午戌), 화(火)의 기운", "신자진(申子辰) 삼합, 그러니까", "해자축 방합은 겨울",
  ]) {
    assert.deepStrictEqual(checkSajuClaims(t, REF), [], `오탐: ${t}`);
  }
});

test("[회귀] 삼재 연도는 문구별로 맞는 값과 대조한다", () => {
  const REF = { dateKey: "2026-10-07" };
  // 예전엔 "두 구간 중 하나면 통과"라, 직전 종료연도를 다음 삼재 구간 값으로 바꿔도 안 걸렸다.
  assert.ok(checkSajuClaims("뱀·닭·소띠 얘기입니다. 직전 삼재는 2033년에 끝났어요.", REF).length > 0);
  assert.deepStrictEqual(checkSajuClaims("뱀·닭·소띠 얘기입니다. 직전 삼재는 2021년에 끝났어요.", REF), []);
});

test("[회귀] 이미 진행 중인 띠에게 '내년부터 삼재'라고 쓰면 잡는다", () => {
  const REF = { dateKey: "2026-10-09" };
  // 돼지·토끼·양(해묘미)은 2025~2027이라 2026년엔 2년째다. 시작 시점이 이미 지났다.
  assert.ok(checkSajuClaims("<내년부터 삼재, 지금 한복판인 사람>\n돼지띠 토끼띠 양띠", REF).length > 0);
  assert.ok(checkSajuClaims("돼지·토끼·양띠는 올해부터 삼재가 시작됩니다", REF).length > 0);
  // 맞는 표현은 통과해야 한다.
  for (const t of [
    "돼지·토끼·양띠는 2025년에 시작한 삼재가 지금 2년째입니다",
    "돼지·토끼·양띠 삼재는 2027년에 끝납니다",
    "호랑이·말·개띠 삼재는 2028년부터입니다. 직전 삼재는 2018년에 끝났어요.",
  ]) {
    assert.deepStrictEqual(checkSajuClaims(t, REF), [], `오탐: ${t}`);
  }
});

test("[회귀] 엔진이 사실로 주지 않는 영역을 단정하면 잡는다", () => {
  // 소재 뱅크는 13개뿐이고 그 13개는 전부 위 검사 항목이 덮는다. 남은 위험은 AI가 **소재 밖**
  // 개념(대운 구체값·격국·공망·12운성)을 꺼내 단정하는 경우다 - 엔진이 사실을 안 주므로
  // 아무도 검증하지 못한다(삼재 사고와 같은 구조).
  const REF = { dateKey: "2026-10-07" };
  for (const t of ["네 대운은 2028년부터 바뀐다", "35세 대운부터 풀립니다", "이 사주는 정관격이에요", "공망은 오입니다", "갑 일간은 해에서 장생이다"]) {
    assert.ok(checkSajuClaims(t, REF).length > 0, `놓침: ${t}`);
  }
  // ⚠ 이 검사는 오탐이 제일 나기 쉽다. 첫 구현이 실제 글에서 3종을 오탐했다:
  //   "이중인격이"→격국, "대운에 따라 정해지는"→정해(丁亥), "~에 기인한"→기인(己寅)
  // 간지 두 글자는 흔한 한국어와 너무 겹쳐서 간지 탐지를 아예 포기했다.
  for (const t of [
    "이중인격이라는 말을 들어본 적 있나요", "대운에 따라 정해지는 흐름이야", "그 성격에 기인한 문제예요",
    // 대운·세운 언급은 전체 글에서 209회·277회 나오고 전부 유보 표현이다 - 오히려 권장되는 패턴
    "대운·세운이 지금 어떻게 오는지에 따라", "대운은 10년마다 바뀌는 흐름이야",
    "스스로 세운 기준에 맞추는 기질", "전체 원국과 대운을 같이 봐야 나와요",
    "공망을 같이 봐야 알 수 있어요",
  ]) {
    assert.deepStrictEqual(checkSajuClaims(t, REF), [], `오탐: ${t}`);
  }
});

test("띠-출생연도 — 연도가 띠 앞에 오는 표기도 본다(줄은 넘지 않는다)", () => {
  // 2026-10-10: 10/31까지 글을 채운 뒤 돌연변이를 재니 `<1977·1989·2001 뱀띠 / …>` 형태에서
  // 1977→1978로 바꿔도 통과했다. ②는 "YYYY년생"만 보고 "같은 줄에 띠 하나"를 요구해서
  // 이 줄을 통째로 건너뛰었다. 그래서 ③(연도 묶음이 띠 바로 앞)을 추가했다.
  //
  // **그 첫 구현이 거짓 양성을 냈다.** `\s*`가 줄바꿈을 넘어
  // "닭띠 2005·1993·1981년생\n뱀띠 …"의 연도를 다음 줄 뱀띠에 붙여 예약글 6건을 오탐했다.
  // 검사기 제1원칙은 거짓 양성 0이다 — 같은 줄 안에서만 본다.
  const { checkSajuClaims } = require("../server/lib/sajuClaimChecker");
  const day = { dateKey: "2026-10-14" };

  // 맞는 글은 절대 잡지 않는다 — 세 가지 표기 전부.
  assert.deepStrictEqual(checkSajuClaims("<1977·1989·2001 뱀띠 / 1981·1993·2005 닭띠 / 1973·1985·1997 소띠>", day), []);
  assert.deepStrictEqual(checkSajuClaims("닭띠 2005·1993·1981년생\n뱀띠 2001·1989·1977년생\n소띠 1997·1985·1973년생", day), []);
  assert.deepStrictEqual(checkSajuClaims("뱀띠(2001·1989·1977)\n닭띠(2005·1993·1981)", day), []);

  // 틀리면 잡는다.
  const wrong = checkSajuClaims("<1978·1989·2001 뱀띠 / 1981·1993·2005 닭띠>", day);
  assert.ok(wrong.length && /1978/.test(wrong[0]), `연도 선행 표기의 오류를 놓쳤다: ${JSON.stringify(wrong)}`);
  const wrong2 = checkSajuClaims("<1977·1989·2001 뱀띠 / 1981·1993·2006 닭띠>", day);
  assert.ok(wrong2.length && /2006/.test(wrong2[0]), `두 번째 띠의 오류를 놓쳤다: ${JSON.stringify(wrong2)}`);
});
