// 사실 블록 증명기 — 글에 들어갈 "검증된 사실"을 **실제 사주로 엔진이 계산해서** 확인한다.
//
// 왜 필요한가(2026-10-08, 사용자 지시):
// 지금까지 글의 명리 근거는 `sajuFacts.js`의 판별표를 **문장으로 렌더링한 것**이었다. 표가 맞아도
// 그 표를 실제로 돌려본 적은 한 번도 없었다. 삼재 사고가 정확히 그 틈이었다 — 삼합→방합 매핑은
// 맞았는데 "그래서 몇 년이냐"를 아무도 계산하지 않아 AI가 지어냈고, 팔자궤도 글이 댓글 28건 중
// 24건으로 반박당했다.
//
// 그래서 이 모듈은 사실 블록에 적힌 판별법을 **집행한다**:
//   ① 그 조건을 만족하는 진짜 생년월일을 찾아 원국을 만들고
//   ② 엔진(server/lib/saju)으로 신살을 판정해서 **성립하는지 확인**하고
//   ③ 조건을 만족하지 않는 사주에서는 **성립하지 않는지**도 확인한다(거짓 양성 차단).
// 하나라도 어긋나면 throw한다 — 틀린 근거가 AI에게 넘어가지 않게.
//
// 결정론: 날짜 탐색은 고정 범위를 **순서대로** 훑는다. Math.random()도 현재시각도 쓰지 않는다.

const { buildChart } = require("./saju/chart");
const { analyzeSinsal } = require("./saju/sinsal");
const { analyzeStrength } = require("./saju/strength");
const E = require("./saju/elements");
const N = require("./saju/naming");

// 탐색 범위: 실제 독자 연령대(1950~2010). **순서대로** 훑으므로 같은 조건이면 늘 같은 날짜가 나온다.
const SEARCH_FROM = 1950;
const SEARCH_TO = 2010;
// 시지 12개를 모두 덮는 시각(각 시의 한가운데라 경계에 안 걸린다).
const SEARCH_HOURS = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22];

const cache = new Map();

// 년지(띠)는 연도로 거의 결정된다 - 후보 연도를 먼저 좁혀야 탐색이 끝난다.
// (입춘 전 출생은 전년도 간지라 ±1년을 같이 본다)
function candidateYears(yearBranch) {
  if (!yearBranch) return Array.from({ length: SEARCH_TO - SEARCH_FROM + 1 }, (_, i) => SEARCH_FROM + i);
  const want = N.BRANCH_KO.indexOf(yearBranch);
  const out = [];
  for (let y = SEARCH_FROM; y <= SEARCH_TO; y++) {
    // 1984년이 갑자년(자 = index 0)이다.
    const idx = ((y - 1984) % 12 + 12) % 12;
    if (idx === want || idx === (want + 1) % 12) out.push(y);
  }
  return out;
}

/**
 * 조건을 만족하는 실제 원국을 찾는다.
 * @param {object} want
 *   yearBranch      년지(띠)가 이 글자여야 한다
 *   containsBranch  원국 지지 어딘가에 이 글자가 있어야 한다
 *   excludesBranch  원국 지지에 이 글자가 **없어야** 한다
 *   dayStem         일간이 이 글자여야 한다
 *   ilju            일주가 이 간지여야 한다
 * @returns {object|null} buildChart 결과
 */
function findChart(want = {}) {
  const key = JSON.stringify(want);
  if (cache.has(key)) return cache.get(key);

  let found = null;
  const years = candidateYears(want.yearBranch);
  outer:
  for (const y of years) {
    for (let m = 1; m <= 12; m++) {
      for (let d = 1; d <= 28; d++) {
        for (const h of SEARCH_HOURS) {
          let c;
          try {
            c = buildChart({ year: y, month: m, day: d, hour: h, minute: 30, gender: "male" });
          } catch (e) { continue; }
          if (c.warnings.length) continue; // 절기·표준시 경계는 예시로 쓰지 않는다
          if (want.yearBranch && c.pillars.year.branch !== want.yearBranch) continue;
          if (want.dayStem && c.dayStem !== want.dayStem) continue;
          if (want.ilju && c.pillars.day.ko !== want.ilju) continue;
          const branches = c.pillarOrder.map((k) => c.pillars[k].branch);
          if (want.containsBranch && !branches.includes(want.containsBranch)) continue;
          if (want.excludesBranch && branches.includes(want.excludesBranch)) continue;
          found = c;
          break outer;
        }
      }
    }
  }
  cache.set(key, found);
  return found;
}

function sinsalOf(chart, id) {
  return analyzeSinsal(chart, analyzeStrength(chart)).byId[id];
}

function label(chart) {
  return `${chart.input.year}-${String(chart.input.month).padStart(2, "0")}-${String(chart.input.day).padStart(2, "0")} ${chart.summary}`;
}

/**
 * "이 띠 + 원국에 이 글자가 있으면 OO살" 이라는 2단 판별을 엔진으로 집행한다.
 * 우리 Threads 글은 **삼합 기준**을 쓰므로 samhapBased로 확인한다(CLAUDE.md의 용도별 분리).
 *
 * @param {string} id        신살 id (yeokma/dohwa/hwagae)
 * @param {string} yearBranch 띠에 해당하는 년지 한 글자
 * @param {string} target     그 띠에서 그 신살이 걸리는 자리
 */
function proveSamhapSinsal(id, yearBranch, target) {
  const hit = findChart({ yearBranch, containsBranch: target });
  if (!hit) throw new Error(`증명 실패: 년지 ${yearBranch} + ${target}을 가진 원국을 못 찾았습니다`);
  const a = sinsalOf(hit, id);
  if (!a.samhapBased.found) {
    throw new Error(`증명 실패(${id}): ${label(hit)}는 년지 ${yearBranch}에 ${target}을 들고 있는데 엔진이 미성립으로 봅니다`);
  }
  if (!a.samhapBased.targetBranches.includes(target)) {
    throw new Error(`증명 실패(${id}): 년지 ${yearBranch}의 자리는 ${a.samhapBased.targetBranches.join("·")}인데 글은 ${target}이라고 적었습니다`);
  }

  // 같은 띠인데 그 글자가 없으면 성립하지 않아야 한다 — "이 띠라고 다 붙는 건 아니다"의 근거.
  const miss = findChart({ yearBranch, excludesBranch: target });
  if (miss && sinsalOf(miss, id).samhapBased.found) {
    throw new Error(`증명 실패(${id}): ${label(miss)}는 ${target}이 없는데 엔진이 성립으로 봅니다(거짓 양성)`);
  }
  return {
    id,
    provedOn: label(hit),
    counterExample: miss ? label(miss) : null,
    targetBranches: a.samhapBased.targetBranches,
  };
}

/** 일간 기준 신살(양인·천을귀인·홍염·문창)을 엔진으로 집행한다. */
function proveDayStemSinsal(id, dayStem, target) {
  const hit = findChart({ dayStem, containsBranch: target });
  if (!hit) throw new Error(`증명 실패: 일간 ${dayStem} + ${target}을 가진 원국을 못 찾았습니다`);
  const a = sinsalOf(hit, id);
  if (!a.found) throw new Error(`증명 실패(${id}): ${label(hit)}는 일간 ${dayStem}에 ${target}을 들고 있는데 엔진이 미성립으로 봅니다`);
  if (!a.targetBranches.includes(target)) {
    throw new Error(`증명 실패(${id}): 일간 ${dayStem}의 자리는 ${a.targetBranches.join("·")}인데 글은 ${target}이라고 적었습니다`);
  }
  const miss = findChart({ dayStem, excludesBranch: target });
  if (miss && sinsalOf(miss, id).found) {
    throw new Error(`증명 실패(${id}): ${label(miss)}는 ${target}이 없는데 엔진이 성립으로 봅니다(거짓 양성)`);
  }
  return { id, provedOn: label(hit), counterExample: miss ? label(miss) : null, targetBranches: a.targetBranches };
}

/** 일주 자체로 성립하는 신살(백호·괴강)을 엔진으로 집행한다. */
function proveIljuSinsal(id, ilju) {
  const hit = findChart({ ilju });
  if (!hit) throw new Error(`증명 실패: 일주 ${ilju}인 원국을 못 찾았습니다`);
  const a = sinsalOf(hit, id);
  const onDay = a.found && a.at.some((x) => x.pillar === "day");
  if (!onDay) throw new Error(`증명 실패(${id}): 일주가 ${ilju}인데 엔진이 일주에서 미성립으로 봅니다`);
  return { id, provedOn: label(hit), targetIlju: a.targetBranches };
}

/** 십성 관계(재성·관성 등)를 엔진의 도출 규칙으로 집행한다. */
function proveTenGod(dayStem, element, expectedGroup) {
  const actual = E.elementGroupFor(N.STEM_ELEMENT[N.stemIndex(dayStem)], element);
  if (actual !== expectedGroup) {
    throw new Error(`증명 실패(십성): 일간 ${dayStem}에게 ${element}은 ${actual}인데 글은 ${expectedGroup}이라고 적었습니다`);
  }
  return { dayStem, element, group: actual };
}

module.exports = {
  findChart,
  proveSamhapSinsal,
  proveDayStemSinsal,
  proveIljuSinsal,
  proveTenGod,
};
