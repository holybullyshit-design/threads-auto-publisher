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
const { publishCarousel, findPublishedByMarker } = require("../server/lib/instagramClient");

const SCHEDULE_FILE = path.join(__dirname, "..", "schedule", "posts.json");

// 게시가 실패해도 바로 "failed"로 못박지 않고, 이 횟수만큼은 다음 실행(10분 뒤)에
// 자동으로 다시 시도한다. threadsClient.js 안의 즉시 재시도(같은 실행 안에서)로도 못 넘긴
// 에러가, 시간이 조금 더 지나면 풀리는 경우(메타 쪽 일시적 문제 등)를 자동으로 흡수하기 위함.
// 이 횟수를 다 써도 안 되면 그때는 진짜 "failed"로 두고 사람이 확인하게 한다.
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
  const posts = loadPosts();
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
        post.status = "published";
        post.publishedAt = new Date().toISOString();
        post.publishedId = result.publishedId;
        post.error = null;
        console.log(`[인스타그램 성공] ${post.id} → ${result.publishedId}${result.recoveredDuplicate ? " (기존 게시물 회수)" : ""}`);
      } catch (err) {
        post.retryCount = (post.retryCount || 0) + 1;
        post.error = err.message;
        const fatal = ["VALIDATION_REQUIRED", "INVALID_CAROUSEL", "INVALID_CAPTION", "INVALID_IMAGE_URL", "MISSING_INSTAGRAM_CONFIG"].includes(err.code);
        if (fatal || post.retryCount >= MAX_AUTO_RETRIES) post.status = "failed";
        console.error(`[인스타그램 ${post.status === "failed" ? "최종 실패" : "재시도 예정"}] ${post.id}: ${err.message}`);
      }
      continue;
    }

    const accounts = loadAccounts();
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
      post.retryCount = (post.retryCount || 0) + 1;
      post.error = err.message;
      if (post.retryCount < MAX_AUTO_RETRIES) {
        // status는 "scheduled"로 그대로 둔다 -> 다음 실행(10분 뒤)에 자동으로 다시 시도된다.
        console.error(
          `[재시도 예정 ${post.retryCount}/${MAX_AUTO_RETRIES}] ${post.id}: ${err.message}`
        );
      } else {
        post.status = "failed";
        console.error(`[최종 실패, ${MAX_AUTO_RETRIES}회 재시도 소진] ${post.id}: ${err.message}`);
      }
    }
  }

  savePosts(posts);
}

main().catch((err) => {
  console.error("스케줄 발행 스크립트 실행 중 오류:", err);
  process.exit(1);
});
