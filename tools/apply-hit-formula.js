// 예약된 글 중 "하루 1개"만 골라서, 우리 채널 실측 "터진 글 공식"(CLAUDE.md 참고)으로 다시 쓴다.
// 계정마다 조회수가 가장 잘 나오는 시간대 슬롯을 고른다(2026-09-23 실측 평균 조회수 기준).
//   팔자장인/팔자궤도 = 그날 첫 글(07~09시), 연리지 실타래 = 13~15시, 아해사주 = 07~09시
//   (아해사주는 16~18시가 가장 높지만 그 자리엔 댓글유도 글이 이미 있어서 다음으로 높은 슬롯을 쓴다)
// 댓글유도 글(다른 경로에서 생성된 글, 그리고 우리가 만든 ctaMode:comment 글)은 대상에서 제외한다.
//
// 사용법: node tools/apply-hit-formula.js <시작일> <종료일> [--dry-run]
require("dotenv").config();
const { readSchedule, writeSchedule } = require("../server/lib/githubStore");
const { writeThreadDraft, COMMENT_CTA_POOL } = require("../server/skills/taebaekSajuDraftWriter");
const { VIRAL_PROFILES } = require("../server/config/viralProfiles");
const { TOPICS } = require("../server/skills/taebaekSajuDraftWriter");

const START = process.argv[2], END = process.argv[3];
const DRY = process.argv.includes("--dry-run");
if (!START || !END) { console.error("사용법: node tools/apply-hit-formula.js <시작일> <종료일> [--dry-run]"); process.exit(1); }

// 계정별 목표 시간대(KST 분 단위 중앙값) - 이 시각에 가장 가까운 글을 고른다
const TARGET_MIN = { "팔자장인": 8 * 60, "팔자궤도": 8 * 60, "연리지 실타래": 14 * 60, "아해사주": 8 * 60 };
const kD = (i) => new Date(new Date(i).getTime() + 9 * 3600e3).toISOString().slice(0, 10);
const kMin = (i) => { const d = new Date(new Date(i).getTime() + 9 * 3600e3); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
const kT = (i) => new Date(new Date(i).getTime() + 9 * 3600e3).toISOString().slice(11, 16);
const isCommentPost = (p) => {
  const j = [p.text, ...(p.replyChain || [])].join("\n");
  return /생년월일/.test(j) || COMMENT_CTA_POOL.some((c) => j.includes(c));
};

async function saveOne(postId, fields) {
  const { posts, sha } = await readSchedule();
  const basePosts = posts.slice();
  await writeSchedule(posts.map((p) => (p.id === postId ? { ...p, ...fields } : p)),
    { sha, message: "chore: 터진 글 공식 적용 1건", basePosts });
}

(async () => {
  const { posts } = await readSchedule();
  const now = Date.now();
  const picks = [];
  for (const acct of Object.keys(TARGET_MIN)) {
    const mine = posts.filter((p) => p.accountLabel === acct && p.platform !== "instagram" && p.status === "scheduled"
      && kD(p.scheduledAt) >= START && kD(p.scheduledAt) <= END
      && new Date(p.scheduledAt).getTime() > now + 30 * 60000
      && !p.hitFormula && !isCommentPost(p));
    const byDate = {};
    mine.forEach((p) => ((byDate[kD(p.scheduledAt)] = byDate[kD(p.scheduledAt)] || []).push(p)));
    Object.keys(byDate).sort().forEach((d) => {
      const best = byDate[d].sort((a, b) => Math.abs(kMin(a.scheduledAt) - TARGET_MIN[acct]) - Math.abs(kMin(b.scheduledAt) - TARGET_MIN[acct]))[0];
      picks.push({ acct, date: d, post: best });
    });
  }
  picks.sort((a, b) => (a.date === b.date ? a.acct.localeCompare(b.acct) : a.date.localeCompare(b.date)));
  console.log(`대상: ${picks.length}건 (${START} ~ ${END}, 하루 계정당 1건)`);
  picks.forEach((x) => console.log(`  ${x.date} ${kT(x.post.scheduledAt)} ${x.acct}`));
  if (DRY) { console.log("[dry-run] 내용은 바꾸지 않음"); return; }

  let done = 0;
  for (const [i, x] of picks.entries()) {
    const profile = VIRAL_PROFILES[x.acct] || null;
    console.log(`[${i + 1}/${picks.length}] ${x.acct} ${x.date} ${kT(x.post.scheduledAt)} 다시 쓰는 중...`);
    let draft = null;
    for (let attempt = 1; attempt <= 3 && !draft; attempt++) {
      try {
        draft = await writeThreadDraft({
          dateKey: x.date,
          accountLabel: x.acct,
          hitFormula: true,
          topicPool: profile ? TOPICS.filter((t) => profile.topicIds.includes(t.id)) : undefined,
          domainFraming: profile ? profile.domainFraming : undefined,
          speechLevel: profile ? profile.speechLevel : undefined,
          extraBans: profile ? profile.extraBans : undefined,
        });
      } catch (e) { console.log(`   (시도 ${attempt}/3 실패: ${e.message.slice(0, 70)})`); }
    }
    if (!draft) { console.log("   -> 3번 다 실패, 기존 글 유지"); continue; }
    try {
      await saveOne(x.post.id, { text: draft.text, replyChain: draft.replyChain, hitFormula: true, regenV3: true });
      done++;
      console.log(`   -> 적용됨. 소재: ${draft.topic} / 훅: ${draft.hookFormat} / 파트 ${1 + draft.replyChain.length}개`);
    } catch (e) { console.log(`   -> 저장 실패(재실행 시 다시 시도됨): ${e.message.slice(0, 60)}`); }
  }
  console.log(`\n완료: ${done}/${picks.length}건 적용`);
})().catch((e) => { console.error("실패:", e); process.exit(1); });
