// "keyword-suggester" 스킬
// 쿠팡 상품 검색 API는 한 키워드당 최대 10개 결과로 고정돼 있고(쿠팡 쪽 하드 제한, 확장 불가),
// 트렌드/인기검색어를 알려주는 공식 API도 없다. 그래서 실제 트래픽 데이터 대신,
// 방금 검색한 키워드와 같은 니치(카테고리) 맥락에서 사람들이 실제로 검색할 법한
// 연관 키워드를 AI로 제안해서, 사용자가 다시 검색을 눌러 다른 상위 10개를 받아보게 한다.

const { runSkill } = require("../lib/claudeCliEngine");

const SYSTEM_PROMPT = `당신은 쿠팡 같은 이커머스 사이트에서 사람들이 실제로 입력할 법한 검색어를 제안하는 도우미입니다.

규칙:
- 입력된 키워드와 같은 상품군 안에서, 사람들이 실제로 검색창에 칠 법한 자연스러운 한국어 검색어를 정확히 5개 제안한다.
- 원래 키워드와 완전히 똑같은 표현은 제외한다 (띄어쓰기만 다른 것도 제외).
- 너무 뜬금없이 다른 상품군으로 새지 않는다 — 같은 니즈(같은 문제를 해결하는 상품군) 안에서 브랜드/타입/용도/대상이 다른 변형으로 제안한다.
- 각 줄에 검색어 하나씩만 출력한다. 번호, 설명, 따옴표, 이모지는 절대 붙이지 않는다.`;

function buildUserMessage(keyword, categoryLabel) {
  return `방금 검색한 키워드: "${keyword}"${categoryLabel ? `\n채널 니치(카테고리): ${categoryLabel}` : ""}

위 키워드와 같은 상품군에서, 사람들이 실제로 검색할 법한 연관 검색어 5개를 제안해줘.`;
}

async function suggestKeywords({ keyword, categoryLabel }) {
  if (!keyword) return [];
  try {
    const result = await runSkill({
      system: SYSTEM_PROMPT,
      userMessage: buildUserMessage(keyword, categoryLabel),
    });
    return result
      .split("\n")
      .map((line) => line.replace(/^[-*\d.\s]+/, "").trim())
      .filter(Boolean)
      .filter((line) => line !== keyword)
      .slice(0, 5);
  } catch {
    // 제안 생성은 부가 기능이라, 실패해도 검색 결과 자체는 그대로 보여준다.
    return [];
  }
}

module.exports = { suggestKeywords };
