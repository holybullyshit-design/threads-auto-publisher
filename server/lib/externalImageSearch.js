// Google Programmable Search(Custom Search JSON API)의 이미지 검색으로, 쿠팡 외 다른 곳에서
// 같은 상품의 사진 후보를 찾아서 사용자에게 보여주는 용도. 자동으로 아무거나 골라서 쓰지 않는다 —
// 후보만 보여주고, 실제로 쓸지/어떤 걸 쓸지는 항상 사람이 클릭해서 결정한다.
//
// (2026-08-24: 원래 네이버쇼핑 검색 API로 만들었는데, 그 API 자체가 2026-07-31부로 완전
// 폐지되어(공식 대체 API도 없음) 구글 Custom Search로 교체했다. 특정 업체 API에 다시 종속되면
// 또 같은 일이 생길 수 있어서, 이 모듈의 인터페이스는 provider-agnostic하게 유지한다.)
//
// 필요: GOOGLE_CSE_API_KEY / GOOGLE_CSE_CX (.env)
//   1) https://console.cloud.google.com/apis/library/customsearch.googleapis.com 에서
//      "Custom Search API" 사용 설정 -> API 키 발급 (GOOGLE_CSE_API_KEY)
//   2) https://programmablesearchengine.google.com/controlpanel/all 에서 검색엔진 새로 만들기
//      -> "전체 웹 검색"으로 설정 -> 설정에서 "이미지 검색" 켜기 -> 검색엔진 ID 복사 (GOOGLE_CSE_CX)
// 무료 티어: 하루 100건. 설정 안 돼 있으면 isConfigured()가 false를 돌려주고,
// 이 기능을 쓰는 쪽(프론트엔드)에서 버튼 자체를 숨긴다.

const API_URL = "https://www.googleapis.com/customsearch/v1";

function isConfigured() {
  return Boolean(process.env.GOOGLE_CSE_API_KEY && process.env.GOOGLE_CSE_CX);
}

async function searchProductImages(keyword, { count = 8 } = {}) {
  if (!isConfigured()) {
    const err = new Error("GOOGLE_CSE_API_KEY / GOOGLE_CSE_CX가 설정되지 않았습니다.");
    err.status = 500;
    throw err;
  }
  if (!keyword) {
    const err = new Error("검색어(keyword)가 필요합니다.");
    err.status = 400;
    throw err;
  }

  const params = new URLSearchParams({
    key: process.env.GOOGLE_CSE_API_KEY,
    cx: process.env.GOOGLE_CSE_CX,
    q: keyword,
    searchType: "image",
    num: String(Math.min(count, 10)), // 구글 CSE 한 번 호출당 최대 10개
    safe: "active",
  });

  const res = await fetch(`${API_URL}?${params.toString()}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error("이미지 검색에 실패했습니다: " + (data.error?.message || `HTTP ${res.status}`));
  }

  return (data.items || []).map((item) => ({
    title: item.title || "",
    image: item.link, // 이미지 직링크
    mallName: item.displayLink || "", // 출처 사이트 도메인 (쇼핑몰 이름 대신)
    price: "",
    link: item.image?.contextLink || "",
  }));
}

module.exports = { isConfigured, searchProductImages };
