// 이미 예약된(status: scheduled) 글들의 "시간"만, 사용자가 정한 새 규칙에 맞게 재배치한다.
// 내용/계정/날짜/순서는 그대로 두고 시각만 바꾼다. 이미 게시되었거나 실패한 글은 손대지 않는다
// (status가 scheduled인 것만 대상).
//
// 규칙 (2026-09-02 사용자 지시):
// - 하루 첫 글은 07:00~08:00 사이
// - 글과 글 사이 간격은 2~3시간
// - 마지막 글은 22:00을 넘기지 않음
// - 연리지실타래/아해사주는 댓글유도 글(다른 경로에서 생성, viralEngine 아님)은 그대로 두고
//   나머지(바이럴) 글들만 재배치 - 5개 슬롯을 계산한 뒤 댓글유도 글과 가장 가까운 슬롯 하나를
//   버리고 나머지로 바이럴 글들을 채운다.
//
// 사용법: node tools/rebalance-daily-times.js [--dry-run]

require("dotenv").config();
const { atomicUpdateSchedule } = require("../server/lib/githubStore");

const ACCOUNTS = ["연리지 실타래", "아해사주", "팔자명가", "팔자궤도", "팔자장인"];
const VIRAL_ACCOUNTS = new Set(["연리지 실타래", "아해사주"]);
const DRY_RUN = process.argv.includes("--dry-run");

function toKstDateHour(iso) {
  const k = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
  return { date: k.toISOString().slice(0, 10), hour: k.getUTCHours() };
}

function kstSlotToUtc(dateStr, hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(Date.parse(`${dateStr}T00:00:00Z`) + (h * 60 + m) * 60 * 1000 - 9 * 60 * 60 * 1000);
}

function minutesToHHMM(totalMinutes) {
  const m = Math.round(totalMinutes);
  const h = Math.floor(m / 60);
  return `${String(h).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function generateDailySlots(count = 5) {
  const DAY_START_MIN = 7 * 60;
  const DAY_START_SPAN_MIN = 60;
  const MAX_END_MIN = 22 * 60;
  const MIN_GAP_MIN = 120;
  const MAX_GAP_MIN = 180;
  const slots = [DAY_START_MIN + Math.random() * DAY_START_SPAN_MIN];
  for (let i = 1; i < count; i++) {
    const gap = MIN_GAP_MIN + Math.random() * (MAX_GAP_MIN - MIN_GAP_MIN);
    slots.push(Math.min(slots[slots.length - 1] + gap, MAX_END_MIN));
  }
  return slots.map(minutesToHHMM);
}

function isViralPost(p) {
  if (p.viralEngine === true) return true;
  if (p.viralEngine === false) return false;
  return toKstDateHour(p.scheduledAt).hour < 12; // 하위호환(플래그 없는 옛날 글)
}

async function main() {
  const changes = [];
  await atomicUpdateSchedule((posts) => {
    for (const acct of ACCOUNTS) {
      const mine = posts.filter(
        (p) => p.accountLabel === acct && p.status === "scheduled" && p.platform !== "instagram" && p.scheduledAt
      );
      const byDate = {};
      mine.forEach((p) => (byDate[toKstDateHour(p.scheduledAt).date] = byDate[toKstDateHour(p.scheduledAt).date] || []).push(p));

      for (const day of Object.keys(byDate)) {
        const dayPosts = byDate[day].sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
        let targets = dayPosts; // 재배치 대상(순서 유지)
        let anchorMs = null; // 건드리지 않는 기준 시각(댓글유도 글)

        if (VIRAL_ACCOUNTS.has(acct)) {
          const nonViral = dayPosts.filter((p) => !isViralPost(p));
          const viral = dayPosts.filter((p) => isViralPost(p));
          if (nonViral.length > 0) anchorMs = new Date(nonViral[0].scheduledAt).getTime();
          targets = viral;
          if (targets.length === 0) continue;
        }

        let slots = generateDailySlots(5);
        if (VIRAL_ACCOUNTS.has(acct)) {
          const slotMs = slots.map((hhmm) => kstSlotToUtc(day, hhmm).getTime());
          let dropIdx = slots.length - 1;
          if (anchorMs !== null) {
            let best = Infinity;
            slotMs.forEach((ms, idx) => {
              const dist = Math.abs(ms - anchorMs);
              if (dist < best) { best = dist; dropIdx = idx; }
            });
          }
          slots = slots.filter((_, idx) => idx !== dropIdx);
        }
        slots = slots.slice(0, targets.length); // 대상 개수만큼만(보통 정확히 맞음)

        targets.forEach((p, idx) => {
          const hhmm = slots[idx % slots.length];
          const newIso = kstSlotToUtc(day, hhmm).toISOString();
          if (newIso !== p.scheduledAt) {
            changes.push({ account: acct, day, id: p.id, before: p.scheduledAt, after: newIso, text: (p.text || "").slice(0, 25) });
            if (!DRY_RUN) p.scheduledAt = newIso;
          }
        });
      }
    }
    return { count: changes.length };
  }, `chore: 예약 시각 재배치 - 아침 7~8시 시작/2~3시간 간격/22시 마지노선 (${changes.length || "N"}건)`);

  console.log(`${DRY_RUN ? "[dry-run] " : ""}재배치 대상: ${changes.length}건`);
  changes.forEach((c) => console.log(` - ${c.account} ${c.day} | ${c.before} -> ${c.after} | ${c.text}`));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
