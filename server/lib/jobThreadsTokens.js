// 채용 프로젝트(스레드 채용공고 자동화)의 Threads 토큰도 "토큰 전체 갱신" 버튼으로 같이 갱신한다.
// 토큰은 그 프로젝트의 비밀 폴더에만 둔다. 이 앱의 계정 목록이나 클라우드 시크릿에는 섞지 않는다.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DEFAULT_TOKEN_DIR = "/Users/choitaehwan/Documents/ChatGPT/스레드 채용공고 자동화/automation/secrets/threads";

function tokenDir() {
  return process.env.JOB_THREADS_TOKEN_DIR || DEFAULT_TOKEN_DIR;
}

function readRecords() {
  const dir = tokenDir();
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => {
      const file = path.join(dir, name);
      return { file, record: JSON.parse(fs.readFileSync(file, "utf8")) };
    });
}

// 같은 폴더에 임시 파일을 쓴 뒤 교체해서, 중간에 실패해도 기존 토큰이 깨지지 않게 한다.
function writeRecord(file, record) {
  const temp = `${file}.${crypto.randomBytes(6).toString("hex")}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(record), { mode: 0o600 });
  fs.renameSync(temp, file);
}

// 클라우드 채용 게시기(cloud/publish-jobs.js)가 읽는 JOB_THREADS_ACCOUNTS_JSON 형식.
function exportForCloudSecret() {
  const accounts = {};
  for (const { record } of readRecords()) {
    accounts[record.handle] = {
      userId: String(record.user_id),
      accessToken: record.access_token,
      expiresAt: new Date(record.expires_at * 1000).toISOString(),
    };
  }
  return JSON.stringify(accounts);
}

function listStatus() {
  return readRecords().map(({ record }) => ({
    handle: record.handle,
    expiresAt: record.expires_at * 1000,
  }));
}

// refreshedByUserId: 같은 버튼에서 이 앱 쪽 계정으로 이미 갱신한 결과 (Threads User ID → { accessToken, expiresIn }).
async function refreshAll(refresh, refreshedByUserId = new Map()) {
  let entries;
  try {
    entries = readRecords();
  } catch (err) {
    return [{ label: "채용 계정", ok: false, error: `토큰 폴더를 읽지 못했습니다: ${err.message}` }];
  }

  const results = [];
  for (const { file, record } of entries) {
    const label = `@${record.handle}`;
    try {
      // @hire_masters처럼 이 앱에도 등록된 계정은 방금 받은 토큰을 쓴다. 갱신 직후의 토큰은 24시간이 지나야 다시 갱신된다.
      const refreshed = refreshedByUserId.get(String(record.user_id)) || (await refresh(record.access_token));
      writeRecord(file, {
        ...record,
        access_token: refreshed.accessToken,
        expires_at: Math.floor(Date.now() / 1000) + refreshed.expiresIn,
      });
      results.push({ label, ok: true });
    } catch (err) {
      results.push({ label, ok: false, error: err.message });
    }
  }
  return results;
}

module.exports = { listStatus, refreshAll, exportForCloudSecret };
