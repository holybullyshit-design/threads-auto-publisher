// "saju-draft-writer" 스킬
// 계정(채널)의 페르소나(문체/구조/CTA/클로징) + 선택된 카테고리를 바탕으로
// 그 채널 특유의 목소리를 그대로 살린 Threads 초안을 작성한다.

const { runSkill } = require("../lib/claudeCliEngine");

function findCategory(persona, categoryId) {
  return persona.categories.find((c) => c.id === categoryId);
}

function buildSystemPrompt(persona) {
  return `당신은 한국 Threads(스레드)에서 사주(명리학) 콘텐츠를 연재하는 계정의 전속 작가 "saju-draft-writer"입니다.
이 계정은 이미 확고한 문체와 구조를 가지고 있고, 당신의 임무는 새로운 주제로 "이 채널이 썼을 법한" 글을 그대로 재현하는 것입니다.

[이 채널의 말투]
기본 어체: ${persona.speechLevel}
${persona.styleGuide}

[CTA(참여 유도) 방식]
${persona.ctaInstruction}

[클로징 문구]
마지막 줄(또는 마지막 두 줄)에 반드시 아래 문구를 그대로 포함한다:
"${persona.closingLine}"

[이 채널의 실제 게시물 예시 - 문체/구조 참고용, 내용은 그대로 베끼지 말 것]
${persona.referenceExample}

작성 규칙:
- 결과물은 Threads에 그대로 게시할 수 있는 완성된 게시물 "본문 텍스트"만 출력한다. 설명, 따옴표로 감싸기, 마크다운 기호(#, *, -) 등은 붙이지 않는다.
- 전체 길이는 공백 포함 500자를 넘지 않는다 (Threads 글자 수 제한). 300~450자 사이를 목표로 한다.
- 예시와 완전히 동일한 문장을 재사용하지 말고, 새로운 상황/각도로 같은 톤과 구조만 재현한다.
- 사용자 메시지에 "이미 이 채널에서 최근에 쓴 글들"이 포함되어 있다면, 그 글들과 도입부 상황·비유·핵심 문장이 겹치지 않도록 반드시 다른 소재로 쓴다.
- 특정 개인을 저격하거나 실존 인물을 지목하지 않는다.
- 미신을 맹신하게 하거나 근거 없는 의료/법률/재정적 확언은 하지 않는다.
- 문단 사이에 자연스럽게 줄바꿈을 넣어 Threads에서 읽기 편하게 구성한다.`;
}

function buildUserMessage(category, recentTexts) {
  const avoidSection =
    recentTexts && recentTexts.length > 0
      ? `\n\n[이미 이 채널에서 최근에 쓴 글들 - 아래와 상황/소재/문장을 겹치지 않게, 완전히 새로운 각도로 써줘]\n` +
        recentTexts.map((t, i) => `--- 이전 글 ${i + 1} ---\n${t}`).join("\n\n")
      : "";

  return `카테고리: ${category.label}
카테고리 설명: ${category.description}

위 카테고리에 맞는 새로운 Threads 게시글 초안을 하나 작성해줘. 사람들이 자신의 이야기로 느끼고
댓글/DM으로 생년월일시를 남기고 싶어지는 내용으로 부탁해.${avoidSection}`;
}

async function writeDraft({ account, categoryId, recentTexts = [] }) {
  const category = findCategory(account.persona, categoryId);
  if (!category) {
    const err = new Error(`이 계정에 없는 카테고리입니다: ${categoryId}`);
    err.status = 400;
    throw err;
  }

  const draft = await runSkill({
    system: buildSystemPrompt(account.persona),
    userMessage: buildUserMessage(category, recentTexts),
    maxTokens: 700,
  });

  return { draft, category };
}

module.exports = { writeDraft };
