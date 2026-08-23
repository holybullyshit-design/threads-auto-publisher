// Threads(Meta) Graph API 연동.
// 1) /{userId}/threads 로 텍스트 미디어 컨테이너 생성
// 2) /{userId}/threads_publish 로 실제 게시
// 참고: https://developers.facebook.com/docs/threads/posts
//
// 여러 계정을 다루므로 accessToken/userId를 호출할 때마다 파라미터로 받는다.
// (이 파일은 로컬 서버와 cloud/publish-scheduled.js에서 공용으로 쓸 수 있도록
//  Node 내장 fetch만 사용하고, 외부 의존성이 없다)

const THREADS_API_BASE = "https://graph.threads.net/v1.0";
const MAX_TEXT_LENGTH = 500;

async function callGraphApi(path, params) {
  const url = new URL(`${THREADS_API_BASE}${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, value);
    }
  });

  const response = await fetch(url, { method: "POST" });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      data?.error?.message || `Threads API 요청이 실패했습니다 (HTTP ${response.status})`;
    const err = new Error(message);
    err.status = response.status;
    err.details = data;
    throw err;
  }

  return data;
}

function assertValidText(text) {
  const trimmed = (text || "").trim();
  if (!trimmed) {
    const err = new Error("게시할 내용이 비어 있습니다.");
    err.status = 400;
    throw err;
  }
  if (trimmed.length > MAX_TEXT_LENGTH) {
    const err = new Error(
      `Threads 글자 수 제한(${MAX_TEXT_LENGTH}자)을 초과했습니다. 현재 ${trimmed.length}자.`
    );
    err.status = 400;
    throw err;
  }
  return trimmed;
}

async function publishTextPost({ text, accessToken, threadsUserId }) {
  const trimmed = assertValidText(text);

  if (!accessToken || !threadsUserId) {
    const err = new Error("accessToken / threadsUserId가 필요합니다.");
    err.status = 400;
    throw err;
  }

  // 1) 미디어 컨테이너 생성
  const container = await callGraphApi(`/${threadsUserId}/threads`, {
    media_type: "TEXT",
    text: trimmed,
    access_token: accessToken,
  });

  if (!container.id) {
    throw new Error("컨테이너 생성 응답에 id가 없습니다: " + JSON.stringify(container));
  }

  // 2) 게시
  const published = await callGraphApi(`/${threadsUserId}/threads_publish`, {
    creation_id: container.id,
    access_token: accessToken,
  });

  return { containerId: container.id, publishedId: published.id, raw: published };
}

module.exports = { publishTextPost, assertValidText, MAX_TEXT_LENGTH };
