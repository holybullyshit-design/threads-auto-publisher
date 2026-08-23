// 여러 개의 Threads 계정(+ 채널별 페르소나)을 로컬 파일(data/accounts.json)에 저장/관리한다.
// 이 파일은 액세스 토큰을 담고 있으므로 절대 git에 커밋되지 않는다 (.gitignore 처리).

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_DIR = path.join(__dirname, "..", "..", "data");
const ACCOUNTS_FILE = path.join(DATA_DIR, "accounts.json");

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(ACCOUNTS_FILE)) fs.writeFileSync(ACCOUNTS_FILE, "[]", "utf8");
}

function readAll() {
  ensureFile();
  const raw = fs.readFileSync(ACCOUNTS_FILE, "utf8");
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writeAll(accounts) {
  ensureFile();
  fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2), "utf8");
}

// 프론트엔드로 보낼 때는 토큰을 마스킹해서 노출을 최소화한다.
// (persona에는 비밀 정보가 없으므로 그대로 내려준다 - 글쓰기 화면에서 카테고리 표시에 필요)
function toPublic(account) {
  const { accessToken, ...rest } = account;
  return {
    ...rest,
    accessTokenPreview: accessToken ? `${accessToken.slice(0, 6)}...${accessToken.slice(-4)}` : "",
  };
}

function listAccounts({ includeSecrets = false } = {}) {
  const accounts = readAll();
  return includeSecrets ? accounts : accounts.map(toPublic);
}

function getAccountSecret(id) {
  const account = readAll().find((a) => a.id === id);
  if (!account) {
    const err = new Error(`계정을 찾을 수 없습니다: ${id}`);
    err.status = 404;
    throw err;
  }
  return account;
}

function validatePersona(persona) {
  if (!persona || typeof persona !== "object") {
    const err = new Error("persona 정보가 필요합니다.");
    err.status = 400;
    throw err;
  }
  if (!Array.isArray(persona.categories) || persona.categories.length === 0) {
    const err = new Error("카테고리를 최소 1개 이상 입력해주세요.");
    err.status = 400;
    throw err;
  }
  return {
    speechLevel: persona.speechLevel || "반말",
    categories: persona.categories,
    styleGuide: persona.styleGuide || "",
    ctaInstruction: persona.ctaInstruction || "",
    closingLine: persona.closingLine || "",
    referenceExample: persona.referenceExample || "",
  };
}

function addAccount({ label, threadsUserId, accessToken, persona }) {
  if (!label || !threadsUserId || !accessToken) {
    const err = new Error("label, threadsUserId, accessToken은 모두 필수입니다.");
    err.status = 400;
    throw err;
  }
  const accounts = readAll();
  const now = new Date().toISOString();
  const account = {
    id: crypto.randomUUID(),
    label,
    threadsUserId,
    accessToken,
    persona: validatePersona(persona),
    createdAt: now,
    tokenUpdatedAt: now,
  };
  accounts.push(account);
  writeAll(accounts);
  return toPublic(account);
}

// 60일마다 만료되는 토큰을 갱신한 뒤, 새 토큰으로 교체하고 갱신 시각을 기록한다.
function updateAccountToken(id, newAccessToken) {
  const accounts = readAll();
  const account = accounts.find((a) => a.id === id);
  if (!account) {
    const err = new Error(`계정을 찾을 수 없습니다: ${id}`);
    err.status = 404;
    throw err;
  }
  account.accessToken = newAccessToken;
  account.tokenUpdatedAt = new Date().toISOString();
  writeAll(accounts);
  return toPublic(account);
}

function updatePersona(id, persona) {
  const accounts = readAll();
  const account = accounts.find((a) => a.id === id);
  if (!account) {
    const err = new Error(`계정을 찾을 수 없습니다: ${id}`);
    err.status = 404;
    throw err;
  }
  account.persona = validatePersona(persona);
  writeAll(accounts);
  return toPublic(account);
}

function deleteAccount(id) {
  const accounts = readAll();
  const next = accounts.filter((a) => a.id !== id);
  if (next.length === accounts.length) {
    const err = new Error(`계정을 찾을 수 없습니다: ${id}`);
    err.status = 404;
    throw err;
  }
  writeAll(next);
}

// GitHub Actions 시크릿(THREADS_ACCOUNTS_JSON)에 붙여넣을 수 있는 형태로 내보낸다.
function exportForCloudSecret() {
  return JSON.stringify(
    readAll().map((a) => ({
      id: a.id,
      label: a.label,
      threadsUserId: a.threadsUserId,
      accessToken: a.accessToken,
    })),
    null,
    2
  );
}

module.exports = {
  listAccounts,
  getAccountSecret,
  addAccount,
  updatePersona,
  updateAccountToken,
  deleteAccount,
  exportForCloudSecret,
};
