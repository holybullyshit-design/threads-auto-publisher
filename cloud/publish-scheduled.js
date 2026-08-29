// GitHub Actions에서 5분마다 실행되는 스크립트.
// schedule/posts.json을 읽어 시간이 된 예약 글을 Threads/Instagram에 게시하고,
// 결과를 같은 파일에 다시 기록한다.
//
// 2026-08-29: 실제로 같은 글이 두 번 게시되는 사고가 있었다 (엄마가 직접 써본 꿀템 계정).
// 원인 두 가지를 같이 고쳤다:
//   1) 예전엔 이 스크립트가 로컬 파일을 읽고/쓰고, 워크플로 yaml이 따로 `git commit && git push`
//      했다. 로컬 앱에서 schedule/posts.json을 수정하는 다른 작업(githubStore.js, GitHub Contents
//      API로 직접 씀)과 동시에 돌면, 이 위치의 plain `git push`가 non-fast-forward로 실패할 수
//      있는데 - 그러면 "방금 실제로 게시했다"는 상태가 통째로 유실된 채 끝나버린다. 다음 실행이
//      그 글을 여전히 "scheduled"로 보고 다시 게시 -> 중복 게시.
//   2) due 목록에 여러 건이 있을 때, 끝에 딱 한 번만 저장했다. 그래서 1번 글은 실제로 잘
//      게시됐는데 2번 글 처리 중 어떤 이유로든(캐치 안 된 예외 등) 스크립트가 죽으면, 1번 글의
//      "published" 기록조차 저장 안 된 채 끝난다 - 다음 실행이 1번 글을 또 게시.
// 해결: (1) 로컬 스크립트들과 완전히 같은 저장 경로(githubStore.js - Contents API + id 기준
// rebase 재시도)를 쓰고, (2) 게시 결과를 "글 하나 처리할 때마다 바로" 저장한다(끝에 몰아서 X).
// 이러면 워크플로 yaml의 별도 git commit/push 단계도 더 이상 필요 없다.
//
// 필요한 환경변수:
//   THREADS_ACCOUNTS_JSON - [{id, label, threadsUserId, accessToken}, ...] 형태의 JSON 문자열
//   GITHUB_TOKEN / GITHUB_REPO - githubStore.js가 schedule/posts.json을 읽고 쓰는 데 씀
//                                (GitHub Actions에서는 자동 토큰 + github.repository로 채움)

const { publishTextPost, publishImagePost } = require("../server/lib/threadsClient");
const { publishCarousel, findPublishedByMarker } = require("../server/lib/instagramClient");
const { readSchedule, writeSchedule } = require("../server/lib/githubStore");

const MAX_AUTO_RETRIES = 3;

function loadAccounts() {
  const raw = process.env.THREADS_ACCOUNTS_JSON;
  if (!raw) {
    throw new Error("THREADS_ACCOUNTS_JSON 시크릿이 설정되지 않았습니다.");
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error("THREADS_ACCOUNTS_JSON 파싱에 실패했습니다: " + e.message);
  }
}

// 방금 처리한 post 하나의 결과 필드만, 최신 원격 상태 위에 다시 얹어서 즉시 저장한다.
// (전체 posts를 끝에 몰아서 한 번에 저장하지 않는다 - 위 설명 참고)
async function persistPostResult(postId, fields) {
  const { posts, sha } = await readSchedule();
  const basePosts = posts.slice();
  const target = posts.find((p) => p.id === postId);
  if (!target) {
    console.error(`[경고] ${postId} 글을 최신 목록에서 못 찾았습니다 - 결과 저장을 건너뜁니다.`);
    return;
  }
  Object.assign(target, fields);
  await writeSchedule(posts, { sha, message: `chore: update status for ${postId} [skip ci]`, basePosts });
}

async function main() {
  const { posts } = await readSchedule();
  const now = new Date();

  const due = posts.filter((p) => p.status === "scheduled" && new Date(p.scheduledAt) <= now);

  if (due.length === 0) {
    console.log("게시할 예약 글이 없습니다.");
    return;
  }

  for (const post of due) {
    if (post.platform === "instagram") {
      try {
        if (post.validation?.status !== "passed" || !post.contentHash) throw Object.assign(new Error("검수 통과 증거가 없어 게시를 차단했습니다."), { code: "VALIDATION_REQUIRED" });
        const marker = `#팔자명가${String(post.expectedLocalDate).replaceAll("-", "")}`;
        const existing = await findPublishedByMarker(marker);
        const result = existing ? { publishedId: existing.id, recoveredDuplicate: true } : await publishCarousel({ imageUrls: post.images, caption: post.text });
        console.log(`[인스타그램 성공] ${post.id} → ${result.publishedId}${result.recoveredDuplicate ? " (기존 게시물 회수)" : ""}`);
        await persistPostResult(post.id, { status: "published", publishedAt: new Date().toISOString(), publishedId: result.publishedId, error: null });
      } catch (err) {
        const retryCount = (post.retryCount || 0) + 1;
        const fatal = ["VALIDATION_REQUIRED", "INVALID_CAROUSEL", "INVALID_CAPTION", "INVALID_IMAGE_URL", "MISSING_INSTAGRAM_CONFIG"].includes(err.code);
        const status = fatal || retryCount >= MAX_AUTO_RETRIES ? "failed" : "scheduled";
        console.error(`[인스타그램 ${status === "failed" ? "최종 실패" : "재시도 예정"}] ${post.id}: ${err.message}`);
        await persistPostResult(post.id, { status, retryCount, error: err.message });
      }
      continue;
    }

    // "팔자장인" 스타일: 본문 + 답글 여러 개가 이어지는 클리프행어 스레드.
    // chainPublishedIds에 "지금까지 실제로 올라간 파트들의 id"를 순서대로 기록해두고,
    // 재시도할 땐 거기부터 이어서 게시한다 — 안 그러면 재시도할 때마다 이미 올라간
    // 앞부분까지 중복으로 다시 올라갈 위험이 있다.
    if (Array.isArray(post.replyChain) && post.replyChain.length > 0) {
      const chainAccounts = loadAccounts();
      const chainAccount = chainAccounts.find((a) => a.id === post.accountId);
      if (!chainAccount) {
        const error = `계정을 찾을 수 없습니다 (accountId: ${post.accountId}). THREADS_ACCOUNTS_JSON 시크릿을 최신 상태로 갱신해주세요.`;
        console.error(`[실패] ${post.id}: ${error}`);
        await persistPostResult(post.id, { status: "failed", error });
        continue;
      }
      try {
        const progress = Array.isArray(post.chainPublishedIds) ? post.chainPublishedIds.slice() : [];
        let lastId = progress.length ? progress[progress.length - 1] : null;

        if (progress.length === 0) {
          const result = await publishTextPost({
            text: post.text,
            accessToken: chainAccount.accessToken,
            threadsUserId: chainAccount.threadsUserId,
          });
          progress.push(result.publishedId);
          lastId = result.publishedId;
          // 본문이 올라간 즉시 바로 저장 - 이 시점 이후 스크립트가 죽어도 다음 실행이
          // chainPublishedIds를 보고 답글부터 이어서 게시하지, 본문을 또 올리지 않는다.
          await persistPostResult(post.id, { chainPublishedIds: progress, publishedId: result.publishedId });
        }

        // progress[0]=본문이므로, 아직 안 올라간 답글은 (progress.length - 1)번째부터.
        const remainingParts = post.replyChain.slice(progress.length - 1);
        for (const part of remainingParts) {
          const reply = await publishTextPost({
            text: part,
            replyToId: lastId,
            accessToken: chainAccount.accessToken,
            threadsUserId: chainAccount.threadsUserId,
          });
          progress.push(reply.publishedId);
          lastId = reply.publishedId;
          await persistPostResult(post.id, { chainPublishedIds: progress });
        }

        console.log(`[팔자장인 체인 성공] ${post.id} → ${progress.length}파트 전부 게시`);
        await persistPostResult(post.id, { status: "published", publishedAt: new Date().toISOString(), error: null });
      } catch (err) {
        const retryCount = (post.retryCount || 0) + 1;
        if (retryCount < MAX_AUTO_RETRIES) {
          console.error(`[팔자장인 체인 재시도 예정 ${retryCount}/${MAX_AUTO_RETRIES}] ${post.id}: ${err.message}`);
          await persistPostResult(post.id, { retryCount, error: err.message });
        } else {
          console.error(`[팔자장인 체인 최종 실패] ${post.id}: ${err.message}`);
          await persistPostResult(post.id, { status: "failed", retryCount, error: err.message });
        }
      }
      continue;
    }

    const accounts = loadAccounts();
    const account = accounts.find((a) => a.id === post.accountId);
    if (!account) {
      const error = `계정을 찾을 수 없습니다 (accountId: ${post.accountId}). THREADS_ACCOUNTS_JSON 시크릿을 최신 상태로 갱신해주세요.`;
      console.error(`[실패] ${post.id}: ${error}`);
      await persistPostResult(post.id, { status: "failed", error });
      continue;
    }

    try {
      const result =
        Array.isArray(post.images) && post.images.length > 0
          ? await publishImagePost({
              text: post.text,
              imageUrls: post.images,
              accessToken: account.accessToken,
              threadsUserId: account.threadsUserId,
            })
          : await publishTextPost({
              text: post.text,
              accessToken: account.accessToken,
              threadsUserId: account.threadsUserId,
            });

      console.log(`[성공] ${post.id} → ${result.publishedId}`);
      // 게시 성공한 즉시 바로 저장 - 답글(제휴 링크) 게시가 실패하더라도, 본문이 이미
      // "published"로 기록돼 있어서 다음 실행이 본문을 또 게시할 일은 없다.
      await persistPostResult(post.id, { status: "published", publishedAt: new Date().toISOString(), publishedId: result.publishedId, error: null });

      // 파트너스: 본문 게시 직후, 제휴 링크를 답글로 자동으로 단다.
      if (post.replyText) {
        try {
          const reply = await publishTextPost({
            text: post.replyText,
            replyToId: result.publishedId,
            accessToken: account.accessToken,
            threadsUserId: account.threadsUserId,
          });
          console.log(`[답글 성공] ${post.id} → ${reply.publishedId}`);
        } catch (err) {
          console.error(`[답글 실패] ${post.id}: ${err.message}`);
        }
      }
    } catch (err) {
      const retryCount = (post.retryCount || 0) + 1;
      if (retryCount < MAX_AUTO_RETRIES) {
        // status는 "scheduled"로 그대로 둔다 -> 다음 실행에 자동으로 다시 시도된다.
        console.error(`[재시도 예정 ${retryCount}/${MAX_AUTO_RETRIES}] ${post.id}: ${err.message}`);
        await persistPostResult(post.id, { retryCount, error: err.message });
      } else {
        console.error(`[최종 실패, ${MAX_AUTO_RETRIES}회 재시도 소진] ${post.id}: ${err.message}`);
        await persistPostResult(post.id, { status: "failed", retryCount, error: err.message });
      }
    }
  }
}

main().catch((err) => {
  console.error("스케줄 발행 스크립트 실행 중 오류:", err);
  process.exit(1);
});
