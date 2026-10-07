// 생년월일시를 넣으면 계산된 사주 풀이를 출력한다. 댓글/DM으로 받은 정보를 그대로 넣어 쓰는 용도.
//
// 엔진이 계산한 사실만 출력한다 - 해석 문장을 지어내지 않는다. 사용자가 이걸 보고 상담 답변을 쓴다.
// 결정론: 같은 입력이면 항상 같은 출력이다(기준일도 인자로 받는다).
//
// 사용법:
//   node tools/saju-reading.js 1988-04-21 12:31 남
//   node tools/saju-reading.js 1990-11-19 21:58 여 --ref=2026-10-07
//   node tools/saju-reading.js 1988-03-06 12:31 남 --lunar        (음력 입력)
//   node tools/saju-reading.js 1988-04-21 모름 남                  (태어난 시간 모를 때)
//   node tools/saju-reading.js 궁합 1988-04-21 12:31 남 1990-11-19 21:58 여
//   끝에 --json 을 붙이면 원본 데이터를 JSON으로 출력한다.

const S = require("../server/lib/saju");

const argv = process.argv.slice(2);
const flag = (name) => argv.find((a) => a.startsWith(`--${name}`));
const JSON_OUT = argv.includes("--json");
const LUNAR = argv.includes("--lunar");
const LEAP = argv.includes("--leap");
const REF = (flag("ref") || "").split("=")[1] || null;
const positional = argv.filter((a) => !a.startsWith("--"));

function parsePerson(parts) {
  const [date, time, gender] = parts;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) throw new Error(`날짜는 YYYY-MM-DD 형식이어야 합니다: "${date}"`);
  const [year, month, day] = date.split("-").map(Number);
  const unknown = !time || ["모름", "미상", "?", "unknown"].includes(time);
  let hour, minute;
  if (!unknown) {
    const m = String(time).match(/^(\d{1,2}):(\d{2})$/);
    if (!m) throw new Error(`시각은 HH:MM 형식이거나 "모름"이어야 합니다: "${time}"`);
    hour = Number(m[1]); minute = Number(m[2]);
  }
  const g = { 남: "male", 남자: "male", m: "male", male: "male", 여: "female", 여자: "female", f: "female", female: "female" }[gender];
  if (!g) throw new Error(`성별은 남/여로 적어주세요: "${gender}"`);
  return { year, month, day, hour, minute, gender: g, calendar: LUNAR ? "lunar" : "solar", isLeapMonth: LEAP };
}

const pad = (s, n) => String(s).padEnd(n, " ");

function printOne(a, title) {
  const c = a.chart, st = a.strength, k = a.sinsal;
  console.log(`\n${"━".repeat(60)}`);
  console.log(`${title}  ${c.solarDate} (음 ${c.lunarDate}) ${c.gender === "male" ? "남" : "여"}${c.timeUnknown ? " · 시간 모름" : ""}`);
  console.log("━".repeat(60));

  const order = c.pillarOrder.slice().reverse(); // 생년→생시 순으로 읽기 쉽게
  console.log("\n【원국】 " + c.summary);
  console.log("        " + order.map((x) => pad(c.pillars[x].label, 10)).join(""));
  console.log("  간지  " + order.map((x) => pad(c.pillars[x].ko, 10)).join(""));
  console.log("  십성  " + order.map((x) => pad(c.pillars[x].tenGodOfStem + "/" + c.pillars[x].tenGodOfBranchPrimary, 10)).join(""));
  console.log("  지장간 " + order.map((x) => pad(c.pillars[x].hiddenStems.map((h) => h.stem).join(""), 10)).join(""));
  console.log("  12운성 " + order.map((x) => pad(c.pillars[x].twelveStage, 10)).join(""));
  console.log(`  공망: ${c.emptyBranches.join("·")}`);

  console.log(`\n【오행】 ` + Object.entries(st.elementPercent).map(([e, p]) => `${e} ${p}%`).join(" · "));
  if (st.missingElements.length) console.log(`  없는 오행: ${st.missingElements.join("·")}`);
  console.log(`\n【신강약】 ${st.verdict}${st.verdictConfirmed ? "" : " (※ 확정 아님)"}`);
  console.log(`  ${st.basis}`);
  if (st.verdictCaveat) console.log(`  ※ ${st.verdictCaveat}`);
  console.log(`  용신 후보(단정 아님): ${st.yongsinCandidateElements.join(" > ") || "-"}`);

  console.log(`\n【신살】`);
  if (!k.found.length) console.log("  성립하는 신살 없음");
  for (const x of k.found) {
    console.log(`  ${pad(x.name, 8)} ${x.at.map((p) => p.label).join("·")}${x.unverified ? "  (※ " + x.unverified + ")" : ""}`);
  }
  if (k.samjae) {
    const sj = k.samjae;
    console.log(`  삼재      ${sj.years}년 (${sj.status === "current" ? `진행 중 ${sj.nthYear}년째` : `${sj.yearsUntilStart}년 뒤 · 직전 ${sj.prevEndYear}년 종료`})`);
  }

  if (a.relations.hasAny) {
    console.log(`\n【원국 안의 관계】 ${a.relations.summary}`);
    for (const [key, list] of Object.entries(a.relations)) {
      if (!Array.isArray(list)) continue;
      for (const x of list) console.log(`  [${key}] ${x.desc || x.result} @ ${(x.between || x.at || []).join("-")}`);
    }
  }

  console.log(`\n【대운】 대운수 ${a.daeun.daeunNumber} · ${a.daeun.direction}`);
  console.log("  " + a.daeun.list.map((d) => `${d.startAge}세 ${d.ganji}(${d.tenGodOfStem})`).join("  "));
  if (a.currentDaeun) console.log(`  ▶ ${a.refDate.slice(0, 4)}년 현재: ${a.currentDaeun.ganji} (${a.currentDaeun.startAge}~${a.currentDaeun.endAge}세, 천간 ${a.currentDaeun.tenGodOfStem} / 지지 ${a.currentDaeun.tenGodOfBranch})`);
  if (a.seun) console.log(`  세운: ` + a.seun.slice(0, 5).map((s) => `${s.year} ${s.ganji}(${s.tenGodOfStem})`).join("  "));

  if (c.warnings.length) {
    console.log(`\n【주의】`);
    for (const w of c.warnings) console.log("  · " + w);
  }
}

function main() {
  if (!positional.length) {
    console.log(`사용법:
  node tools/saju-reading.js <YYYY-MM-DD> <HH:MM|모름> <남|여> [--ref=YYYY-MM-DD] [--lunar] [--json]
  node tools/saju-reading.js 궁합 <날짜1> <시각1> <성별1> <날짜2> <시각2> <성별2>`);
    process.exit(1);
  }

  if (positional[0] === "궁합") {
    const rest = positional.slice(1);
    if (rest.length < 6) throw new Error("궁합은 두 사람의 날짜·시각·성별 6개가 필요합니다.");
    const a = S.analyze(parsePerson(rest.slice(0, 3)), { refDate: REF });
    const b = S.analyze(parsePerson(rest.slice(3, 6)), { refDate: REF });
    const g = S.compatibility(a, b, { labelA: "A", labelB: "B" });
    if (JSON_OUT) return console.log(JSON.stringify({ a, b, compatibility: g }, null, 2));
    printOne(a, "【A】");
    printOne(b, "【B】");
    console.log(`\n${"━".repeat(60)}\n【궁합】 ${g.summary}\n${"━".repeat(60)}`);
    console.log(`  일간  ${g.dayStem.a} ↔ ${g.dayStem.b} | B가 A에게 ${g.dayStem.bToA} / A가 B에게 ${g.dayStem.aToB}`);
    console.log(`  띠    ${g.yearBranch.animals.join(" - ")} ${g.yearBranch.relations.map((r) => r.desc).join(",") || "(직접 관계 없음)"}`);
    console.log(`  일지  ${g.dayBranch.a} ↔ ${g.dayBranch.b} ${g.dayBranch.relations.map((r) => r.desc).join(",") || "(직접 관계 없음)"}  ← 배우자 자리`);
    console.log(`\n  교차 관계 ${g.crossStem.length + g.crossBranch.length}건`);
    for (const x of [...g.crossStem, ...g.crossBranch]) console.log(`    [${x.type}] ${x.desc}  ${x.from} ↔ ${x.to}`);
    if (g.complement) {
      console.log(`\n  오행 보완`);
      console.log(`    A에게 없는 오행 중 B가 가진 것: ${g.complement.aMissingFilledByB.map((x) => `${x.element}(${x.otherCount})`).join(", ") || "없음"}`);
      console.log(`    B에게 없는 오행 중 A가 가진 것: ${g.complement.bMissingFilledByA.map((x) => `${x.element}(${x.otherCount})`).join(", ") || "없음"}`);
      console.log(`    A 용신 후보를 B가 가진 양: ${g.complement.aYongsinFromB.map((x) => `${x.element} ${x.otherPercent}%`).join(", ") || "-"}`);
      console.log(`    B 용신 후보를 A가 가진 양: ${g.complement.bYongsinFromA.map((x) => `${x.element} ${x.otherPercent}%`).join(", ") || "-"}`);
    }
    console.log(`\n  ※ ${g.note}`);
    return;
  }

  const a = S.analyze(parsePerson(positional), { refDate: REF });
  if (JSON_OUT) return console.log(JSON.stringify(a, null, 2));
  printOne(a, "【사주】");
  console.log("\n※ 엔진이 계산한 사실만 출력합니다. 해석은 이 사실들을 근거로 직접 쓰세요.");
  console.log("※ 용신은 후보만 냅니다(학파 차이가 커서 단정하지 않습니다).\n");
}

try { main(); } catch (err) { console.error("오류:", err.message); process.exit(1); }
