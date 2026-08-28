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

module.exports = {
  BRANCHES_KO,
  ANIMALS,
  STEMS_KO,
  STEM_ELEMENT,
  SIPSEONG_TABLE,
  SAMHAP_GROUPS,
  YANGIN_TABLE,
  CHEONEULGWIIN_TABLE,
  branchLabel,
  getSamhapRoles,
  getSamjaeInfo,
  getVerifiedCalendarFacts,
};
