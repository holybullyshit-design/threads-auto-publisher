require("dotenv").config();

const path = require("path");
const { exec, execFile } = require("child_process");
const express = require("express");

const { PERSONA_PRESETS } = require("./config/personaPresets");
const { writeDraft } = require("./skills/sajuDraftWriter");
const { polishDraft } = require("./skills/sajuToneRewriter");
const { publishTextPost, MAX_TEXT_LENGTH } = require("./lib/threadsClient");
const accountsStore = require("./lib/accountsStore");
const scheduleStore = require("./lib/scheduleStore");
const threadsOAuth = require("./lib/threadsOAuth");

const app = express();
const PORT = Number(process.env.PORT) || 4321;

app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

// ---------- 메타 정보 ----------
app.get("/api/meta", (req, res) => {
  res.json({ maxTextLength: MAX_TEXT_LENGTH, threadsOAuthConfigured: threadsOAuth.isConfigured() });
});

// ---------- Threads 계정 자동 연결 (OAuth) ----------
// state -> { threadsUserId, accessToken, error, createdAt }
const oauthResults = new Map();

function cleanupOldOAuthResults() {
  const cutoff = Date.now() - 10 * 60 * 1000; // 10분
  for (const [state, entry] of oauthResults) {
    if (entry.createdAt < cutoff) oauthResults.delete(state);
  }
}

app.get("/oauth/threads/start", (req, res) => {
  try {
    const { state } = req.query;
    if (!state) return res.status(400).send("state 파라미터가 필요합니다.");
    const url = threadsOAuth.buildAuthorizeUrl(String(state));
    res.redirect(url);
  } catch (err) {
    res.status(500).send(`설정 오류: ${err.message}`);
  }
});

app.get("/oauth/threads/callback", async (req, res) => {
  cleanupOldOAuthResults();
  const { code, state, error, error_description } = req.query;

  if (!state) return res.status(400).send("state 파라미터가 없습니다.");

  if (error) {
    oauthResults.set(String(state), { error: error_description || error, createdAt: Date.now() });
    return res.send(oauthResultPage("연결이 취소되었거나 거부되었습니다. 이 창을 닫고 앱으로 돌아가주세요."));
  }

  try {
    const short = await threadsOAuth.exchangeCodeForShortLivedToken(String(code));
    const long = await threadsOAuth.exchangeForLongLivedToken(short.accessToken);
    oauthResults.set(String(state), {
      threadsUserId: short.userId,
      accessToken: long.accessToken,
      createdAt: Date.now(),
    });
    res.send(oauthResultPage("연결이 완료되었습니다! 이 창을 닫고 앱으로 돌아가주세요."));
  } catch (err) {
    oauthResults.set(String(state), { error: err.message, createdAt: Date.now() });
    res.send(oauthResultPage("연결 중 오류가 발생했습니다: " + err.message));
  }
});

// Meta 개발자 페이지의 "사용자 토큰 생성기"로 직접 발급받은 토큰을 붙여넣으면
// User ID를 자동으로 찾아준다 (Access Token만 있고 User ID를 모를 때 사용).
app.post("/api/threads/lookup", async (req, res) => {
  try {
    const { accessToken } = req.body || {};
    if (!accessToken) return res.status(400).json({ error: "accessToken이 필요합니다." });
    const result = await threadsOAuth.lookupUserByToken(accessToken);
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

app.get("/api/oauth/threads/result", (req, res) => {
  const { state } = req.query;
  const entry = oauthResults.get(String(state));
  if (!entry) return res.json({ status: "pending" });
  oauthResults.delete(String(state)); // 1회용
  if (entry.error) return res.json({ status: "error", error: entry.error });
  res.json({ status: "done", threadsUserId: entry.threadsUserId, accessToken: entry.accessToken });
});

function oauthResultPage(message) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Threads 연결</title>
  <style>body{background:#0a0812;color:#ece7f5;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;padding:20px}</style>
  </head><body><div><p style="font-size:18px;">${message}</p><p style="color:#a79cc2;font-size:13px;">이 창은 이제 닫으셔도 됩니다.</p></div></body></html>`;
}

app.get("/api/persona-presets", (req, res) => {
  res.json({ presets: PERSONA_PRESETS });
});

// ---------- 계정(+페르소나) 관리 ----------
app.get("/api/accounts", (req, res) => {
  res.json({ accounts: accountsStore.listAccounts() });
});

app.post("/api/accounts", (req, res) => {
  try {
    const { label, threadsUserId, accessToken, persona } = req.body || {};
    const account = accountsStore.addAccount({ label, threadsUserId, accessToken, persona });
    syncAccountsSecretToGitHub().catch((err) => console.error("[warn] 클라우드 동기화 실패:", err.message));
    res.status(201).json({ account });
  } catch (err) {
    handleError(res, err);
  }
});

app.patch("/api/accounts/:id/persona", (req, res) => {
  try {
    const account = accountsStore.updatePersona(req.params.id, req.body?.persona);
    res.json({ account });
  } catch (err) {
    handleError(res, err);
  }
});

app.delete("/api/accounts/:id", (req, res) => {
  try {
    accountsStore.deleteAccount(req.params.id);
    syncAccountsSecretToGitHub().catch((err) => console.error("[warn] 클라우드 동기화 실패:", err.message));
    res.status(204).end();
  } catch (err) {
    handleError(res, err);
  }
});

// GitHub Actions 시크릿(THREADS_ACCOUNTS_JSON)에 붙여넣을 JSON 파일 다운로드.
app.get("/api/accounts/export-secret", (req, res) => {
  const json = accountsStore.exportForCloudSecret();
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", 'attachment; filename="threads-accounts-secret.json"');
  res.send(json);
});

// gh CLI로 GitHub Actions 시크릿(THREADS_ACCOUNTS_JSON)을 최신 계정 목록으로 갱신한다.
// (파일을 거치지 않고 JSON을 표준입력으로 바로 넘긴다)
function syncAccountsSecretToGitHub() {
  return new Promise((resolve, reject) => {
    const repo = process.env.GITHUB_REPO;
    if (!repo) return reject(new Error("GITHUB_REPO가 설정되지 않아 클라우드 동기화를 건너뜁니다."));

    const child = execFile(
      "gh",
      ["secret", "set", "THREADS_ACCOUNTS_JSON", "--repo", repo],
      { timeout: 30000 },
      (err, stdout, stderr) => {
        if (err) return reject(new Error("gh secret set 실패: " + (stderr || err.message)));
        resolve();
      }
    );
    child.stdin.write(accountsStore.exportForCloudSecret());
    child.stdin.end();
  });
}

// 만료 임박 여부와 무관하게, 요청받은(또는 전체) 계정의 토큰을 즉시 갱신하고
// 클라우드 시크릿까지 한 번에 동기화한다.
app.post("/api/accounts/refresh-tokens", async (req, res) => {
  const accounts = accountsStore.listAccounts({ includeSecrets: true });
  const results = [];

  for (const account of accounts) {
    try {
      const refreshed = await threadsOAuth.refreshLongLivedToken(account.accessToken);
      accountsStore.updateAccountToken(account.id, refreshed.accessToken);
      results.push({ id: account.id, label: account.label, ok: true });
    } catch (err) {
      results.push({ id: account.id, label: account.label, ok: false, error: err.message });
    }
  }

  let syncedToCloud = false;
  let syncError = null;
  try {
    await syncAccountsSecretToGitHub();
    syncedToCloud = true;
  } catch (err) {
    syncError = err.message;
  }

  res.json({ results, syncedToCloud, syncError });
});

// ---------- 초안 생성 / 다듬기 (계정 페르소나 기반) ----------
app.post("/api/draft", async (req, res) => {
  try {
    const { accountId, categoryId } = req.body || {};
    if (!accountId || !categoryId) {
      return res.status(400).json({ error: "accountId, categoryId가 필요합니다." });
    }
    const account = accountsStore.getAccountSecret(accountId);
    const recentTexts = await scheduleStore.listRecentTextsForAccount(accountId).catch(() => []);
    const result = await writeDraft({ account, categoryId, recentTexts });
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

app.post("/api/polish", async (req, res) => {
  try {
    const { accountId, text } = req.body || {};
    if (!accountId) return res.status(400).json({ error: "accountId가 필요합니다." });
    const account = accountsStore.getAccountSecret(accountId);
    const result = await polishDraft({ account, text });
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

// ---------- 지금 게시 ----------
app.post("/api/publish", async (req, res) => {
  try {
    const { text, accountId } = req.body || {};
    if (!accountId) return res.status(400).json({ error: "accountId가 필요합니다." });
    const account = accountsStore.getAccountSecret(accountId);
    const result = await publishTextPost({
      text,
      accessToken: account.accessToken,
      threadsUserId: account.threadsUserId,
    });
    // 다음 초안 생성 때 중복을 피할 수 있도록 이력에 기록 (실패해도 게시 자체는 이미 성공했으니 무시)
    scheduleStore
      .recordImmediatePublish({ accountId, accountLabel: account.label, text, publishedId: result.publishedId })
      .catch((err) => console.error("[warn] 게시 이력 기록 실패:", err.message));
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

// ---------- 예약 발행 (GitHub 저장 → Actions가 대신 게시) ----------
app.get("/api/schedule", async (req, res) => {
  try {
    const posts = await scheduleStore.listSchedule();
    res.json({ posts });
  } catch (err) {
    handleError(res, err);
  }
});

app.post("/api/schedule", async (req, res) => {
  try {
    const { accountId, text, scheduledAt } = req.body || {};
    if (!accountId) return res.status(400).json({ error: "accountId가 필요합니다." });
    const account = accountsStore.getAccountSecret(accountId);
    const post = await scheduleStore.addScheduledPost({
      accountId,
      accountLabel: account.label,
      text,
      scheduledAt,
    });
    res.status(201).json({ post });
  } catch (err) {
    handleError(res, err);
  }
});

app.post("/api/schedule/:id/cancel", async (req, res) => {
  try {
    const post = await scheduleStore.cancelScheduledPost(req.params.id);
    res.json({ post });
  } catch (err) {
    handleError(res, err);
  }
});

function handleError(res, err) {
  console.error("[error]", err.message);
  const status = err.status || 500;
  res.status(status).json({ error: err.message });
}

app.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`\n스레드 자동 게시 앱이 실행되었습니다: ${url}\n`);

  if (process.platform === "darwin") {
    exec(`open "${url}"`);
  } else {
    console.log("브라우저에서 위 주소를 직접 열어주세요.");
  }
});
