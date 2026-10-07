// lunar-javascript는 결과를 **중국어 간체 한자**로 돌려준다(比肩, 伤官, 长生, 白蜡金 …).
// 글은 한글로 써야 하므로 여기서 전부 번역한다. 2026-10-06에 "한자로 오는 값을 한글 배열에
// indexOf 걸어서 전부 -1이 나오던" 버그가 있었으므로, 이 파일은 **매핑에 없는 값이 들어오면
// 조용히 undefined를 돌려주지 말고 반드시 throw**한다.
//
// 매핑 대상 문자열은 라이브러리 출력을 실제로 전수 수집해서 만들었다(십성 11 / 십이운성 12 /
// 납음 30 / 오행 5). 새 메서드를 쓰기 시작하면 그 출력도 여기에 먼저 등록할 것.

const STEM_HANJA = [..."甲乙丙丁戊己庚辛壬癸"];
const STEM_KO = ["갑", "을", "병", "정", "무", "기", "경", "신", "임", "계"];
const BRANCH_HANJA = [..."子丑寅卯辰巳午未申酉戌亥"];
const BRANCH_KO = ["자", "축", "인", "묘", "진", "사", "오", "미", "신", "유", "술", "해"];
const ANIMAL_KO = ["쥐", "소", "호랑이", "토끼", "용", "뱀", "말", "양", "원숭이", "닭", "개", "돼지"];

// 천간 오행·음양 (갑을=목, 병정=화, 무기=토, 경신=금, 임계=수 / 갑병무경임=양)
const STEM_ELEMENT = ["목", "목", "화", "화", "토", "토", "금", "금", "수", "수"];
const STEM_YINYANG = ["양", "음", "양", "음", "양", "음", "양", "음", "양", "음"];
// 지지 오행·음양 (자수 축토 인목 묘목 진토 사화 오화 미토 신금 유금 술토 해수)
const BRANCH_ELEMENT = ["수", "토", "목", "목", "토", "화", "화", "토", "금", "금", "토", "수"];
const BRANCH_YINYANG = ["양", "음", "양", "음", "양", "음", "양", "음", "양", "음", "양", "음"];

const ELEMENT_FROM_HANJA = { 木: "목", 火: "화", 土: "토", 金: "금", 水: "수" };

// 십성: 라이브러리 출력(간체) → 한글. 편관은 실무에서 "편관"과 "칠살"을 같이 쓰는데, 하나로
// 고정해야 답이 일치하므로 **편관**으로 쓰고 별칭을 따로 둔다.
const TEN_GOD = {
  比肩: "비견",
  劫财: "겁재",
  食神: "식신",
  伤官: "상관",
  偏财: "편재",
  正财: "정재",
  七杀: "편관",
  正官: "정관",
  偏印: "편인",
  正印: "정인",
  日主: "일간",
};
const TEN_GOD_ALIAS = { 편관: "칠살" };
// 십성 → 다섯 묶음(비겁/식상/재성/관성/인성). 신강약 계산이 이 묶음을 쓴다.
const TEN_GOD_GROUP = {
  비견: "비겁", 겁재: "비겁",
  식신: "식상", 상관: "식상",
  편재: "재성", 정재: "재성",
  편관: "관성", 정관: "관성",
  편인: "인성", 정인: "인성",
};

// 십이운성
const TWELVE_STAGE = {
  长生: "장생", 沐浴: "목욕", 冠带: "관대", 临官: "건록", 帝旺: "제왕", 衰: "쇠",
  病: "병", 死: "사", 墓: "묘", 绝: "절", 胎: "태", 养: "양",
};


// 24절기 한자→한글. lunar-javascript의 절기 표 키가 한자(간체/번체 혼용)라 둘 다 받는다.
const JIEQI_KO = {
  立春: "입춘", 雨水: "우수", 驚蟄: "경칩", 惊蛰: "경칩", 春分: "춘분", 清明: "청명", 淸明: "청명",
  穀雨: "곡우", 谷雨: "곡우", 立夏: "입하", 小滿: "소만", 小满: "소만", 芒種: "망종", 芒种: "망종",
  夏至: "하지", 小暑: "소서", 大暑: "대서", 立秋: "입추", 處暑: "처서", 处暑: "처서", 白露: "백로",
  秋分: "추분", 寒露: "한로", 霜降: "상강", 立冬: "입동", 小雪: "소설", 大雪: "대설", 冬至: "동지",
  小寒: "소한", 大寒: "대한",
};

// 납음 30종
const NAYIN = {
  海中金: "해중금", 炉中火: "노중화", 大林木: "대림목", 路旁土: "노방토", 剑锋金: "검봉금",
  山头火: "산두화", 涧下水: "간하수", 城头土: "성두토", 白蜡金: "백랍금", 杨柳木: "양류목",
  泉中水: "천중수", 屋上土: "옥상토", 霹雳火: "벽력화", 松柏木: "송백목", 长流水: "장류수",
  沙中金: "사중금", 山下火: "산하화", 平地木: "평지목", 壁上土: "벽상토", 金箔金: "금박금",
  覆灯火: "복등화", 天河水: "천하수", 大驿土: "대역토", 钗钏金: "차천금", 桑柘木: "상자목",
  大溪水: "대계수", 沙中土: "사중토", 天上火: "천상화", 石榴木: "석류목", 大海水: "대해수",
};

function need(map, key, what) {
  const v = map[key];
  if (v === undefined) {
    // 조용히 undefined를 흘리면 글에 "undefined"가 박힌다(2026-10-06 실측 사고).
    throw new Error(`${what} 한글 매핑에 없는 값입니다: "${key}" - naming.js에 먼저 등록하세요.`);
  }
  return v;
}

const stemIndex = (ch) => {
  const i = STEM_HANJA.indexOf(ch) !== -1 ? STEM_HANJA.indexOf(ch) : STEM_KO.indexOf(ch);
  if (i === -1) throw new Error(`천간으로 해석할 수 없습니다: "${ch}"`);
  return i;
};
const branchIndex = (ch) => {
  const i = BRANCH_HANJA.indexOf(ch) !== -1 ? BRANCH_HANJA.indexOf(ch) : BRANCH_KO.indexOf(ch);
  if (i === -1) throw new Error(`지지로 해석할 수 없습니다: "${ch}"`);
  return i;
};

// "庚午" → { stemIndex, branchIndex, ko: "경오", ... }
function parseGanji(ganji) {
  if (typeof ganji !== "string" || ganji.length < 2) throw new Error(`간지 형식이 아닙니다: "${ganji}"`);
  const si = stemIndex(ganji[0]);
  const bi = branchIndex(ganji[1]);
  return {
    stemIndex: si,
    branchIndex: bi,
    stem: STEM_KO[si],
    branch: BRANCH_KO[bi],
    ko: STEM_KO[si] + BRANCH_KO[bi],
    hanja: STEM_HANJA[si] + BRANCH_HANJA[bi],
    animal: ANIMAL_KO[bi],
    stemElement: STEM_ELEMENT[si],
    branchElement: BRANCH_ELEMENT[bi],
    stemYinYang: STEM_YINYANG[si],
    branchYinYang: BRANCH_YINYANG[bi],
  };
}

module.exports = {
  STEM_HANJA, STEM_KO, BRANCH_HANJA, BRANCH_KO, ANIMAL_KO, JIEQI_KO,
  STEM_ELEMENT, STEM_YINYANG, BRANCH_ELEMENT, BRANCH_YINYANG,
  TEN_GOD, TEN_GOD_ALIAS, TEN_GOD_GROUP, TWELVE_STAGE, NAYIN,
  stemIndex, branchIndex, parseGanji,
  tenGod: (s) => need(TEN_GOD, s, "십성"),
  twelveStage: (s) => need(TWELVE_STAGE, s, "십이운성"),
  nayin: (s) => need(NAYIN, s, "납음"),
  elementFromHanja: (s) => need(ELEMENT_FROM_HANJA, s, "오행"),
};
