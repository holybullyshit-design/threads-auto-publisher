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
    // 2026-10-07 돌연변이 테스트로 드러난 버그: 예전 정규식이 `([가-힣]{1,3})띠?\s*\(` 였는데
    // `[가-힣]{1,3}`가 욕심껏 먹어서 "양띠(" 에서 그룹1이 **"양띠"** 가 돼버렸다(띠도 한글이다).
    // 그래서 3글자 띠(호랑이·원숭이)만 걸리고 1~2글자 띠(쥐·소·용·말·양·개·뱀·닭·토끼)는
    // 전부 빠져나갔다. 줄 단위 검사가 덮어주고 있었지만, **한 줄에 띠가 둘이면** 그것도
    // 건너뛰므로("양띠(…)랑 쥐띠(…)는") 완전히 무방비였다.
    // → 띠 이름을 명시적으로 나열해서 경계를 못 박는다.
    const ANIMAL_ALT = ANIMALS.join("|");

    // ① "호랑이띠(1998·1986·1974)" / "양띠(1992·2003)" - 각 띠가 자기 괄호를 갖는 형태
    const parenRe = new RegExp(`(${ANIMAL_ALT})띠?\\s*\\(\\s*((?:19|20)\\d{2}(?:\\s*[·,、]\\s*(?:19|20)\\d{2})*)\\s*\\)`, "g");
    for (const m of text.matchAll(parenRe)) {
      const idx = ANIMALS.indexOf(m[1]);
      for (const y of m[2].split(/[·,、]/).map((x) => Number(x.trim()))) {
        if (branchOfYear(y) !== idx) issues.push(`${m[1]}띠에 ${y}년(실제 ${ANIMALS[branchOfYear(y)]}띠)`);
      }
    }

    // ③ "1977·1989·2001 뱀띠" - 연도 묶음이 띠 **바로 앞**에 오는 형태(2026-10-10 추가).
    //    실제 팔자궤도 글이 `<1977·1989·2001 뱀띠 / 1981·1993·2005 닭띠 / 1973·1985·1997 소띠>`
    //    처럼 쓰는데, ②는 "YYYY년생"만 보고 "같은 줄에 띠 하나"를 요구해서 이 줄을 통째로
    //    건너뛰었다. 돌연변이 측정에서 1977→1978로 바꿔도 통과했다.
    //    연도와 띠가 **붙어 있을 때만** 보므로 어느 띠의 연도인지 단정할 수 있다(줄에 띠가 여럿이어도 안전).
    //    **줄바꿈을 넘으면 안 된다.** 처음 구현이 `\s*`를 써서 "닭띠 2005·1993·1981년생\n뱀띠 …"의
    //    연도를 다음 줄 뱀띠에 붙여 6건을 오탐했다(검사기 제1원칙은 거짓 양성 0). 같은 줄만 본다.
    const leadRe = new RegExp(`((?:19|20)\\d{2}(?:[ \\t]*[·,、][ \\t]*(?:19|20)\\d{2})*)[ \\t]*년?생?[ \\t]*(${ANIMAL_ALT})띠`, "g");
    for (const m of text.matchAll(leadRe)) {
      const idx = ANIMALS.indexOf(m[2]);
      for (const y of m[1].split(/[·,、]/).map((x) => Number(x.trim()))) {
        if (branchOfYear(y) !== idx) issues.push(`${m[2]}띠에 ${y}년(실제 ${ANIMALS[branchOfYear(y)]}띠)`);
      }
    }

    // ② "돼지띠는 2007·1995·1983년생" - 괄호 없이 쓰는 형태. 같은 줄에 띠가 하나일 때만 본다
    //    (여러 띠가 섞인 줄은 어느 띠의 연도인지 단정할 수 없다).
    for (const line of text.split(/\n/)) {
      if (parenRe.test(line)) { parenRe.lastIndex = 0; continue; } // ①에서 이미 처리
      parenRe.lastIndex = 0;
      const animalsOnLine = [...line.matchAll(new RegExp(`(${ANIMAL_ALT})띠`, "g"))].map((x) => x[1]);
      if (animalsOnLine.length !== 1) continue;
      const idx = ANIMALS.indexOf(animalsOnLine[0]);
      for (const ym of line.matchAll(/((?:19|20)\d{2})\s*년?\s*생/g)) {
        const y = Number(ym[1]);
        if (branchOfYear(y) !== idx) issues.push(`${y}년생을 ${animalsOnLine[0]}띠로(실제 ${ANIMALS[branchOfYear(y)]}띠)`);
      }
      for (const ym of line.matchAll(/((?:19|20)\d{2})\s*[·,、]\s*((?:19|20)\d{2})/g)) {
        for (const y of [Number(ym[1]), Number(ym[2])]) {
          if (branchOfYear(y) !== idx) issues.push(`${y}년을 ${animalsOnLine[0]}띠로(실제 ${ANIMALS[branchOfYear(y)]}띠)`);
        }
      }
    }
    return issues.length ? `띠-출생연도 불일치: ${[...new Set(issues)].join(", ")}` : null;
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
    // 2026-10-07 돌연변이 테스트에서 드러난 구멍: 글은 삼합/방합을 "인오술", "신자진(申子辰)"처럼
    // **단어 없이 세 글자로만** 쓰는 경우가 많아서, 뒤에 "삼합"이 붙은 경우만 보던 규칙이 한 글자
    // 틀린 변형을 전혀 못 잡았다(22건 중 0건 탐지).
    // 그렇다고 "지지 3글자 연속"을 전부 검사하면 "친구가 인사해도", "자기도 축축해져요",
    // "유유자형", "축오해(害)" 같은 정상 텍스트가 걸린다(실측 9건). 그래서 **정통 조합과 자리별로
    // 정확히 2글자가 일치하는 것**만 잡는다 - 그게 "한 글자 틀린 변형"의 signature다.
    // (실측: 오탐 후보 9건은 전부 1글자 이하 일치라 걸리지 않고, 한 글자 손상은 전부 걸린다)
    const GROUPS = [...SAMHAP_SETS.map((x) => ({ chars: x, kind: "삼합" })), ...BANGHAP_SETS.map((x) => ({ chars: x, kind: "방합" }))];
    for (const m of text.matchAll(/[자축인묘진사오미신유술해]{3}/g)) {
      const got = [...m[0]];
      if (GROUPS.some((g) => g.chars.join("") === m[0])) continue; // 정상 조합
      for (const g of GROUPS) {
        const same = got.filter((ch, i) => ch === g.chars[i]).length;
        if (same === 2) {
          issues.push(`${m[0]}(정통 ${g.kind}은 ${g.chars.join("")})`);
          break;
        }
      }
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

  // 11) 천간합·천간충 — 사주 엔진(server/lib/saju/relations.js)의 정통 표와 대조한다.
  function stemCombos(text) {
    const issues = [];
    const R = require("./saju/relations");
    for (const m of text.matchAll(/([갑을병정무기경신임계])\s*([갑을병정무기경신임계])\s*합\s*([목화토금수])?/g)) {
      const [a, b, el] = [m[1], m[2], m[3]];
      const def = R.STEM_HAP.find((x) => (x.pair[0] === a && x.pair[1] === b) || (x.pair[0] === b && x.pair[1] === a));
      if (!def) { issues.push(`${a}${b}합(정통 천간합은 갑기·을경·병신·정임·무계)`); continue; }
      if (el && def.result !== el) issues.push(`${a}${b}합${el}(실제 ${a}${b}합${def.result})`);
    }
    for (const m of text.matchAll(/([갑을병정무기경신임계])\s*([갑을병정무기경신임계])\s*충/g)) {
      const [a, b] = [m[1], m[2]];
      const ok = R.STEM_CHUNG.some((p) => (p[0] === a && p[1] === b) || (p[0] === b && p[1] === a));
      if (!ok) issues.push(`${a}${b}충(정통 천간충은 갑경·을신·병임·정계)`);
    }
    return issues.length ? `천간합·충 오류: ${issues.join(", ")}` : null;
  },

  // 12) 지장간 — "<지지>의 지장간은 ○○○" 처럼 단정한 경우
  function hiddenStems(text) {
    const E = require("./saju/elements");
    const issues = [];
    for (const m of text.matchAll(/([자축인묘진사오미신유술해])\s*(?:\([^)]*\))?\s*(?:의)?\s*지장간\s*(?:은|는|이|가)?\s*[:=]?\s*([가-힣]{2,3})/g)) {
      const want = E.HIDDEN_STEMS[m[1]];
      if (!want) continue;
      const got = m[2];
      // 글이 적은 글자들이 전부 실제 지장간에 들어 있어야 한다(순서·개수는 느슨하게 본다).
      const bad = [...got].filter((ch) => "갑을병정무기경신임계".includes(ch) && !want.includes(ch));
      if (bad.length) issues.push(`${m[1]}의 지장간에 ${bad.join("")}(실제 ${want.join("")})`);
    }
    return issues.length ? `지장간 오류: ${issues.join(", ")}` : null;
  },

  // 13) **엔진이 사실을 주지 않는 영역을 단정했는지** — 마지막 안전망.
  //
  // 2026-10-07: 소재 뱅크는 13개뿐이고 그 13개는 전부 위 검사 항목이 덮는다. 그래서 글이
  // 하는 명리 주장은 원칙적으로 전부 검증된다. 문제는 AI가 **소재 밖 개념을 꺼내 단정**하는
  // 경우다 - 12운성·12신살·격국·공망·대운/세운의 구체값은 엔진이 사실로 주지 않으므로,
  // 그런 단정이 나오면 그건 AI가 기억으로 쓴 것이고 아무도 검증하지 못한다(삼재 사고와 같은 구조).
  //
  // 단, "대운·세운을 같이 봐야 한다" 같은 **유보 표현은 정상이고 오히려 권장**된다(CTA 정보 갭).
  // 실측: 전체 글에서 대운 209회·세운 277회가 전부 유보 표현이었다. 그래서 **구체값을 못 박은
  // 경우만** 잡는다. ("스스로 세운 기준" 같은 일반 한국어도 걸리면 안 된다)
  function outOfScopeAssertions(text) {
    const issues = [];
    // ⚠ 이 검사는 **오탐이 제일 나기 쉬운 자리**다. 2026-10-07 첫 구현이 실제 글에서 3종을 오탐했다:
    //   "이중인격이" → "이중인"+"격이"로 격국 오인
    //   "대운에 따라 정해지는" → 정해(丁亥)를 대운 간지로 오인
    //   "~에 기인한" → 기인(己寅)을 간지로 오인
    // 간지 두 글자는 흔한 한국어와 너무 많이 겹친다(정해·기인·을사·무신·갑자…). 그래서
    // **간지 탐지는 포기하고**, 겹칠 수 없는 형태(연도·나이)와 **명시적 격국 이름**만 잡는다.
    // 어차피 실측상 우리 글은 대운·세운을 209회·277회 언급하면서 구체값을 단정한 적이 0건이다
    // (전부 "대운에 따라 다르다"는 유보 표현 - 오히려 권장되는 CTA 정보 갭 패턴).

    // 대운/세운에 연도·나이를 못 박은 경우(양방향)
    const CONCRETE = "(?:19|20)\\d{2}\\s*년|\\d{1,3}\\s*세";
    for (const m of text.matchAll(new RegExp(`(대운|세운)[^\\n]{0,8}?(${CONCRETE})`, "g"))) {
      issues.push(`${m[1]}에 구체값 "${m[2].trim()}"을 단정`);
    }
    for (const m of text.matchAll(new RegExp(`(${CONCRETE})\\s*(?:부터\\s*)?(대운|세운)`, "g"))) {
      issues.push(`${m[2]}에 구체값 "${m[1].trim()}"을 단정`);
    }
    // 격국은 **실제 격국 이름**만 본다(아무 2~4글자나 잡으면 "이중인격"이 걸린다)
    const GYEOKGUK = ["정관격", "편관격", "칠살격", "식신격", "상관격", "정재격", "편재격", "정인격", "편인격", "건록격", "양인격", "곡직격", "염상격", "가색격", "종혁격", "윤하격"];
    for (const g of GYEOKGUK) if (text.includes(g)) issues.push(`격국 "${g}"을 단정`);

    // 공망을 특정 지지로 단정한 경우
    for (const m of text.matchAll(/공망[^\n]{0,8}?(?:는|은|이|가)\s*([자축인묘진사오미신유술해])(?:\s*[·,]\s*[자축인묘진사오미신유술해])?\s*(?:입니다|이에요|이야|야|지|\.|$|[)\]])/gm)) {
      issues.push(`공망을 "${m[1]}"로 단정`);
    }
    // 12운성을 특정 일간·지지에 못 박은 경우
    // 임관과 건록은 같은 단계의 다른 이름이다. 글에 어느 쪽이 쓰였든 받는다.
    const STAGE = "장생|목욕|관대|건록|임관|제왕|쇠|병|사|묘|절|태|양";
    const stageRe = new RegExp(`([갑을병정무기경신임계])\\s*일간[^\\n]{0,16}?([자축인묘진사오미신유술해])[^\\n]{0,8}?(${STAGE})\\s*(?:이다|입니다|이에요|야|지)`, "g");
    for (const m of text.matchAll(stageRe)) {
      issues.push(`12운성 "${m[1]} 일간 + ${m[2]} = ${m[3]}"을 단정`);
    }

    return issues.length
      ? `엔진이 사실로 주지 않는 영역을 단정함(검증할 방법이 없으니 쓰지 말 것): ${[...new Set(issues)].join(", ")}`
      : null;
  },

  // 14) 삼재 연도/시기
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
    // 아직 안 온 띠에게 임박하다고 썼으면
    if (info.status !== "current") {
      const w = ["올해부터", "내년부터", "내년 삼재", "지금부터 3년", "앞으로 3년", "올해가 삼재", "내년이 삼재"].find((x) => text.includes(x));
      if (w) issues.push(`"${w}"로 썼지만 ${g.key} 삼재는 ${info.startYear}~${info.endYear}년(지금 ${info.refYear}년, 직전은 ${info.prevEndYear}년에 끝남)`);
    } else {
      // 2026-10-07 돌연변이 테스트에서 마지막까지 안 걸리던 것: **이미 진행 중인 띠**에게
      // "내년부터 삼재"라고 써도 통과했다(진행 중이 아닐 때만 검사했기 때문).
      // 진행 중이면 시작 시점이 이미 지났으므로 "내년부터"는 언제나 틀리고,
      // "올해부터"는 첫해(들삼재)일 때만 맞다.
      if (/내년부터\s*삼재|삼재[^\n]{0,6}내년부터|내년이\s*삼재|내년\s*삼재/.test(text)) {
        issues.push(`"내년부터"로 썼지만 ${g.key} 삼재는 ${info.startYear}년에 이미 시작해 지금 ${info.nthYear}년째다(${info.endYear}년에 끝남)`);
      }
      if (info.nthYear !== 1 && /올해부터\s*삼재|삼재[^\n]{0,6}올해부터/.test(text)) {
        issues.push(`"올해부터"로 썼지만 ${g.key} 삼재는 ${info.startYear}년 시작이라 지금 ${info.nthYear}년째다`);
      }
    }
    // 연도를 적었으면 **어떤 연도로 적었는지**까지 본다. 2026-10-07 돌연변이 테스트에서,
    // "직전 삼재는 2021년에 끝났어요"를 "2033년"으로 바꿔도 안 걸렸다 - 2033이 다음 삼재 구간
    // 안이라 "구간 중 하나면 통과"로 빠져나간 것이다. 문구별로 맞는 값과 대조한다.
    for (const m of text.matchAll(/직전\s*삼재[^\n]{0,12}?((?:20)\d{2})\s*년/g)) {
      const y = Number(m[1]);
      if (info.prevEndYear && y !== info.prevEndYear) issues.push(`직전 삼재 종료를 ${y}년으로(실제 ${info.prevEndYear}년)`);
    }
    for (const m of text.matchAll(/(?:이번|다음)\s*삼재[^\n]{0,12}?((?:20)\d{2})\s*년/g)) {
      const y = Number(m[1]);
      if (y !== info.startYear) issues.push(`이번 삼재 시작을 ${y}년으로(실제 ${info.startYear}년)`);
    }
    // 범위 표기("2031~2033년")는 **앞 연도에 '년'이 안 붙는다**. 아래 일반 검사는 `년`이 붙은
    // 연도만 보기 때문에 앞 연도가 통째로 빠져나갔다 — 돌연변이 테스트에서 "2031~2033년"을
    // "2043~2033년"으로 바꿔도 통과했다(2026-10-10, 677건 중 유일한 누락). 범위를 따로 본다.
    for (const m of text.matchAll(/((?:20)\d{2})\s*[~∼〜\-–—]\s*((?:20)\d{2})\s*년?/g)) {
      const sent = text.split(/[.\n]/).find((x) => x.includes(m[0]) && x.includes("삼재"));
      if (!sent) continue;
      const a = Number(m[1]), b = Number(m[2]);
      if (a > b) { issues.push(`삼재 구간이 뒤집힘(${a}~${b}년)`); continue; }
      const okPair = (a === info.startYear && b === info.endYear)
        || (info.prevEndYear && b === info.prevEndYear && a === info.prevEndYear - 2);
      if (!okPair) issues.push(`삼재 구간을 ${a}~${b}년으로(${g.key} 삼재는 ${info.startYear}~${info.endYear}년)`);
    }

    // 그 외 삼재 문장 안의 연도는 두 구간 중 하나에는 들어가야 한다.
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
