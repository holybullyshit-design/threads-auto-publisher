// Threads 계정 "자동 연결" (OAuth) 헬퍼.
// 사용자가 버튼 한 번만 누르면, User ID / Access Token을 직접 복사-붙여넣기 하지 않아도
// 자동으로 받아오도록 하는 흐름을 구현한다.
//
// 1) buildAuthorizeUrl(state)  -> 이 URL로 사용자를 보내면 Threads 로그인/권한 승인 화면이 뜬다
// 2) 승인 후 redirect_uri로 code가 돌아오면 exchangeCodeForShortLivedToken(code) 호출
// 3) 받은 단기 토큰을 exchangeForLongLivedToken(shortToken) 으로 60일짜리로 교환
//
// 참고: https://developers.facebook.com/documentation/threads/get-started/get-access-tokens-and-permissions

const AUTHORIZE_BASE = "https://threads.net/oauth/authorize";
const TOKEN_EXCHANGE_URL = "https://graph.threads.net/oauth/access_token";
const LONG_LIVED_EXCHANGE_URL = "https://graph.threads.net/access_token";

const SCOPES = "threads_basic,threads_content_publish";

function getConfig() {
  const appId = process.env.THREADS_APP_ID;
  const appSecret = process.env.THREADS_APP_SECRET;
  const redirectUri = process.env.THREADS_REDIRECT_URI;
  if (!appId || !appSecret || !redirectUri) {
    const err = new Error(
      "THREADS_APP_ID / THREADS_APP_SECRET / THREADS_REDIRECT_URI가 설정되지 않았습니다. .env 파일과 README를 확인해주세요."
    );
    err.code = "MISSING_THREADS_APP_CONFIG";
    throw err;
  }
  return { appId, appSecret, redirectUri };
}

function isConfigured() {
  return Boolean(process.env.THREADS_APP_ID && process.env.THREADS_APP_SECRET && process.env.THREADS_REDIRECT_URI);
}

function buildAuthorizeUrl(state) {
  const { appId, redirectUri } = getConfig();
  const url = new URL(AUTHORIZE_BASE);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  return url.toString();
}

async function exchangeCodeForShortLivedToken(code) {
  const { appId, appSecret, redirectUri } = getConfig();
  const body = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    code,
  });

  const res = await fetch(TOKEN_EXCHANGE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error("단기 토큰 교환에 실패했습니다: " + (data?.error_message || JSON.stringify(data)));
  }
  return { accessToken: data.access_token, userId: String(data.user_id) };
}

async function exchangeForLongLivedToken(shortLivedToken) {
  const { appSecret } = getConfig();
  const url = new URL(LONG_LIVED_EXCHANGE_URL);
  url.searchParams.set("grant_type", "th_exchange_token");
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("access_token", shortLivedToken);

  const res = await fetch(url, { method: "GET" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error("장기 토큰 교환에 실패했습니다: " + (data?.error?.message || JSON.stringify(data)));
  }
  return { accessToken: data.access_token, expiresIn: data.expires_in };
}

// Meta 개발자 페이지의 "사용자 토큰 생성기"로 직접 발급받은 토큰은 User ID를 알려주지 않는다.
// 토큰만으로 /me를 조회해서 User ID + username을 찾아준다.
async function lookupUserByToken(accessToken) {
  const url = new URL("https://graph.threads.net/v1.0/me");
  url.searchParams.set("fields", "id,username");
  url.searchParams.set("access_token", accessToken);

  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.id) {
    throw new Error("토큰으로 계정 정보를 찾지 못했습니다: " + (data?.error?.message || JSON.stringify(data)));
  }
  return { userId: String(data.id), username: data.username };
}

module.exports = {
  isConfigured,
  buildAuthorizeUrl,
  exchangeCodeForShortLivedToken,
  exchangeForLongLivedToken,
  lookupUserByToken,
};
