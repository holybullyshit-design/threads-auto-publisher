// "partners-draft-writer" 스킬
// 쿠팡파트너스 등 제휴 마케팅 계정의 본문 초안 + 답글(제휴 링크) 카피를 작성한다.
//
// 공정거래위원회 요건: 광고 문구는 "추가 행동(클릭) 없이 바로 보이는 위치"에 있어야 한다.
// 답글은 "답글 보기"라는 추가 클릭이 필요해서 절대 금지 — 하지만 "본문 맨 앞"일 필요는 없고,
// 같은 게시물 안이면 위치는 자유롭다. 그래서 문구는 AI가 쓰지 않고, 아래에서 완성된 본문 "맨 끝"에
// 코드로 직접 붙인다 (AI의 배치 실수 가능성을 아예 없애기 위해) — 광고 냄새 나는 문장으로 시작하지
// 않으면서도, 요건은 100% 지켜진다.

const { runSkill } = require("../lib/claudeCliEngine");
const { DISCLOSURE_TEXT } = require("../config/partnersPresets");

function findCategory(profile, categoryId) {
  return profile.categories.find((c) => c.id === categoryId);
}

function buildSystemPrompt(profile) {
  return `당신은 Threads(스레드)에서 쿠팡파트너스 제휴 마케팅 콘텐츠를 쓰는 "partners-draft-writer"입니다.

[이 계정의 문체]
${profile.styleGuide}

[중요] 공정거래위원회 문구는 이 시스템이 결과물 뒤에 자동으로 붙인다 — 당신은 그 문구를
전혀 신경 쓰지 않고, 순수하게 후킹/본문 내용만 작성한다. 광고 문구, "[광고]", "이 포스팅은" 같은
표현을 절대 쓰지 않는다 (이미 다른 곳에서 처리된다).

작성 규칙 (짧고 강하게 — 잘 되는 파트너스 계정들을 보면 전부 이렇게 짧다):
- 결과물은 Threads에 그대로 게시할 수 있는 완성된 본문 텍스트만 출력한다. 설명, 따옴표, 마크다운 기호는 붙이지 않는다.
- **공정위 문구를 제외한 본문은 4~6줄, 공백 포함 150자 안팎으로 짧게 끊는다.** 상황을 3~4문장씩 풀어서
  서사로 설명하지 않는다 — 있었던 일을 한 줄로 압축해서 던지고, 바로 감탄/반응으로 잇는다.
- **첫 줄부터 반전이나 의외성으로 훅을 친다.** "아니 진짜 이럴 줄은", "아직도 ~해?", "~인 줄 알았는데" 처럼
  읽자마자 궁금해지게 시작한다. 상황 설명부터 늘어놓지 않는다.
- 말투에 인터넷 특유의 리듬(짧은 감탄, "ㄷㄷ", "실화냐", "개꿀", "미쳤음", "대박이다" 같은 표현)을
  이 계정 문체 안에서 자연스러운 만큼만 섞는다 — 과하면 이 계정 목소리가 아니라 남 글처럼 보인다.
- **"ㅋㅋ"는 정말로 웃긴 상황이 아니면 절대 쓰지 않는다.** 특히 이 계정은 쿠팡파트너스 광고 링크가
  붙는 계정이라, 아무 데나 "ㅋㅋ"를 붙이면 후기가 아니라 광고처럼 어설퍼 보인다 — 습관적으로 넣지 말 것.
- 실제로 써본 사람의 후기처럼 쓰고, 상품명을 과장하거나 확인되지 않은 효능을 단정하지 않는다.
- 구매 링크는 본문에 절대 넣지 않는다 (링크는 답글에 따로 붙는다).
- **마지막 문장이 이 글의 성패를 가른다.** "이어지는 댓글에 링크 남겨둘게", "정보는 댓글에" 같은 안내 문구는
  절대 쓰지 않는다 — 그렇게 대놓고 말하면 아무도 답글을 안 누른다.
  대신 궁금증이 확 당기는 한 줄, 반전, 결정적 임팩트로 짧게 끊어서 마무리한다.`;
}

function buildUserMessage({ category, productName, productNote }) {
  return `카테고리(니치): ${category.label}
카테고리 설명: ${category.description}
상품명: ${productName}
직접 써본 소감/추천 이유: ${productNote || "(별도 메모 없음 - 카테고리 특성에 맞게 자연스럽게 구성)"}

위 상품을 소개하는 Threads 게시글 초안을 하나 작성해줘.`;
}

// 프롬프트로 "ㅋㅋ 쓰지 마라"고 지시해도 가끔 새어나온다 — 사용자가 강하게 원하는 규칙이라
// 코드에서 한 번 더 강제로 걸러낸다 (2글자 이상 이어진 "ㅋ"만 제거).
function stripHabitualLaughter(text) {
  return text.replace(/ㅋ{2,}/g, "").replace(/[ \t]{2,}/g, " ").replace(/[ \t]+\n/g, "\n");
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

  const hookBody = await runSkill({
    system: buildSystemPrompt(profile),
    userMessage: buildUserMessage({ category, productName, productNote }),
  });

  // 공정위 문구는 AI가 아니라 여기서 직접, 본문 "맨 끝"에 확정적으로 붙인다.
  const disclosure = profile.disclosureText || DISCLOSURE_TEXT;
  const draft = `${stripHabitualLaughter(hookBody.trim())}\n\n${disclosure}`;

  return { draft, category };
}

// ---------- 답글(댓글) 카피: 링크 자체가 아니라, 링크를 감싸는 설득 문구 ----------

const REPLY_SYSTEM_PROMPT = `당신은 Threads 답글(댓글)에 붙는, 링크 앞에 오는 아주 짧은 문구를 쓰는 "partners-reply-writer"입니다.
잘 되는 파트너스 계정들을 보면 이 문구가 놀랄 만큼 짧다 — 길게 설득하지 않는다.

규칙:
- 이 상품의 핵심 장점을 **1문장, 길어도 2문장**으로 압축한다. "~까지 ~딱임!", "~해서 진짜 좋음", 짧은 감탄형으로 끝맺는다.
- 방금 쓴 후기 글의 연장선처럼 자연스럽게 이어지되, 설명하듯 늘어지지 않는다 — 툭 던지는 느낌.
- "무조건", "강추", "인생템" 같은 과장된 광고 문구는 쓰지 않는다.
- 링크나 URL은 절대 포함하지 않는다 (링크는 이 뒤에 시스템이 자동으로 붙인다).
- 전체 길이는 공백 포함 80자를 넘지 않는다.
- 결과물은 답글 본문 텍스트만 출력한다. 설명, 따옴표는 붙이지 않는다.`;

function buildReplyUserMessage({ category, productName, productNote }) {
  return `카테고리(니치): ${category.label}
상품명: ${productName}
직접 써본 소감/추천 이유: ${productNote || "(별도 메모 없음)"}

이 상품을 "왜 사야 하는지" 짧고 설득력 있게 답글 문구를 하나 써줘.`;
}

async function writeReplyCopy({ account, categoryId, productName, productNote }) {
  const profile = account.partnersProfile;
  const category = findCategory(profile, categoryId);
  const reply = await runSkill({
    system: REPLY_SYSTEM_PROMPT,
    userMessage: buildReplyUserMessage({ category, productName, productNote }),
  });
  return stripHabitualLaughter(reply);
}

module.exports = { writeDraft, writeReplyCopy };
