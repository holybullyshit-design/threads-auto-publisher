// 파트너스 계정에서 "제품 홍보"가 아니라 순수 일상글(비-광고)을 쓸 때 고를 수 있는 니치.
// 광고가 아니므로 공정거래위원회 문구를 넣지 않는다 — lifestyleDraftWriter.js 참고.
// 2026년 Threads에서 반응이 좋은 포맷(공감형 하소연, 캡처하고 싶은 웃긴 순간, 짧고 강한 후킹,
// 답글을 유도하는 여운형 마무리)을 엄마 시점 콘텐츠에 맞게 카테고리로 구성했다.

const LIFESTYLE_CATEGORIES = [
  {
    id: "vent",
    label: "육아 빡침 토크",
    description: "육아하다 뚜껑 열렸던 순간을 웃프게 풀어내는 공감형 하소연",
  },
  {
    id: "kid-quotes",
    label: "아이 명언/드립",
    description: "아이가 뱉은 웃긴 말·엉뚱한 드립, 캡처해서 보여주고 싶은 순간",
  },
  {
    id: "small-win",
    label: "엄마의 소소한 승리",
    description: "육아 틈에 나 자신을 챙긴 작은 순간 — 공감과 위로를 주는 잔잔한 글",
  },
  {
    id: "husband-watch",
    label: "남편 관찰기",
    description: "남편/가족을 애정 어린 시선으로 관찰하는 유머형 에피소드",
  },
];

module.exports = { LIFESTYLE_CATEGORIES };
