// 생년월일시 + 성별 → 원국(사주 네 기둥)과 거기서 파생되는 모든 사실을 계산한다.
//
// 왜 이 모듈이 생겼나(2026-10-07 사용자 지시): 그때까지 콘텐츠 엔진은 **사주를 계산한 적이 한 번도
// 없었다.** 띠 하나를 랜덤으로 뽑아 판별 규칙을 설명하는 구조라, 궁합·대운·신강약처럼 원국이 있어야
// 하는 얘기는 전부 AI가 분위기로 썼다(그래서 삼재 시기 오류 같은 사고가 났다).
// 만세력 자체는 이미 lunar-javascript가 정확하게 해준다(입춘·절기 경계, 음력·윤달, 대운 순역까지
// 실측 검증 완료) - 그걸 69개 메서드 중 3개만 쓰고 있었다. 이 모듈이 그 전부를 한 객체로 모은다.
//
// 결정론: 같은 입력이면 항상 같은 출력이다. 이 파일은 Math.random()도 현재시각도 쓰지 않는다.
// 유파 선택(일주 경계·진태양시·신강약 가중치)은 전부 config.js에 못 박혀 있다.

const { Solar, Lunar } = require("lunar-javascript");
const CONFIG = require("./config");
const N = require("./naming");
const E = require("./elements");

const PILLAR_KEYS = ["year", "month", "day", "time"];
const PILLAR_KO = { year: "년주", month: "월주", day: "일주", time: "시주" };
// 각 기둥이 상징하는 영역 - 글에서 "어느 기둥에 걸렸나"를 말할 때 쓴다.
const PILLAR_MEANING = {
  year: "조상·초년·집안 배경",
  month: "부모·형제·사회생활",
  day: "나 자신·배우자",
  time: "자녀·말년",
};

function assertPositiveInt(v, name) {
  if (!Number.isInteger(v)) throw new Error(`${name}은 정수여야 합니다: ${v}`);
}

// 입력을 Solar(양력) 객체로 정규화한다. 음력이면 윤달 여부까지 받는다.
// lunar-javascript의 Lunar.fromYmdHms는 윤달을 "월에 음수"로 표현한다(윤6월 = -6).
function toSolar({ year, month, day, hour, minute, calendar, isLeapMonth }) {
  assertPositiveInt(year, "년");
  assertPositiveInt(month, "월");
  assertPositiveInt(day, "일");
  if (calendar === "lunar") {
    const m = isLeapMonth ? -Math.abs(month) : month;
    return Lunar.fromYmdHms(year, m, day, hour, minute, 0).getSolar();
  }
  if (calendar && calendar !== "solar") throw new Error(`달력 종류는 solar 또는 lunar여야 합니다: ${calendar}`);
  return Solar.fromYmdHms(year, month, day, hour, minute, 0);
}

// 진태양시 보정을 쓰는 유파에서는 시주가 달라질 수 있다. 보정폭만큼 시각을 옮겨서 **시지가 실제로
// 바뀌는 경우에만** 경고한다. (처음엔 "경계에서 N분 이내"로 판정했는데, 보정은 시각을 앞으로 당기므로
// 경계 "앞쪽"에 있는 시각은 바뀌지 않는다 - 14:30(미시)이 보정 후 13:58로 여전히 미시인데도 경고가
// 뜨는 오작동이 있었다.)
const BRANCH_OF_HOUR = (h) => Math.floor(((h + 1) % 24) / 2); // 23~00시=자(0), 01~02=축(1) …
function timeBoundaryWarning(hour, minute) {
  const off = CONFIG.LONGITUDE_OFFSET_MIN;
  const mins = hour * 60 + minute;
  const shifted = ((mins + off) % 1440 + 1440) % 1440;
  const before = BRANCH_OF_HOUR(Math.floor(mins / 60));
  const after = BRANCH_OF_HOUR(Math.floor(shifted / 60));
  if (before === after) return null;
  return `태어난 시각이 시(時) 경계에 걸쳐 있습니다. 진태양시 보정(${Math.abs(off)}분)을 적용하는 유파에서는 시지가 ${N.BRANCH_KO[before]}시에서 ${N.BRANCH_KO[after]}시로 달라지므로, 시주 단독 판단은 피해야 합니다.`;
}

/**
 * 원국을 계산한다.
 * @param {object} input
 *   year, month, day        (필수)
 *   hour, minute            (선택 - 모르면 생략, timeUnknown=true가 된다)
 *   gender                  "male" | "female" (대운 순역에 필요)
 *   calendar                "solar"(기본) | "lunar"
 *   isLeapMonth             음력 윤달이면 true
 */
function buildChart(input = {}) {
  const { gender, calendar = "solar", isLeapMonth = false } = input;
  if (gender !== "male" && gender !== "female") {
    throw new Error('성별은 "male" 또는 "female"이어야 합니다(대운 순행·역행이 성별로 갈립니다).');
  }
  const timeUnknown = input.hour === undefined || input.hour === null;
  // 시간을 모르면 시주를 쓰지 않는다. 계산은 정오로 하되(날짜 경계 영향 없는 시각) 결과에서
  // 시주를 제외하고 timeUnknown을 표시한다 - 임의의 시주를 넣고 모른 채 쓰는 게 제일 위험하다.
  const hour = timeUnknown ? 12 : input.hour;
  const minute = timeUnknown ? 0 : input.minute || 0;
  if (!timeUnknown && (hour < 0 || hour > 23 || minute < 0 || minute > 59)) {
    throw new Error(`시각이 범위를 벗어났습니다: ${hour}:${minute}`);
  }

  let solar = toSolar({ ...input, hour, minute, calendar, isLeapMonth });
  let trueSolarApplied = false;
  if (CONFIG.APPLY_TRUE_SOLAR_TIME && !timeUnknown) {
    // 보정은 "시각을 LONGITUDE_OFFSET_MIN만큼 옮긴 뒤 다시 만세력을 뽑는" 것이다.
    const ms = Date.UTC(solar.getYear(), solar.getMonth() - 1, solar.getDay(), hour, minute) + CONFIG.LONGITUDE_OFFSET_MIN * 60000;
    const d = new Date(ms);
    solar = Solar.fromYmdHms(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), 0);
    trueSolarApplied = true;
  }

  const lunar = solar.getLunar();
  const ec = lunar.getEightChar();
  ec.setSect(CONFIG.DAY_BOUNDARY_SECT);

  const rawGanji = { year: ec.getYear(), month: ec.getMonth(), day: ec.getDay(), time: ec.getTime() };
  // 지장간·십성은 라이브러리를 쓰지 않는다 - 라이브러리 지장간표가 한국 주류 표와 5개 지지에서
  // 다르기 때문(elements.js 주석 참고). 우리 표와 우리 도출 규칙으로 계산한다.
  const stage = { year: ec.getYearDiShi(), month: ec.getMonthDiShi(), day: ec.getDayDiShi(), time: ec.getTimeDiShi() };
  const nayin = { year: ec.getYearNaYin(), month: ec.getMonthNaYin(), day: ec.getDayNaYin(), time: ec.getTimeNaYin() };
  const xunKong = { year: ec.getYearXunKong(), month: ec.getMonthXunKong(), day: ec.getDayXunKong(), time: ec.getTimeXunKong() };

  const usedKeys = timeUnknown ? ["year", "month", "day"] : PILLAR_KEYS;
  // 일간을 먼저 확정해야 십성을 도출할 수 있다.
  const dayGanji = N.parseGanji(rawGanji.day);
  const dayStemKo = dayGanji.stem;

  const pillars = {};
  for (const key of usedKeys) {
    const g = N.parseGanji(rawGanji[key]);
    const hidden = E.hiddenStemsOf(g.branch);
    pillars[key] = {
      ...g,
      label: PILLAR_KO[key],
      meaning: PILLAR_MEANING[key],
      hiddenStems: hidden,
      // 천간 십성(일주는 자기 자신이라 "일간")
      tenGodOfStem: key === "day" ? "일간" : E.tenGodOf(dayStemKo, g.stem),
      // 지지 십성은 그 지지의 지장간마다 하나씩 나온다(본기가 대표).
      tenGodOfBranch: hidden.map((h) => E.tenGodOf(dayStemKo, h.stem)),
      tenGodOfBranchPrimary: E.tenGodOf(dayStemKo, hidden[hidden.length - 1].stem),
      twelveStage: N.twelveStage(stage[key]),
      nayin: N.nayin(nayin[key]),
      emptyBranches: xunKong[key].split("").map((c) => N.BRANCH_KO[N.branchIndex(c)]),
    };
  }

  const dayStemIndex = pillars.day.stemIndex;
  const chart = {
    // 입력 되짚기(결정론 확인·디버깅용)
    input: {
      year: input.year, month: input.month, day: input.day,
      hour: timeUnknown ? null : input.hour,
      minute: timeUnknown ? null : input.minute || 0,
      gender, calendar, isLeapMonth: Boolean(isLeapMonth),
    },
    solarDate: solar.toYmd(),
    lunarDate: `${lunar.getYear()}-${String(Math.abs(lunar.getMonth())).padStart(2, "0")}-${String(lunar.getDay()).padStart(2, "0")}${lunar.getMonth() < 0 ? " (윤달)" : ""}`,
    timeUnknown,
    trueSolarApplied,
    gender,
    pillars,
    pillarOrder: usedKeys,
    // 일간이 명식의 기준점이다 - 십성·신강약·신살 전부 여기서 나온다.
    dayStem: pillars.day.stem,
    dayStemElement: N.STEM_ELEMENT[dayStemIndex],
    dayStemYinYang: N.STEM_YINYANG[dayStemIndex],
    dayBranch: pillars.day.branch,
    yearAnimal: pillars.year.animal,
    // 공망은 일주 기준을 쓴다(실무 주류).
    emptyBranches: pillars.day.emptyBranches,
    // 사람이 읽는 한 줄
    summary: usedKeys.map((k) => pillars[k].ko).join(" "),
    warnings: [],
  };
  if (!timeUnknown) {
    const w = timeBoundaryWarning(input.hour, input.minute || 0);
    if (w) chart.warnings.push(w);
  } else {
    chart.warnings.push("태어난 시간을 모르는 사주입니다. 시주(자녀·말년 자리)와 시주에 걸리는 신살은 판단하지 않습니다.");
  }
  // 라이브러리 핸들을 그대로 들고 있으면 대운 계산(luck.js)에서 재사용할 수 있다.
  Object.defineProperty(chart, "_eightChar", { value: ec, enumerable: false });
  Object.defineProperty(chart, "_solar", { value: solar, enumerable: false });
  return chart;
}

module.exports = { buildChart, PILLAR_KEYS, PILLAR_KO, PILLAR_MEANING };
