// 명리 사실 검증기(sajuClaimChecker)에 걸리는 "발행 전" 글을 찾아 다시 쓴다.
//
// 2026-10-06: 전체 1,102건을 검사해 20건이 걸렸다(발행 19 / 예약 1). 발행된 건 되돌릴 수 없으니
// 예약분만 교체한다. 이제 두 생성 엔진 모두 저장 직전에 같은 검사기를 통과해야 하므로, 앞으로
// 새로 만들어지는 글에서는 이 도구가 할 일이 없는 게 정상이다 - 뭔가 걸리면 검사기나 엔진 쪽을 본다.
//
// 사용법: node tools/fix-saju-claims.js [--dry-run]

require("dotenv").config();
const { readSchedule, writeSchedule } = require("../server/lib/githubStore");
const { writeThreadDraft } = require("../server/skills/taebaekSajuDraftWriter");
const { checkSajuClaims } = require("../server/lib/sajuClaimChecker");
const { VIRAL_PROFILES } = require("../server/config/viralProfiles");

const DRY_RUN = process.argv.includes("--dry-run");
const RETRY_ATTEMPTS = 5;
const SAJU = ["연리지 실타래", "아해사주", "팔자명가", "팔자궤도", "팔자장인"];
const kstDate = (iso) => new Date(new Date(iso).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const kst = (iso) => new Date(new Date(iso).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 16).replace("T", " ");

async function main() {
  const { posts } = await readSchedule();
  const targets = [];
  for (const p of posts) {
    if (!SAJU.includes(p.accountLabel) || p.platform === "instagram" || p.status !== "scheduled" || !p.text) continue;
    const issues = checkSajuClaims([p.text, ...(p.replyChain || [])].join("\n"), { dateKey: kstDate(p.scheduledAt) });
    if (issues.length) targets.push({ post: p, issues });
  }

  console.log(`명리 사실 검증에 걸린 예약글: ${targets.length}건`);
  targets.forEach(({ post, issues }) => console.log(`   ${kst(post.scheduledAt)} ${post.accountLabel} → ${issues.join(" / ")}`));
  if (DRY_RUN) return console.log("[dry-run] 계획만 출력하고 종료.");
  if (!targets.length) return console.log("고칠 글이 없습니다. 종료.");

  let done = 0;
  for (let i = 0; i < targets.length; i++) {
    const { post } = targets[i];
    const profile = VIRAL_PROFILES[post.accountLabel] || null;
    console.log(`[${i + 1}/${targets.length}] 다시 쓰는 중... (${kst(post.scheduledAt)} ${post.accountLabel})`);
    let draft = null;
    for (let attempt = 1; attempt <= RETRY_ATTEMPTS && !draft; attempt++) {
      try {
        draft = await writeThreadDraft({
          dateKey: kstDate(post.scheduledAt),
          accountLabel: post.accountLabel,
          hitFormula: post.hitFormula === true || undefined,
          ctaMode: post.commentCta === true ? "comment" : undefined,
          domainFraming: profile ? profile.domainFraming : undefined,
          speechLevel: profile ? profile.speechLevel : undefined,
          extraBans: profile ? profile.extraBans : undefined,
        });
      } catch (err) {
        console.log(`  (시도 ${attempt}/${RETRY_ATTEMPTS} 실패: ${err.message})`);
      }
    }
    if (!draft) {
      console.log("  -> 다 실패, 기존 내용 그대로 둠(다음 재실행 때 다시 시도).");
      continue;
    }
    const { posts: cur, sha } = await readSchedule();
    const basePosts = cur.slice();
    const updated = cur.map((x) => (x.id === post.id ? { ...x, text: draft.text, replyChain: draft.replyChain, claimFixed: true } : x));
    await writeSchedule(updated, { sha, message: `fix: 명리 사실 오류 교정 1건 (${post.accountLabel})`, basePosts });
    done++;
    console.log(`  -> 교체됨. 소재: ${draft.topic}`);
  }
  console.log(`\n완료: ${done}/${targets.length}건 교정.`);
}

main().catch((err) => {
  console.error("실패:", err);
  process.exit(1);
});
