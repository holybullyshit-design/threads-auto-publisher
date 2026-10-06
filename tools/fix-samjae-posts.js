// 삼재 소재로 쓰인 "아직 발행 전" 글만 찾아서, 연도까지 검증된 새 엔진으로 다시 쓴다.
//
// 배경(2026-10-06 사고): 삼재 판별표(삼합 생지와 충하는 방합)는 맞았는데 사실 블록에 "그 방합이
// 서력 몇 년이냐"가 없어서, AI가 시기를 "내년부터 3년"·"앞으로 3년"으로 지어냈다. 원숭이·쥐·용띠
// (신자진) 삼재는 인묘진년 = 2022~2024에 이미 끝났는데 팔자궤도 10/4 글이 "내년 삼재 명단에
// 이미 올라가 있습니다"로 나가 답글 28건 중 24건이 틀렸다는 지적을 받았다.
// sajuFacts.getSamjaeInfo가 이제 실제 연도·현재 몇 년째·직전 종료연도를 계산하고, 엔진이 그 값을
// 사실로 못 박고 검증까지 하므로 - 남은 예약글을 전부 다시 쓴다.
//
// 글 개수·시각·상태는 건드리지 않고 text/replyChain만 바꾼다. 다시 쓴 글은 samjaeFixed:true로
// 표시해서 재실행 때 건너뛴다.
//
// 사용법: node tools/fix-samjae-posts.js [--dry-run]

require("dotenv").config();
const { readSchedule, writeSchedule } = require("../server/lib/githubStore");
const { writeThreadDraft } = require("../server/skills/taebaekSajuDraftWriter");
const { VIRAL_PROFILES } = require("../server/config/viralProfiles");

const DRY_RUN = process.argv.includes("--dry-run");
const RETRY_ATTEMPTS = 4; // 삼재 검증이 걸려 재시도가 늘 수 있어 한 번 더 준다
const SAJU_ACCOUNTS = ["연리지 실타래", "아해사주", "팔자명가", "팔자궤도", "팔자장인"];
const kst = (iso) => new Date(new Date(iso).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 16).replace("T", " ");
const kstDate = (iso) => new Date(new Date(iso).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);

async function writeWithRetry(args) {
  let lastErr;
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      return await writeThreadDraft(args);
    } catch (err) {
      lastErr = err;
      console.log(`  (시도 ${attempt}/${RETRY_ATTEMPTS} 실패: ${err.message} - 재시도)`);
    }
  }
  throw lastErr;
}

async function saveOneUpdate(postId, newFields, label) {
  const { posts, sha } = await readSchedule();
  const basePosts = posts.slice();
  const updated = posts.map((p) => (p.id === postId ? { ...p, ...newFields } : p));
  await writeSchedule(updated, { sha, message: `fix: 삼재 시기 오류 교정 1건 (${label})`, basePosts });
}

async function main() {
  const { posts } = await readSchedule();
  const targets = posts
    .filter(
      (p) =>
        SAJU_ACCOUNTS.includes(p.accountLabel) &&
        p.platform !== "instagram" &&
        p.status === "scheduled" &&
        p.samjaeFixed !== true &&
        /삼재/.test([p.text, ...(p.replyChain || [])].join("\n"))
    )
    .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));

  console.log(`삼재 소재 예약글: ${targets.length}건 (발행 전만, 이미 교정한 건 건너뜀)`);
  targets.forEach((p) => console.log(`   ${kst(p.scheduledAt)} ${p.accountLabel}${p.commentCta ? " [댓글유도]" : ""}${p.commentAnchor ? " [앵커]" : ""}`));
  if (DRY_RUN) return console.log("[dry-run] 계획만 출력하고 종료.");
  if (targets.length === 0) return console.log("교정할 글이 없습니다. 종료.");

  let done = 0;
  for (let i = 0; i < targets.length; i++) {
    const post = targets[i];
    const profile = VIRAL_PROFILES[post.accountLabel] || null;
    console.log(`[${i + 1}/${targets.length}] 다시 쓰는 중... (${kst(post.scheduledAt)} ${post.accountLabel})`);
    let draft;
    try {
      draft = await writeWithRetry({
        dateKey: kstDate(post.scheduledAt),
        accountLabel: post.accountLabel,
        hitFormula: post.hitFormula === true || undefined,
        ctaMode: post.commentCta === true ? "comment" : undefined,
        domainFraming: profile ? profile.domainFraming : undefined,
        speechLevel: profile ? profile.speechLevel : undefined,
        extraBans: profile ? profile.extraBans : undefined,
        topicPool: profile ? undefined : undefined,
      });
    } catch (err) {
      console.log(`  -> ${RETRY_ATTEMPTS}번 다 실패, 기존 내용 그대로 둠(다음 재실행 때 다시 시도): ${err.message}`);
      continue;
    }
    try {
      await saveOneUpdate(post.id, { text: draft.text, replyChain: draft.replyChain, samjaeFixed: true }, post.accountLabel);
    } catch (err) {
      console.log(`  -> 저장 실패(다음 재실행 때 다시 시도됨): ${err.message}`);
      continue;
    }
    done++;
    console.log(`  -> 교체됨. 소재: ${draft.topic} / 파트 ${1 + draft.replyChain.length}개`);
  }
  console.log(`\n완료: 삼재 예약글 ${done}/${targets.length}건 교정.`);
}

main().catch((err) => {
  console.error("실패:", err);
  process.exit(1);
});
