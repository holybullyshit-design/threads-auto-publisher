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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 컨테이너를 만들자마자 바로 게시 요청하면, 메타 쪽에서 아직 컨테이너 처리가 안 끝나서
// "The requested resource does not exist" 에러가 가끔 난다(2026-08-24, 사주 계정 2개 동시 실패로
// 실제 확인됨 — 토큰/threadsUserId는 둘 다 정상이었음, 타이밍 문제로 판단). 그래서 게시 전에
// 잠깐 기다리고, 그래도 이 에러가 나면 한 번 더 재시도한다.
async function publishContainer(threadsUserId, containerId, accessToken) {
  await sleep(3000);
  try {
    return await callGraphApi(`/${threadsUserId}/threads_publish`, {
      creation_id: containerId,
      access_token: accessToken,
    });
  } catch (err) {
    if (err.status === 400 && /does not exist/i.test(err.message)) {
      await sleep(5000);
      return await callGraphApi(`/${threadsUserId}/threads_publish`, {
        creation_id: containerId,
        access_token: accessToken,
      });
    }
    throw err;
  }
}

async function publishTextPost({ text, accessToken, threadsUserId, replyToId }) {
  const trimmed = assertValidText(text);

  if (!accessToken || !threadsUserId) {
    const err = new Error("accessToken / threadsUserId가 필요합니다.");
    err.status = 400;
    throw err;
  }

  // 1) 미디어 컨테이너 생성 (replyToId가 있으면 그 글에 달리는 답글이 된다)
  const container = await callGraphApi(`/${threadsUserId}/threads`, {
    media_type: "TEXT",
    text: trimmed,
    reply_to_id: replyToId,
    access_token: accessToken,
  });

  if (!container.id) {
    throw new Error("컨테이너 생성 응답에 id가 없습니다: " + JSON.stringify(container));
  }

  // 2) 게시
  const published = await publishContainer(threadsUserId, container.id, accessToken);

  return { containerId: container.id, publishedId: published.id, raw: published };
}

// 이미지 1~여러 장 + 본문 텍스트를 게시한다.
// - 이미지 1장: media_type=IMAGE 컨테이너 하나로 바로 게시
// - 이미지 2장 이상: 각 이미지를 캐러셀 아이템 컨테이너로 만든 뒤, CAROUSEL 컨테이너로 묶어서 게시
// imageUrls: 인터넷에 공개적으로 접근 가능한 이미지 URL 배열 (로컬 파일 경로 불가)
async function publishImagePost({ text, imageUrls, accessToken, threadsUserId }) {
  const trimmed = assertValidText(text || "");

  if (!accessToken || !threadsUserId) {
    const err = new Error("accessToken / threadsUserId가 필요합니다.");
    err.status = 400;
    throw err;
  }
  if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
    const err = new Error("imageUrls가 비어 있습니다.");
    err.status = 400;
    throw err;
  }

  let creationId;

  if (imageUrls.length === 1) {
    const container = await callGraphApi(`/${threadsUserId}/threads`, {
      media_type: "IMAGE",
      image_url: imageUrls[0],
      text: trimmed,
      access_token: accessToken,
    });
    if (!container.id) throw new Error("이미지 컨테이너 생성 실패: " + JSON.stringify(container));
    creationId = container.id;
  } else {
    // 1) 캐러셀 아이템(자식) 컨테이너들을 먼저 만든다 (텍스트 없이, is_carousel_item=true)
    const childIds = [];
    for (const url of imageUrls) {
      const child = await callGraphApi(`/${threadsUserId}/threads`, {
        media_type: "IMAGE",
        image_url: url,
        is_carousel_item: true,
        access_token: accessToken,
      });
      if (!child.id) throw new Error("캐러셀 아이템 컨테이너 생성 실패: " + JSON.stringify(child));
      childIds.push(child.id);
    }
    // 2) 부모 CAROUSEL 컨테이너 생성 (여기에 본문 텍스트를 붙인다)
    const parent = await callGraphApi(`/${threadsUserId}/threads`, {
      media_type: "CAROUSEL",
      children: childIds.join(","),
      text: trimmed,
      access_token: accessToken,
    });
    if (!parent.id) throw new Error("캐러셀 컨테이너 생성 실패: " + JSON.stringify(parent));
    creationId = parent.id;
  }

  const published = await publishContainer(threadsUserId, creationId, accessToken);

  return { containerId: creationId, publishedId: published.id, raw: published };
}

module.exports = { publishTextPost, publishImagePost, assertValidText, MAX_TEXT_LENGTH };
