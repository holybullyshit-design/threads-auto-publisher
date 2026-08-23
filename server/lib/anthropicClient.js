const Anthropic = require("@anthropic-ai/sdk");

let client = null;

// API 키가 없어도 서버 자체는 뜨도록, 클라이언트는 지연 생성한다.
// (설정 화면/미리보기 화면은 열리되, 실제 생성 버튼을 누를 때 에러 메시지로 안내)
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    const err = new Error(
      "ANTHROPIC_API_KEY가 설정되지 않았습니다. .env 파일을 확인해주세요."
    );
    err.code = "MISSING_ANTHROPIC_KEY";
    throw err;
  }
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

function getModel() {
  return process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
}

// system 프롬프트 + user 메시지를 넣어 텍스트 응답 하나를 받아오는 공용 헬퍼.
async function runSkill({ system, userMessage, maxTokens = 1024 }) {
  const anthropic = getClient();
  const response = await anthropic.messages.create({
    model: getModel(),
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: userMessage }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock) {
    throw new Error("Claude 응답에서 텍스트를 찾을 수 없습니다.");
  }
  return textBlock.text.trim();
}

module.exports = { runSkill };
