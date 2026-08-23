// 여러 개의 Threads 계정을 로컬 파일(data/accounts.json)에 저장/관리한다.
// 이 파일은 액세스 토큰을 담고 있으므로 절대 git에 커밋되지 않는다 (.gitignore 처리).
//
// 계정은 "카테고리"(type)를 가진다:
//   - "saju"     : 기존 사주 채널. account.persona 에 문체/카테고리/클로징 정보를 담는다.
//   - "partners" : 쿠팡파트너스 등 제휴 마케팅 채널. account.partnersProfile 에 정보를 담는다.
// 예전에(카테고리 개념이 생기기 전) 만들어진 계정은 전부 "saju"로 자동 마이그레이션한다.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_DIR = path.join(__dirname, "..", "..", "data");
const ACCOUNTS_FILE = path.join(DATA_DIR, "accounts.json");

const ACCOUNT_TYPES = ["saju", "partners"];

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(ACCOUNTS_FILE)) fs.writeFileSync(ACCOUNTS_FILE, "[]", "utf8");
}

// 예전 데이터(type 필드 없음)를 만나면 "saju"로 채워서 돌려준다.
// 실제로 뭔가 바뀐 경우에만 파일에 다시 써서, 매 요청마다 불필요한 쓰기를 피한다.
function readAll() {
  ensureFile();
  const raw = fs.readFileSync(ACCOUNTS_FILE, "utf8");
  let accounts;
  try {
    accounts = JSON.parse(raw);
  } catch {
    accounts = [];
  }

  let migrated = false;
  accounts.forEach((a) => {
    if (!a.type) {
      a.type = "saju";
      migrated = true;
    }
  });
  if (migrated) writeAll(accounts);

  return accounts;
}

function writeAll(accounts) {
  ensureFile();
  fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2), "utf8");
}

// 프론트엔드로 보낼 때는 토큰을 마스킹해서 노출을 최소화한다.
function toPublic(account) {
  const { accessToken, ...rest } = account;
  return {
    ...rest,
    accessTokenPreview: accessToken ? `${accessToken.slice(0, 6)}...${accessToken.slice(-4)}` : "",
  };
}

function listAccounts({ includeSecrets = false, type = null } = {}) {
  let accounts = readAll();
  if (type) accounts = accounts.filter((a) => a.type === type);
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

function validatePartnersProfile(profile) {
  if (!profile || typeof profile !== "object") {
    const err = new Error("partnersProfile 정보가 필요합니다.");
    err.status = 400;
    throw err;
  }
  if (!Array.isArray(profile.categories) || profile.categories.length === 0) {
    const err = new Error("니치(카테고리)를 최소 1개 이상 입력해주세요.");
    err.status = 400;
    throw err;
  }
  return {
    styleGuide: profile.styleGuide || "",
    disclosureText: profile.disclosureText || "",
    closingLine: profile.closingLine || "",
    categories: profile.categories,
  };
}

function addAccount({ label, threadsUserId, accessToken, type, persona, partnersProfile }) {
  if (!label || !threadsUserId || !accessToken) {
    const err = new Error("label, threadsUserId, accessToken은 모두 필수입니다.");
    err.status = 400;
    throw err;
  }
  const accountType = ACCOUNT_TYPES.includes(type) ? type : "saju";

  const accounts = readAll();
  const now = new Date().toISOString();
  const account = {
    id: crypto.randomUUID(),
    label,
    type: accountType,
    threadsUserId,
    accessToken,
    createdAt: now,
    tokenUpdatedAt: now,
  };

  if (accountType === "partners") {
    account.partnersProfile = validatePartnersProfile(partnersProfile);
  } else {
    account.persona = validatePersona(persona);
  }

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

function updatePartnersProfile(id, partnersProfile) {
  const accounts = readAll();
  const account = accounts.find((a) => a.id === id);
  if (!account) {
    const err = new Error(`계정을 찾을 수 없습니다: ${id}`);
    err.status = 404;
    throw err;
  }
  account.partnersProfile = validatePartnersProfile(partnersProfile);
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
// (카테고리 종류와 무관하게 전체 계정의 발행용 자격 증명만 내보낸다)
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
  ACCOUNT_TYPES,
  listAccounts,
  getAccountSecret,
  addAccount,
  updatePersona,
  updatePartnersProfile,
  updateAccountToken,
  deleteAccount,
  exportForCloudSecret,
};
