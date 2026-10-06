// 이미 예약된 글 중 "날짜별 마지막 1개"만 댓글유도형 CTA(생년월일시를 댓글로 받는 마무리)로
// 다시 써서 교체한다. 글 개수·시각은 전혀 바뀌지 않고, 그 하루치의 마지막 글 내용만 바뀐다.
//
// 배경(2026-10-06 실측): 팔자장인·팔자궤도는 조회수가 가장 높은데(주간 6.8만·10.6만) 리드가
// 거의 안 생긴다. 추적 150건 기준 답글률 0.32%/0.33%로 전 계정 최하위고, 생년월일을 받는 글이
// 150건 중 7건·5건밖에 없었다. 그 소수의 글만 떼어 보면 답글률이 0.80%·0.65%로 **2.4~2.6배**
// 높았다(그 외 글은 0.31%·0.32%). 조회를 더 올리는 것보다 "받는 글"을 매일 하나 넣는 쪽이
// 리드에 직접 꽂힌다는 판단 - 연리지실타래/아해사주가 이미 그 구조로 운영된다(CLAUDE.md 참고).
//
// 안전장치: status가 "scheduled"인 글만, text/replyChain만 바꾼다. 이미 바꾼 글은
// commentCta=true로 표시해서 재실행 때 건너뛴다. 연리지/아해사주의 별도 경로 댓글유도 글
// (commentAnchor)은 대상에서 제외한다.
//
// 사용법:
//   node tools/add-comment-cta.js "<팔자장인|팔자궤도>" <시작일> <종료일 YYYY-MM-DD> [--dry-run]

require("dotenv").config();
const accountsStore = require("../server/lib/accountsStore");
const { readSchedule, writeSchedule } = require("../server/lib/githubStore");
const { writeThreadDraft } = require("../server/skills/taebaekSajuDraftWriter");

const RETRY_ATTEMPTS = 3;
const DRY_RUN = process.argv.includes("--dry-run");
const ACCOUNT_LABEL = process.argv[2];
const START_DATE = process.argv[3];
const END_DATE = process.argv[4];

if (!ACCOUNT_LABEL || !START_DATE || !END_DATE) {
  console.error('사용법: node tools/add-comment-cta.js "<계정라벨>" <시작일 YYYY-MM-DD> <종료일 YYYY-MM-DD> [--dry-run]');
  process.exit(1);
}

const kstDate = (iso) => new Date(new Date(iso).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const kstTime = (iso) => new Date(new Date(iso).getTime() + 9 * 3600 * 1000).toISOString().slice(11, 16);

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

async function saveOneUpdate(postId, newFields) {
  const { posts, sha } = await readSchedule();
  const basePosts = posts.slice();
  const updated = posts.map((p) => (p.id === postId ? { ...p, ...newFields } : p));
  await writeSchedule(updated, { sha, message: `chore: comment CTA for 1 post (${ACCOUNT_LABEL})`, basePosts });
}

async function main() {
  const account = accountsStore.listAccounts().find((a) => a.label === ACCOUNT_LABEL);
  if (!account) throw new Error(`계정을 찾을 수 없습니다: "${ACCOUNT_LABEL}"`);

  const start = new Date(`${START_DATE}T00:00:00+09:00`);
  const end = new Date(`${END_DATE}T23:59:59+09:00`);
  const { posts } = await readSchedule();

  const mine = posts
    .filter(
      (p) =>
        p.accountId === account.id &&
        p.platform !== "instagram" &&
        p.status === "scheduled" &&
        p.commentAnchor !== true &&
        new Date(p.scheduledAt) >= start &&
        new Date(p.scheduledAt) <= end
    )
    .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));

  // 날짜별 마지막 글 하나씩. 그 날에 이미 댓글유도 글이 있으면 건너뛴다.
  const byDate = {};
  mine.forEach((p) => ((byDate[kstDate(p.scheduledAt)] = byDate[kstDate(p.scheduledAt)] || []).push(p)));
  const targets = [];
  for (const date of Object.keys(byDate).sort()) {
    const list = byDate[date];
    if (list.some((p) => p.commentCta === true)) {
      console.log(`  ${date}: 이미 댓글유도 글이 있어 건너뜀`);
      continue;
    }
    targets.push(list[list.length - 1]);
  }

  console.log(`계정: ${account.label} / 댓글유도로 바꿀 글: ${targets.length}개 (${START_DATE} ~ ${END_DATE})`);
  targets.forEach((p) => console.log(`   ${kstDate(p.scheduledAt)} ${kstTime(p.scheduledAt)}`));
  if (DRY_RUN) {
    console.log("[dry-run] 계획만 출력하고 종료 - 글 생성/저장 안 함.");
    return;
  }
  if (targets.length === 0) return console.log("바꿀 글이 없습니다. 종료.");

  let done = 0;
  for (let i = 0; i < targets.length; i++) {
    const post = targets[i];
    const dateKey = kstDate(post.scheduledAt);
    console.log(`[${i + 1}/${targets.length}] 다시 쓰는 중... (${dateKey} ${kstTime(post.scheduledAt)} KST)`);
    let draft;
    try {
      draft = await writeWithRetry({ dateKey, accountLabel: ACCOUNT_LABEL, hitFormula: true, ctaMode: "comment" });
    } catch (err) {
      console.log(`  -> ${RETRY_ATTEMPTS}번 다 실패, 기존 내용 그대로 둠: ${err.message}`);
      continue;
    }
    try {
      await saveOneUpdate(post.id, {
        text: draft.text,
        replyChain: draft.replyChain,
        commentCta: true,
        hitFormula: true,
      });
    } catch (err) {
      console.log(`  -> 저장 실패(다음 재실행 때 다시 시도됨): ${err.message}`);
      continue;
    }
    done++;
    console.log(`  -> 교체됨. 소재: ${draft.topic} / 훅: ${draft.hookFormat} / 파트 ${1 + draft.replyChain.length}개 / 댓글유도`);
  }
  console.log(`\n완료: ${ACCOUNT_LABEL} - ${done}/${targets.length}건 댓글유도로 교체 (${START_DATE} ~ ${END_DATE}).`);
}

main().catch((err) => {
  console.error("실패:", err);
  process.exit(1);
});
