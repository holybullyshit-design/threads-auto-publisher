// 파트너스(제휴 마케팅) 계정을 추가할 때 고를 수 있는 템플릿.
// 니치(카테고리)별로 공정위 문구, 문체 가이드가 다르지 않고 공통 규칙을 따르므로
// 사주처럼 채널마다 다른 템플릿을 여러 개 두지 않고, 니치 목록만 다르게 구성해서 쓴다.

const DISCLOSURE_TEXT =
  "이 게시물은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.";

const PARTNERS_PRESETS = {
  "coupang-general": {
    name: "쿠팡파트너스 일반형",
    categories: [
      { id: "home-goods", label: "생활꿀템", description: "주방/욕실/청소 등 고민 없이 바로 사는 생활용품" },
      { id: "seasonal", label: "계절가전", description: "선풍기, 히터 등 계절마다 반복 구매되는 가전" },
      { id: "baby-kids", label: "육아용품", description: "부모가 재구매하는 소모성 육아템" },
      { id: "pet", label: "반려동물용품", description: "사료, 간식, 위생용품 등 반려동물 소모품" },
      { id: "beauty", label: "가성비뷰티", description: "가격 대비 만족도 높은 뷰티 소모품" },
      { id: "camping", label: "캠핑/차박소품", description: "캠핑·차박용 소품 및 편의용품" },
      { id: "kitchen-storage", label: "주방/수납용품", description: "주방 정리, 밀폐용기, 수납 등 살림 효율템" },
      { id: "health-food", label: "건강기능식품", description: "유산균, 비타민 등 가족이 챙겨 먹는 건강식품" },
      { id: "kids-edu-toy", label: "아동교육/장난감", description: "아이 발달·놀이·학습용 장난감과 교구" },
      { id: "fashion", label: "패션/잡화", description: "엄마·아이 옷, 신발, 가방 등 데일리 패션" },
      { id: "car", label: "차량용품", description: "카시트, 방향제 등 가족 차량에 쓰는 용품" },
      { id: "office", label: "문구/오피스", description: "재택·홈스쿨링에 쓰는 문구·사무용품" },
      { id: "it-appliance", label: "IT/생활가전", description: "무선청소기, 에어프라이어 등 편의 가전" },
      { id: "interior", label: "인테리어 소품", description: "집을 예쁘게 만드는 저부담 인테리어 소품" },
    ],
    styleGuide: `- 광고 티가 나지 않게, "내가 직접 써보고 좋아서 공유한다"는 후기 어조로 쓴다 (과장 광고 문구 금지).
- 반말/존댓말 어느 쪽이든 가능하지만, 친근하고 담백한 반말체를 기본으로 한다.
- 문장을 짧게 끊고, 실제 사용 상황(언제/왜 필요했는지)을 구체적으로 묘사하며 시작한다.
- 상품의 장점을 1~2가지로 좁혀서 설명한다 (장점 나열식 광고 문구 금지).
- 과장된 확언("무조건", "인생템", "무조건 사세요")은 피하고, "나는 이래서 좋았다"는 개인 경험 톤을 유지한다.`,
    closingLine: "",
  },
};

module.exports = { PARTNERS_PRESETS, DISCLOSURE_TEXT };
