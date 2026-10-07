// 댓글로 받은 생년월일시에 달아줄 답글 초안을 만든다.
//
// 사용법:
//   node tools/saju-reply.js 1990-11-19 21:58 여 --account="연리지 실타래"
//   node tools/saju-reply.js 1988-04-21 모름 남 --account=아해사주 --ref=2026-10-07
//   --facts 를 붙이면 엔진이 AI에게 넘긴 사실 블록도 같이 보여준다(검산용).

require("dotenv").config();
const { writeSajuReply } = require("../server/skills/sajuReplyWriter");

const argv = process.argv.slice(2);
const flagOf = (n) => { const a = argv.find((x) => x.startsWith(`--${n}=`)); return a ? a.split("=").slice(1).join("=").replace(/^["']|["']$/g, "") : null; };
const pos = argv.filter((a) => !a.startsWith("--"));

const [date, time, gender] = pos;
if (!date) {
  console.log('사용법: node tools/saju-reply.js <YYYY-MM-DD> <HH:MM|모름> <남|여> [--account="계정명"] [--ref=YYYY-MM-DD] [--facts]');
  process.exit(1);
}
const [year, month, day] = date.split("-").map(Number);
const unknown = !time || ["모름", "미상", "?"].includes(time);
const m = unknown ? null : String(time).match(/^(\d{1,2}):(\d{2})$/);
if (!unknown && !m) { console.error(`시각은 HH:MM 또는 "모름"이어야 합니다: ${time}`); process.exit(1); }
const g = { 남: "male", 남자: "male", 여: "female", 여자: "female" }[gender];
if (!g) { console.error(`성별은 남/여로 적어주세요: ${gender}`); process.exit(1); }

(async () => {
  const birth = { year, month, day, gender: g, calendar: argv.includes("--lunar") ? "lunar" : "solar" };
  if (!unknown) { birth.hour = Number(m[1]); birth.minute = Number(m[2]); }
  const account = flagOf("account") || "팔자장인";
  const r = await writeSajuReply(birth, { accountLabel: account, refDate: flagOf("ref"), verbose: true });

  console.log(`\n━━━ ${account} / ${r.analysis.chart.summary} (${r.analysis.strength.verdict}) ━━━`);
  console.log(`짚은 포인트: [${r.highlight.kind}] ${r.highlight.name} @ ${r.highlight.where}`);
  if (argv.includes("--facts")) console.log(`\n${r.facts}\n`);
  console.log(`\n${"─".repeat(50)}\n${r.text}\n${"─".repeat(50)}`);
  console.log(`(${r.text.length}자 · 명리 사실 검증 통과)\n`);
})().catch((e) => { console.error("실패:", e.message); process.exit(1); });
