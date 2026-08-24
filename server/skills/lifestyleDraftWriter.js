// "lifestyle-draft-writer" 스킬
// 파트너스 계정의 "일상글"(비-광고) 초안을 쓴다. 제품/링크/공정위 문구가 전혀 들어가지 않는다 —
// 이건 광고가 아니라 순수 콘텐츠라서, 오히려 여기에 공정위 문구나 링크를 넣으면 안 된다.
// 목적: 채널에 진짜 사람 느낌을 채워서 팔로워/노출을 키우는 것 (제품 글만 있으면 광고 계정처럼 보임).

const { runSkill } = require("../lib/claudeCliEngine");
const { LIFESTYLE_CATEGORIES } = require("../config/lifestylePresets");

function findCategory(categoryId) {
  return LIFESTYLE_CATEGORIES.find((c) => c.id === categoryId);
}

function buildSystemPrompt(profile) {
  return `당신은 Threads(스레드)에서 "엄마의 일상"을 소재로 순수 일상글(광고 아님)을 쓰는 "lifestyle-draft-writer"입니다.

[이 계정의 기본 문체 - 참고용]
${profile.styleGuide}

[일상글 작성 규칙 - 이 글은 광고가 아니다]
- 상품명, 구매 링크, 공정거래위원회 문구를 절대 넣지 않는다. 이건 순수 일상 공유 글이다.
- 첫 1~2줄 안에 강한 후킹을 넣는다 — Threads는 앞부분만 보고 스크롤할지 결정하기 때문에,
  상황을 다 설명하지 말고 임팩트 있는 한 줄이나 상황의 정점부터 던진다.
- 문장을 짧게 끊고, 진짜 겪은 일처럼 구체적인 디테일(시간, 장소, 대사)을 살린다.
- 과장된 결론이나 교훈으로 마무리하지 않는다 — 결과를 다 말해주지 않거나, 공감 가는 여운으로 끝내서
  사람들이 답글로 자기 얘기를 남기고 싶게 만든다 (Threads는 답글이 많을수록 노출이 잘 된다).
- 전체 길이는 공백 포함 500자를 넘지 않는다.
- **"ㅋㅋ"는 정말로 웃긴 상황이 아니면 절대 쓰지 않는다.** 이 계정은 쿠팡파트너스 광고가 붙는
  계정이라, 일상글이라도 습관적으로 "ㅋㅋ"를 붙이면 어설퍼 보인다 — 감정 표현은 다른 방식(말줄임,
  짧은 문장, 구체적 디테일)으로 살린다.
- 결과물은 Threads에 그대로 게시할 수 있는 완성된 본문 텍스트만 출력한다. 설명, 따옴표, 마크다운, 해시태그는 붙이지 않는다.`;
}

function buildUserMessage({ category, topicNote }) {
  return `니치: ${category.label}
니치 설명: ${category.description}
오늘 쓰고 싶은 소재/메모: ${topicNote || "(별도 메모 없음 - 이 니치에 맞게 자연스러운 에피소드를 하나 창작해줘)"}

위 소재로 Threads 일상글 초안을 하나 작성해줘.`;
}

// 프롬프트로 "ㅋㅋ 쓰지 마라"고 지시해도 가끔 새어나온다 — 사용자가 강하게 원하는 규칙이라
// 코드에서 한 번 더 강제로 걸러낸다 (2글자 이상 이어진 "ㅋ"만 제거, 진짜 웃겨서 한두 글자
// 섞인 경우까지 과하게 지우지 않도록 2개 이상만 대상으로 함).
function stripHabitualLaughter(text) {
  return text.replace(/ㅋ{2,}/g, "").replace(/[ \t]{2,}/g, " ").replace(/[ \t]+\n/g, "\n");
}

async function writeDraft({ account, categoryId, topicNote }) {
  const category = findCategory(categoryId);
  if (!category) {
    const err = new Error(`일상글 카테고리를 찾을 수 없습니다: ${categoryId}`);
    err.status = 400;
    throw err;
  }
  const raw = await runSkill({
    system: buildSystemPrompt(account.partnersProfile),
    userMessage: buildUserMessage({ category, topicNote }),
  });
  const draft = stripHabitualLaughter(raw);
  return { draft, category };
}

module.exports = { writeDraft, LIFESTYLE_CATEGORIES };
