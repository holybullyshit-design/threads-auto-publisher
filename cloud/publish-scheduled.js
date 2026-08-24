// GitHub Actions에서 주기적으로 실행되는 스크립트.
// schedule/posts.json을 읽어 시간이 된 예약 글을 Threads에 게시하고,
// 결과를 같은 파일에 다시 기록한다. (커밋/푸시는 워크플로 yaml에서 처리)
//
// 필요한 환경변수:
//   THREADS_ACCOUNTS_JSON - [{id, label, threadsUserId, accessToken}, ...] 형태의 JSON 문자열
//                           (GitHub Secrets에 저장됨)

const fs = require("fs");
const path = require("path");
const { publishTextPost, publishImagePost } = require("../server/lib/threadsClient");

const SCHEDULE_FILE = path.join(__dirname, "..", "schedule", "posts.json");

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

function loadPosts() {
  if (!fs.existsSync(SCHEDULE_FILE)) return [];
  const raw = fs.readFileSync(SCHEDULE_FILE, "utf8").trim();
  if (!raw) return [];
  return JSON.parse(raw);
}

function savePosts(posts) {
  fs.mkdirSync(path.dirname(SCHEDULE_FILE), { recursive: true });
  fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(posts, null, 2) + "\n", "utf8");
}

async function main() {
  const accounts = loadAccounts();
  const posts = loadPosts();
  const now = new Date();

  const due = posts.filter((p) => p.status === "scheduled" && new Date(p.scheduledAt) <= now);

  if (due.length === 0) {
    console.log("게시할 예약 글이 없습니다.");
    return;
  }

  for (const post of due) {
    const account = accounts.find((a) => a.id === post.accountId);
    if (!account) {
      post.status = "failed";
      post.error = `계정을 찾을 수 없습니다 (accountId: ${post.accountId}). THREADS_ACCOUNTS_JSON 시크릿을 최신 상태로 갱신해주세요.`;
      console.error(`[실패] ${post.id}: ${post.error}`);
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

      post.status = "published";
      post.publishedAt = new Date().toISOString();
      post.publishedId = result.publishedId;
      post.error = null;
      console.log(`[성공] ${post.id} → ${result.publishedId}`);

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
      post.status = "failed";
      post.error = err.message;
      console.error(`[실패] ${post.id}: ${err.message}`);
    }
  }

  savePosts(posts);
}

main().catch((err) => {
  console.error("스케줄 발행 스크립트 실행 중 오류:", err);
  process.exit(1);
});
