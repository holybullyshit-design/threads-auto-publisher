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

// base(우리가 읽었던 시점의 스냅샷) 대비 mine(우리가 수정한 결과)에서 실제로 바뀌었거나
// 새로 추가/삭제된 글만 골라서, remote(그 사이 다른 곳이 새로 커밋한 최신 내용) 위에 얹는다.
// 이렇게 하면 "그 사이 GitHub Actions가 다른 글을 발행완료로 바꾼 것"까지 우리가 실수로
// 덮어써서 되돌리는 일을 막을 수 있다 — 우리가 손댄 글만 반영하고 나머지는 remote 그대로 둔다.
function rebaseOnto(remote, base, mine) {
  const baseById = new Map(base.map((p) => [p.id, p]));
  const changedOrNew = mine.filter((p) => {
    const before = baseById.get(p.id);
    return !before || JSON.stringify(before) !== JSON.stringify(p);
  });
  const mineIds = new Set(mine.map((p) => p.id));
  const removedIds = new Set(base.filter((p) => !mineIds.has(p.id)).map((p) => p.id));

  const merged = new Map(remote.map((p) => [p.id, p]));
  changedOrNew.forEach((p) => merged.set(p.id, p));
  removedIds.forEach((id) => merged.delete(id));

  return Array.from(merged.values());
}

// posts 배열 전체를 다시 저장한다. 동시 수정 충돌(409/422) 시, basePosts(수정 전 스냅샷)가
// 있으면 우리가 실제로 바꾼 부분만 최신 내용 위에 다시 얹어서(rebase) 재시도한다.
// basePosts가 없으면(과거 호출부 호환용) 예전처럼 통째로 덮어쓴다 — 이 경우 그 사이 다른
// 곳의 변경을 덮어쓸 위험이 있으니, 새로 쓰는 코드는 반드시 basePosts를 넘길 것.
// 2026-08-30: 동시에 쓰는 곳이 늘면서(로컬 배치 스크립트 + GitHub Actions 발행 + Codex 작업)
// 재시도 1번으로는 부족해서 연속 충돌이 나는 걸 실측함 - 최대 3번까지 재시도한다.
const WRITE_SCHEDULE_MAX_ATTEMPTS = 3;
async function writeSchedule(posts, { sha, message, basePosts } = {}, attempt = 0) {
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

  if ((res.status === 409 || res.status === 422) && attempt < WRITE_SCHEDULE_MAX_ATTEMPTS - 1) {
    // 다른 곳(Actions 등)에서 먼저 커밋한 경우: 최신 내용을 다시 읽어서
    // - basePosts가 있으면: 우리가 실제로 바꾼 글만 최신 내용 위에 얹어서 재시도
    // - 없으면: 예전 동작대로 그냥 우리 posts로 덮어써서 재시도(위험 감수)
    const latest = await readSchedule();
    const rebased = basePosts ? rebaseOnto(latest.posts, basePosts, posts) : posts;
    return writeSchedule(rebased, { sha: latest.sha, message, basePosts }, attempt + 1);
  }

  const body = await res.json().catch(() => ({}));
  throw new Error(`GitHub에 예약 목록을 저장하지 못했습니다: ${body.message || res.status}`);
}

// 임의의 JSON 파일 하나를 GitHub에 통째로 덮어쓴다 (마지막에 쓴 내용이 이긴다 - schedule/
// posts.json처럼 여러 곳에서 동시에 건드리는 파일이 아니라, 한 곳(로컬 서버의 성과 분석
// 배경 갱신)에서만 쓰는 요약 데이터라 rebase 같은 병합 로직이 필요 없다).
// 파일이 아직 없으면(첫 실행) sha 없이 새로 만든다.
async function writeJsonFile(filePath, data, message) {
  const { repo } = getConfig();
  const content = Buffer.from(JSON.stringify(data, null, 2), "utf8").toString("base64");

  const existing = await githubRequest(`/repos/${repo}/contents/${filePath}`);
  const sha = existing.ok ? (await existing.json()).sha : undefined;

  const res = await githubRequest(`/repos/${repo}/contents/${filePath}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: message || `chore: update ${filePath}`, content, sha }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`GitHub에 ${filePath}를 저장하지 못했습니다: ${body.message || res.status}`);
  }
  const data2 = await res.json();
  return { sha: data2.content.sha };
}

module.exports = { readSchedule, writeSchedule, writeJsonFile, SCHEDULE_PATH };
