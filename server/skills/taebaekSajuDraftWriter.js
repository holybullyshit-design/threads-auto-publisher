// "팔자장인" 계정 전용 — 종합사주 클리프행어 스레드(본문 + 답글 이어달기) 생성 스킬.
// 다른 3계정(연리지실타래/아해사주/팔자명가)과 달리:
//  - 고정 페르소나 목소리가 아니라 소재마다 다양한 스타일
//  - 댓글 유도가 아니라 조회수/체류시간이 목표 (프로필 링크 CTA)
//  - 본문에서 문장을 끊고 답글로 이어지는 "클리프행어" 구조, 파트 수는 3~5개로 유동적
//  - 사주 이론은 AI가 기억으로 지어내지 않고, sajuFacts.js가 미리 계산한 "검증된 사실"만 사용

const { runSkill } = require("../lib/claudeCliEngine");
const {
  ANIMALS,
  STEMS_KO,
  STEM_ELEMENT,
  SIPSEONG_TABLE,
  YANGIN_TABLE,
  CHEONEULGWIIN_TABLE,
  branchLabel,
  getSamhapRoles,
  getSamjaeInfo,
  getVerifiedCalendarFacts,
} = require("../lib/sajuFacts");

const CTA_POOL = [
  "여기까지 읽었으면, 이미 궁금해진 겁니다. 프로필로 넘어와서 확인해보세요.",
  "아는 사람은 미리 대비하고, 모르는 사람은 나중에 놀랍니다. 프로필에서 확인해보세요.",
  "내 사주는 어느 쪽일까요? 프로필로 와서 직접 확인해보세요.",
  "지금이 물어보기 딱 좋은 시점입니다. 프로필 확인해보세요.",
  "궁금하면 편하게 프로필로 넘어오세요. 직접 봐드릴게요.",
  "정확한 건 원국을 봐야 나옵니다. 프로필에서 확인해보세요.",
  "남 얘기 같아도, 내 얘기일 수 있습니다. 프로필에서 확인해보세요.",
  "궁금한 채로 넘기지 마세요. 지금 프로필 눌러서 확인해보세요.",
  "몰랐다고 피해가는 게 아닙니다. 미리 알고 준비하세요. 프로필에서 확인해보세요.",
];

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// 순수 무작위 추첨(pickRandom)만으로 한 번에 여러 개를 뽑으면, 확률상 같은 소재가
// 몰리는 경우가 실제로 생긴다(2026-08-28 실측: 11개 중 도화살이 6번). 그래서 여러 개를
// 한 번에 뽑을 땐 "카드 뭉치를 섞어서 한 바퀴 다 돌고 나서야 다시 섞는" 셔플백 방식을
// 써서, 전체 소재가 최대한 고르게 나오도록 강제한다.
function shuffled(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function pickTopicIds(count, topicIds = TOPICS.map((t) => t.id)) {
  const result = [];
  let bag = [];
  while (result.length < count) {
    if (bag.length === 0) bag = shuffled(topicIds);
    result.push(bag.pop());
  }
  return result;
}

// 소재 뱅크 — 각 항목이 build(dateKey)를 실행하면, 그 소재에 필요한 "검증된 사실 블록"
// 문자열을 만들어준다. AI는 이 사실만 근거로 쓰고, 새로운 명리학 규칙을 지어내면 안 된다.
const TOPICS = [
  {
    id: "yeokma",
    label: "역마살(띠 기반)",
    format: "성격/시기형",
    build(dateKey) {
      const groupIdx = Math.floor(Math.random() * 4);
      const group = ["인오술(화국)", "신자진(수국)", "사유축(금국)", "해묘미(목국)"][groupIdx];
      const seedBranch = { "인오술(화국)": 2, "신자진(수국)": 8, "사유축(금국)": 5, "해묘미(목국)": 11 }[group];
      const roles = getSamhapRoles(seedBranch);
      const memberAnimals = roles.group.branches.map((b) => ANIMALS[b]).join("·");
      return `[검증된 사실 - 역마살]
대상 띠: ${memberAnimals}띠 (${roles.group.name})
역마 자리: ${branchLabel(roles.역마)}
판별법: 위 띠로 태어난 사람의 사주 원국 어딘가에 역마 자리(${branchLabel(roles.역마)})가 있으면 역마살이 성립한다.
성격/의미: 역마는 움직임·이동·변화의 기운. 원국이 안정적이면 이직/이사/여행이 좋은 쪽으로 풀리는 역마, 원국이 흔들리는 상태에서 겹치면 불안해서 도망치고 싶은 역마로 갈린다.`;
    },
  },
  {
    id: "dohwa",
    label: "도화살(띠 기반)",
    format: "성격형",
    build() {
      const groupIdx = Math.floor(Math.random() * 4);
      const group = ["인오술(화국)", "신자진(수국)", "사유축(금국)", "해묘미(목국)"][groupIdx];
      const seedBranch = { "인오술(화국)": 2, "신자진(수국)": 8, "사유축(금국)": 5, "해묘미(목국)": 11 }[group];
      const roles = getSamhapRoles(seedBranch);
      const memberAnimals = roles.group.branches.map((b) => ANIMALS[b]).join("·");
      return `[검증된 사실 - 도화살]
대상 띠: ${memberAnimals}띠 (${roles.group.name})
도화 자리: ${branchLabel(roles.도화)}
판별법: 위 띠로 태어난 사람의 사주 원국 어딘가에 도화 자리(${branchLabel(roles.도화)})가 있으면 도화살이 성립한다.
성격/의미: 본인 의지와 무관하게 사람을 끌어당기는 매력. 원국에서 힘 있게 자리잡으면 매력으로 쓰이고, 원국이 흔들리는 상태에서 겹치면 관계가 계속 꼬이는 소모전이 된다.`;
    },
  },
  {
    id: "hwagae",
    label: "화개살(띠 기반)",
    format: "성격형",
    build() {
      const groupIdx = Math.floor(Math.random() * 4);
      const group = ["인오술(화국)", "신자진(수국)", "사유축(금국)", "해묘미(목국)"][groupIdx];
      const seedBranch = { "인오술(화국)": 2, "신자진(수국)": 8, "사유축(금국)": 5, "해묘미(목국)": 11 }[group];
      const roles = getSamhapRoles(seedBranch);
      const memberAnimals = roles.group.branches.map((b) => ANIMALS[b]).join("·");
      return `[검증된 사실 - 화개살]
대상 띠: ${memberAnimals}띠 (${roles.group.name})
화개 자리: ${branchLabel(roles.화개)}
판별법: 위 띠로 태어난 사람의 사주 원국 어딘가에 화개 자리(${branchLabel(roles.화개)})가 있으면 화개살이 성립한다.
성격/의미: 밖으로 뻗치기보다 안으로 응축·몰입하는 기운. 예술·종교·학문 쪽으로 잘 풀리는 살이며(옛날엔 수행자 팔자로도 봄), 원국이 약하면 몰입이 아니라 고립으로 흐르기도 한다.`;
    },
  },
  {
    id: "yangin",
    label: "양인살(일간 기반)",
    format: "성격형",
    build() {
      const stems = Object.keys(YANGIN_TABLE);
      const stem = pickRandom(stems);
      const branch = YANGIN_TABLE[stem];
      return `[검증된 사실 - 양인살]
대상 일간: ${stem}(${STEM_ELEMENT[STEMS_KO.indexOf(stem)]}) 일간
양인 자리: ${branchLabel(branch)}
판별법: 일간이 ${stem}인 사람의 사주에 ${branchLabel(branch)} 자리가 있으면 양인살이 성립한다(양간에만 적용되는 정통 판별법).
성격/의미: 일간 기운이 가장 날카롭게 선 자리. 결단력·추진력·승부욕이 강함. 군인·의사·운동선수처럼 결단이 필요한 자리에선 무기가 되지만, 쓸 곳이 없으면 가까운 사람에게 날이 향하기도 한다.`;
    },
  },
  {
    id: "cheoneulgwiin",
    label: "천을귀인(일간 기반)",
    format: "성격/길신형",
    build() {
      const stems = Object.keys(CHEONEULGWIIN_TABLE);
      const stem = pickRandom(stems);
      const branches = CHEONEULGWIIN_TABLE[stem];
      return `[검증된 사실 - 천을귀인]
대상 일간: ${stem} 일간
귀인 자리: ${branches.map(branchLabel).join(", ")}
판별법: 일간이 ${stem}인 사람의 사주 원국(년주·월주·일주·시주) 어딘가에 위 자리 중 하나라도 있으면 천을귀인이 성립한다.
의미: 명리학에서 최고로 치는 길신. 다른 신살과 달리 거의 순수하게 좋은 쪽으로만 작용. 일지에 있으면 배우자/가까운 사람이, 시주에 있으면 노년에, 월주에 있으면 사회생활에서 귀인을 만난다. 원국이 탁하면 있어도 잘 안 쓰인다는 단서도 있음.`;
    },
  },
  {
    id: "sipseong-jaeseong",
    label: "재성 시기(일간별 재물운)",
    format: "시기형",
    build(dateKey) {
      const cal = getVerifiedCalendarFacts(dateKey);
      const elements = ["목", "화", "토", "금", "수"];
      const el = pickRandom(elements);
      const jaeseong = SIPSEONG_TABLE[el].재성;
      const bigeop = SIPSEONG_TABLE[el].비겁;
      return `[검증된 사실 - 재성/시기]
기준 날짜: ${cal.korean} (${cal.dateKey})
이번 달 오행: ${cal.monthStemElement}
대상 일간: ${el} 일간
이 일간의 재성(財星, 재물운) 오행: ${jaeseong}
이 일간의 비겁(比劫) 오행: ${bigeop}
십성 원리: 일간과 같은 오행이 강해지는 시기(비겁운)엔 재성이 상대적으로 눌리고, 일간이 극(剋)하는 오행이 강해지는 시기(재성운)엔 재물운이 좋아진다.
현재 이번 달 오행(${cal.monthStemElement})이 이 일간(${el})한테 비겁인지 재성인지 관계를 스스로 판단해서, 그 관계에 맞는 내용으로 쓸 것. (같은 오행=비겁, 일간이 극하는 오행=재성)`;
    },
  },
  {
    id: "sipseong-gwanseong",
    label: "관성 시기(일간별 직장운)",
    format: "시기형",
    build(dateKey) {
      const cal = getVerifiedCalendarFacts(dateKey);
      const elements = ["목", "화", "토", "금", "수"];
      const el = pickRandom(elements);
      const gwanseong = SIPSEONG_TABLE[el].관성;
      return `[검증된 사실 - 관성/시기]
기준 날짜: ${cal.korean} (${cal.dateKey})
이번 달 오행: ${cal.monthStemElement}
대상 일간: ${el} 일간
이 일간의 관성(官星, 직장·명예운) 오행: ${gwanseong}
십성 원리: 일간을 극(剋)하는 오행이 관성이다 — 나를 통제하고 자리 잡게 만드는 힘.
현재 이번 달 오행(${cal.monthStemElement})이 이 일간(${el})의 관성에 해당하는지 스스로 판단해서, 맞으면 "직장/조직에서 부딪히거나 인정받는 시기"로, 아니면 다른 십성 관계로 자연스럽게 풀어서 쓸 것.`;
    },
  },
  {
    id: "samjae",
    label: "삼재(띠 기반)",
    format: "시기형",
    build() {
      const groupIdx = Math.floor(Math.random() * 4);
      const group = ["인오술(화국)", "신자진(수국)", "사유축(금국)", "해묘미(목국)"][groupIdx];
      const seedBranch = { "인오술(화국)": 2, "신자진(수국)": 8, "사유축(금국)": 5, "해묘미(목국)": 11 }[group];
      const info = getSamjaeInfo(seedBranch);
      const memberAnimals = info.samhapGroup.branches.map((b) => ANIMALS[b]).join("·");
      const samjaeYears = info.samjaeBanghap.branches.map((b) => ANIMALS[b]).join("·");
      return `[검증된 사실 - 삼재]
대상 띠: ${memberAnimals}띠 (${info.samhapGroup.name})
삼재에 해당하는 방합: ${info.samjaeBanghap.name}
삼재 3년의 띠(그 해의 지지): ${samjaeYears}
판별법: ${memberAnimals}띠는 ${info.samjaeBanghap.name} 3년 동안 삼재를 겪는다(정통 방합 기준 공식).
의미: 삼재라고 다 나쁜 게 아니다. 원국에 그 삼재 방합 오행이 이미 자리잡고 있으면 오히려 정리·결실의 시기로 풀리기도 한다.`;
    },
  },
];

// 훅(첫인상) 형태가 매번 "번호 리스트 나열"로 고정되면, 소재(신살/십성)는 달라도 글의
// "구조"가 다 똑같아 보인다(2026-08-28 실측 지적) — 그래서 본문이 시작되는 방식 자체를
// 여러 형태로 나눠두고 매번 다른 걸 뽑아서 쓴다.
// 공통 원칙: 리스트/랭킹/키워드를 곧바로 던지면 안 된다. 그 앞에 반드시 "제목 또는
// 1~3줄짜리 후킹 도입부"가 먼저 나와야 한다(예: "<숨어도 눈에띄는 초상위급으로 귀한
// 여자 사주 특징>" 같은 홑화살괄호 제목, 또는 "죄송하지만," 같은 짧은 긴장감 조성
// 문장). 번호부터 바로 시작하면 안 됨 — 실제로 이 실수를 한 번 했었다(2026-08-28).
const HOOK_FORMATS = [
  {
    id: "list",
    instruction: `번호 리스트형: 먼저 이 글의 실제 제목 문장을 홑화살괄호 안에 넣어서 쓰거나
    (예: <사주 원국에 이 글자 있으면 귀한 사람> — "<제목>"이라는 글자를 그대로 쓰는 게 아니라
    실제 제목 내용을 저 괄호 안에 채워 넣으라는 뜻이다), 또는 홑화살괄호 없이 1~2줄짜리 후킹
    도입 문장으로 궁금증을 만든다. 그다음에 구체적인 관찰/증상을 3~7개 "1. ...  2. ..." 형태로
    나열한다. 절대 도입부 없이 번호부터 바로 시작하지 않는다. 항목은 추상적("성격이 급하다")이
    아니라 구체적인 행동/장면으로 쓴다(예: "결제하려다 손이 멈춘다").`,
  },
  {
    id: "topRank",
    instruction: `TOP 랭킹형: 먼저 이 글의 실제 제목 문장을 홑화살괄호 안에 채워 넣거나("<제목>"이라는
    글자 자체를 쓰는 게 아니라 실제 제목을 넣으라는 뜻), 짧은 후킹 문장으로 시작한다. 그다음
    "TOP 5"/"TOP.10" 같은 표시와 함께 순위를 매기는 형태로 이어간다(예: "1위. ...  2위. ...").
    제목이나 도입부 없이 바로 "1위."로 시작하지 않는다. 검증된 사실 안에서 실제로 순위를 매길
    수 있는 대상(일간별, 띠별 등)이 있을 때 쓴다.`,
  },
  {
    id: "apology",
    instruction: `"죄송하지만" 사과형: 첫 줄을 "죄송하지만," 으로 시작해서 안 좋은 소식을 전하는 듯한
    긴장감을 준 뒤, 그 뒤에 짧은 도입 문장 1~2줄을 더 붙이고, 번호 없이 상황을 압축해서 던진다.
    예시 형태: "죄송하지만,\n[대상]은/는 [핵심 한 줄]\n[구체적 상황 1~2줄]"`,
  },
  {
    id: "keywords",
    instruction: `키워드 나열형: 먼저 무엇에 대한 이야기인지 알려주는 짧은 한 줄(제목처럼)을 두고,
    그 아래에 문장이 아니라 짧은 명사/구를 마침표로 끊어서 나열한다(예: "촉. 직감. 끝까지.").
    도입 한 줄 없이 키워드부터 바로 시작하지 않는다.`,
  },
  {
    id: "question",
    instruction: `직접 질문형: "이런 사람들 특징 아는 사람?", "이거 겪어본 사람?" 같은 짧고 직접적인
    질문 하나로 시작한 뒤(이 질문 자체가 후킹 역할을 한다), 번호 없이 상황을 1~2문장으로 던진다.`,
  },
];

// 관찰 -> 설명으로 넘어가는 연결 문장도 매번 "이상하죠 / 기분 탓 아닙니다"로 고정하면 티가 난다.
const BRIDGE_STYLES = [
  `"이상하죠. 근데 기분 탓 아닙니다. 명리로 설명되는 구조예요." 같은 톤으로 이어간다.`,
  `"우연 아닙니다. 사주에 이미 새겨진 구조예요." 같은 톤으로 짧게 단정하며 이어간다.`,
  `"이거 성격이 아니라, [소재명]이 있는 겁니다." 처럼 원인을 바로 지목하며 이어간다.`,
  `별도의 "기분 탓 아니다"류 연결 문장 없이, 곧바로 명리학적 설명으로 자연스럽게 넘어간다.`,
];

function buildSystemPrompt(factsBlock, cta, partCount, hookFormat, bridgeStyle, accountLabel, domainFraming, speechLevel, extraBans) {
  const defaultIdentity = `이 계정은 연리지실타래/아해사주/팔자명가 같은 고정 페르소나 계정과 다릅니다 — 소재마다 스타일이 다양하고,
목표는 댓글 유도가 아니라 "많은 사람이 끝까지 읽고 프로필까지 눌러보게" 만드는 조회수/체류시간입니다.`;
  // domainFraming이 있으면 = 이 계정은 원래 고정 페르소나 계정인데(연리지실타래/아해사주),
  // 하루 중 한 슬롯만 이 "종합사주 바이럴" 형식을 빌려 쓰는 경우다. 그 계정 본연의 컨셉(연애/육아)
  // 렌즈로 소재를 재해석해야 하므로 정체성 설명 자체를 다르게 준다.
  const identity = domainFraming
    ? `이 계정은 평소엔 페르소나 상담형 콘텐츠를 쓰지만, 오늘 이 글은 예외적으로 "많은 사람이 끝까지
읽고 프로필까지 눌러보게" 만드는 조회수 극대화용 바이럴 콘텐츠입니다(댓글에 생년월일시를
남기라고 요청하지 않습니다). ${domainFraming}`
    : defaultIdentity;
  const speechRule = speechLevel
    ? `\n[말투]\n이 계정은 반드시 ${speechLevel}만 쓴다. 아래 훅 형태 예시 문장이 다른 말투로 적혀 있어도,
그건 구조 참고용일 뿐이니 실제 출력은 ${speechLevel}로 바꿔서 쓴다.\n`
    : "";
  const bansRule = extraBans ? `\n[이 계정만의 추가 금지 사항]\n${extraBans}\n` : "";

  return `당신은 한국 Threads(스레드)에서 "종합사주" 콘텐츠를 연재하는 계정 "${accountLabel}"의 전속 작가입니다.
${identity}
매번 같은 틀로 찍어내면 안 됩니다 — 이번 글에 배정된 훅 형태/연결 방식을 그대로 따르세요.
${speechRule}${bansRule}

[이번 글의 훅(본문 시작) 형태]
${hookFormat.instruction}

[이번 글의 관찰->설명 연결 방식]
${bridgeStyle}

[반드시 지킬 구조 규칙]
1. **본문 맨 첫 줄부터 리스트/랭킹/키워드를 바로 던지지 않는다.** 위 [이번 글의 훅 형태]에서
   설명한 대로, 항상 실제 제목 문장을 담은 홑화살괄호(예: <이런 사람이 귀한 사주다>) 또는
   1~3줄짜리 후킹 도입부가 먼저 나오고 그다음에 본론이 이어져야 한다. "1. ..."이나 "1위."로
   글이 시작하면 안 된다 — 그 앞에 반드시 뭔가가 있어야 한다.
2. 본문(1개) + 답글(N-1개)로 구성된 "이어지는 스레드"를 쓴다. 전체 파트 수는 ${partCount}개.
3. **클리프행어**: 본문과 답글 대부분을, 완결된 문장이 아니라 중간에 끊긴 채로 끝낸다(예: "이거 그냥" 처럼).
   그리고 다음 파트 맨 앞에서 그 문장을 이어서 완성한다. 마지막 파트만 완결해도 된다.
4. 오행/십성/일간을 설명할 땐 가능하면 그 오행의 성질을 구체적 사물에 빗댄 은유(예: 계수=이슬,
   신금=보석, 갑목=큰 나무)를 섞어서 기억에 남게 쓴다.
5. 마지막 파트 끝에 아래 문장을 정확히 그대로 포함한다:
   "${cta}"

[절대 규칙 - 사실 근거]
아래 [검증된 사실] 블록에 있는 명리학 판별법/관계만 사용한다. 여기 없는 새로운 신살 이름, 새로운 판별법,
새로운 절기/간지 사실을 지어내지 않는다. 오행 상생상극(목생화·화생토·토생금·금생수·수생목 /
목극토·토극수·수극화·화극금·금극목) 관계도 이 규칙대로만 쓴다.

${factsBlock}

[줄바꿈/가독성 규칙 - 반드시 지킬 것]
Threads는 좁은 화면에서 한 줄씩 내려 읽는 매체다. 쉼표로 절을 계속 이어붙인 긴 문장(신문 기사처럼
40자 넘게 한 줄로 쭉 이어지는 문장)은 절대 쓰지 않는다. 대신:
- 문장을 의미 단위(하나의 절/호흡)로 짧게 끊어서, 그 단위마다 줄바꿈한다. 한 줄은 대략 25자 안쪽을
  기본으로 하고, 길어도 한 줄에 마침표가 두 개 이상 들어가지 않게 한다.
- 쉼표로 이어질 법한 부분도 웬만하면 쉼표 대신 줄바꿈으로 끊는다(예: "능력은 있는데" 줄바꿈
  "자존감이 흔들리면 전부 무너지는 사람이에요." 처럼 — 이렇게 절 하나가 한 줄을 이룬다).
- 짧은 줄 2~4개가 하나의 생각 덩어리를 이루면, 그 덩어리와 다음 덩어리 사이에 빈 줄을 넣어서
  숨 쉬듯 끊어 읽히게 한다. 파트 하나가 통짜 문단 한두 개로 뭉쳐 보이면 안 된다.
- 이 규칙은 명리학 설명 부분에도 똑같이 적용한다 — 설명이라고 길게 풀어쓰지 말고, 짧은 문장을
  여러 줄로 쌓아올리는 방식으로 쓴다.

[작성 규칙]
- 결과물은 아래 형식으로만 출력한다. 그 외 설명/따옴표/마크다운 기호는 절대 붙이지 않는다:
  각 파트를 "===PART===" 라는 구분선으로 나눠서, 파트 1부터 ${partCount}까지 순서대로 출력한다.
- 파트 하나당 공백 포함 500자를 넘지 않는다(Threads 글자 수 제한).
- 특정 개인을 저격하거나 실존 인물을 지목하지 않는다.
- 미신을 맹신하게 하거나 근거 없는 의료/법률적 확언은 하지 않는다.
- "복채", "스.하.리.팔" 같은 캐릭터성 결제 유도 문구는 쓰지 않는다.`;
}

function buildUserMessage(topic, accountLabel) {
  return `소재: ${topic.label} (${topic.format})\n\n위 [검증된 사실]만 근거로, ${accountLabel} 계정 스타일의 클리프행어 스레드를 작성해줘.`;
}

// accountLabel: 이 엔진(소재 뱅크 + 구조)을 공유하는 여러 "종합사주" 계정을 구분하기 위한 이름.
// 팔자장인 외에 같은 포맷으로 운영하는 계정(예: 팔자궤도)이 늘어나도 이 파일 하나로 처리한다 —
// 계정마다 다른 건 이름뿐, 소재/훅/클리프행어/CTA 구조는 전부 동일하게 유지해야 바이럴 공식이 깨지지 않는다.
async function writeThreadDraft({
  dateKey,
  topicId,
  hookFormatId,
  accountLabel = "팔자장인",
  topicPool, // 지정하면 이 배열(TOPICS의 부분집합)에서만 소재를 고른다 - 연리지실타래/아해사주처럼
  // 계정 컨셉에 안 맞는 소재(재성/관성 시기 등)를 빼고 쓸 때 사용
  domainFraming, // 있으면 = 원래 고정 페르소나 계정이 오늘만 이 바이럴 형식을 빌려 쓰는 경우.
  // 소재를 그 계정 컨셉(연애/육아 등) 렌즈로 재해석하라는 지시문
  speechLevel, // "반말" | "존댓말" - 지정 안 하면 훅 형태 예시들의 기본 톤을 그대로 따름
  extraBans, // 이 계정에서 절대 다루면 안 되는 추가 주제(예: 아해사주의 임신/난임 금지)
} = {}) {
  const pool = topicPool || TOPICS;
  const topic = topicId ? pool.find((t) => t.id === topicId) : pickRandom(pool);
  if (!topic) throw Object.assign(new Error(`알 수 없는 소재: ${topicId}`), { status: 400 });
  const hookFormat = hookFormatId ? HOOK_FORMATS.find((h) => h.id === hookFormatId) : pickRandom(HOOK_FORMATS);
  if (!hookFormat) throw Object.assign(new Error(`알 수 없는 훅 형태: ${hookFormatId}`), { status: 400 });

  const factsBlock = topic.build(dateKey || new Date().toISOString().slice(0, 10));
  const cta = pickRandom(CTA_POOL);
  const bridgeStyle = pickRandom(BRIDGE_STYLES);
  const partCount = 3 + Math.floor(Math.random() * 3); // 3~5

  const raw = await runSkill({
    system: buildSystemPrompt(factsBlock, cta, partCount, hookFormat, bridgeStyle, accountLabel, domainFraming, speechLevel, extraBans),
    userMessage: buildUserMessage(topic, accountLabel),
  });

  const parts = raw
    .split("===PART===")
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length < 2) {
    throw new Error(`파트 구분에 실패했습니다(파트 ${parts.length}개). 원문: ${raw.slice(0, 200)}`);
  }

  // 요청한 파트 수(partCount)와 실제로 나온 파트 수가 다르면 무조건 비정상이다 - 특히
  // 실측된 사고: 모델이 검증 과정을 영어로 혼잣말하듯 출력에 남기고, 그러다 스스로 다시
  // 처음부터 전체 파트를 새로 써서 "본문~답글N"이 그대로 통째로 두 번 반복된 채 나온 적이
  // 있음(2026-08-28, 파트 8개 - 요청은 4개였는데 정상 4파트 + 영어 자기검증 문단 + 같은
  // 4파트 반복). 개수가 안 맞으면 재시도하는 게 개별 파트 안을 하나하나 검사하는 것보다 확실하다.
  if (parts.length !== partCount) {
    throw new Error(`요청한 파트 수(${partCount})와 실제 파트 수(${parts.length})가 다릅니다. 원문: ${raw.slice(0, 200)}`);
  }

  // 가끔 모델이 "<제목>" 같은 안내문 속 자리표시자를 실제 제목 대신 그대로 쓰거나(예: "<제목>:
  // <실제 제목>"), 어떤 파트를 "<제목/도입부는 이미 각 파트 안에 포함>" 식 메타 설명 문장으로
  // 대체해버리는 경우, 또는 파트 안에 영어 검증 혼잣말이 섞여 나오는 경우가 실측됨(2026-08-28).
  // 파트 개수/구분자 체크만으로는 못 걸러내서, 내용 자체를 한 번 더 검사한다.
  const asciiHeavy = (p) => (p.match(/[A-Za-z]/g) || []).length > 25;
  const looksBroken = parts.some(
    (p) => p.length < 40 || p.includes("<제목>") || p.includes("이미 각 파트") || asciiHeavy(p)
  );
  if (looksBroken) {
    throw new Error(`파트 내용이 비정상입니다(자리표시자/영어 혼잣말 잔존 또는 너무 짧음). 원문: ${raw.slice(0, 200)}`);
  }

  return {
    topic: topic.label,
    hookFormat: hookFormat.id,
    text: parts[0],
    replyChain: parts.slice(1),
  };
}

function pickHookFormatIds(count) {
  return pickTopicIds(count, HOOK_FORMATS.map((h) => h.id)); // 셔플백 로직 재사용
}

module.exports = { writeThreadDraft, TOPICS, HOOK_FORMATS, CTA_POOL, pickTopicIds, pickHookFormatIds };
