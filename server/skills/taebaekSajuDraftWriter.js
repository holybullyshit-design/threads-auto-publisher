// "팔자장인" 계정 전용 — 종합사주 클리프행어 스레드(본문 + 답글 이어달기) 생성 스킬.
// 다른 3계정(연리지실타래/아해사주/팔자명가)과 달리:
//  - 고정 페르소나 목소리가 아니라 소재마다 다양한 스타일
//  - 댓글 유도가 아니라 조회수/체류시간이 목표 (프로필 링크 CTA)
//  - 본문에서 문장을 끊고 답글로 이어지는 "클리프행어" 구조, 파트 수는 3~6개로 유동적
//  - 사주 이론은 AI가 기억으로 지어내지 않고, sajuFacts.js가 미리 계산한 "검증된 사실"만 사용

const { runSkill } = require("../lib/claudeCliEngine");
const {
  ANIMALS,
  STEMS_KO,
  STEM_ELEMENT,
  SIPSEONG_TABLE,
  YANGIN_TABLE,
  CHEONEULGWIIN_TABLE,
  BAEKHO_ILJU,
  GOEGANG_ILJU,
  HONGYEOM_TABLE,
  MUNCHANG_TABLE,
  WONJIN_PAIRS,
  PILLAR_MEANINGS,
  branchLabel,
  getSamhapRoles,
  getSamjaeInfo,
  getVerifiedCalendarFacts,
} = require("../lib/sajuFacts");

// 2026-09-10 사용자 지시: "프로필 확인해보세요" 류는 클릭해서 뭘 하면 되는지가 없어서
// 조회수 대비 전환이 거의 안 됨(실측: 팔자장인/팔자궤도 조회수 대비 팔로워·답글 전환율이
// 연리지실타래/아해사주보다 10배 이상 낮음) - 다음 행동을 "상담 신청"으로 구체화한다.
// 단, 무료가 아니므로 "무료"라는 단어/뉘앙스는 절대 쓰지 않는다.
const CTA_POOL = [
  "여기까지 읽었으면, 이미 궁금해진 겁니다. 프로필에서 상담 신청하고 확인해보세요.",
  "아는 사람은 미리 대비하고, 모르는 사람은 나중에 놀랍니다. 프로필에서 상담 신청해보세요.",
  "내 사주는 어느 쪽일까요? 프로필에서 상담 신청하면 정확히 알려드립니다.",
  "지금이 물어보기 딱 좋은 시점입니다. 프로필에서 상담 신청해보세요.",
  "궁금하면 편하게 프로필에서 상담 신청하세요. 직접 봐드릴게요.",
  "정확한 건 원국을 봐야 나옵니다. 프로필에서 상담 신청해보세요.",
  "남 얘기 같아도, 내 얘기일 수 있습니다. 프로필에서 상담 신청해서 확인해보세요.",
  "궁금한 채로 넘기지 마세요. 지금 프로필에서 상담 신청하세요.",
  "몰랐다고 피해가는 게 아닙니다. 미리 알고 준비하세요. 프로필에서 상담 신청하세요.",
];

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// 띠 이름으로 최근 출생연도 N개를 계산한다(갑자년 기준 산식 - 순수 계산이라 명리학
// 판별법이 아니라 그냥 달력 사실이다, 지어내는 것 없음). 벤치마크 채널(2026-08-30 사용자가
// 직접 캡처해서 보여준 예시들 - saju.myungdang, saju.philosopher 등)을 보면 "OO띠"보다
// "1993년생" 처럼 구체적 연도로 부르는 글이 훨씬 개인적으로 와닿는다는 게 확인돼서,
// 훅 형태 중 하나(birthYear)와 띠 기반 소재들이 이 값을 실제로 쓸 수 있게 계산해서 준다.
function recentBirthYears(animalName, count = 4, fromYear = new Date().getFullYear()) {
  const idx = ANIMALS.indexOf(animalName);
  if (idx === -1) return [];
  // 실제 Threads 타겟 독자층(성인)을 벗어난 어린이/유아 연도(예: 올해·작년생)를 예시로
  // 들면 어색하다 - 최소 18년 전부터 거슬러 올라가서 뽑는다.
  const years = [];
  let y = fromYear - 18;
  while (years.length < count) {
    if (((((y - 4) % 12) + 12) % 12) === idx) years.push(y);
    y -= 1;
  }
  return years;
}

// 삼합 그룹 지지 배열(예: [11,3,7] 해묘미)을 받아서 "돼지(1995·2007·2019), 토끼(...), 양(...)"
// 형태의 한 줄로 만든다. 훅 형태가 "birthYear"일 때는 이 줄을 직접 인용하고, 다른 훅 형태에서도
// 참고용으로 쓸 수 있다(전부 강제는 아님 - 훅 형태 지시문에서 필요할 때만 쓰라고 안내함).
function animalYearsLine(branchIndices) {
  const parts = branchIndices.map((b) => {
    const animal = ANIMALS[b];
    const years = recentBirthYears(animal, 3);
    return `${animal}(${years.join("·")})`;
  });
  return `출생연도 예시(최근 3회): ${parts.join(", ")}`;
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
      const yearsLine = animalYearsLine(roles.group.branches);
      return `[검증된 사실 - 역마살]
대상 띠: ${memberAnimals}띠 (${roles.group.name})
${yearsLine}
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
      const yearsLine = animalYearsLine(roles.group.branches);
      return `[검증된 사실 - 도화살]
대상 띠: ${memberAnimals}띠 (${roles.group.name})
${yearsLine}
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
      const yearsLine = animalYearsLine(roles.group.branches);
      return `[검증된 사실 - 화개살]
대상 띠: ${memberAnimals}띠 (${roles.group.name})
${yearsLine}
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
  // 2026-09-03 소재 확장(벤치마크 채널 대비 소재 폭이 좁다는 사용자 지적 - 8개뿐이던 소재를
  // 13개로 넓힘). 아래 5개는 전부 sajuFacts.js의 정통 판별표를 그대로 근거로 쓴다.
  {
    id: "baekho",
    label: "백호살(일주 기반)",
    format: "성격/기질형",
    build() {
      const ilju = pickRandom(BAEKHO_ILJU);
      return `[검증된 사실 - 백호살]
성립 일주: ${ilju}일주
판별법: 사주 원국의 일주(태어난 날의 간지)가 ${ilju}이면 백호살이 성립한다(정통 판별표 - 갑진·을미·병술·정축·무진·임술·계축 7개 일주 중 하나).
성격/의미: 백호는 원래 사고·상해·급변을 상징하는 흉살이지만, 힘 있게 다스려지면 강한 결단력과 승부 근성으로 쓰인다. 감정 기복이 크고 극단으로 치닫는 경향이 있어, 스스로를 다스리는 법을 알면 오히려 위기에서 강한 사람이 된다.`;
    },
  },
  {
    id: "goegang",
    label: "괴강살(일주 기반)",
    format: "성격/기질형",
    build() {
      const ilju = pickRandom(GOEGANG_ILJU);
      return `[검증된 사실 - 괴강살]
성립 일주: ${ilju}일주
판별법: 사주 원국의 일주가 ${ilju}이면 괴강살이 성립한다(정통 판별표 - 경진·경술·임진·임술 4개 일주).
성격/의미: 괴강은 우두머리 기운. 자존심이 강하고 결단이 빠르며 지배력·리더십이 두드러진다. 신강(身强)하고 원국이 잘 다스려지면 큰 성취를 이루지만, 제어가 안 되면 독선·충돌로 흐르기 쉽다.`;
    },
  },
  {
    id: "hongyeom",
    label: "홍염살(일간 기반)",
    format: "성격/매력형",
    build() {
      const stems = Object.keys(HONGYEOM_TABLE);
      const stem = pickRandom(stems);
      const branch = HONGYEOM_TABLE[stem];
      return `[검증된 사실 - 홍염살]
대상 일간: ${stem} 일간
홍염 자리: ${branchLabel(branch)}
판별법: 일간이 ${stem}인 사람의 사주 원국에 ${branchLabel(branch)} 자리가 있으면 홍염살이 성립한다(정통 판별표).
성격/의미: 도화살이 "눈에 띄는 매력"이라면 홍염은 "스며드는 매력" — 첫인상보다 시간이 지날수록, 특히 떨어진 뒤에 오히려 그리움이 짙어지는 방식으로 작용한다. 이성 관계에서 미련·재회가 반복되는 경우가 많다.`;
    },
  },
  {
    id: "munchang",
    label: "문창귀인(일간 기반)",
    format: "재능/길신형",
    build() {
      const stems = Object.keys(MUNCHANG_TABLE);
      const stem = pickRandom(stems);
      const branch = MUNCHANG_TABLE[stem];
      return `[검증된 사실 - 문창귀인]
대상 일간: ${stem} 일간
문창 자리: ${branchLabel(branch)}
판별법: 일간이 ${stem}인 사람의 사주 원국에 ${branchLabel(branch)} 자리가 있으면 문창귀인이 성립한다(정통 판별표).
의미: 학문·문서·표현력을 상징하는 길신. 배운 걸 정리해서 풀어내는 능력이 좋고, 시험·자격증·글쓰기·강의처럼 지식을 문서/언어로 다루는 분야에서 유독 빛을 발한다. 원국이 탁하면 재능은 있는데 정작 본인이 몰라서 안 쓰는 경우도 있다.`;
    },
  },
  {
    id: "wonjin",
    label: "원진살(띠 기반)",
    format: "관계형",
    build() {
      const branch = Math.floor(Math.random() * 12);
      const partnerBranch = WONJIN_PAIRS.find((p) => p.includes(branch)).find((b) => b !== branch);
      return `[검증된 사실 - 원진살]
기준 띠: ${branchLabel(branch)}
원진 상대 띠: ${branchLabel(partnerBranch)}
판별법: ${branchLabel(branch)}와 ${branchLabel(partnerBranch)}는 서로 원진 관계다(정통 판별표 - 자미·축오·인유·묘신·진해·사술 6개 조합 중 하나).
의미: 원진은 "이유 없이 미묘하게 거슬리는" 관계살. 딱히 큰 사건이 없어도 은근히 신경 쓰이고 서운함이 쌓이는 궁합에서 자주 나타난다. 가족·연인·동료 관계에서 이 조합이 겹치면, 서로 나쁜 사람이 아닌데도 유독 삐걱대는 이유를 원진에서 찾기도 한다.`;
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
      const yearsLine = animalYearsLine(info.samhapGroup.branches);
      return `[검증된 사실 - 삼재]
대상 띠: ${memberAnimals}띠 (${info.samhapGroup.name})
${yearsLine}
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
    // 2026-09-10 벤치마크 실측(@taebaek_saju, 사용자가 직접 캡처해서 보여준 실제 글 7건) 반영:
    // 이 계정의 리스트형은 항목이 전부 "같은 범주 안의 예시"가 아니라, 매번 다른 인생 영역
    // (외모/성격/마인드/직업/태도/표현/돈 등)에서 하나의 결론을 각각 다르게 비춰준다 - 그래서
    // 항목이 늘어나도 반복처럼 안 느껴진다. 그리고 어떤 글은 1파트를 순수 나열로만 끝내고
    // ("밑에서 왜 이래야 하는지 풀게요" 처럼 명시적으로 다음 파트를 예고) 설명을 전혀 안 섞는다.
    instruction: `번호 리스트형: 먼저 이 글의 실제 제목 문장을 홑화살괄호 안에 넣어서 쓰거나
    (예: <사주 원국에 이 글자 있으면 귀한 사람> — "<제목>"이라는 글자를 그대로 쓰는 게 아니라
    실제 제목 내용을 저 괄호 안에 채워 넣으라는 뜻이다), 또는 홑화살괄호 없이 1~2줄짜리 후킹
    도입 문장으로 궁금증을 만든다. 그다음에 구체적인 관찰/증상을 3~7개 "1. ...  2. ..." 형태로
    나열한다. 절대 도입부 없이 번호부터 바로 시작하지 않는다. 항목은 추상적("성격이 급하다")이
    아니라 구체적인 행동/장면으로 쓴다(예: "결제하려다 손이 멈춘다").
    가능하면 항목들을 전부 같은 범주로 나열하지 말고, 서로 다른 삶의 영역(예: 외모/성격/마인드/
    직업/태도/표현/돈, 또는 연애/직장/가족/돈)에서 하나씩 골라 각도를 다르게 준다 — 같은 결론을
    여러 면에서 비춰주면 항목이 많아도 반복처럼 안 느껴진다. 이 리스트형을 쓸 땐, 설명을 섞지
    않고 항목 나열로만 첫 파트를 끝낸 뒤 "밑에서 왜 그런지 풀게요" 류의 한 줄로 다음 파트를
    명시적으로 예고하는 방식도 써도 된다(문장을 중간에 끊는 클리프행어 대신 이 예고 문장으로
    대체 가능 — 리스트형에서는 이게 더 자연스럽다).`,
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
  {
    id: "countdown",
    instruction: `역순 카운트다운형: 제목/후킹 도입부(홑화살괄호 제목 또는 1~2줄 도입 문장)로 시작한 뒤,
    "1위. ... 2위. ... 3위. ..." 처럼 순위만 먼저 짧게 나열한다. 그다음 답글에서는 등수가
    낮은 것부터 거꾸로("3위" 먼저, "1위"를 마지막에) 하나씩 자세히 설명한다. 검증된 사실 안에
    순위를 매길 수 있는 대상(띠·일간)이 3개 이상 있을 때 쓴다. 마지막 파트 초반에는 앞서 다룬
    대상들의 공통점을 한두 문장으로 짧게 정리한 뒤 CTA로 넘어간다.`,
  },
  {
    id: "birthYear",
    // 2026-09-10 벤치마크 실측(@taebaek_saju): 가장 강했던 예시는 설명을 한 줄도 안 섞고
    // 연도 리스트 자체가 첫 파트 전부였다("86, 98년생 호랑이띠 / 89, 01년생 뱀띠 / ..." 이게
    // 제목 한 줄 빼고 전부). 독자가 "내 연도 있나?"만 2초 안에 스캔하게 만드는 게 핵심.
    instruction: `구체적 출생연도형: 검증된 사실에 있는 "출생연도 예시" 줄을 그대로 활용해서, 띠 이름
    대신(또는 띠 이름과 함께) "1993년생", "2005년생"처럼 실제 연도로 대상을 부른다. 제목/도입부
    에서 "OO년생 여러분" 또는 "이 글 본 OOO띠 — 1977, 1989, 2001년생" 식으로 구체적 연도를
    먼저 던지고, 이어지는 설명에서도 계속 그 연도로 지칭한다(예: "1993년생은 9월 중순..."). 절대
    출생연도 예시 줄에 없는 연도를 지어내지 않는다 — 주어진 연도만 그대로 쓴다.
    더 강한 변형: 첫 파트를 설명 없이 짧은 제목 한 줄 + 연도·띠 나열로만 끝내도 된다(예: "오히려
    쉬어야 풀리는 사주 / 86, 98년생 호랑이띠 / 89, 01년생 뱀띠"). 독자가 자기 연도부터 찾게
    만들고, 설명은 전부 답글로 넘긴다.`,
  },
  {
    id: "contrastAB",
    // 2026-09-10 벤치마크 실측(@taebaek_saju, 사용자 제공 캡처): "<A 사주> vs <B 사주>" 처럼
    // 제목 자체를 두 진영으로 가르는 대조형 — 신살 이름보다 "나는 어느 쪽이지?"가 먼저 꽂힌다.
    instruction: `A/B 대조형: 제목 자체를 홑화살괄호 두 개로 서로 반대/대비되는 두 결과로 가른다
    (예: "<해외에서 살아야 하는 사주> vs <국내에서 정착하는 사주>"). 제목 바로 아래에 A그룹
    조건들을 번호나 대시로 짧게 나열하고, 이어서 B그룹 조건도 같은 방식으로 나열한다. 검증된
    사실 안에서 자연스럽게 둘로 나뉘는 대상(오행 과다/부족, 있음/없음, 강함/약함 등)이 있을 때
    쓴다 — 억지로 반대를 지어내지 않는다. 답글에서는 각 그룹이 왜 그런지, 그리고 독자가 어느
    그룹에 해당하는지 판단하는 기준을 설명한다.`,
  },
  {
    id: "scenarioAdvice",
    instruction: `상황 조언형: "[대상]이 이러면, 한 번 더 생각해보세요" 같은 실전 조언 프레임으로
    시작한다(홑화살괄호 제목 없이 이 한 줄 자체가 도입부다). 그 뒤 각 파트에서 대상(일간/신살
    보유자)별로 아주 구체적인 일상 장면 하나를 가정하고("퇴사하겠다고 하면", "갑자기 연락을
    끊으면" 같은), 그 상황에서 어떻게 반응/대응하면 좋을지 짧고 단정적인 문장으로 조언한다.
    설명체가 아니라 "~하세요/~해보세요" 명령형·조언형 어미를 쓴다.`,
  },
  {
    id: "directAddress",
    instruction: `직접 호명형: "이 글 본 [대상] 집중해", "[대상]이면 그냥 넘기지 마" 처럼 독자를
    화면 너머에서 바로 부르는 한 줄로 시작한다. 그다음 짧게 무엇에 대한 이야기인지 1줄로
    예고하고 번호/순위로 넘어간다(list나 topRank처럼 이어가도 된다). 도입 호명 문장 없이 바로
    번호부터 시작하지 않는다.`,
  },
  {
    id: "retroReason",
    instruction: `소급 이유형: list나 topRank처럼 제목/도입부(홑화살괄호 제목 또는 1~2줄 도입 문장)로
    시작해서 번호로 나열하되, 각 항목 설명 끝에 그 특징 때문에 독자가 과거에 겪었을 법한 일을
    짚어주는 소급 설명 문장을 한 줄 덧붙인다(예: "평범한 사람이랑 오래 못 갔던 이유예요", "그
    사람이 자꾸 생각났던 이유입니다", "그때 왜 그랬는지 이제 알겠죠"). "몰랐는데 이제 보니 이유가
    있었다"는 느낌을 주는 게 핵심 — 항목을 특징 나열만 하고 끝내지 않는다. 소급 설명은 매 항목마다
    반드시 붙이고, 뻔한 문장 반복 대신 항목 내용에 맞게 매번 다르게 쓴다.`,
  },
  {
    id: "assertive",
    // 2026-09-03 벤치마크 실측(@taebaek_saju) 반영: 이 계정 글은 거의 전부 제목/도입부를
    // 먼저 쌓고 리스트로 들어가는데, 실제로 잘 되는 벤치마크 글은 그 반대였다 — 제목 없이
    // "[신살명] 가진 [대상] / [단정적 결과 문장] / [한 번 더 짧게 못박기]" 3줄 안에서
    // 바로 끝내고 답글에서 설명으로 들어갔다(예: "홍염살 가진 여자 / 헤어진 사람한테 연락
    // 옵니다 / 거의 다 옵니다"). 이 형태는 아래 [반드시 지킬 구조 규칙]의 "제목/도입부 필수"
    // 규칙에서 예외로 취급한다(buildSystemPrompt 참고).
    instruction: `단정형(제목 없음): 홑화살괄호 제목도, 도입 문장도 없이 곧바로 "[대상] [신살/특징명]
    [키워드 짧게] / [단정적 결과 한 줄] / [그 결과를 한 번 더 짧게 못박는 한 줄]" 형태로 3줄
    안에서 끝낸다(예: "홍염살 가진 여자 / 헤어진 사람한테 연락 옵니다 / 거의 다 옵니다"). 근거나
    이유는 이 파트에서 절대 설명하지 않는다 — 결과만 단정적으로 던지고, 왜 그런지는 다음 파트로
    넘긴다. 문장은 전부 짧고 건조하게, 부연 설명 없이 끊는다.`,
  },
  {
    id: "themeGroup",
    // 2026-09-10 벤치마크 실측(@taebaek_saju 로그인 확인): 이 계정 최고 반응 글들은 신살
    // 이름을 먼저 던지지 않고, 누구나 아는 "관찰 가능한 특징/심리"를 먼저 던진 다음("야망은
    // 큰데 무기력해요"), 그 특징에 해당하는 서로 다른 신살 2~3개를 번호로 나열했다("1. 괴강살
    // 있는 여자 2. 공망 있는 여자 3. 인성 많은 여자"). 신살 용어보다 "이거 내 얘기인가?"가
    // 먼저 꽂히는 구조 - writeThreadDraft가 이 훅일 때만 소재를 2~3개 묶어서 준다.
    instruction: `테마 묶음형: 아래 [검증된 사실]에 여러 소재가 묶여 있다. 먼저 이 소재들이 공통으로
    만들어내는 관찰 가능한 심리/행동 특징 하나를 짧은 한 줄로 던진다(신살 용어를 쓰지 않고,
    "이런 사람들은 [공통 특징]이에요" 식 — 예: "이 분들은 야망은 큰데 무기력해요"). 그다음 그
    특징에 해당하는 대상을 번호로 나열한다("1. [신살명] 있는 사람  2. [신살명] 있는 사람 ...").
    번호 목록 앞에 반드시 저 한 줄 특징 문장이 먼저 나와야 한다 — 신살 이름부터 던지지 않는다.`,
  },
];

// 관찰 -> 설명으로 넘어가는 연결 문장도 매번 "이상하죠 / 기분 탓 아닙니다"로 고정하면 티가 난다.
// 2026-09-03 벤치마크 실측(@taebaek_saju): 실제로 잘 되는 글은 이 "이상하죠" 류 다리 문장을
// 거의 안 쓰고, "본인이 특별해서가 아니에요. [소재]는 [본질]이에요." 식으로 곧장 원인 설명으로
// 뛰어들거나, A와 B를 대조하는 방식으로 설명을 시작했다. 그래서 그 두 유형을 추가하고, 기존
// "이상하죠" 계열은 비중을 줄였다(8개 중 1개만 남김 - 예전엔 4개 중 1개, 25%였던 걸 12.5%로).
const BRIDGE_STYLES = [
  `"이상하죠. 근데 기분 탓 아닙니다. 명리로 설명되는 구조예요." 같은 톤으로 이어간다.`,
  `"우연 아닙니다. 사주에 이미 새겨진 구조예요." 같은 톤으로 짧게 단정하며 이어간다.`,
  `"이거 성격이 아니라, [소재명]이 있는 겁니다." 처럼 원인을 바로 지목하며 이어간다.`,
  `별도의 "기분 탓 아니다"류 연결 문장 없이, 곧바로 명리학적 설명으로 자연스럽게 넘어간다.`,
  `"본인이 특별해서가 아니에요. [소재]는 [본질을 한 줄로 정의]예요." 처럼, 독자를 안심시키며
   곧장 그 신살/기운의 본질 정의로 뛰어든다(예: "본인이 예민해서가 아니에요. 식상은 원래
   그렇게 생긴 자리예요.").`,
  `비슷해 보이는 다른 신살/개념과 대조하며 설명을 시작한다 — "[소재A]는 [특징 한 줄], [소재B]는
   [다른 특징 한 줄]" 형태로 짧게 두 줄을 나란히 놓아 차이를 먼저 보여준 뒤, 이번 글의 소재가
   그중 어느 쪽인지로 자연스럽게 이어간다(예: "도화는 눈으로 붙는 불. 빨리 오고 빨리 식어요.
   홍염은 떨어진 뒤에 온도가 오릅니다.").`,
  `"[소재] 자체가 나쁜 게 아니에요." 처럼 오해부터 바로잡는 문장으로 시작해서, 진짜 의미로
   넘어간다.`,
  `설명 없이 결과가 왜 반복되는지를 짧은 인과 사슬로 못박는다("A라서 B가 되고, B라서 C가
   된다" 식 — 예: "도화가 아니라 홍염이라서 그래요. 홍염은 떨어진 뒤에 진해지거든요.").`,
];

// 마무리도 항상 "CTA 문장 툭 붙이기"로만 끝나면 매번 같은 뒷맛이 남는다(2026-08-30 실측
// 지적 - 벤치마크 채널들은 종합 정리 문단, 캐치프레이즈 나열, 단서/caveat 문단 등 마무리
// 방식 자체가 다양했다). 마지막 파트에서 CTA 문장 앞에 어떤 식으로 숨을 고르고 넘어갈지를
// 여기서 정한다.
const CLOSING_STYLES = [
  {
    id: "plain",
    instruction: `별도 마무리 문단 없이, 마지막 내용 문장 다음 줄에 바로 CTA 문장을 붙인다.`,
  },
  {
    id: "synthesis",
    instruction: `마지막 파트 초반에, 앞서 다룬 대상들을 한 줄씩 요약해서 나열한 뒤("[A]는 ~하고,
    [B]는 ~하고" 식), "그런데 같은 [소재]라도 사람마다 다르다"는 취지의 caveat 문장을 1~2줄
    덧붙인다(예: "원국의 다른 글자, 대운·세운에 따라 갈린다"). 그다음 CTA로 넘어간다.`,
  },
  {
    id: "rhetorical",
    instruction: `마지막 파트에서, 독자가 스스로에게 묻게 만드는 짧은 질문 2~4개를 줄바꿈으로
    나열한다(예: "왜 나만 자꾸 이런 일을 겪을까", "이게 진짜 내 얘기인지 궁금하다면"). 그다음
    바로 이어서 CTA 문장을 붙인다.`,
  },
  {
    // 2026-09-03 벤치마크 실측(@taebaek_saju): 마무리 문단을 따로 안 깔고, 그 소재의
    // 본질을 짧고 단정적인 한두 문장으로 못박은 뒤 바로 CTA로 넘어가는 방식이 잦았다
    // (예: "그 자리가 내 마음에도 똑같이 남아요. 이해가 되면 못 끊거든요.").
    id: "fatalistic",
    instruction: `정리 문단이나 질문 없이, 이번 소재의 본질을 짧고 단정적인 한두 문장으로
    못박는다 — 위로도 경고도 아닌, 그냥 원래 그런 구조라는 투로 끝맺는다(예: "그 자리가 내
    마음에도 똑같이 남아요. 이해가 되면 못 끊거든요.", "이건 노력으로 되는 게 아니에요.
    자리가 그렇게 생긴 거예요."). 그다음 바로 CTA 문장을 붙인다.`,
  },
  {
    // 2026-09-10 벤치마크 실측(@taebaek_saju, 사용자 제공 캡처): 거의 모든 글이 CTA 직전에
    // "매일 오전을 비우세요 / 잠과 물을 지키세요 / 정유월 안에 하나를 버리세요" 식 번호 매긴
    // 구체적 행동 팁 2~3개를 넣었다 — 추상적 위로가 아니라 오늘 당장 해볼 수 있는 실천 항목이라,
    // 상담을 안 받아도 글 자체로 "쓸모"가 남는다(공유·저장 유인).
    id: "actionTips",
    instruction: `정리 문단 대신, 이번 소재를 다루는 데 도움이 되는 아주 구체적인 실천 팁을
    "하나. ~  둘. ~  셋. ~" 식으로 2~3개 나열한다. 추상적 조언("마음을 편히 가지세요") 대신
    오늘/이번 주 안에 실제로 해볼 수 있는 구체적 행동으로 쓴다(예: "잠들기 전 10분은 폰을 끄고
    보세요", "이번 주 안에 미뤄둔 연락 하나만 정리하세요"). 그다음 바로 CTA로 넘어간다.`,
  },
];

function buildSystemPrompt(factsBlock, cta, partCount, hookFormat, bridgeStyle, closingStyle, accountLabel, domainFraming, speechLevel, extraBans) {
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
  // 2026-09-03 사용자 지시: "제목/도입부 필수" 규칙이 모든 훅에 걸려있으면 단정형(assertive)의
  // 핵심(제목 없이 곧장 결과부터 던지기)이 무력화된다 - 이 훅일 때만 예외로 둔다.
  const openingRule =
    hookFormat.id === "assertive"
      ? `1. 이번 글은 "단정형" 훅이므로 홑화살괄호 제목이나 도입 문장을 따로 만들지 않는다 — 위
   [이번 글의 훅 형태]에서 설명한 3줄 구조(대상+소재 / 단정 결과 / 못박기)를 그대로 첫 파트로
   쓴다.`
      : `1. **본문 맨 첫 줄부터 리스트/랭킹/키워드를 바로 던지지 않는다.** 위 [이번 글의 훅 형태]에서
   설명한 대로, 항상 실제 제목 문장을 담은 홑화살괄호(예: <이런 사람이 귀한 사주다>) 또는
   1~3줄짜리 후킹 도입부가 먼저 나오고 그다음에 본론이 이어져야 한다. "1. ..."이나 "1위."로
   글이 시작하면 안 된다 — 그 앞에 반드시 뭔가가 있어야 한다.`;

  return `당신은 한국 Threads(스레드)에서 "종합사주" 콘텐츠를 연재하는 계정 "${accountLabel}"의 전속 작가입니다.
${identity}
매번 같은 틀로 찍어내면 안 됩니다 — 이번 글에 배정된 훅 형태/연결 방식을 그대로 따르세요.
${speechRule}${bansRule}

[이번 글의 훅(본문 시작) 형태]
${hookFormat.instruction}

[이번 글의 관찰->설명 연결 방식]
${bridgeStyle}

[이번 글의 마무리 방식]
${closingStyle.instruction}

[첫 문장 임팩트 - 이게 가장 중요하다]
Threads 피드는 첫 줄(많아야 첫 두 줄)만 보고 넘길지 멈출지 0.5초 안에 결정된다. 그러니 첫
문장은 그 어떤 규칙보다 우선한다:
- 첫 문장에서 "이 글을 지금 읽어야 할 이유"가 바로 느껴져야 한다 — 독자 본인 얘기라는 확신,
  또는 몰랐던 걸 지금 알게 된다는 확신 둘 중 하나를 첫 줄 안에 심는다.
- 배경 설명, 인사, "오늘은 ~에 대해 알아볼게요" 같은 워밍업으로 시작하지 않는다. 곧바로
  대상(띠/일간/신살 보유자)을 지목하거나, 단정적인 주장/결과부터 던진다.
- 뻔하고 일반적인 문장("사주에는 다양한 신살이 있습니다" 같은)이 아니라, 이 소재만의 구체적이고
  의외성 있는 한 문장으로 시작한다.
- 위 [이번 글의 훅 형태]가 이미 첫 줄의 형태(제목형/질문형/단정형 등)를 정해주지만, 그 형태
  안에서도 "가장 강하고 구체적인 표현"을 고른다 — 힘 빠진 표현으로 형식만 채우지 않는다.

[반드시 지킬 구조 규칙]
${openingRule}
2. 본문(1개) + 답글(N-1개)로 구성된 "이어지는 스레드"를 쓴다. 전체 파트 수는 ${partCount}개.
3. **클리프행어**: 본문과 답글 대부분을, 완결된 문장이 아니라 중간에 끊긴 채로 끝낸다(예: "이거 그냥" 처럼).
   그리고 다음 파트 맨 앞에서 그 문장을 이어서 완성한다. 마지막 파트만 완결해도 된다.
4. 오행/십성/일간을 설명할 땐 가능하면 그 오행의 성질을 구체적 사물에 빗댄 은유(예: 계수=이슬,
   신금=보석, 갑목=큰 나무)를 섞어서 기억에 남게 쓴다.
5. **추상적인 성격 묘사로 끝내지 말고, 구체적인 일상 장면·행동으로 바꿔서 쓴다** (예: "성격이
   급하다" 대신 "결제하려다 손이 멈춘다", "예민하다" 대신 "카드값으로 남은 열정" 같은 식). 이건
   list 형태에만 해당하는 게 아니라 이번 글 전체에 적용한다.
6. 위 [이번 글의 마무리 방식]에서 설명한 순서로 마무리한 뒤, 마지막 파트 끝에 아래 문장을
   정확히 그대로 포함한다:
   "${cta}"
7. **한자 강조(선택적, 2026-09-04 벤치마크 실측 반영)**: 모든 단어에 넣지 않는다. 파트 하나당
   많아야 1~2곳, 정말 힘을 주고 싶은 핵심 단어 뒤에만 한자를 괄호로 병기한다(예: "우연이 아니라
   구조(構造)예요", "이건 인연(因緣)이 아니라 습성(習性)입니다"). 신살 이름 자체(홍염살 등)에는
   넣지 않는다 — 감정/개념 단어(구조, 인연, 습성, 본질, 숙명, 인과 등)에 넣을 때 효과가 크다.
   파트마다 반드시 넣어야 하는 건 아니다 — 어울리는 단어가 없으면 그냥 넘어간다.
8. **기둥 위치별 해석(선택적, 2026-09-10 벤치마크 실측 반영)**: 소재 성격상 자연스러우면, "이게
   사주 네 기둥(년주/월주/일주/시주) 중 어디 있느냐"에 따라 결과를 4갈래로 나눠서 보여주는
   방식을 써도 된다 — 아래 [기둥 위치별 의미 - 정통 해석 원칙]을 근거로, "년주에 있으면 ~,
   월주면 ~, 일주면 ~, 시주면 ~" 식으로 한 파트 안에서 짧게 나열한다. 모든 글에 꼭 써야 하는
   건 아니다 — 소재가 "있다/없다"로만 판별되고 위치 구분이 어색하면 그냥 넘어간다.

[기둥 위치별 의미 - 정통 해석 원칙 (필요할 때만 참고)]
${Object.entries(PILLAR_MEANINGS).map(([k, v]) => `${k}: ${v}`).join("\n")}

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
  const hookFormat = hookFormatId ? HOOK_FORMATS.find((h) => h.id === hookFormatId) : pickRandom(HOOK_FORMATS);
  if (!hookFormat) throw Object.assign(new Error(`알 수 없는 훅 형태: ${hookFormatId}`), { status: 400 });

  const effectiveDateKey = dateKey || new Date().toISOString().slice(0, 10);
  let topic;
  let factsBlock;
  // 2026-09-10: themeGroup 훅은 소재 하나가 아니라 서로 다른 소재 2~3개를 한 글 안에 묶어서
  // 쓴다(@taebaek_saju 실측 구조) - topicId를 지정해도 이 훅에서는 무시하고, 풀에서 매번
  // 서로 다른 소재 2~3개를 자동으로 골라 묶는다(같은 신살이 두 번 묶이면 의미가 없어서).
  if (hookFormat.id === "themeGroup") {
    const groupSize = 2 + Math.floor(Math.random() * 2); // 2~3개
    const chosen = shuffled(pool).slice(0, Math.min(groupSize, pool.length));
    topic = { label: chosen.map((t) => t.label).join(" + "), format: "테마 묶음형" };
    factsBlock = chosen.map((t) => t.build(effectiveDateKey)).join("\n\n");
  } else {
    topic = topicId ? pool.find((t) => t.id === topicId) : pickRandom(pool);
    if (!topic) throw Object.assign(new Error(`알 수 없는 소재: ${topicId}`), { status: 400 });
    factsBlock = topic.build(effectiveDateKey);
  }
  const cta = pickRandom(CTA_POOL);
  const bridgeStyle = pickRandom(BRIDGE_STYLES);
  const closingStyle = pickRandom(CLOSING_STYLES);
  // 2026-09-10 벤치마크 실측(@taebaek_saju): 소재가 풍부하면(띠 4개+개운법 등) 7파트짜리 글도
  // 있었다 - 항상 3~5로 압축하지 말고, themeGroup처럼 원래 다룰 대상이 많은 훅은 더 길게 가도
  // 되게 범위를 3~6으로 넓힌다(무제한은 아님 - 너무 길면 완주율이 떨어지므로 6을 상한으로 둠).
  const partCount = 3 + Math.floor(Math.random() * 4); // 3~6

  const raw = await runSkill({
    system: buildSystemPrompt(factsBlock, cta, partCount, hookFormat, bridgeStyle, closingStyle, accountLabel, domainFraming, speechLevel, extraBans),
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
