// 취소(canceled) 상태로 남아있던 예약 글을 schedule/posts.json에서 완전히 삭제한다.
// (기존엔 취소돼도 status만 바뀌고 레코드는 남아있어서, 날짜 클릭 시 상세 목록에 계속 보였음
// - 2026-09-02 사용자 요청으로 완전 삭제로 변경. dedup/중복확인 로직은 전부 이미
// status!=="canceled"로 걸러서 보고 있어서(githubStore.js 등), 삭제해도 안전함 - grep 확인함.)
//
// 사용법: node tools/purge-canceled.js
require("dotenv").config();
const { atomicUpdateSchedule } = require("../server/lib/githubStore");

async function main() {
  const removedSummary = [];
  const { removed } = await atomicUpdateSchedule((posts) => {
    const keep = [];
    let removed = 0;
    for (const p of posts) {
      if (p.status === "canceled" || p.status === "cancelled") {
        removed++;
        removedSummary.push(`${p.scheduledAt} ${p.accountLabel} ${(p.text || "").slice(0, 30)}`);
        continue;
      }
      keep.push(p);
    }
    posts.length = 0;
    posts.push(...keep);
    return { removed };
  }, "chore: 취소된 예약 글 완전 삭제");
  console.log(`삭제된 건수: ${removed}`);
  removedSummary.forEach((s) => console.log(" -", s));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
