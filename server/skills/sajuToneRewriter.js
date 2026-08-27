// "saju-tone-rewriter" 스킬
// 사용자가 미리보기 화면에서 직접 수정한 글을, 해당 계정(채널)의 고정된 문체/구조/클로징에
// 다시 맞춰 다듬는다. (예전 버전처럼 "다정한/냉철한" 같은 범용 톤을 고르는 방식이 아니라,
// 계정마다 이미 정해진 채널 목소리 하나로 고정 정렬한다)

const { runSkill } = require("../lib/claudeCliEngine");

// sajuDraftWriter.js와 동일한 이유로 카테고리별 CTA/클로징 오버라이드를 지원한다
// (카테고리 성격상 페르소나 기본 CTA/클로징 문구가 안 맞는 경우가 있을 수 있어서 — 예:
// 아직 벌어지지 않은 일을 전제하는 클로징을 그대로 붙이면 말이 안 되는 카테고리).
function buildSystemPrompt(persona, category) {
  const ctaInstruction = category?.ctaInstruction || persona.ctaInstruction;
  const closingLine = category?.closingLine || persona.closingLine;

  return `당신은 Threads 게시글의 문체를 "${persona.speechLevel}" 채널 목소리에 맞게 다듬는 "saju-tone-rewriter"입니다.

[이 채널의 말투]
기본 어체: ${persona.speechLevel}
${persona.styleGuide}

[CTA(참여 유도) 방식 - 이 카테고리 기준]
${ctaInstruction}

[클로징 문구 - 이 카테고리 기준]
마지막 줄(또는 마지막 두 줄)에 반드시 아래 문구를 그대로 포함한다:
"${closingLine}"

[절대 다루지 않는 주제]
임신, 난임, 유산, 사산, 불임 시술(시험관/인공수정 등)은 원문에 그 내용이 있더라도 다듬은
결과물에는 절대 포함하지 않는다. 오랫동안 아이를 기다리며 매달 상심하는 사람들이 읽는 주제라,
"사주로 시기를 알려주겠다"는 문장 하나가 가벼운 콘텐츠가 아니라 아픈 곳을 찌르는 말이 된다.
원문이 이 주제를 다루고 있다면 다듬지 말고 그 사실만 언급해라.

작성 규칙:
- 원문에 담긴 핵심 정보/메시지/카테고리는 그대로 유지하되, 말투/구조/클로징만 이 채널 스타일에 맞게 다시 쓴다.
- 결과물은 Threads에 그대로 게시할 수 있는 완성된 본문 텍스트만 출력한다. 설명, 따옴표, 마크다운 기호는 붙이지 않는다.
- 전체 길이는 공백 포함 500자를 넘지 않는다 (Threads 글자 수 제한).`;
}

function buildUserMessage(text) {
  return `[원문]
${text}

위 원문을 이 채널의 말투/구조/클로징에 맞게 다시 다듬어줘.`;
}

async function polishDraft({ account, text, categoryId }) {
  if (!text || !text.trim()) {
    const err = new Error("다듬을 원문 텍스트가 비어 있습니다.");
    err.status = 400;
    throw err;
  }

  const category = categoryId ? account.persona.categories.find((c) => c.id === categoryId) : null;

  const rewritten = await runSkill({
    system: buildSystemPrompt(account.persona, category),
    userMessage: buildUserMessage(text),
    maxTokens: 700,
  });

  return { rewritten };
}

module.exports = { polishDraft };
