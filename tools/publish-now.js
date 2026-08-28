// 지금 즉시 종합사주 클리프행어 1건을 생성해서 실제로 게시한다 (예약 아님).
// taebaekSajuDraftWriter 엔진 그대로 쓰고, 본문 게시 -> 답글로 이어붙이는 체인 게시까지
// cloud/publish-scheduled.js와 같은 방식으로 처리한 뒤 schedule/posts.json에 "published"
// 상태로 기록한다(다른 게시물들과 동일한 스키마 유지).
//
// 사용법: node tools/publish-now.js "<계정라벨>"

require("dotenv").config();
const crypto = require("crypto");
const accountsStore = require("../server/lib/accountsStore");
const { readSchedule, writeSchedule } = require("../server/lib/githubStore");
const { publishTextPost } = require("../server/lib/threadsClient");
const { writeThreadDraft } = require("../server/skills/taebaekSajuDraftWriter");

const ACCOUNT_LABEL = process.argv[2];
if (!ACCOUNT_LABEL) {
  console.error('사용법: node tools/publish-now.js "<계정라벨>"');
  process.exit(1);
}

async function main() {
  const account = accountsStore.listAccounts().find((a) => a.label === ACCOUNT_LABEL);
  if (!account) throw new Error(`계정을 찾을 수 없습니다: "${ACCOUNT_LABEL}"`);
  const secret = accountsStore.getAccountSecret(account.id);

  console.log(`계정 확인됨: ${account.label} (${account.id})`);
  console.log("생성 중...");
  const draft = await writeThreadDraft({ accountLabel: ACCOUNT_LABEL });
  console.log(`소재: ${draft.topic} / 훅: ${draft.hookFormat} / 파트 ${1 + draft.replyChain.length}개`);

  console.log("본문 게시 중...");
  const main = await publishTextPost({
    text: draft.text,
    accessToken: secret.accessToken,
    threadsUserId: secret.threadsUserId,
  });
  const chainPublishedIds = [main.publishedId];
  let lastId = main.publishedId;
  console.log(`  -> 본문 게시됨: ${main.publishedId}`);

  for (let i = 0; i < draft.replyChain.length; i++) {
    console.log(`답글 ${i + 1}/${draft.replyChain.length} 게시 중...`);
    const reply = await publishTextPost({
      text: draft.replyChain[i],
      replyToId: lastId,
      accessToken: secret.accessToken,
      threadsUserId: secret.threadsUserId,
    });
    chainPublishedIds.push(reply.publishedId);
    lastId = reply.publishedId;
    console.log(`  -> 게시됨: ${reply.publishedId}`);
  }

  const { posts, sha } = await readSchedule();
  const basePosts = posts.slice();
  const now = new Date().toISOString();
  const record = {
    id: crypto.randomUUID(),
    accountId: account.id,
    accountLabel: account.label,
    text: draft.text,
    replyChain: draft.replyChain,
    chainPublishedIds,
    status: "published",
    scheduledAt: now,
    createdAt: now,
    publishedAt: now,
    publishedId: main.publishedId,
    error: null,
  };
  await writeSchedule(posts.concat([record]), { sha, message: `chore: record immediate publish for ${ACCOUNT_LABEL}`, basePosts });

  console.log(`\n완료: ${ACCOUNT_LABEL} 계정에 ${chainPublishedIds.length}파트 전부 실제 게시함.`);
}

main().catch((err) => {
  console.error("실패:", err);
  process.exit(1);
});
