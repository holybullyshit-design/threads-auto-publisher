// 사주 5계정의 "아직 발행되지 않은" 예약글을 날짜 범위로 완전 삭제한다.
// 템플릿 포화 같은 이유로 예약분을 통째로 다시 쓸 때 쓴다(2026-10-30 첫 사용).
//
// 안전장치:
//  - status가 'scheduled'인 것만 지운다(published는 절대 건드리지 않는다).
//  - 시작일이 오늘(KST)보다 이르면 거부한다 - 이미 지난 글을 지우는 사고를 막는다.
//  - --dry-run이 기본 사용법이다. 실제 삭제는 --yes를 같이 줘야 한다.
//
// 사용법:
//   node tools/purge-scheduled-range.js <시작일> <종료일> [--account="계정명"] [--yes]
//
// --account를 주면 그 계정만 지운다(2026-10-30: 팔자명가 발행 중단에 사용).

require("dotenv").config();
const { atomicUpdateSchedule, readSchedule } = require("../server/lib/githubStore");

const SAJU = ["연리지 실타래", "아해사주", "팔자명가", "팔자궤도", "팔자장인"];
const FROM = process.argv[2];
const TO = process.argv[3];
const CONFIRMED = process.argv.includes("--yes");
const ACCOUNT = (process.argv.find((a) => a.startsWith("--account=")) || "").split("=").slice(1).join("=");

if (ACCOUNT && !SAJU.includes(ACCOUNT)) {
  console.error(`거부: 알 수 없는 계정 "${ACCOUNT}". 사주 5계정 중 하나여야 합니다 - ${SAJU.join(" / ")}`);
  process.exit(1);
}

if (!/^\d{4}-\d{2}-\d{2}$/.test(FROM || "") || !/^\d{4}-\d{2}-\d{2}$/.test(TO || "")) {
  console.error('사용법: node tools/purge-scheduled-range.js <시작일 YYYY-MM-DD> <종료일 YYYY-MM-DD> [--account="계정명"] [--yes]');
  process.exit(1);
}

const kstDate = (s) => new Date(new Date(s).getTime() + 9 * 3600000).toISOString().slice(0, 10);
const todayKst = kstDate(new Date().toISOString());

if (FROM < todayKst) {
  console.error(`거부: 시작일(${FROM})이 오늘(${todayKst})보다 이릅니다. 지난 날짜는 지우지 않습니다.`);
  process.exit(1);
}

function targets(posts) {
  return posts.filter(
    (p) =>
      SAJU.includes(p.accountLabel) &&
      (!ACCOUNT || p.accountLabel === ACCOUNT) &&
      p.platform !== "instagram" &&
      p.status === "scheduled" &&
      p.scheduledAt &&
      kstDate(p.scheduledAt) >= FROM &&
      kstDate(p.scheduledAt) <= TO
  );
}

(async () => {
  const { posts } = await readSchedule();
  const hit = targets(posts);
  const byAcct = {};
  for (const p of hit) byAcct[p.accountLabel] = (byAcct[p.accountLabel] || 0) + 1;

  console.log(`대상: ${FROM} ~ ${TO} / status=scheduled / ${ACCOUNT || "사주 5계정"}${ACCOUNT ? "" : ""} / platform=threads`);
  console.log(`지울 글: ${hit.length}건`, JSON.stringify(byAcct));
  console.log(`  그중 댓글유도(앵커): ${hit.filter((p) => p.commentAnchor).length}건 / 댓글CTA: ${hit.filter((p) => p.commentCta).length}건`);
  const published = posts.filter(
    (p) => SAJU.includes(p.accountLabel) && (!ACCOUNT || p.accountLabel === ACCOUNT) && p.status === "published" && p.publishedAt && kstDate(p.publishedAt) >= FROM
  ).length;
  console.log(`  (같은 범위에서 이미 발행된 글 ${published}건은 건드리지 않습니다)`);

  if (!CONFIRMED) {
    console.log("\n[dry-run] 실제로 지우려면 --yes 를 붙이세요.");
    return;
  }

  // atomicUpdateSchedule은 mutate에 **posts 배열**을 넘기고, 그 배열을 제자리에서 바꾸길
  // 기대한다(반환값이 아니라 배열 자체를 비교해 변경 여부를 판단한다). 새 객체를 돌려주면
  // 아무 일도 일어나지 않는다.
  const removedIds = new Set(hit.map((p) => p.id));
  await atomicUpdateSchedule((posts) => {
    for (let i = posts.length - 1; i >= 0; i--) {
      if (removedIds.has(posts[i].id)) posts.splice(i, 1);
    }
  }, `chore: purge ${hit.length} scheduled ${ACCOUNT || "saju"} posts (${FROM}~${TO})`);
  const after = await readSchedule();
  console.log(`\n삭제 완료. 남은 대상: ${targets(after.posts).length}건 (0이어야 정상)`);
})();
