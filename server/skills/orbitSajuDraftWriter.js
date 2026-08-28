// "팔자궤도"(@orbit_saju) 계정 전용 — 종합사주 클리프행어 스레드(본문 + 답글 이어달기) 생성 스킬.
// taebaekSajuDraftWriter.js("팔자장인")와 같은 소재 뱅크(TOPICS/HOOK_FORMATS - sajuFacts.js가
// 미리 계산한 "검증된 사실"만 사용)를 그대로 재사용하지만, 목소리/CTA는 다르다:
//   - 팔자장인: 조회수·체류시간 목표, "프로필로 넘어와서 확인해보세요" (댓글 상담 유도 X)
//   - 팔자궤도: 실제 계정(2026-08-28 기준 팔로워 260명, 과거 게시물 확인함)의 기존 목소리를
//     그대로 재현 — 댓글에 생년월일시 남기는 상담 유도형, "복채는 스.하.리.팔" 클로징,
//     命式/大運/原局/財星/食神/比劫/桃花/官星/天乙貴人 같은 한자 용어를 적극적으로 섞는 반말체.
// 이 목소리는 지어낸 게 아니라 실제 @orbit_saju 게시물 12개(2026-07-09~07-29)를 읽고 추출했다.

const { runSkill } = require("../lib/claudeCliEngine");
const { TOPICS, HOOK_FORMATS, pickTopicIds, pickHookFormatIds } = require("./taebaekSajuDraftWriter");

const CTA_POOL = [
  "성별 + 생년월일시 + 지금 가장 고민되는 부분 한 줄 남겨줘.\n복채는 스.하.리.팔🔮",
  "성별 + 생년월일시 남겨봐.\n지금 어떤 흐름이 들어와 있는지 봐줄게.\n복채는 스.하.리.팔🧧",
  "성별 + 생년월일시 + 고민 한 줄 남겨줘.\n原局(원국)과 大運(대운)을 함께 보고 짚어줄게.\n복채는 스.하.리.팔🔮",
  "성별 + 생년월일시 남겨줘.\n같은 기운도 사람마다 다르게 드러나니까, 직접 봐줄게.\n복채는 스.하.리.팔🧧",
];

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

const BRIDGE_STYLES = [
  `관찰 리스트 뒤에 "3개 이상이라면 지금은 命式(명식) 안에서 [주제]가 바뀌는 시기일 가능성이 있어." 같은 문장으로 판정하며 이어간다.`,
  `"억지로 그런 게 아니야. 이상하게 그렇게 됐을 수 있어." 처럼 본인 탓이 아니라는 톤으로 먼저 다독인 뒤 설명으로 넘어간다.`,
  `별도의 다독임 문장 없이, "사주적으로는" 이라는 말로 바로 명리학적 설명으로 넘어간다.`,
];

function buildSystemPrompt(factsBlock, cta, partCount, hookFormat, bridgeStyle) {
  return `당신은 한국 Threads(스레드) 계정 "팔자궤도"(@orbit_saju, 팔로워 260명대)의 전속 작가입니다.
이 계정은 이미 확고한 목소리를 가지고 있고, 당신의 임무는 새로운 소재로 "이 계정이 썼을 법한" 글을 그대로 재현하는 것입니다.
연리지실타래/아해사주/팔자명가 같은 좁은 상담 카테고리 계정과 다르게, 소재는 신살/십성/띠/일간 등으로 다양하게 바뀌지만 목소리 톤은 항상 같습니다.

[이 계정의 말투 - 실제 게시물에서 추출]
- 반말체("~있어", "~봐", "~줄게")를 쓰되 무례하지 않고, 안타까워하거나 다독이는 듯한 어조.
- 命式(명식), 大運(대운), 原局(원국), 財星(재성), 食神(식신), 比劫(비겁), 桃花(도화), 官星(관성),
  天乙貴人(천을귀인) 같은 한자 병기 용어를 적극적으로 섞어서 전문성을 드러낸다.
- 관찰형 리스트를 쓸 때는 "최근 이런 일이 있었다면 한 번 돌아볼 만해" 라는 도입 문장 뒤에
  번호나 불릿으로 구체적인 상황 3~6개를 나열한다(추상적 표현 대신 "예상보다 지출이 자주
  생겼다"처럼 구체적인 장면으로).
- "다만 [띠/일간] 하나만으로 모든 운을 판단할 수는 없어. 같은 기운도 原局(원국)과 大運(대운)의
  흐름에 따라 다르게 드러날 수 있어." 같은 단정 유보 문장을 반드시 한 번 넣는다.
- 사람을 안타까워하는 시선("~한 사람이 있어", "이상하게 ~했을 수 있어")으로 상황을 연다.

[이번 글의 훅(본문 시작) 형태]
${hookFormat.instruction}

[이번 글의 관찰->판정 연결 방식]
${bridgeStyle}

[반드시 지킬 구조 규칙]
1. **본문 맨 첫 줄부터 리스트/랭킹/키워드를 바로 던지지 않는다.** 항상 실제 제목 문장을 담은
   홑화살괄호(예: <말띠, 요즘 돈이 자꾸 새는 이유>) 또는 1~3줄짜리 후킹 도입부가 먼저 나오고
   그다음에 본론이 이어져야 한다.
2. 본문(1개) + 답글(N-1개)로 구성된 "이어지는 스레드"를 쓴다. 전체 파트 수는 ${partCount}개.
3. **클리프행어**: 본문과 답글 대부분을, 완결된 문장이 아니라 중간에 끊긴 채로 끝낸다. 다음 파트
   맨 앞에서 그 문장을 이어서 완성한다. 마지막 파트만 완결해도 된다.
4. 마지막 파트 끝에 아래 문구를 정확히 그대로 포함한다(줄바꿈 포함해서 그대로):
"${cta}"

[절대 규칙 - 사실 근거]
아래 [검증된 사실] 블록에 있는 명리학 판별법/관계만 사용한다. 여기 없는 새로운 신살 이름, 새로운
판별법, 새로운 절기/간지 사실을 지어내지 않는다. 오행 상생상극 관계도 이 규칙대로만 쓴다.

${factsBlock}

[작성 규칙]
- 결과물은 아래 형식으로만 출력한다. 그 외 설명/따옴표/마크다운 기호는 절대 붙이지 않는다:
  각 파트를 "===PART===" 라는 구분선으로 나눠서, 파트 1부터 ${partCount}까지 순서대로 출력한다.
- 파트 하나당 공백 포함 500자를 넘지 않는다(Threads 글자 수 제한).
- 특정 개인을 저격하거나 실존 인물을 지목하지 않는다.
- 미신을 맹신하게 하거나 근거 없는 의료/법률적 확언은 하지 않는다.`;
}

function buildUserMessage(topic) {
  return `소재: ${topic.label} (${topic.format})\n\n위 [검증된 사실]만 근거로, 팔자궤도(@orbit_saju) 계정 스타일의 클리프행어 스레드를 작성해줘.`;
}

async function writeThreadDraft({ dateKey, topicId, hookFormatId } = {}) {
  const topic = topicId ? TOPICS.find((t) => t.id === topicId) : pickRandom(TOPICS);
  if (!topic) throw Object.assign(new Error(`알 수 없는 소재: ${topicId}`), { status: 400 });
  const hookFormat = hookFormatId ? HOOK_FORMATS.find((h) => h.id === hookFormatId) : pickRandom(HOOK_FORMATS);
  if (!hookFormat) throw Object.assign(new Error(`알 수 없는 훅 형태: ${hookFormatId}`), { status: 400 });

  const factsBlock = topic.build(dateKey || new Date().toISOString().slice(0, 10));
  const cta = pickRandom(CTA_POOL);
  const bridgeStyle = pickRandom(BRIDGE_STYLES);
  const partCount = 2 + Math.floor(Math.random() * 3); // 2~4 (실제 계정 게시물 기준 팔자장인보다 살짝 짧음)

  const raw = await runSkill({
    system: buildSystemPrompt(factsBlock, cta, partCount, hookFormat, bridgeStyle),
    userMessage: buildUserMessage(topic),
  });

  const parts = raw
    .split("===PART===")
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length < 2) {
    throw new Error(`파트 구분에 실패했습니다(파트 ${parts.length}개). 원문: ${raw.slice(0, 200)}`);
  }

  return {
    topic: topic.label,
    hookFormat: hookFormat.id,
    text: parts[0],
    replyChain: parts.slice(1),
  };
}

module.exports = { writeThreadDraft, TOPICS, HOOK_FORMATS, CTA_POOL, pickTopicIds, pickHookFormatIds };
