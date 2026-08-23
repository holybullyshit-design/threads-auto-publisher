// schedule/posts.json 파일을 "로컬 디스크"가 아니라 GitHub 저장소(Contents API)에 직접
// 읽고 쓴다. 이렇게 하면 로컬 앱이 꺼져 있어도 GitHub Actions가 같은 파일을 보고 예약 발행을
// 처리할 수 있다.
//
// 필요한 env:
//   GITHUB_TOKEN  - 해당 저장소에 대한 contents:read/write 권한이 있는 PAT
//   GITHUB_REPO   - "owner/repo" 형식

const GITHUB_API_BASE = "https://api.github.com";
const SCHEDULE_PATH = "schedule/posts.json";

function getConfig() {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  if (!token || !repo) {
    const err = new Error(
      "GITHUB_TOKEN / GITHUB_REPO가 설정되지 않았습니다. .env 파일과 README의 '클라우드 예약 발행 설정'을 확인해주세요."
    );
    err.code = "MISSING_GITHUB_CONFIG";
    throw err;
  }
  return { token, repo };
}

async function githubRequest(pathname, options = {}) {
  const { token } = getConfig();
  const res = await fetch(`${GITHUB_API_BASE}${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {}),
    },
  });
  return res;
}

// 현재 schedule/posts.json 내용 + sha(수정 시 필요)를 가져온다.
// 파일이 아직 없으면 빈 배열 + sha:null 로 취급한다.
async function readSchedule() {
  const { repo } = getConfig();
  const res = await githubRequest(`/repos/${repo}/contents/${SCHEDULE_PATH}`);

  if (res.status === 404) {
    return { posts: [], sha: null };
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`GitHub에서 예약 목록을 읽지 못했습니다: ${body.message || res.status}`);
  }

  const data = await res.json();
  const content = Buffer.from(data.content, "base64").toString("utf8");
  let posts = [];
  try {
    posts = JSON.parse(content);
  } catch {
    posts = [];
  }
  return { posts, sha: data.sha };
}

// posts 배열 전체를 다시 저장한다. 동시 수정 충돌(409/422) 시 1회 재시도한다.
async function writeSchedule(posts, { sha, message } = {}, attempt = 0) {
  const { repo } = getConfig();
  const content = Buffer.from(JSON.stringify(posts, null, 2), "utf8").toString("base64");

  const res = await githubRequest(`/repos/${repo}/contents/${SCHEDULE_PATH}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: message || "chore: update schedule/posts.json",
      content,
      sha: sha || undefined,
    }),
  });

  if (res.ok) {
    const data = await res.json();
    return { sha: data.content.sha };
  }

  if ((res.status === 409 || res.status === 422) && attempt === 0) {
    // 다른 곳(Actions 등)에서 먼저 커밋한 경우: 최신 sha를 다시 읽어 한 번 재시도
    const latest = await readSchedule();
    return writeSchedule(posts, { sha: latest.sha, message }, attempt + 1);
  }

  const body = await res.json().catch(() => ({}));
  throw new Error(`GitHub에 예약 목록을 저장하지 못했습니다: ${body.message || res.status}`);
}

module.exports = { readSchedule, writeSchedule, SCHEDULE_PATH };
