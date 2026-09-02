// 이미 예약된 글들 중, 같은 계정·같은 날에 시간 간격이 너무 짧은(< MIN_GAP_MINUTES) 쌍을
// 찾아서 뒤쪽 글의 시간만 뒤로 밀어 최소 간격을 확보한다. 내용/계정/날짜는 그대로 두고
// scheduledAt만 조정한다 - 새 글을 만들거나 취소하지 않는다.
//
// 2026-09-02: 연리지실타래/아해사주가 매일 오후 5시경 댓글유도 글과 바이럴 4번째 슬롯이
// 1~15분(심한 날은 18초) 간격으로 붙어서 나가고 있던 걸 사용자가 지적 - 앞으로 새로 채우는
// 건 tools/fill-schedule.js의 충돌회피로 막았지만, 이미 예약된 기존 글들은 그대로 남아있어서
// 이 스크립트로 한 번 정리한다.
//
// 사용법: node tools/fix-time-collisions.js [--dry-run]

require("dotenv").config();
const { atomicUpdateSchedule } = require("../server/lib/githubStore");

const ACCOUNTS = ["연리지 실타래", "아해사주", "팔자명가", "팔자궤도", "팔자장인"];
const MIN_GAP_MINUTES = 45;
const MIN_GAP_MS = MIN_GAP_MINUTES * 60 * 1000;
const DRY_RUN = process.argv.includes("--dry-run");

function toKstDateStr(iso) {
  return new Date(new Date(iso).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

async function main() {
  const changes = [];
  await atomicUpdateSchedule((posts) => {
    for (const acct of ACCOUNTS) {
      // scheduled 상태만 조정한다 - 이미 published/failed인 과거 글의 기록은 손대지 않는다.
      const mine = posts.filter(
        (p) => p.accountLabel === acct && p.status === "scheduled" && p.platform !== "instagram" && p.scheduledAt
      );
      const byDate = {};
      mine.forEach((p) => (byDate[toKstDateStr(p.scheduledAt)] = byDate[toKstDateStr(p.scheduledAt)] || []).push(p));
      for (const day of Object.keys(byDate)) {
        const dayPosts = byDate[day].sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
        for (let i = 1; i < dayPosts.length; i++) {
          const prevMs = new Date(dayPosts[i - 1].scheduledAt).getTime();
          const curMs = new Date(dayPosts[i].scheduledAt).getTime();
          if (curMs - prevMs < MIN_GAP_MS) {
            const newMs = prevMs + MIN_GAP_MS;
            changes.push({
              account: acct,
              day,
              id: dayPosts[i].id,
              before: dayPosts[i].scheduledAt,
              after: new Date(newMs).toISOString(),
              text: (dayPosts[i].text || "").slice(0, 30),
            });
            if (!DRY_RUN) dayPosts[i].scheduledAt = new Date(newMs).toISOString();
          }
        }
      }
    }
    return { count: changes.length };
  }, `chore: 시간 겹침 ${changes.length || "N"}건 보정 (최소 ${MIN_GAP_MINUTES}분 간격)`);

  console.log(`${DRY_RUN ? "[dry-run] " : ""}보정 대상: ${changes.length}건`);
  changes.forEach((c) => console.log(` - ${c.account} ${c.day} | ${c.before} -> ${c.after} | ${c.text}`));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
