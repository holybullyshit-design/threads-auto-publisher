// "팔자장인" 종합사주 계정 전용 — 검증된 명리학 판별표 + 만세력 계산기를 결합해서,
// AI가 스스로 사주 이론을 "기억"해서 지어내지 않고, 여기서 미리 계산된 사실만 근거로
// 글을 쓰게 만드는 모듈. (신살/십성 판별법은 사람이 직접 검증한 정통 방식만 사용)

const { calculateCalendar } = require("./fortuneEngine");

const BRANCHES_KO = ["자", "축", "인", "묘", "진", "사", "오", "미", "신", "유", "술", "해"];
const ANIMALS = ["쥐", "소", "호랑이", "토끼", "용", "뱀", "말", "양", "원숭이", "닭", "개", "돼지"];
const STEMS_KO = ["갑", "을", "병", "정", "무", "기", "경", "신", "임", "계"];
const STEM_ELEMENT = ["목", "목", "화", "화", "토", "토", "금", "금", "수", "수"]; // 갑을=목, 병정=화, 무기=토, 경신=금, 임계=수

// 오행별 십성 원소 (일간 기준). 검증: 상생(목화토금수 순환)/상극(목토수화금 순환) 규칙과 일치.
const SIPSEONG_TABLE = {
  목: { 비겁: "목", 식상: "화", 재성: "토", 관성: "금", 인성: "수" },
  화: { 비겁: "화", 식상: "토", 재성: "금", 관성: "수", 인성: "목" },
  토: { 비겁: "토", 식상: "금", 재성: "수", 관성: "목", 인성: "화" },
  금: { 비겁: "금", 식상: "수", 재성: "목", 관성: "화", 인성: "토" },
  수: { 비겁: "수", 식상: "목", 재성: "화", 관성: "토", 인성: "금" },
};

// 삼합 4그룹: [생지(역마), 왕지(도화), 고지(화개)] — 지지 인덱스(자=0...해=11) 기준
const SAMHAP_GROUPS = [
  { name: "인오술(화국)", element: "화", branches: [2, 6, 10] }, // 인·오·술
  { name: "신자진(수국)", element: "수", branches: [8, 0, 4] }, // 신·자·진
  { name: "사유축(금국)", element: "금", branches: [5, 9, 1] }, // 사·유·축
  { name: "해묘미(목국)", element: "목", branches: [11, 3, 7] }, // 해·묘·미
];

function findSamhapGroup(branchIndex) {
  return SAMHAP_GROUPS.find((g) => g.branches.includes(branchIndex));
}

function branchLabel(branchIndex) {
  return `${BRANCHES_KO[branchIndex]}(${ANIMALS[branchIndex]}띠)`;
}

// 역마·도화·화개는 셋 다 "삼합의 생지/왕지/고지" 개념에서 나오지만, 역마·도화는 자기 그룹의
// 구성원이 아니라 다른 지지를 가리킨다(정통 사대국 신살 공식) — 혼동하기 쉬워서 직접
// 검증한 고정표로 못박는다.
//   역마: 자기 생지와 정반대(충)에 있는 지지 = 충하는 삼합 그룹의 생지
//     인오술→신, 신자진→인, 사유축→해, 해묘미→사
//   도화(함지): 사대국 도화결 — 신자진見酉, 사유축見午, 인오술見卯, 해묘미見子
//   화개: 자기 삼합의 "고지(묘지)" 그 자체 — 인오술→술, 신자진→진, 사유축→축, 해묘미→미
const YEOKMA_BY_GROUP = { "인오술(화국)": 8, "신자진(수국)": 2, "사유축(금국)": 11, "해묘미(목국)": 5 };
const DOHWA_BY_GROUP = { "인오술(화국)": 3, "신자진(수국)": 9, "사유축(금국)": 6, "해묘미(목국)": 0 };

// 띠(년지) 기준 역마/도화/화개 자리를 계산.
function getSamhapRoles(branchIndex) {
  const group = findSamhapGroup(branchIndex);
  const goji = group.branches[2]; // 삼합 배열은 [생지, 왕지, 고지] 순서로 정의되어 있음
  return {
    group,
    역마: YEOKMA_BY_GROUP[group.name],
    도화: DOHWA_BY_GROUP[group.name],
    화개: goji,
  };
}

// 검증된 정통 판별표 (일간 기준). 양간에만 적용되는 게 정설인 양인살 포함.
const YANGIN_TABLE = { 갑: 3, 병: 6, 무: 6, 경: 9, 임: 0 }; // 지지 인덱스: 묘=3, 오=6, 유=9, 자=0
const CHEONEULGWIIN_TABLE = {
  갑: [1, 7], 무: [1, 7], 경: [1, 7], // 축(1)·미(7)
  을: [0, 8], 기: [0, 8], // 자(0)·신(8)
  병: [11, 9], 정: [11, 9], // 해(11)·유(9)
  임: [5, 3], 계: [5, 3], // 사(5)·묘(3)
  신: [6, 2], // 오(6)·인(2)
};

// 2026-09-03 소재 확장(사용자 지시 - 벤치마크 채널 대비 소재 폭이 좁다는 지적): 백호살/
// 괴강살/홍염살/문창귀인/원진살 추가. 전부 명리학에서 표준적으로 통용되는 정통 판별표를
// 그대로 코드에 박아넣은 것 — 위의 다른 표들과 동일한 원칙(AI가 기억으로 지어내지 않고
// 여기서 계산된 값만 근거로 쓴다).

// 백호살(白虎殺): 일주(일간+일지)가 아래 7개 갑자 중 하나일 때 성립하는 정통 판별법.
const BAEKHO_ILJU = ["갑진", "을미", "병술", "정축", "무진", "임술", "계축"];

// 괴강살(魁罡殺): 일주가 아래 4개 갑자(경진·경술·임진·임술) 중 하나일 때 성립(좁은 정의,
// 가장 널리 쓰이는 표준 버전).
const GOEGANG_ILJU = ["경진", "경술", "임진", "임술"];

// 홍염살(紅艶殺): 일간 기준 특정 지지가 사주 원국에 있으면 성립(정통 판별표).
const HONGYEOM_TABLE = { 갑: 6, 을: 6, 병: 2, 정: 7, 무: 4, 기: 4, 경: 10, 신: 9, 임: 0, 계: 8 };

// 문창귀인(文昌貴人): 일간 기준 특정 지지가 원국에 있으면 성립(정통 판별표) - 학문/문서운 길신.
const MUNCHANG_TABLE = { 갑: 5, 을: 6, 병: 8, 정: 9, 무: 8, 기: 9, 경: 11, 신: 0, 임: 2, 계: 3 };

// 원진살(怨嗔殺): 년지(띠) 기준 서로 원진 관계인 짝. (자-미, 축-오, 인-유, 묘-신, 진-해, 사-술)
const WONJIN_PAIRS = [
  [0, 7], [1, 6], [2, 9], [3, 8], [4, 11], [5, 10],
];
function getWonjinPartner(branchIndex) {
  const pair = WONJIN_PAIRS.find((p) => p.includes(branchIndex));
  return pair.find((b) => b !== branchIndex);
}

// 삼재: 띠(년지) 삼합 그룹과 "충"하는 방합(계절 3글자) 기준. (해묘미 삼재=사오미 방합 등 검증됨)
const BANGHAP = [
  { name: "인묘진(봄/목방)", element: "목", branches: [2, 3, 4] },
  { name: "사오미(여름/화방)", element: "화", branches: [5, 6, 7] },
  { name: "신유술(가을/금방)", element: "금", branches: [8, 9, 10] },
  { name: "해자축(겨울/수방)", element: "수", branches: [11, 0, 1] },
];
// 삼합 오행 -> 삼재에 해당하는 방합(마주보는 계절)
const SAMJAE_BANGHAP_BY_ELEMENT = { 화: "금방", 수: "목방", 금: "수방", 목: "화방" };

function getSamjaeInfo(yearBranchIndex) {
  const group = findSamhapGroup(yearBranchIndex);
  const targetBanghapName = { 화: "신유술(가을/금방)", 수: "인묘진(봄/목방)", 금: "해자축(겨울/수방)", 목: "사오미(여름/화방)" }[
    group.element
  ];
  const banghap = BANGHAP.find((b) => b.name === targetBanghapName);
  return { samhapGroup: group, samjaeBanghap: banghap };
}

// 오늘/특정 날짜 기준 검증된 년주·월주·일주 (lunar-javascript 기반, fortuneEngine.js 재사용)
function getVerifiedCalendarFacts(dateKey) {
  const cal = calculateCalendar(dateKey);
  const yearBranch = BRANCHES_KO.indexOf(cal.year[1]);
  const monthBranch = BRANCHES_KO.indexOf(cal.month[1]);
  const monthStem = STEMS_KO.indexOf(cal.month[0]);
  return {
    dateKey,
    korean: cal.korean, // "병오년 · 병신월 · 갑술일" 형태
    yearGanji: cal.year,
    monthGanji: cal.month,
    dayGanji: cal.day,
    yearBranchIndex: yearBranch,
    monthBranchIndex: monthBranch,
    monthStemElement: STEM_ELEMENT[monthStem],
  };
}

// 2026-09-10 벤치마크 실측(@taebaek_saju 로그인 확인) 반영: 이 계정은 같은 신살이라도
// "어느 기둥(년주/월주/일주/시주)에 있는지"별로 결과를 4갈래로 나눠서 보여주는 장치를 자주
// 쓴다("년주 괴강/월주 괴강/일주 괴강/시주 괴강" 식). 이건 새 판별표가 아니라 명리학에서
// 표준적으로 쓰이는 "사주 네 기둥이 각각 어느 인생 영역을 상징하는지"에 대한 정통 해석
// 원칙을 신살 설명에 적용한 것 - 코드로 어느 기둥인지 계산하지 않고(독자 본인이 자기
// 사주에서 확인해야 아는 영역), 이 관점 자체를 참고용 사실로 제공한다.
const PILLAR_MEANINGS = {
  년주: "조상·어린 시절·집안 배경, 초년운",
  월주: "부모·형제·사회생활 진입기, 청년기 흐름",
  일주: "나 자신과 배우자 자리, 인생의 중심축",
  시주: "자녀·말년·내가 마지막에 이루는 것",
};

module.exports = {
  BRANCHES_KO,
  ANIMALS,
  STEMS_KO,
  STEM_ELEMENT,
  SIPSEONG_TABLE,
  SAMHAP_GROUPS,
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
  getWonjinPartner,
};
