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

// tools/fill-schedule.js와 동일한 로직(그 파일 주석 참고, 4차 개정 - 앵커 회피 방식).
// 오전 코어(7~9시)만 고정 앵커, 나머지는 순서대로 2~3시간씩 쌓는다. 댓글유도 글(anchorMin,
// KST 분 단위)이 있으면 그 시각과 2시간 미만으로 가까워지는 슬롯을 "앵커+2시간"으로 건너뛰어
// 피해간다 - "5개 만들고 가까운 거 버리기" 방식은 버린 자리 양옆 간격이 안 보장돼서 실측으로
// 2시간 미만 간격 사고가 났었다.
function generateDailySlots(count = 5, anchorMin = null) {
  const AM_CORE_START = 7 * 60, AM_CORE_END = 9 * 60;
  const MIN_GAP_MIN = 120, MAX_GAP_MIN = 180;
  const ANCHOR_MARGIN_MIN = 120;

  const slots = [AM_CORE_START + Math.random() * (AM_CORE_END - AM_CORE_START)];
  while (slots.length < count) {
    let next = slots[slots.length - 1] + MIN_GAP_MIN + Math.random() * (MAX_GAP_MIN - MIN_GAP_MIN);
    if (anchorMin !== null && Math.abs(next - anchorMin) < ANCHOR_MARGIN_MIN) {
      next = anchorMin + ANCHOR_MARGIN_MIN;
    }
    slots.push(next);
  }
  return slots.map(minutesToHHMM);
}

function msToKstMinuteOfDay(ms) {
  const k = new Date(ms + 9 * 60 * 60 * 1000);
  return k.getUTCHours() * 60 + k.getUTCMinutes();
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

        const anchorMin = anchorMs !== null ? msToKstMinuteOfDay(anchorMs) : null;
        let slots = generateDailySlots(targets.length, anchorMin); // 앵커 있으면 자동 회피

        targets.forEach((p, idx) => {
          const hhmm = slots[idx % slots.length];
          const newMs = kstSlotToUtc(day, hhmm).getTime();
          // 2026-09-02 실측 사고: "오늘"처럼 하루가 이미 반쯤 지난 날짜를 재배치하면, 새로
          // 뽑은 07~09시/중간 슬롯이 지금 시각보다 과거일 수 있다 - 그런 시각을 그대로 넣으면
          // 그 글이 "이미 지난 예약"이 되어 다음 5분 주기 실행 때 곧바로(다른 계정 것과 함께)
          // 한꺼번에 발행돼버린다(실제로 5개 계정에서 전부 발생, 15시~15시42분 사이에 몰아서
          // 게시됨). 그래서 지금 시각 + 여유(SAFETY_BUFFER_MS)보다 이른 시각은 아예 배정하지
          // 않고 그 글의 기존 예약 시각을 그대로 둔다.
          const SAFETY_BUFFER_MS = 15 * 60 * 1000;
          if (newMs <= Date.now() + SAFETY_BUFFER_MS) return;
          const newIso = new Date(newMs).toISOString();
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
