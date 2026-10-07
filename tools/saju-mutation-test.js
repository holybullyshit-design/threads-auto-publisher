// 명리 사실 검사기가 **실제 글에서** 얼마나 잡는지 측정한다(돌연변이 테스트).
//
// 왜 필요한가(2026-10-07): 단위 테스트는 내가 만든 예문만 본다. 그건 "내가 생각한 오류"만
// 검증하는 것이라, 실제 AI가 쓰는 문장 구조에서 뚫리는 구멍은 못 찾는다. 그래서 **지금 깨끗한
// 예약글**에 오류를 하나씩 심어서 검사기가 잡는지 센다.
// 첫 측정은 87.6%였고(217건 중 27건 놓침), 거기서 진짜 버그 3개가 나왔다:
//   ① 정규식이 "양띠"를 통째로 띠 이름으로 먹어서 1~2글자 띠가 전부 빠져나감(121건 중 2건만 걸림)
//   ② 삼합·방합을 "삼합"이란 단어 없이 쓰면 한 글자 틀려도 못 잡음(22건 중 0건)
//   ③ 이미 진행 중인 띠에게 "내년부터 삼재"라고 써도 통과
// 전부 메워서 100%가 됐다. 검사 항목을 추가하거나 생성 엔진을 손댄 뒤에는 이걸 다시 돌릴 것.
//
// 사용법: node tools/saju-mutation-test.js

require("dotenv").config();
const { readSchedule } = require("../server/lib/githubStore");
const { checkSajuClaims } = require("../server/lib/sajuClaimChecker");
const ANIMALS = ["쥐","소","호랑이","토끼","용","뱀","말","양","원숭이","닭","개","돼지"];
const BR = ["자","축","인","묘","진","사","오","미","신","유","술","해"];
const EL = ["목","화","토","금","수"];

// 실제 글에 "한 군데만" 틀리게 바꾸는 돌연변이들. 각각 명리적으로 명백한 오류다.
const MUTATIONS = [
  { name: "띠-출생연도", apply: (t) => t.replace(/([가-힣]{1,3})띠\s*\(\s*((?:19|20)\d{2})/, (m, a, y) => ANIMALS.includes(a) ? `${a}띠(${Number(y) + 1}` : m) },
  { name: "지지-띠 병기", apply: (t) => t.replace(/([자축인묘진사오미신유술해])\s*\(\s*([가-힣]{1,3})띠/, (m, b, a) => {
      const wrong = ANIMALS[(ANIMALS.indexOf(a) + 3) % 12]; return `${b}(${wrong}띠`; }) },
  { name: "천간-오행 병기", apply: (t) => t.replace(/([갑을병정무기경신임계])\s*\(\s*([목화토금수])\s*\)/, (m, s, e) => `${s}(${EL[(EL.indexOf(e) + 1) % 5]})`) },
  { name: "오행 상극", apply: (t) => t.replace(/([목화토금수])\s*극\s*([목화토금수])/, (m, a, b) => `${a}극${EL[(EL.indexOf(b) + 1) % 5]}`) },
  { name: "오행 상생", apply: (t) => t.replace(/([목화토금수])\s*생\s*([목화토금수])/, (m, a, b) => `${a}생${EL[(EL.indexOf(b) + 2) % 5]}`) },
  { name: "지지 충", apply: (t) => t.replace(/([자축인묘진사오미신유술해])([자축인묘진사오미신유술해])\s*충/, (m, a, b) => `${a}${BR[(BR.indexOf(b) + 1) % 12]}충`) },
  { name: "삼합 조합", apply: (t) => t.replace(/(인오술|신자진|사유축|해묘미)/, (m) => m[0] + m[1] + BR[(BR.indexOf(m[2]) + 1) % 12]) },
  { name: "방합 조합", apply: (t) => t.replace(/(인묘진|사오미|신유술|해자축)/, (m) => m[0] + m[1] + BR[(BR.indexOf(m[2]) + 1) % 12]) },
  { name: "지장간", apply: (t) => t.replace(/지장간\s*(?:은|는|이|가)?\s*[:=]?\s*([갑을병정무기경신임계]{2,3})/, (m, g) => m.replace(g, "병정무")) },
  { name: "천간합", apply: (t) => t.replace(/([갑을병정무기경신임계])([갑을병정무기경신임계])\s*합/, (m, a, b) => `${a}${b === a ? "을" : a}합`) },
  { name: "삼재 시기", apply: (t) => /삼재/.test(t) ? t.replace(/(이번 삼재는|삼재는)\s*(20\d\d)/, (m, p, y) => `${p} ${Number(y) + 12}`) : t },
  { name: "삼재 임박", apply: (t) => /삼재/.test(t) && !/올해부터|내년부터/.test(t) ? t.replace(/삼재/, "내년부터 삼재") : t },
];

(async () => {
  const { posts } = await readSchedule();
  const A = ["연리지 실타래","아해사주","팔자명가","팔자궤도","팔자장인"];
  // 지금 "깨끗한" 예약글만 대상으로 한다(이미 오류가 있으면 측정이 오염된다).
  const clean = posts.filter((p) => A.includes(p.accountLabel) && p.platform !== "instagram" && p.status === "scheduled" && p.text)
    .map((p) => ({ p, d: new Date(new Date(p.scheduledAt).getTime() + 9*3600000).toISOString().slice(0,10), text: [p.text, ...(p.replyChain||[])].join("\n") }))
    .filter((x) => checkSajuClaims(x.text, { dateKey: x.d }).length === 0);

  console.log(`깨끗한 예약글 ${clean.length}건에 오류를 하나씩 심어서 검사기가 잡는지 측정\n`);
  const stat = {};
  let totalApplied = 0, totalCaught = 0;
  for (const mut of MUTATIONS) {
    let applied = 0, caught = 0;
    for (const x of clean) {
      const mutated = mut.apply(x.text);
      if (mutated === x.text) continue; // 이 글엔 해당 패턴이 없음
      applied++;
      if (checkSajuClaims(mutated, { dateKey: x.d }).length > 0) caught++;
    }
    stat[mut.name] = { applied, caught };
    totalApplied += applied; totalCaught += caught;
  }
  console.log("돌연변이 종류".padEnd(16) + "적용".padStart(6) + "탐지".padStart(6) + "  탐지율");
  for (const [k, v] of Object.entries(stat)) {
    if (!v.applied) { console.log(k.padEnd(16) + "  (해당 글 없음)"); continue; }
    const r = (v.caught / v.applied * 100).toFixed(0);
    console.log(k.padEnd(16) + String(v.applied).padStart(6) + String(v.caught).padStart(6) + "  " + r + "%" + (r === "100" ? " ✓" : " ✗"));
  }
  console.log("\n합계: " + totalCaught + "/" + totalApplied + " = " + (totalCaught/totalApplied*100).toFixed(1) + "% 탐지");
})();
