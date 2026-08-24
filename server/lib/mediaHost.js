// Threads API는 이미지 게시 시 "공개적으로 접근 가능한 URL"을 요구한다.
// 로컬에서 가공한 이미지를 별도 공개 저장소(threads-media-host)에 커밋/푸시하고,
// jsdelivr CDN 주소(커밋 해시 고정 — 캐시 지연 걱정 없음)로 돌려준다.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFile } = require("child_process");

const MEDIA_HOST_DIR = path.join(__dirname, "..", "..", "media-host");
const IMAGES_DIR = path.join(MEDIA_HOST_DIR, "images");
const GH_REPO = "holybullyshit-design/threads-media-host";

function run(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { cwd, timeout: 30000 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(`${cmd} ${args.join(" ")} 실패: ${stderr || err.message}`));
      resolve(stdout.trim());
    });
  });
}

function assertRepoExists() {
  if (!fs.existsSync(MEDIA_HOST_DIR)) {
    const err = new Error(
      `media-host 저장소가 없습니다 (${MEDIA_HOST_DIR}). "gh repo clone ${GH_REPO} media-host"로 먼저 클론해주세요.`
    );
    err.status = 500;
    throw err;
  }
}

// 이미지 2장을 동시에 업로드하면(드래그로 여러 장, 또는 병렬 요청) publishImages가 동시에 두 번
// 실행돼서 git이 스스로와 충돌한다 ("index.lock" 에러). 같은 git 저장소를 쓰는 모든 커밋 작업을
// 이 큐 하나로 한 줄 세워서, 항상 한 번에 하나씩만 git을 건드리게 한다.
let gitQueue = Promise.resolve();
function withGitLock(fn) {
  const result = gitQueue.then(fn, fn);
  gitQueue = result.then(
    () => {},
    () => {}
  ); // 실패해도 큐 자체는 끊기지 않게
  return result;
}

// buffers: [{ buffer: Buffer, ext: "jpg" }, ...]
// 반환: 커밋 해시로 고정된 jsdelivr 공개 URL 배열 (같은 순서)
async function publishImages(buffers) {
  assertRepoExists();
  if (!Array.isArray(buffers) || buffers.length === 0) return [];

  fs.mkdirSync(IMAGES_DIR, { recursive: true });

  const filenames = buffers.map(({ ext = "jpg" }) => `${crypto.randomUUID()}.${ext}`);
  buffers.forEach(({ buffer }, i) => {
    fs.writeFileSync(path.join(IMAGES_DIR, filenames[i]), buffer);
  });

  // "-A"(전체 변경사항)가 아니라 이번 요청이 만든 파일만 콕 집어서 add한다 —
  // 그래야 동시에 들어온 다른 요청이 아직 커밋 전에 써둔 파일까지 같이 딸려와서
  // "커밋할 게 없음" 에러가 나는 걸 막을 수 있다.
  const relativePaths = filenames.map((name) => path.join("images", name));

  const commitSha = await withGitLock(async () => {
    await run("git", ["add", ...relativePaths], MEDIA_HOST_DIR);
    await run(
      "git",
      ["commit", "-m", `chore: add ${filenames.length}장 이미지 (${new Date().toISOString()})`],
      MEDIA_HOST_DIR
    );
    await run("git", ["push"], MEDIA_HOST_DIR);
    return run("git", ["rev-parse", "HEAD"], MEDIA_HOST_DIR);
  });

  return filenames.map(
    (name) => `https://cdn.jsdelivr.net/gh/${GH_REPO}@${commitSha}/images/${name}`
  );
}

module.exports = { publishImages };
