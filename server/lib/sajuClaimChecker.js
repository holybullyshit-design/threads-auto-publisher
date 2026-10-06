// 생성된 글 본문에서 "기계로 검증 가능한 명리 주장"을 전부 찾아내 판별표와 대조한다.
//
// 왜 필요한가(2026-10-06): 삼재 시기 오류가 발행돼 답글 28건 중 24건이 틀렸다는 지적을 받았다.
// 그때 고친 건 삼재 하나뿐이었고, 전수 검토에서 만세력 간지 한자 색인 버그(월 오행이 undefined)도
// 또 나왔다. 둘 다 "사실 블록을 잘 만들면 괜찮다"는 가정에 기대고 있었는데, 그 가정이 두 번 깨졌다.
// 그래서 **사실 블록을 믿지 않고, 완성된 글 자체를 검사**하는 층을 따로 둔다. 연리지/아해사주의
// 댓글유도 글은 아예 사실 블록이 없는 경로(sajuDraftWriter)에서 나오므로, 이 검사기가 유일한 방어선이다.
//
// 설계 원칙: **거짓 양성(멀쩡한 글을 틀렸다고 하는 것)을 극도로 피한다.** 글이 명확하게 단정한
// 것만 잡는다. 애매하면 통과시킨다 - 안 그러면 재시도만 돌다가 생성이 막힌다.

const {
  BRANCHES_KO,
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
  getSamhapRoles,
  getSamjaeInfo,
  getWonjinPartner,
} = require("./sajuFacts");

const ELEMENTS = ["목", "화", "토", "금", "수"];
// 오행 상생(목→화→토→금→수→목) / 상극(목→토→수→화→금→목)
const SAENG_NEXT = { 목: "화", 화: "토", 토: "금", 금: "수", 수: "목" };
const GEUK_NEXT = { 목: "토", 토: "수", 수: "화", 화: "금", 금: "목" };
// 지지 오행
const BRANCH_ELEMENT = ["수", "토", "목", "목", "토", "화", "화", "토", "금", "금", "토", "수"];
// 지지 육충 / 육합
const CHUNG = { 자: "오", 오: "자", 축: "미", 미: "축", 인: "신", 신: "인", 묘: "유", 유: "묘", 진: "술", 술: "진", 사: "해", 해: "사" };
const YUKHAP = { 자: "축", 축: "자", 인: "해", 해: "인", 묘: "술", 술: "묘", 진: "유", 유: "진", 사: "신", 신: "사", 오: "미", 미: "오" };
const SAMHAP_SETS = [["인", "오", "술"], ["신", "자", "진"], ["사", "유", "축"], ["해", "묘", "미"]];
const BANGHAP_SETS = [["인", "묘", "진"], ["사", "오", "미"], ["신", "유", "술"], ["해", "자", "축"]];
const ANIMAL_TO_BRANCH = Object.fromEntries(ANIMALS.map((a, i) => [a, BRANCHES_KO[i]]));
const SAMHAP_BY_ANIMALS = [
  { key: "인오술", animals: ["호랑이", "말", "개"], seed: 2 },
  { key: "신자진", animals: ["원숭이", "쥐", "용"], seed: 8 },
  { key: "사유축", animals: ["뱀", "닭", "소"], seed: 5 },
  { key: "해묘미", animals: ["돼지", "토끼", "양"], seed: 11 },
];

const branchOfYear = (y) => ((((y - 1984) % 12) + 12) % 12);

// 그 단어를 언급한 "문장"들만 뽑는다. 신살 판별 주장은 한 문장 안에서 이뤄지므로, 지지가 신살
// 이름보다 앞에 오든 뒤에 오든(예: "갑 일간인데 사주에 오(말띠) 글자가 있으면 양인살") 잡힌다.
// 줄바꿈이 잦은 Threads 문체라 마침표만으로 자르면 문장이 너무 길어진다 - 빈 줄·마침표·물음표로 자른다.
// 빈 줄로 구분된 "생각 덩어리" 단위. 주장과 그 주체(일간 등)는 같은 덩어리 안에 있다고 본다.
function blocks(text) {
  return text.split(/\n\s*\n/).filter((b) => b.trim());
}

function sentencesMentioning(text, word) {
  return text
    .split(/(?:\n\s*\n|[.!?。]|\n(?=[가-힣<「【]))/)
    .filter((s) => s.includes(word));
}

// 글이 어떤 삼합 그룹을 대상으로 쓴 건지 찾는다(띠 3개가 다 등장해야 인정 - 한두 개만 스친 글은 제외).
function detectSamhapGroup(text) {
  return SAMHAP_BY_ANIMALS.find((g) => g.animals.every((a) => text.includes(a))) || null;
}
// 글이 지목한 일간(천간 한 글자 또는 오행)을 찾는다.
function detectDayStem(text) {
  const m = text.match(/([갑을병정무기경신임계])\s*\(?\s*[목화토금수]?\s*\)?\s*일간/) || text.match(/일간이?\s*([갑을병정무기경신임계])/);
  return m ? m[1] : null;
}
function detectDayElement(text) {
  const m = text.match(/([목화토금수])\s*일간/);
  return m ? m[1] : null;
}

// 각 검사기는 문제를 발견하면 문자열 하나를 반환한다(없으면 null).
const CHECKS = [
  // 1) 띠 ↔ 출생연도: "호랑이띠(1998·1986·1974)" / "호랑이(1998·1986)" / "1998년생 호랑이"
  function birthYears(text) {
    const issues = [];
    for (const m of text.matchAll(/([가-힣]{1,3})띠?\s*\(\s*((?:19|20)\d{2}(?:\s*[·,、]\s*(?:19|20)\d{2})*)\s*\)/g)) {
      const idx = ANIMALS.indexOf(m[1]);
      if (idx === -1) continue;
      for (const y of m[2].split(/[·,、]/).map((x) => Number(x.trim()))) {
        if (branchOfYear(y) !== idx) issues.push(`${m[1]}띠에 ${y}년(실제 ${ANIMALS[branchOfYear(y)]}띠)`);
      }
    }
    // "돼지띠는 2007·1995·1983년생" 형태 - **같은 줄 안에서** 띠가 연도보다 앞에 올 때만 본다.
    // (줄을 넘어 매칭하면 "…1983년생\n토끼띠는…"에서 1983을 토끼띠로 오인한다 - 실측 오탐 원인)
    for (const line of text.split(/\n/)) {
      const am = line.match(/([가-힣]{1,3})띠/);
      if (!am) continue;
      const idx = ANIMALS.indexOf(am[1]);
      if (idx === -1) continue;
      // 그 줄에 다른 띠가 또 있으면 어느 띠의 연도인지 단정할 수 없다 - 건너뛴다.
      if ([...line.matchAll(/([가-힣]{1,3})띠/g)].filter((x) => ANIMALS.includes(x[1])).length > 1) continue;
      for (const ym of line.matchAll(/((?:19|20)\d{2})\s*년?\s*생/g)) {
        const y = Number(ym[1]);
        if (branchOfYear(y) !== idx) issues.push(`${y}년생을 ${am[1]}띠로(실제 ${ANIMALS[branchOfYear(y)]}띠)`);
      }
      for (const ym of line.matchAll(/((?:19|20)\d{2})\s*[·,、]\s*((?:19|20)\d{2})/g)) {
        for (const y of [Number(ym[1]), Number(ym[2])]) {
          if (branchOfYear(y) !== idx) issues.push(`${y}년을 ${am[1]}띠로(실제 ${ANIMALS[branchOfYear(y)]}띠)`);
        }
      }
    }
    return issues.length ? `띠-출생연도 불일치: ${issues.join(", ")}` : null;
  },

  // 2) 지지 ↔ 띠 병기: "묘(토끼띠)", "신(원숭이띠 글자)"
  function branchAnimalPair(text) {
    const issues = [];
    for (const m of text.matchAll(/([자축인묘진사오미신유술해])\s*\(\s*([가-힣]{1,3})띠/g)) {
      const bi = BRANCHES_KO.indexOf(m[1]);
      if (ANIMALS[bi] !== m[2]) issues.push(`${m[1]}=${m[2]}띠(실제 ${ANIMALS[bi]}띠)`);
    }
    return issues.length ? `지지-띠 불일치: ${issues.join(", ")}` : null;
  },

  // 3) 천간 ↔ 오행 병기: "갑(목)", "신금", "정화"
  function stemElementPair(text) {
    const issues = [];
    for (const m of text.matchAll(/([갑을병정무기경신임계])\s*\(\s*([목화토금수])\s*\)/g)) {
      const want = STEM_ELEMENT[STEMS_KO.indexOf(m[1])];
      if (want !== m[2]) issues.push(`${m[1]}=${m[2]}(실제 ${want})`);
    }
    return issues.length ? `천간-오행 불일치: ${issues.join(", ")}` : null;
  },

  // 4) 오행 상생/상극: "목생화", "금극목", "금이 목을 극"
  function elementRelations(text) {
    const issues = [];
    for (const m of text.matchAll(/([목화토금수])\s*생\s*([목화토금수])/g)) {
      if (SAENG_NEXT[m[1]] !== m[2]) issues.push(`${m[1]}생${m[2]}(실제 ${m[1]}생${SAENG_NEXT[m[1]]})`);
    }
    for (const m of text.matchAll(/([목화토금수])\s*극\s*([목화토금수])/g)) {
      if (GEUK_NEXT[m[1]] !== m[2]) issues.push(`${m[1]}극${m[2]}(실제 ${m[1]}극${GEUK_NEXT[m[1]]})`);
    }
    for (const m of text.matchAll(/([목화토금수])\s*(?:기운)?\s*이\s*([목화토금수])\s*(?:기운)?\s*을\s*극/g)) {
      if (GEUK_NEXT[m[1]] !== m[2]) issues.push(`${m[1]}이 ${m[2]}를 극(실제 ${m[1]}극${GEUK_NEXT[m[1]]})`);
    }
    return issues.length ? `오행 상생상극 오류: ${issues.join(", ")}` : null;
  },

  // 5) 지지 충/합/삼합/방합
  function branchCombos(text) {
    const issues = [];
    for (const m of text.matchAll(/([자축인묘진사오미신유술해])\s*([자축인묘진사오미신유술해])\s*충/g)) {
      if (CHUNG[m[1]] !== m[2]) issues.push(`${m[1]}${m[2]}충(${m[1]}의 충은 ${CHUNG[m[1]]})`);
    }
    for (const m of text.matchAll(/([자축인묘진사오미신유술해])\s*([자축인묘진사오미신유술해])\s*(?:육)?합/g)) {
      const a = m[1], b = m[2];
      const isSamhapPrefix = SAMHAP_SETS.some((s) => s[0] === a && s[1] === b);
      const isBanghapPrefix = BANGHAP_SETS.some((s) => s[0] === a && s[1] === b);
      if (isSamhapPrefix || isBanghapPrefix) continue; // "인오술 삼합" / "인묘진 방합"의 앞 두 글자
      if (YUKHAP[a] !== b) issues.push(`${a}${b}합(${a}의 육합은 ${YUKHAP[a]})`);
    }
    for (const m of text.matchAll(/([자축인묘진사오미신유술해])([자축인묘진사오미신유술해])([자축인묘진사오미신유술해])\s*삼합/g)) {
      const got = [m[1], m[2], m[3]];
      if (!SAMHAP_SETS.some((s) => s.join("") === got.join(""))) issues.push(`${got.join("")} 삼합(정통 삼합은 인오술·신자진·사유축·해묘미)`);
    }
    for (const m of text.matchAll(/([자축인묘진사오미신유술해])([자축인묘진사오미신유술해])([자축인묘진사오미신유술해])\s*방합/g)) {
      const got = [m[1], m[2], m[3]];
      if (!BANGHAP_SETS.some((s) => s.join("") === got.join(""))) issues.push(`${got.join("")} 방합(정통 방합은 인묘진·사오미·신유술·해자축)`);
    }
    return issues.length ? `지지 충/합 오류: ${issues.join(", ")}` : null;
  },

  // 6) 띠 기반 신살(역마·도화·화개): 글이 지목한 삼합 그룹 + 그 신살의 자리
  function samhapSinsal(text) {
    const g = detectSamhapGroup(text);
    if (!g) return null;
    const roles = getSamhapRoles(g.seed);
    const issues = [];
    for (const [name, want] of [["역마", roles.역마], ["도화", roles.도화], ["화개", roles.화개]]) {
      if (!text.includes(name)) continue;
      // 그 신살을 언급한 "문장" 안에서 지지를 단정한 경우만 본다(신살 이름 앞/뒤 어디든).
      for (const sent of sentencesMentioning(text, name)) {
        for (const m of sent.matchAll(/([자축인묘진사오미신유술해])\s*\(/g)) {
          const got = BRANCHES_KO.indexOf(m[1]);
          // 삼합 구성 지지를 그냥 나열한 경우는 제외(판별 자리 주장이 아님)
          if (roles.group.branches.includes(got)) continue;
          if (got !== want) issues.push(`${g.key} ${name}=${m[1]}(실제 ${BRANCHES_KO[want]})`);
        }
      }
    }
    return issues.length ? `띠 기반 신살 오류: ${issues.join(", ")}` : null;
  },

  // 7) 일간 기반 신살(양인·천을귀인·홍염·문창)
  function stemSinsal(text) {
    const issues = [];
    // 여러 일간이 섞인 블록은 판정 보류(순위형 글 오탐 방지).
    for (const block of blocks(text)) {
      const stems = [...new Set([...block.matchAll(/([갑을병정무기경신임계])\s*\(?\s*[목화토금수]?\s*\)?\s*일간/g)].map((m) => m[1]))];
      if (stems.length !== 1) continue;
      issues.push(...stemSinsalInBlock(block, stems[0]));
    }
    return issues.length ? `일간 기반 신살 오류: ${[...new Set(issues)].join(", ")}` : null;
  },
];

function stemSinsalInBlock(text, stem) {
    const issues = [];
    const defs = [
      ["양인", YANGIN_TABLE[stem] === undefined ? null : [YANGIN_TABLE[stem]]],
      ["천을귀인", CHEONEULGWIIN_TABLE[stem]],
      ["홍염", HONGYEOM_TABLE[stem] === undefined ? null : [HONGYEOM_TABLE[stem]]],
      ["문창", MUNCHANG_TABLE[stem] === undefined ? null : [MUNCHANG_TABLE[stem]]],
    ];
    for (const [name, want] of defs) {
      if (!want || !text.includes(name)) continue;
      for (const sent of sentencesMentioning(text, name)) {
        for (const m of sent.matchAll(/([자축인묘진사오미신유술해])\s*\(/g)) {
          const got = BRANCHES_KO.indexOf(m[1]);
          if (!want.includes(got)) issues.push(`${stem} 일간 ${name}=${m[1]}(실제 ${want.map((b) => BRANCHES_KO[b]).join("/")})`);
        }
      }
    }
  return issues;
}

const CHECKS2 = [
  // 8) 일주 기반 신살(백호·괴강): 성립 일주 목록 밖의 일주를 지목했는지
  function iljuSinsal(text) {
    const issues = [];
    for (const [name, list] of [["백호", BAEKHO_ILJU], ["괴강", GOEGANG_ILJU]]) {
      if (!text.includes(name)) continue;
      for (const m of text.matchAll(/([갑을병정무기경신임계][자축인묘진사오미신유술해])\s*일주/g)) {
        // 그 문장 안에 해당 신살 이름이 같이 있을 때만 "이 일주가 그 신살"이라는 주장으로 본다.
        const sent = text.split(/[.\n]/).find((s) => s.includes(m[1]) && s.includes(name));
        if (!sent) continue;
        if (!list.includes(m[1])) issues.push(`${m[1]}일주를 ${name}살로(정통 ${name}: ${list.join("·")})`);
      }
    }
    return issues.length ? `일주 기반 신살 오류: ${issues.join(", ")}` : null;
  },

  // 9) 원진 짝
  function wonjin(text) {
    if (!text.includes("원진")) return null;
    const issues = [];
    for (const m of text.matchAll(/([가-힣]{1,3})띠\s*(?:와|과|-|·)\s*([가-힣]{1,3})띠[^。\n]{0,20}원진/g)) {
      const a = ANIMALS.indexOf(m[1]), b = ANIMALS.indexOf(m[2]);
      if (a === -1 || b === -1) continue;
      if (getWonjinPartner(a) !== b) issues.push(`${m[1]}띠-${m[2]}띠 원진(${m[1]}띠의 원진은 ${ANIMALS[getWonjinPartner(a)]}띠)`);
    }
    return issues.length ? `원진 짝 오류: ${issues.join(", ")}` : null;
  },

  // 10) 십성: "<오행> 일간 ... 관성은 <오행>" 처럼 단정한 경우
  function sipseong(text) {
    const issues = [];
    // 순위형 글은 한 편에서 5개 일간을 다 다룬다(갑을목→금, 병정화→수 …). 전체 문서를 첫 일간
    // 하나로 대조하면 멀쩡한 글이 전부 걸린다(실측 오탐 원인). 그래서 **일간이 정확히 하나만
    // 등장하는 블록** 안에서만 그 일간의 십성을 따진다.
    for (const block of blocks(text)) {
      const found = [...new Set([...block.matchAll(/([목화토금수])\s*일간/g)].map((m) => m[1]))];
      const stemFound = [...new Set([...block.matchAll(/([갑을병정무기경신임계])[가-힣]?([목화토금수])?\s*\(?[^)]{0,4}\)?\s*일간/g)].map((m) => m[1]))];
      if (found.length !== 1 || stemFound.length > 1) continue; // 여러 일간이 섞인 블록은 판정 보류
      const el = found[0];
      const row = SIPSEONG_TABLE[el];
      for (const name of ["비겁", "식상", "재성", "관성", "인성"]) {
        for (const m of block.matchAll(new RegExp(`${name}[^\\n]{0,12}?(?:은|는|이|가)\\s*([목화토금수])`, "g"))) {
          if (row[name] !== m[1]) issues.push(`${el} 일간의 ${name}=${m[1]}(실제 ${row[name]})`);
        }
      }
    }
    return issues.length ? `십성 오류: ${[...new Set(issues)].join(", ")}` : null;
  },

  // 11) 삼재 연도/시기
  function samjae(text, { dateKey } = {}) {
    if (!text.includes("삼재")) return null;
    const g = detectSamhapGroup(text) || SAMHAP_BY_ANIMALS.find((x) => text.includes(x.key));
    if (!g) return null;
    const info = getSamjaeInfo(g.seed, dateKey);
    const issues = [];
    // 방합을 단정했으면 맞는지
    const bang = BANGHAP_SETS.map((s) => s.join("")).find((b) => text.includes(b));
    if (bang && !info.samjaeBanghap.name.startsWith(bang)) {
      issues.push(`${g.key} 삼재를 ${bang}으로(실제 ${info.samjaeBanghap.name.split("(")[0]})`);
    }
    // 진행 중이 아닌데 임박하다고 썼으면
    if (info.status !== "current") {
      const w = ["올해부터", "내년부터", "내년 삼재", "지금부터 3년", "앞으로 3년", "올해가 삼재", "내년이 삼재"].find((x) => text.includes(x));
      if (w) issues.push(`"${w}"로 썼지만 ${g.key} 삼재는 ${info.startYear}~${info.endYear}년(지금 ${info.refYear}년, 직전은 ${info.prevEndYear}년에 끝남)`);
    }
    // 연도를 적었으면 구간과 맞는지
    for (const m of text.matchAll(/((?:20)\d{2})\s*년/g)) {
      const y = Number(m[1]);
      const sent = text.split(/[.\n]/).find((s) => s.includes(m[0]) && s.includes("삼재"));
      if (!sent) continue;
      const inCurrent = y >= info.startYear && y <= info.endYear;
      const inPrev = info.prevEndYear && y >= info.prevEndYear - 2 && y <= info.prevEndYear;
      if (!inCurrent && !inPrev) issues.push(`삼재 연도로 ${y}년(${g.key} 삼재는 ${info.startYear}~${info.endYear}년)`);
    }
    return issues.length ? `삼재 오류: ${issues.join(", ")}` : null;
  },
];

// 글 한 편(파트 전체를 합친 문자열)을 검사한다. 반환: 문제 설명 배열(빈 배열이면 통과).
const ALL_CHECKS = [...CHECKS, ...CHECKS2];

function checkSajuClaims(text, opts = {}) {
  if (!text) return [];
  const found = [];
  for (const check of ALL_CHECKS) {
    let r;
    try {
      r = check(text, opts);
    } catch (err) {
      // 검사기 자체가 터져서 생성이 막히면 안 된다 - 그 검사만 건너뛴다.
      continue;
    }
    if (r) found.push(r);
  }
  return found;
}

module.exports = { checkSajuClaims, ELEMENTS, BRANCH_ELEMENT, CHUNG, YUKHAP, SAMHAP_SETS, BANGHAP_SETS, branchOfYear };
