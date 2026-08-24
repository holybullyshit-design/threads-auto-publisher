// 쿠팡파트너스 Open API 연동 (검색 API).
// HMAC-SHA256 서명 인증 방식 (쿠팡파트너스 공식 Open API 규격).
// 상품명(키워드)을 넣으면 공식 이미지 1장 + 상품명 + 가격 + "이미 제휴 추적 코드가 박힌" 구매 링크를
// 한 번에 돌려준다 — 별도 딥링크 변환 단계가 필요 없다.

const crypto = require("crypto");

const API_HOST = "https://api-gateway.coupang.com";
const SEARCH_PATH = "/v2/providers/affiliate_open_api/apis/openapi/products/search";
const DEEPLINK_PATH = "/v2/providers/affiliate_open_api/apis/openapi/v1/deeplink";

function pad2(n) {
  return String(n).padStart(2, "0");
}

// 쿠팡 Open API가 요구하는 서명용 날짜 포맷: yyMMdd'T'HHmmss'Z' (UTC)
function signedDateNow() {
  const d = new Date();
  return (
    String(d.getUTCFullYear()).slice(2) +
    pad2(d.getUTCMonth() + 1) +
    pad2(d.getUTCDate()) +
    "T" +
    pad2(d.getUTCHours()) +
    pad2(d.getUTCMinutes()) +
    pad2(d.getUTCSeconds()) +
    "Z"
  );
}

function buildAuthHeader(method, pathWithQuery, accessKey, secretKey) {
  const [pathOnly, query = ""] = pathWithQuery.split("?");
  const signedDate = signedDateNow();
  const message = signedDate + method + pathOnly + query;
  const signature = crypto.createHmac("sha256", secretKey).update(message).digest("hex");
  return `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${signedDate}, signature=${signature}`;
}

function getKeys() {
  const accessKey = process.env.COUPANG_ACCESS_KEY;
  const secretKey = process.env.COUPANG_SECRET_KEY;
  if (!accessKey || !secretKey) {
    const err = new Error(
      "COUPANG_ACCESS_KEY / COUPANG_SECRET_KEY가 설정되지 않았습니다. .env 파일을 확인해주세요."
    );
    err.status = 500;
    throw err;
  }
  return { accessKey, secretKey };
}

// 키워드로 쿠팡 상품을 검색한다. (봇 차단과 무관한 공식 API — 스크래핑이 아니다)
async function searchProducts(keyword, { limit = 10 } = {}) {
  if (!keyword || !keyword.trim()) {
    const err = new Error("검색할 상품명(키워드)을 입력해주세요.");
    err.status = 400;
    throw err;
  }
  const { accessKey, secretKey } = getKeys();
  const query = `keyword=${encodeURIComponent(keyword.trim())}&limit=${Number(limit) || 10}`;
  const pathWithQuery = `${SEARCH_PATH}?${query}`;
  const authorization = buildAuthHeader("GET", pathWithQuery, accessKey, secretKey);

  const res = await fetch(API_HOST + pathWithQuery, {
    method: "GET",
    headers: { Authorization: authorization, "Content-Type": "application/json" },
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok || data.rCode !== "0") {
    const err = new Error(
      "쿠팡 상품 검색에 실패했습니다: " + (data.rMessage || `HTTP ${res.status}`)
    );
    err.status = res.status >= 400 ? res.status : 502;
    throw err;
  }

  const products = (data.data?.productData || []).map((p) => {
    // productUrl(AFFSDP 리다이렉트 링크)에서 itemId를 뽑아, 딥링크 API가 받아들이는
    // "정식 상품 페이지 URL"을 별도로 만들어둔다 (딥링크 API는 리다이렉트 링크 자체는 거부한다).
    let itemId = null;
    try {
      itemId = new URL(p.productUrl).searchParams.get("itemId");
    } catch {
      /* URL 파싱 실패 시 무시 */
    }
    const canonicalUrl = `https://www.coupang.com/vp/products/${p.productId}${itemId ? `?itemId=${itemId}` : ""}`;

    return {
      productId: p.productId,
      productName: p.productName,
      productPrice: p.productPrice,
      productImage: p.productImage,
      productUrl: p.productUrl, // 이미 제휴 추적 코드가 포함된 링크 (사람이 클릭해서 들어가는 용도)
      canonicalUrl, // 딥링크(단축 URL) 생성 API에 넘길 정식 상품 페이지 URL
      categoryName: p.categoryName,
      isRocket: p.isRocket,
      isFreeShipping: p.isFreeShipping,
    };
  });

  return { products, disclosureNotice: data.rMessage || "" };
}

// 긴 추적 파라미터가 잔뜩 붙은 링크를 짧은 link.coupang.com/a/xxxx 형태로 줄인다.
// (Threads 500자 제한 안에서 링크를 두 번 넣어야 할 때 특히 필요)
async function createDeeplink(url) {
  const { accessKey, secretKey } = getKeys();
  const authorization = buildAuthHeader("POST", DEEPLINK_PATH, accessKey, secretKey);
  const body = JSON.stringify({ coupangUrls: [url] });

  const res = await fetch(API_HOST + DEEPLINK_PATH, {
    method: "POST",
    headers: { Authorization: authorization, "Content-Type": "application/json" },
    body,
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok || data.rCode !== "0" || !data.data?.[0]?.shortenUrl) {
    const err = new Error("링크 단축에 실패했습니다: " + (data.rMessage || `HTTP ${res.status}`));
    err.status = res.status >= 400 ? res.status : 502;
    throw err;
  }
  return data.data[0].shortenUrl;
}

module.exports = { searchProducts, createDeeplink };
