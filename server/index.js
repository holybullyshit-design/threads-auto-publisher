require("dotenv").config();

const path = require("path");
const { exec } = require("child_process");
const express = require("express");

const { PERSONA_PRESETS } = require("./config/personaPresets");
const { writeDraft } = require("./skills/sajuDraftWriter");
const { polishDraft } = require("./skills/sajuToneRewriter");
const { publishTextPost, MAX_TEXT_LENGTH } = require("./lib/threadsClient");
const accountsStore = require("./lib/accountsStore");
const scheduleStore = require("./lib/scheduleStore");

const app = express();
const PORT = Number(process.env.PORT) || 4321;

app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

// ---------- 메타 정보 ----------
app.get("/api/meta", (req, res) => {
  res.json({ maxTextLength: MAX_TEXT_LENGTH });
});

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

// ---------- 초안 생성 / 다듬기 (계정 페르소나 기반) ----------
app.post("/api/draft", async (req, res) => {
  try {
    const { accountId, categoryId } = req.body || {};
    if (!accountId || !categoryId) {
      return res.status(400).json({ error: "accountId, categoryId가 필요합니다." });
    }
    const account = accountsStore.getAccountSecret(accountId);
    const result = await writeDraft({ account, categoryId });
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
