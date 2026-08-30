// 이미 예약돼 있는(아직 발행 전) 글의 "내용만" 새 훅/마무리 다양화 엔진으로 다시 써서
// 교체한다. fill-schedule.js와 달리 이건 빈 슬롯을 채우는 게 아니라 기존 글을 대체하는
// 거라 훨씬 조심스럽게 다룬다:
//   - status가 정확히 "scheduled"인 글만 건드린다(published/canceled/failed는 절대 손 안 댐).
//   - id, accountId, scheduledAt, status는 그대로 두고 text/replyChain만 바꾼다.
//   - 취소나 삭제는 절대 하지 않는다 - 매수(개수)는 실행 전후 항상 동일해야 한다.
//   - 한 번에 하나씩 GitHub에 저장한다(githubStore rebase) - 중간에 실패해도 이미 바꾼
//     것들은 남는다.
//   - 이미 이번 엔진으로 다시 쓴 글은 post.regenV2=true로 표시해서, 사용량 한도 등으로
//     중간에 멈췄다가 다시 실행해도 안 겹치고 이어서 처리된다(fill-schedule.js의
//     "이미 채워진 건 건너뛴다"와 같은 원칙).
//
// 사용법:
//   node tools/regenerate-scheduled.js "<팔자명가|팔자궤도|팔자장인>" <시작일> <종료일 YYYY-MM-DD>

require("dotenv").config();
const accountsStore = require("../server/lib/accountsStore");
const { readSchedule, writeSchedule } = require("../server/lib/githubStore");
const { writeThreadDraft, pickTopicIds, pickHookFormatIds } = require("../server/skills/taebaekSajuDraftWriter");

const RETRY_ATTEMPTS = 3;

const ACCOUNT_LABEL = process.argv[2];
const START_DATE = process.argv[3];
const END_DATE = process.argv[4];

if (!ACCOUNT_LABEL || !START_DATE || !END_DATE) {
  console.error('사용법: node tools/regenerate-scheduled.js "<계정라벨>" <시작일 YYYY-MM-DD> <종료일 YYYY-MM-DD>');
  process.exit(1);
}

function findAccount() {
  return accountsStore.listAccounts().find((a) => a.label === ACCOUNT_LABEL);
}

function kstDateKey(iso) {
  const k = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
  return k.toISOString().slice(0, 10);
}

async function writeThreadDraftWithRetry(args) {
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

// 대상 글 하나를 새 내용으로 교체해서 즉시 저장한다(rebase 방식 - 그 사이 다른 곳이 바꾼
// 내용은 그대로 두고 이 글 하나만 갱신).
async function saveOneUpdate(postId, newFields) {
  const { posts, sha } = await readSchedule();
  const basePosts = posts.slice();
  const updated = posts.map((p) => (p.id === postId ? { ...p, ...newFields } : p));
  await writeSchedule(updated, { sha, message: `chore: regenerate 1 post (${ACCOUNT_LABEL})`, basePosts });
}

async function main() {
  const account = findAccount();
  if (!account) throw new Error(`계정을 찾을 수 없습니다: "${ACCOUNT_LABEL}"`);

  const start = new Date(`${START_DATE}T00:00:00+09:00`);
  const end = new Date(`${END_DATE}T23:59:59+09:00`);

  const { posts } = await readSchedule();
  const targets = posts
    .filter(
      (p) =>
        p.accountId === account.id &&
        p.platform !== "instagram" &&
        p.status === "scheduled" &&
        !p.regenV2 &&
        new Date(p.scheduledAt) >= start &&
        new Date(p.scheduledAt) <= end
    )
    .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));

  console.log(`계정: ${account.label} / 대상: ${targets.length}개 (${START_DATE} ~ ${END_DATE}, 이미 새 엔진으로 다시 쓴 글은 건너뜀)`);
  if (targets.length === 0) {
    console.log("다시 쓸 글이 없습니다. 종료.");
    return;
  }

  const topicIds = pickTopicIds(targets.length);
  const hookFormatIds = pickHookFormatIds(targets.length);

  let done = 0;
  for (let i = 0; i < targets.length; i++) {
    const post = targets[i];
    const dateKey = kstDateKey(post.scheduledAt);
    console.log(`[${i + 1}/${targets.length}] 다시 쓰는 중... (예정: ${dateKey} ${post.scheduledAt})`);
    let draft;
    try {
      draft = await writeThreadDraftWithRetry({
        dateKey,
        topicId: topicIds[i],
        hookFormatId: hookFormatIds[i],
        accountLabel: ACCOUNT_LABEL,
      });
    } catch (err) {
      console.log(`  -> ${RETRY_ATTEMPTS}번 다 실패, 이 글은 기존 내용 그대로 둠: ${err.message}`);
      continue;
    }
    // 저장 자체가 실패해도(GitHub 동시 쓰기 충돌 등) 이 글 하나만 건너뛰고 나머지는 계속
    // 처리한다 - 안 그러면 배치 중간에 한 번 충돌났다고 뒤에 남은 글 전부가 처리 안 된 채로
    // 스크립트가 죽어버린다(2026-08-30 실측: 42/55에서 이렇게 멈췄었음). regenV2 표시가
    // 안 붙은 글은 다음 재실행 때 다시 시도된다.
    try {
      await saveOneUpdate(post.id, { text: draft.text, replyChain: draft.replyChain, regenV2: true });
    } catch (err) {
      console.log(`  -> 저장 실패(다음 재실행 때 다시 시도됨): ${err.message}`);
      continue;
    }
    done++;
    console.log(`  -> 교체됨. 소재: ${draft.topic} / 훅: ${draft.hookFormat} / 파트 ${1 + draft.replyChain.length}개`);
  }

  console.log(`\n완료: ${ACCOUNT_LABEL} - ${done}/${targets.length}건 교체 (${START_DATE} ~ ${END_DATE}).`);
}

main().catch((err) => {
  console.error("실패:", err);
  process.exit(1);
});
