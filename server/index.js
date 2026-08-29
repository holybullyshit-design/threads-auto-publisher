require("dotenv").config();

const path = require("path");
const fs = require("fs");
const { exec, execFile } = require("child_process");
const express = require("express");

const { PERSONA_PRESETS } = require("./config/personaPresets");
const { PARTNERS_PRESETS } = require("./config/partnersPresets");
const { writeDraft } = require("./skills/sajuDraftWriter");
const { polishDraft } = require("./skills/sajuToneRewriter");
const { writeDraft: writePartnersDraft, writeReplyCopy } = require("./skills/partnersDraftWriter");
const { writeDraft: writeLifestyleDraft, LIFESTYLE_CATEGORIES } = require("./skills/lifestyleDraftWriter");
const { publishTextPost, publishImagePost, MAX_TEXT_LENGTH } = require("./lib/threadsClient");
const accountsStore = require("./lib/accountsStore");
const scheduleStore = require("./lib/scheduleStore");
const threadsOAuth = require("./lib/threadsOAuth");
const coupangApi = require("./lib/coupangApi");
const { suggestKeywords } = require("./skills/keywordSuggester");
const { squareToJpeg } = require("./lib/imageSquarer");
const mediaHost = require("./lib/mediaHost");
const externalImageSearch = require("./lib/externalImageSearch");
const instagramAutomation = require("./lib/instagramAutomation");
const { preflightInstagram } = require("./lib/instagramClient");
const instagramOAuth = require("./lib/instagramOAuth");
const instagramAuthStore = require("./lib/instagramAuthStore");

instagramAuthStore.loadOAuthConfig();
instagramAuthStore.load();

const app = express();
const PORT = Number(process.env.PORT) || 4321;
const INSTAGRAM_PUBLIC_REDIRECT_URI = "https://threads-publish-pinger.threadsautopub.workers.dev/oauth/instagram/callback";

app.use(express.json({ limit: "15mb" })); // 캡처 이미지(base64) 업로드를 받을 수 있도록 넉넉하게
app.use(express.static(path.join(__dirname, "..", "public")));

// ---------- 메타 정보 ----------
app.get("/api/meta", (req, res) => {
  res.json({
    maxTextLength: MAX_TEXT_LENGTH,
    threadsOAuthConfigured: threadsOAuth.isConfigured(),
    externalImageSearchConfigured: externalImageSearch.isConfigured(),
    instagramConfigured: Boolean(process.env.INSTAGRAM_USER_ID && process.env.INSTAGRAM_ACCESS_TOKEN),
    instagramOAuthConfigured: instagramOAuth.isConfigured(),
  });
});

// ---------- Instagram 팔자명가 오늘의 운세 ----------
app.get("/api/instagram/content", (req, res) => {
  try {
    res.json({ content: instagramAutomation.generateFortunePackage(String(req.query.date || "")) });
  } catch (err) { handleError(res, err); }
});

app.get("/api/instagram/card/:date/:page.jpg", async (req, res) => {
  try {
    const { buffer, pkg } = await instagramAutomation.renderCard(req.params.date, Number(req.params.page));
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.setHeader("X-Content-Hash", pkg.contentHash);
    res.send(buffer);
  } catch (err) { handleError(res, err); }
});

app.get("/api/instagram/range", (req, res) => {
  try {
    const start = String(req.query.start || "2026-08-26");
    const end = String(req.query.end || start);
    const days = instagramAutomation.rangeSummary(start, end);
    res.json({ start, end, count: days.length, days });
  } catch (err) { handleError(res, err); }
});

app.get("/api/instagram/preflight", async (req, res) => {
  try { res.json(await preflightInstagram()); } catch (err) { handleError(res, err); }
});

app.post("/api/instagram/schedule-range", async (req, res) => {
  try {
    const { start, end, confirm } = req.body || {};
    if (confirm !== true) return res.status(400).json({ error: "검수 후 예약 확정(confirm=true)이 필요합니다." });
    const result = await instagramAutomation.prepareAndScheduleRange(start, end);
    res.status(201).json(result);
  } catch (err) { handleError(res, err); }
});

app.post("/api/instagram/oauth-config", (req, res) => {
  try {
    const appId = String(req.body?.appId || "").trim();
    const appSecret = String(req.body?.appSecret || "").trim();
    if (!/^\d+$/.test(appId)) return res.status(400).json({ error: "Instagram 앱 ID는 숫자만 입력해주세요." });
    if (appSecret.length < 8) return res.status(400).json({ error: "Instagram 앱 시크릿을 정확히 입력해주세요." });
    const redirectUri = INSTAGRAM_PUBLIC_REDIRECT_URI;
    instagramAuthStore.saveOAuthConfig({ appId, appSecret, redirectUri });
    process.env.INSTAGRAM_APP_ID = appId;
    process.env.INSTAGRAM_APP_SECRET = appSecret;
    process.env.INSTAGRAM_REDIRECT_URI = redirectUri;
    res.json({ saved: true, redirectUri });
  } catch (err) { handleError(res, err); }
});

// ---------- Instagram 계정 자동 연결 (공식 Instagram Login OAuth) ----------
const instagramOAuthResults = new Map();
const instagramOAuthStates = new Map();

app.get("/oauth/instagram/start", (req, res) => {
  try {
    if (!req.query.state) return res.status(400).send("state 파라미터가 필요합니다.");
    const state = String(req.query.state);
    instagramOAuthStates.set(state, Date.now());
    res.redirect(instagramOAuth.buildAuthorizeUrl(state));
  } catch (err) { res.status(500).send(`설정 오류: ${err.message}`); }
});

app.get("/oauth/instagram/callback", async (req, res) => {
  const { code, state, error, error_description } = req.query;
  if (!state) return res.status(400).send(instagramCallbackHelpPage());
  const issuedAt = instagramOAuthStates.get(String(state));
  instagramOAuthStates.delete(String(state));
  if (!issuedAt || Date.now() - issuedAt > 10 * 60 * 1000) return res.status(400).send("만료되었거나 올바르지 않은 연결 요청입니다.");
  if (error) {
    instagramOAuthResults.set(String(state), { error: error_description || error, createdAt: Date.now() });
    return res.send(oauthResultPage("Instagram 연결이 취소되었거나 거부되었습니다.", "Instagram 연결"));
  }
  try {
    const short = await instagramOAuth.exchangeCode(String(code || ""));
    const long = await instagramOAuth.exchangeLongToken(short.accessToken);
    const profile = await instagramOAuth.fetchProfile(long.accessToken);
    process.env.INSTAGRAM_USER_ID = String(profile.user_id);
    process.env.INSTAGRAM_ACCESS_TOKEN = long.accessToken;
    process.env.INSTAGRAM_TOKEN_EXPIRES_AT = String(Date.now() + long.expiresIn * 1000);
    instagramAuthStore.save({ userId: profile.user_id, accessToken: long.accessToken, expiresAt: Number(process.env.INSTAGRAM_TOKEN_EXPIRES_AT) });
    let cloudSynced = false;
    let cloudSyncError = null;
    try { await syncInstagramSecretsToGitHub(String(profile.user_id), long.accessToken); cloudSynced = true; }
    catch (syncError) { cloudSyncError = syncError.message; }
    instagramOAuthResults.set(String(state), { userId: String(profile.user_id), expiresIn: long.expiresIn, cloudSynced, cloudSyncError, createdAt: Date.now() });
    res.send(oauthResultPage("팔자명가 Instagram 연결이 완료되었습니다.", "Instagram 연결"));
  } catch (err) {
    instagramOAuthResults.set(String(state), { error: err.message, createdAt: Date.now() });
    res.send(oauthResultPage("Instagram 연결 중 오류가 발생했습니다: " + err.message, "Instagram 연결"));
  }
});

app.get("/api/oauth/instagram/result", (req, res) => {
  const state = String(req.query.state || "");
  const entry = instagramOAuthResults.get(state);
  if (!entry) return res.json({ status: "pending" });
  instagramOAuthResults.delete(state);
  if (entry.error) return res.json({ status: "error", error: entry.error });
  res.json({ status: "done", userId: entry.userId, expiresIn: entry.expiresIn, cloudSynced: entry.cloudSynced, cloudSyncError: entry.cloudSyncError });
});

function syncInstagramSecretsToGitHub(userId, accessToken) {
  const repo = process.env.GITHUB_REPO;
  if (!repo) return Promise.reject(new Error("GITHUB_REPO가 설정되지 않아 클라우드 동기화를 건너뜁니다."));
  const setSecret = (name, value) => new Promise((resolve, reject) => {
    const child = execFile("gh", ["secret", "set", name, "--repo", repo], { timeout: 30000 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(`${name} 동기화 실패: ${stderr || err.message}`));
      resolve();
    });
    child.stdin.end(value);
  });
  return Promise.all([setSecret("INSTAGRAM_USER_ID", userId), setSecret("INSTAGRAM_ACCESS_TOKEN", accessToken)]);
}

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

function oauthResultPage(message, title = "Threads 연결") {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
  <style>body{background:#0a0812;color:#ece7f5;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;padding:20px}</style>
  </head><body><div><p style="font-size:18px;">${message}</p><p style="color:#a79cc2;font-size:13px;">이 창은 이제 닫으셔도 됩니다.</p></div></body></html>`;
}

function instagramCallbackHelpPage() {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Instagram 연결 안내</title>
  <style>body{background:#0a0812;color:#ece7f5;font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo",sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;text-align:center;padding:24px;box-sizing:border-box}.box{max-width:560px;padding:34px;border:1px solid #665536;border-radius:18px;background:#121018}h1{font-size:24px;color:#e6c982}p{line-height:1.7;color:#c9c0d2}.btn{display:inline-block;margin-top:12px;padding:13px 22px;border-radius:10px;background:#c69b4b;color:#0b0910;text-decoration:none;font-weight:800}</style>
  </head><body><div class="box"><h1>문제가 생긴 것이 아닙니다</h1><p>이 주소는 Meta 설정에 등록하는 콜백 주소입니다. 직접 여는 페이지가 아니며, 팔자명가 프로그램의 <b>Instagram 계정 자동 연결</b> 버튼을 눌렀을 때만 자동으로 사용됩니다.</p><a class="btn" href="/">팔자명가 프로그램으로 돌아가기</a></div></body></html>`;
}

app.get("/api/persona-presets", (req, res) => {
  res.json({ presets: PERSONA_PRESETS });
});

app.get("/api/partners-presets", (req, res) => {
  res.json({ presets: PARTNERS_PRESETS });
});

app.get("/api/lifestyle-presets", (req, res) => {
  res.json({ categories: LIFESTYLE_CATEGORIES });
});

// ---------- 계정(+카테고리별 설정) 관리 ----------
app.get("/api/accounts", (req, res) => {
  const { type } = req.query;
  res.json({ accounts: accountsStore.listAccounts({ type: type || null }) });
});

app.post("/api/accounts", (req, res) => {
  try {
    const { label, threadsUserId, accessToken, type, persona, partnersProfile } = req.body || {};
    const account = accountsStore.addAccount({ label, threadsUserId, accessToken, type, persona, partnersProfile });
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

app.patch("/api/accounts/:id/partners-profile", (req, res) => {
  try {
    const account = accountsStore.updatePartnersProfile(req.params.id, req.body?.partnersProfile);
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
    const { accountId, categoryId, productName, productNote } = req.body || {};
    if (!accountId || !categoryId) {
      return res.status(400).json({ error: "accountId, categoryId가 필요합니다." });
    }
    const account = accountsStore.getAccountSecret(accountId);

    // "종합사주"(팔자장인/팔자명가/팔자궤도) 계정은 카테고리 기반 페르소나(sajuDraftWriter)가 아니라
    // 소재 뱅크 + 클리프행어 답글 체인 구조(taebaekSajuDraftWriter)로 운영한다. 이 탭(단일 텍스트
    // 작성 화면)은 답글 체인을 못 다루므로, 여기서 잘못된 스타일로 조용히 생성되는 대신 막고
    // 배치 스크립트(tools/convert-to-comprehensive-saju.js 등)를 쓰라고 안내한다.
    if (account.contentEngine === "comprehensive-saju") {
      return res.status(400).json({
        error: `"${account.label}"은(는) 종합사주 계정이라 이 화면에서 직접 작성할 수 없습니다. 팔자장인과 같은 소재/클리프행어 구조로만 콘텐츠를 만들며, 배치 스크립트(tools/convert-to-comprehensive-saju.js)로만 생성·예약합니다.`,
      });
    }

    if (account.type === "partners") {
      const result = await writePartnersDraft({ account, categoryId, productName, productNote });
      return res.json(result);
    }

    const recentTexts = await scheduleStore.listRecentTextsForAccount(accountId).catch(() => []);
    const result = await writeDraft({ account, categoryId, recentTexts });
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

// ---------- 파트너스: 쿠팡 상품 검색 → 이미지 가공 → 초안 (원스톱) ----------

// 상품명(키워드)으로 쿠팡 상품을 검색한다. 결과에 이미 제휴 추적 링크가 포함돼 있다.
// 쿠팡 검색 API는 한 키워드당 최대 10개로 고정돼 있어(쿠팡 쪽 하드 제한, 우리가 늘릴 수 없음)
// 대신 같은 니치 맥락의 연관 검색어를 몇 개 함께 제안해서, 다시 검색하며 더 둘러볼 수 있게 한다.
app.post("/api/partners/search", async (req, res) => {
  try {
    const { keyword, limit } = req.body || {};
    const result = await coupangApi.searchProducts(keyword, { limit });
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

// 연관 검색어 추천은 AI 호출이라 몇 초 걸린다 — 상품 검색과 분리해서, 상품이 먼저 뜨고
// 추천어는 화면에 나중에 채워지도록 한다 (검색 자체를 느리게 만들지 않기 위함).
app.post("/api/partners/keyword-suggestions", async (req, res) => {
  try {
    const { keyword, categoryLabel } = req.body || {};
    const suggestedKeywords = await suggestKeywords({ keyword, categoryLabel });
    res.json({ suggestedKeywords });
  } catch (err) {
    handleError(res, err);
  }
});

// 캡처해서 끌어다 놓거나 붙여넣은 이미지를 1:1로 가공해서 공개 저장소에 올린다.
// (쿠팡 상세페이지에서 이미지 주소만 복사가 안 되는 경우의 대안 — 파일 자체를 그대로 받는다)
app.post("/api/partners/upload-image", async (req, res) => {
  try {
    const { imageBase64 } = req.body || {};
    if (!imageBase64) return res.status(400).json({ error: "imageBase64가 필요합니다." });
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const rawBuffer = Buffer.from(base64Data, "base64");
    const { buffer } = await squareToJpeg(rawBuffer, 1080);
    const [url] = await mediaHost.publishImages([{ buffer, ext: "jpg" }]);
    res.json({ url });
  } catch (err) {
    handleError(res, err);
  }
});

// 쿠팡 외 다른 쇼핑몰(네이버쇼핑)에서 같은 상품의 사진 후보를 찾아서 "보여주기만" 한다.
// 여기서는 아무것도 자동으로 고르거나 저장하지 않는다 — 사용자가 그중 하나를 클릭하면
// 그때 /api/partners/import-image로 실제 가져와서 처리한다.
app.get("/api/partners/search-external-images", async (req, res) => {
  try {
    const { keyword } = req.query || {};
    if (!keyword) return res.status(400).json({ error: "keyword가 필요합니다." });
    const results = await externalImageSearch.searchProductImages(String(keyword));
    res.json({ results });
  } catch (err) {
    handleError(res, err);
  }
});

// 사용자가 검색 후보 중 실제로 클릭해서 고른 사진 1장을, 지금 직접 업로드하는 것과 동일하게
// 1:1로 가공해서 공개 저장소에 올린다 (URL로 받아온다는 것만 다르고, 이후 처리는 upload-image와 같다).
app.post("/api/partners/import-image", async (req, res) => {
  try {
    const { imageUrl } = req.body || {};
    if (!imageUrl) return res.status(400).json({ error: "imageUrl이 필요합니다." });
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) throw new Error(`이미지를 가져오지 못했습니다: HTTP ${imgRes.status}`);
    const rawBuffer = Buffer.from(await imgRes.arrayBuffer());
    const { buffer } = await squareToJpeg(rawBuffer, 1080);
    const [url] = await mediaHost.publishImages([{ buffer, ext: "jpg" }]);
    res.json({ url });
  } catch (err) {
    handleError(res, err);
  }
});

// 선택된 상품(+선택적으로 추가 이미지들)을 1:1로 가공해서 공개 저장소에 올리고,
// 동시에 그 계정 페르소나로 초안까지 작성해서 한 번에 돌려준다.
// extraImageUrls: 이미 /api/partners/upload-image로 가공/호스팅까지 끝난 URL들 (다시 처리하지 않고 그대로 씀)
app.post("/api/partners/prepare", async (req, res) => {
  try {
    const { accountId, categoryId, product, extraImageUrls, productNote } = req.body || {};
    if (!accountId || !categoryId || !product?.productName) {
      return res.status(400).json({ error: "accountId, categoryId, product가 필요합니다." });
    }
    const account = accountsStore.getAccountSecret(accountId);
    if (account.type !== "partners") {
      return res.status(400).json({ error: "파트너스 계정이 아닙니다." });
    }

    // 1) 대표 상품 이미지 다운로드 (원본, 쿠팡 공식 스튜디오컷) — 수동 이미지가 하나도 없을 때의
    //    최후 대체용으로만 갖고 있는다.
    const imgRes = await fetch(product.productImage);
    if (!imgRes.ok) throw new Error(`상품 이미지 다운로드 실패: HTTP ${imgRes.status}`);
    const rawBuffer = Buffer.from(await imgRes.arrayBuffer());

    // 2) AI 이미지 생성은 완전히 끄고, 사용자가 직접 올린 사진(2~3장)만 쓴다 — gpt-image 편집이
    //    라벨 글씨 깨짐/엉뚱한 장면 등 오류를 계속 내서(2026-08-24) 사용자가 AI 생성 자체를 안 쓰기로
    //    결정했다. `server/lib/aiImageEditor.js`는 남겨두되 여기서는 더 이상 호출하지 않는다.
    const providedExtras = (Array.isArray(extraImageUrls) ? extraImageUrls : []).filter(Boolean);

    let mainBuffers = [];
    if (providedExtras.length === 0) {
      mainBuffers = [rawBuffer]; // 수동 이미지가 하나도 없을 때만 원본 스튜디오컷으로 대체
    }

    const squaredMain = await Promise.all(mainBuffers.map((buf) => squareToJpeg(buf, 1080)));
    const mainImageUrls = await mediaHost.publishImages(
      squaredMain.map(({ buffer }) => ({ buffer, ext: "jpg" }))
    );

    // 3) 최대 3장까지. 사용자가 직접 넣은 사진이 항상 앞자리를 차지한다.
    const images = [...providedExtras, ...mainImageUrls].filter(Boolean).slice(0, 3);

    // 본문 초안 + 답글용 설득 카피 + 링크 단축, 세 가지를 동시에 준비한다.
    const [{ draft, category }, replyCopy, shortLink] = await Promise.all([
      writePartnersDraft({ account, categoryId, productName: product.productName, productNote }),
      writeReplyCopy({ account, categoryId, productName: product.productName, productNote }),
      coupangApi
        .createDeeplink(product.canonicalUrl || product.productUrl)
        .catch(() => product.productUrl), // 단축 실패 시 원래 링크로 대체
    ]);

    // 답글 = 설득 카피 + 같은 링크 두 번 (다른 파트너스 계정들도 흔히 쓰는 방식)
    // 혹시 카피가 길어져서 500자를 넘으면, 링크 두 개는 반드시 지키고 카피만 줄인다.
    let replyText = `${replyCopy}\n\n${shortLink}\n${shortLink}`;
    if (replyText.length > MAX_TEXT_LENGTH) {
      const linksBlock = `\n\n${shortLink}\n${shortLink}`;
      const trimmedCopy = replyCopy.slice(0, MAX_TEXT_LENGTH - linksBlock.length - 1) + "…";
      replyText = `${trimmedCopy}${linksBlock}`;
    }

    res.json({
      images,
      draftText: draft,
      category,
      affiliateLink: shortLink,
      replyText,
      productName: product.productName,
      productPrice: product.productPrice,
    });
  } catch (err) {
    handleError(res, err);
  }
});

// 파트너스 계정의 "일상글"(비-광고) 초안. 상품/이미지/링크/공정위 문구가 전혀 없다.
app.post("/api/partners/lifestyle-draft", async (req, res) => {
  try {
    const { accountId, categoryId, topicNote } = req.body || {};
    if (!accountId || !categoryId) {
      return res.status(400).json({ error: "accountId, categoryId가 필요합니다." });
    }
    const account = accountsStore.getAccountSecret(accountId);
    if (account.type !== "partners") {
      return res.status(400).json({ error: "파트너스 계정이 아닙니다." });
    }
    const result = await writeLifestyleDraft({ account, categoryId, topicNote });
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

app.post("/api/polish", async (req, res) => {
  try {
    const { accountId, text, categoryId } = req.body || {};
    if (!accountId) return res.status(400).json({ error: "accountId가 필요합니다." });
    const account = accountsStore.getAccountSecret(accountId);
    if (account.type === "partners") {
      return res.status(400).json({ error: "파트너스 계정은 아직 톤 다듬기를 지원하지 않습니다. 다시 생성해주세요." });
    }
    const result = await polishDraft({ account, text, categoryId });
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

// ---------- 지금 게시 ----------
// images가 있으면 이미지(캐러셀) 게시, replyText가 있으면 본문 게시 직후 그 텍스트로 답글까지 자동으로 단다.
app.post("/api/publish", async (req, res) => {
  try {
    const { text, accountId, images, replyText } = req.body || {};
    if (!accountId) return res.status(400).json({ error: "accountId가 필요합니다." });
    const account = accountsStore.getAccountSecret(accountId);

    const result =
      Array.isArray(images) && images.length > 0
        ? await publishImagePost({
            text,
            imageUrls: images,
            accessToken: account.accessToken,
            threadsUserId: account.threadsUserId,
          })
        : await publishTextPost({
            text,
            accessToken: account.accessToken,
            threadsUserId: account.threadsUserId,
          });

    let replyResult = null;
    if (replyText) {
      try {
        replyResult = await publishTextPost({
          text: replyText,
          replyToId: result.publishedId,
          accessToken: account.accessToken,
          threadsUserId: account.threadsUserId,
        });
      } catch (err) {
        console.error("[warn] 답글(링크) 자동 게시 실패:", err.message);
      }
    }

    // 다음 초안 생성 때 중복을 피할 수 있도록 이력에 기록 (실패해도 게시 자체는 이미 성공했으니 무시)
    scheduleStore
      .recordImmediatePublish({
        accountId,
        accountLabel: account.label,
        text,
        publishedId: result.publishedId,
        images,
        replyText,
      })
      .catch((err) => console.error("[warn] 게시 이력 기록 실패:", err.message));

    res.json({ ...result, reply: replyResult });
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

// ---------- 관제탑(운영 현황) ----------
// "글쓰기/예약 목록/계정 관리" 탭과 같은 데이터(scheduleStore)를 보고 시점에 새로 계산해서
// 보여주는 요약 뷰. 정적 스냅샷이 아니라 탭을 열 때마다 서버에서 다시 계산한다.
const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"];

function toKst(dateInput) {
  const d = new Date(dateInput);
  const kstMs = d.getTime() + 9 * 60 * 60 * 1000;
  const k = new Date(kstMs);
  return {
    year: k.getUTCFullYear(),
    month: k.getUTCMonth() + 1,
    date: k.getUTCDate(),
    hour: k.getUTCHours(),
    minute: k.getUTCMinutes(),
    weekday: WEEKDAY_KO[k.getUTCDay()],
  };
}

function formatNextMonday() {
  const k = toKst(new Date());
  const kstNow = new Date(Date.UTC(k.year, k.month - 1, k.date, k.hour, k.minute));
  const dow = kstNow.getUTCDay();
  let daysUntilMonday = (1 - dow + 7) % 7;
  if (daysUntilMonday === 0 && (k.hour > 9 || (k.hour === 9 && k.minute >= 9))) daysUntilMonday = 7;
  const next = new Date(kstNow);
  next.setUTCDate(next.getUTCDate() + daysUntilMonday);
  return `${next.getUTCMonth() + 1}/${next.getUTCDate()} (월) 09:09`;
}

function buildOpsSummary(posts) {
  const byAccount = new Map();
  let totalPublished = 0;
  let totalScheduled = 0;
  let totalFailed = 0;

  for (const p of posts) {
    const label = p.accountLabel || "(알 수 없음)";
    if (!byAccount.has(label)) {
      byAccount.set(label, { label, published: 0, scheduled: 0, failed: 0, other: 0, platforms: new Set() });
    }
    const acc = byAccount.get(label);
    acc.platforms.add((p.platform || "threads").toUpperCase());
    if (p.status === "published") { acc.published++; totalPublished++; }
    else if (p.status === "scheduled") { acc.scheduled++; totalScheduled++; }
    else if (p.status === "failed") { acc.failed++; totalFailed++; }
    else acc.other++;
  }

  const accounts = [...byAccount.values()]
    .map((a) => ({ ...a, platforms: [...a.platforms] }))
    .sort((a, b) => (b.published + b.scheduled) - (a.published + a.scheduled));

  const now = Date.now();
  const in7d = now + 7 * 24 * 60 * 60 * 1000;
  const dueThisWeek = posts.filter(
    (p) => p.status === "scheduled" && p.scheduledAt && new Date(p.scheduledAt).getTime() <= in7d
  ).length;

  const queue = posts
    .filter((p) => p.status === "scheduled" && p.scheduledAt)
    .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt))
    .slice(0, 8)
    .map((p) => {
      const k = toKst(p.scheduledAt);
      const preview = (p.text || "").replace(/\s+/g, " ").trim().slice(0, 44);
      return {
        time: `${String(k.hour).padStart(2, "0")}:${String(k.minute).padStart(2, "0")}`,
        day: `${k.month}/${k.date} ${k.weekday}`,
        account: p.accountLabel || "",
        text: preview,
      };
    });

  // 벤치마크 기록 (매주 월요일 스케줄 작업이 tools/ops-dashboard/benchmark-log.json에 append)
  let benchmarkLog = [];
  try {
    const raw = fs.readFileSync(path.join(__dirname, "..", "tools", "ops-dashboard", "benchmark-log.json"), "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) benchmarkLog = parsed.slice(-3).reverse();
  } catch (e) {
    benchmarkLog = [];
  }

  // 성장 리서치 기록 (매주 노출/알고리즘 최적화 리서치 스케줄 작업이 append)
  let growthLog = [];
  try {
    const raw = fs.readFileSync(path.join(__dirname, "..", "tools", "ops-dashboard", "growth-research-log.json"), "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) growthLog = parsed.slice(-3).reverse();
  } catch (e) {
    growthLog = [];
  }

  // 간단한 규칙 기반 한 줄 인사이트 — 지어낸 숫자 없이 지금 데이터에서만 뽑는다.
  let insight;
  if (totalFailed > 0) {
    insight = `⚠ 실패한 게시물이 ${totalFailed}건 있습니다 — 예약 목록에서 확인해보세요.`;
  } else if (accounts.length > 0) {
    const top = accounts[0];
    insight = `이번 주 발행 예정 ${dueThisWeek}건 중, 예약이 가장 많이 쌓인 계정은 '${top.label}'입니다 (${top.scheduled}건 대기).`;
  } else {
    insight = "아직 등록된 게시물이 없습니다.";
  }

  return {
    generatedAt: new Date().toISOString(),
    totalPosts: posts.length,
    totalPublished,
    totalScheduled,
    totalFailed,
    dueThisWeek,
    accounts,
    queue,
    nextMonday: formatNextMonday(),
    benchmarkLog,
    growthLog,
    insight,
  };
}

app.get("/api/ops/summary", async (req, res) => {
  try {
    const posts = await scheduleStore.listSchedule();
    res.json(buildOpsSummary(posts));
  } catch (err) {
    handleError(res, err);
  }
});

app.post("/api/schedule", async (req, res) => {
  try {
    const { accountId, text, scheduledAt, images, replyText } = req.body || {};
    if (!accountId) return res.status(400).json({ error: "accountId가 필요합니다." });
    const account = accountsStore.getAccountSecret(accountId);
    const post = await scheduleStore.addScheduledPost({
      accountId,
      accountLabel: account.label,
      text,
      scheduledAt,
      images,
      replyText,
    });
    res.status(201).json({ post });
  } catch (err) {
    handleError(res, err);
  }
});

app.patch("/api/schedule/:id", async (req, res) => {
  try {
    const { text, scheduledAt, images, replyText } = req.body || {};
    const post = await scheduleStore.updateScheduledPost(req.params.id, {
      text,
      scheduledAt,
      images,
      replyText,
    });
    res.json({ post });
  } catch (err) {
    handleError(res, err);
  }
});

// 특정 계정의 예약 시각들을, 날짜는 그대로 두고 하루에 정해진 시간 슬롯으로 다시 배분한다.
// (예: 정확한 시간 계산 없이 아무 시각으로나 걸어둔 뒤, 한 번에 11:00/16:00/20:00으로 정리)
app.post("/api/schedule/rebalance-times", async (req, res) => {
  try {
    const { accountId, times, kind } = req.body || {};
    const result = await scheduleStore.rebalanceTimes({ accountId, times, kind });
    res.json(result);
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
  console.log(`\n팔자명가 스레드 + Instagram 자동화 앱이 실행되었습니다: ${url}\n`);

  if (process.platform === "darwin") {
    exec(`open "${url}"`);
  } else {
    console.log("브라우저에서 위 주소를 직접 열어주세요.");
  }
});
