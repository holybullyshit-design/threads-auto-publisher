// 대운·세운(연운) 계산.
//
// 대운은 월주에서 출발해 순행/역행으로 10년씩 전개된다. 방향은 **연간의 음양 × 성별**로 갈린다
// (양년생 남자·음년생 여자는 순행, 그 반대는 역행). 시작 나이(대운수)는 태어난 날부터 다음(순행)
// 또는 직전(역행) 절입일까지의 날수를 3으로 나눈 값이다. 이 계산은 lunar-javascript가 해주고,
// 정답지 2건으로 간지 순서가 완전히 일치하는 것을 확인했다.
//
// 2026-10-07 정답지 대조에서 나온 차이 하나: 라이브러리는 **세는나이**로 돌려준다(대운 전 구간이
// 1세부터 시작). 한국 만세력 앱은 **만나이**를 쓴다(대운수 5 = 만 5세). 두 정답지 모두 정확히
// 1 차이라, 만나이로 변환해서 돌려준다.
//   1988-04-21 남: 라이브러리 6세 → 앱 대운수 5
//   1990-11-19 여: 라이브러리 5세 → 앱 대운수 4
//
// 결정론: 기준 연도를 인자로 받는다. 현재시각에 의존하지 않는다.

const { Solar } = require("lunar-javascript");
const CONFIG = require("./config");
const N = require("./naming");
const E = require("./elements");

// 라이브러리가 세는나이로 주는 것을 만나이로 바꾼다.
const AGE_OFFSET = -1;

// ── 대운수를 직접 계산한다 (2026-10-07) ──────────────────────────────────
// 라이브러리의 getStartAge()에서 1을 빼 쓰던 걸 그만뒀다. 정답지4(1966-10-26 10:00 남)에서
// 라이브러리는 5를, 앱은 4를 준다. 규칙은 단순하다 — **순행이면 다음 절입까지, 역행이면 직전
// 절입부터의 시간을 3일=1년으로 환산하고 반올림**한다. 정답지 2건(1958 경칩까지 5.81일 → 2,
// 1966 입동까지 12.83일 → 4)에서 반올림이 둘 다 맞았다(내림은 1958에서 1이 되어 틀린다).
// 절기 시각은 chart.js와 같은 이유로 **중국 표준시 → KST 보정**을 거친다(config.JIEQI_TZ_OFFSET_MIN).
//
// 중기(中氣)는 쓰지 않는다 - 대운은 절(節)에서만 갈린다.
const JEOL_HANJA = new Set([
  "立春", "驚蟄", "惊蛰", "清明", "淸明", "立夏", "芒種", "芒种", "小暑",
  "立秋", "白露", "寒露", "立冬", "大雪", "小寒",
]);

function jeolMomentsAround(solar) {
  const out = [];
  for (const y of [solar.getYear() - 1, solar.getYear(), solar.getYear() + 1]) {
    const table = Solar.fromYmd(y, 6, 15).getLunar().getJieQiTable();
    for (const [hanja, at] of Object.entries(table)) {
      if (!JEOL_HANJA.has(hanja)) continue;
      const ms = Date.UTC(at.getYear(), at.getMonth() - 1, at.getDay(), at.getHour(), at.getMinute())
        + CONFIG.JIEQI_TZ_OFFSET_MIN * 60000;
      out.push({ name: N.JIEQI_KO[hanja] || hanja, ms });
    }
  }
  return out.sort((a, b) => a.ms - b.ms);
}

function computeDaeunNumber(solar, forward) {
  const birth = Date.UTC(solar.getYear(), solar.getMonth() - 1, solar.getDay(), solar.getHour(), solar.getMinute());
  const list = jeolMomentsAround(solar);
  const target = forward
    ? list.find((x) => x.ms > birth)
    : list.filter((x) => x.ms <= birth).pop();
  if (!target) throw new Error("대운수를 정할 절입을 찾지 못했습니다");
  const days = Math.abs(target.ms - birth) / 86400000;
  return { number: Math.round(days / 3), days, jeol: target.name };
}

function decorate(ganjiKo, dayStem) {
  const g = N.parseGanji(ganjiKo);
  return {
    ganji: g.ko,
    stem: g.stem,
    branch: g.branch,
    animal: g.animal,
    stemElement: g.stemElement,
    branchElement: g.branchElement,
    // 그 운이 일간에게 어떤 십성으로 들어오는지 - 글과 상담이 쓰는 핵심 정보다.
    tenGodOfStem: E.tenGodOf(dayStem, g.stem),
    tenGodOfBranch: E.tenGodOf(dayStem, E.hiddenStemsOf(g.branch).slice(-1)[0].stem),
  };
}

/**
 * 대운을 계산한다.
 * @param {object} chart buildChart() 결과
 * @param {number} count 몇 개까지 볼지(기본 10 - 만세력 앱과 같은 범위)
 */
function daeun(chart, count = 10) {
  if (chart.timeUnknown) {
    // 대운수는 절입일까지의 날수로 정해지므로 시간을 몰라도 계산되지만, 경계일에 태어난 경우
    // 하루 차이로 대운수가 1 달라질 수 있다. 숨기지 않고 경고를 단다.
    // (시주가 없다고 대운 자체를 못 내는 건 아니다)
  }
  const yun = chart._eightChar.getYun(chart.gender === "male" ? 1 : 0);
  const raw = yun.getDaYun(count + 1); // [0]은 대운 시작 전 구간(간지 없음)
  const startSolar = yun.getStartSolar();

  const list = [];
  for (let i = 1; i < raw.length && list.length < count; i++) {
    const d = raw[i];
    const ganji = d.getGanZhi();
    if (!ganji) continue;
    list.push({
      index: list.length + 1,
      startAge: d.getStartAge() + AGE_OFFSET, // 만나이
      endAge: d.getEndAge() + AGE_OFFSET,
      startYear: d.getStartYear(),
      endYear: d.getEndYear(),
      ...decorate(ganji, chart.dayStem),
    });
  }

  const direction = raw.length > 1 && list.length > 1
    ? (N.branchIndex(list[1].branch) - N.branchIndex(list[0].branch) + 12) % 12 === 1 ? "순행" : "역행"
    : null;

  // 대운수는 라이브러리 값이 아니라 절입까지의 거리로 직접 구한다(위 주석 참고).
  const dn = computeDaeunNumber(chart._solar, direction !== "역행");
  // 대운 나이는 전부 대운수에서 10년씩 간다. 라이브러리 나이를 그대로 쓰면 여기서 통째로 밀린다.
  for (let i = 0; i < list.length; i++) {
    list[i].startAge = dn.number + i * 10;
    list[i].endAge = list[i].startAge + 9;
  }

  const first = list[0];
  return {
    direction,
    // 대운수 = 첫 대운이 시작되는 만나이. 만세력 앱이 "대운수 : 4(무술)"로 보여주는 그 숫자다.
    daeunNumber: dn.number,
    daeunBasis: `${direction === "역행" ? "직전" : "다음"} 절입(${dn.jeol})까지 ${dn.days.toFixed(2)}일 → 3일=1년으로 환산해 반올림`,
    // 대운이 시작되는 기준(월주)
    basePillar: chart.pillars.month.ko,
    startDate: startSolar ? startSolar.toYmd() : null,
    list,
    note: chart.timeUnknown ? "태어난 시간을 몰라도 대운수는 나오지만, 절입 경계일 출생이면 1 차이가 날 수 있다." : undefined,
  };
}

/**
 * 특정 연도에 해당하는 대운을 찾는다.
 */
function daeunAt(chart, year, count = 12) {
  const d = daeun(chart, count);
  return d.list.find((x) => year >= x.startYear && year <= x.endYear) || null;
}

/**
 * 세운(연운)을 계산한다. 기준 연도부터 n개.
 * @param {object} chart
 * @param {number} fromYear 시작 연도(필수 - 현재시각에 의존하지 않기 위해)
 * @param {number} count
 */
function seun(chart, fromYear, count = 10) {
  if (!Number.isInteger(fromYear)) throw new Error("세운은 기준 연도를 받아야 합니다(현재시각에 의존하지 않기 위해).");
  const { Solar } = require("lunar-javascript");
  const out = [];
  for (let i = 0; i < count; i++) {
    const y = fromYear + i;
    // 그 해의 년주는 입춘 이후 기준이라, 연중(6월 15일)으로 뽑으면 안전하다.
    const ec = Solar.fromYmdHms(y, 6, 15, 12, 0, 0).getLunar().getEightChar();
    out.push({ year: y, ...decorate(ec.getYear(), chart.dayStem) });
  }
  return out;
}

module.exports = { daeun, daeunAt, seun };
