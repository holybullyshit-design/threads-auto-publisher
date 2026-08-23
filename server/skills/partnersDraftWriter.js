// "partners-draft-writer" 스킬
// 쿠팡파트너스 등 제휴 마케팅 계정의 초안을 작성한다.
// 공정거래위원회 문구를 "본문 맨 앞"에 반드시 포함시키는 게 이 스킬의 핵심 제약이다.
// (문구 위치가 하단이면 실제로 수익이 몰수된 사례가 있어 절대 타협하지 않는다)

const { runSkill } = require("../lib/claudeCliEngine");
const { DISCLOSURE_TEXT } = require("../config/partnersPresets");

function findCategory(profile, categoryId) {
  return profile.categories.find((c) => c.id === categoryId);
}

function buildSystemPrompt(profile) {
  const disclosure = profile.disclosureText || DISCLOSURE_TEXT;
  return `당신은 Threads(스레드)에서 쿠팡파트너스 제휴 마케팅 콘텐츠를 쓰는 "partners-draft-writer"입니다.

[이 계정의 문체]
${profile.styleGuide}

[반드시 지켜야 할 규칙 - 공정거래위원회 요건]
- 결과물의 **가장 첫 줄**은 예외 없이 아래 문구 그대로여야 한다 (문구를 바꾸거나 하단에 배치하는 것 절대 금지):
"${disclosure}"
- 이 문구 뒤에 한 줄을 띄우고 본문을 시작한다.

작성 규칙:
- 결과물은 Threads에 그대로 게시할 수 있는 완성된 본문 텍스트만 출력한다. 설명, 따옴표, 마크다운 기호는 붙이지 않는다.
- 전체 길이는 공백 포함 500자를 넘지 않는다 (Threads 글자 수 제한, 공정위 문구 포함).
- 실제로 써본 사람의 후기처럼 자연스럽게 쓰고, 상품명을 과장하거나 확인되지 않은 효능을 단정하지 않는다.
- 본문 안에 "[여기에 구매 링크]" 라는 자리표시자를 자연스러운 위치(보통 마지막)에 넣는다 — 실제 링크는 사용자가 직접 붙여넣는다.`;
}

function buildUserMessage({ category, productName, productNote }) {
  return `카테고리(니치): ${category.label}
카테고리 설명: ${category.description}
상품명: ${productName}
직접 써본 소감/추천 이유: ${productNote || "(별도 메모 없음 - 카테고리 특성에 맞게 자연스럽게 구성)"}

위 상품을 소개하는 Threads 게시글 초안을 하나 작성해줘.`;
}

async function writeDraft({ account, categoryId, productName, productNote }) {
  const profile = account.partnersProfile;
  const category = findCategory(profile, categoryId);
  if (!category) {
    const err = new Error(`이 계정에 없는 카테고리입니다: ${categoryId}`);
    err.status = 400;
    throw err;
  }
  if (!productName) {
    const err = new Error("상품명을 입력해주세요.");
    err.status = 400;
    throw err;
  }

  const draft = await runSkill({
    system: buildSystemPrompt(profile),
    userMessage: buildUserMessage({ category, productName, productNote }),
    maxTokens: 700,
  });

  return { draft, category };
}

module.exports = { writeDraft };
