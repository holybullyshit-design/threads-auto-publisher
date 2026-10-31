const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const jobTokens = require("../server/lib/jobThreadsTokens");

const SIXTY_DAYS = 5184000;
let tempDir;

function writeToken(handle, userId) {
  const record = { handle, user_id: userId, access_token: `old-${handle}`, app: "오토니즘", expires_at: 1 };
  fs.writeFileSync(path.join(tempDir, `${handle}.json`), JSON.stringify(record), { mode: 0o600 });
}

function readToken(handle) {
  return JSON.parse(fs.readFileSync(path.join(tempDir, `${handle}.json`), "utf8"));
}

test.beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "job-tokens-"));
  process.env.JOB_THREADS_TOKEN_DIR = tempDir;
});

test.afterEach(() => {
  delete process.env.JOB_THREADS_TOKEN_DIR;
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("계정별 토큰과 만료를 갱신하고 나머지 정보와 파일 권한은 유지한다", async () => {
  writeToken("jobs_curator", "1");
  const results = await jobTokens.refreshAll(async (token) => ({ accessToken: `new-${token}`, expiresIn: SIXTY_DAYS }));

  assert.deepEqual(results, [{ label: "@jobs_curator", ok: true }]);
  const record = readToken("jobs_curator");
  assert.equal(record.access_token, "new-old-jobs_curator");
  assert.equal(record.app, "오토니즘");
  assert.ok(record.expires_at > Date.now() / 1000 + SIXTY_DAYS - 60);
  assert.equal(fs.statSync(path.join(tempDir, "jobs_curator.json")).mode & 0o777, 0o600);
  assert.deepEqual(fs.readdirSync(tempDir), ["jobs_curator.json"]);
});

test("이 앱에서 방금 갱신한 계정은 다시 갱신하지 않고 그 토큰을 쓴다", async () => {
  writeToken("hire_masters", "2");
  const shared = new Map([["2", { accessToken: "from-saju-app", expiresIn: SIXTY_DAYS }]]);
  const results = await jobTokens.refreshAll(async () => assert.fail("다시 갱신하면 안 된다"), shared);

  assert.equal(results[0].ok, true);
  assert.equal(readToken("hire_masters").access_token, "from-saju-app");
});

test("한 계정이 실패해도 그 계정 토큰은 유지하고 다른 계정은 계속 갱신한다", async () => {
  writeToken("high_quality_hire", "3");
  writeToken("jobs_curator", "1");
  const results = await jobTokens.refreshAll(async (token) => {
    if (token === "old-high_quality_hire") throw new Error("토큰 갱신에 실패했습니다");
    return { accessToken: "new", expiresIn: SIXTY_DAYS };
  });

  assert.deepEqual(results.map((r) => r.ok), [false, true]);
  assert.equal(readToken("high_quality_hire").access_token, "old-high_quality_hire");
  assert.equal(readToken("jobs_curator").access_token, "new");
});

test("토큰 폴더를 읽지 못해도 예외 없이 실패 결과로 돌려준다", async () => {
  process.env.JOB_THREADS_TOKEN_DIR = path.join(tempDir, "없는 폴더");
  const results = await jobTokens.refreshAll(async () => assert.fail("호출되면 안 된다"));

  assert.equal(results.length, 1);
  assert.equal(results[0].ok, false);
});

test("상태 조회에는 토큰 값이 포함되지 않는다", () => {
  writeToken("jobs_curator", "1");
  const status = jobTokens.listStatus();

  assert.deepEqual(status, [{ handle: "jobs_curator", expiresAt: 1000 }]);
});
