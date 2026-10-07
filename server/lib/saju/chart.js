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

const { Solar, Lunar, LunarUtil } = require("lunar-javascript");
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


// 절기 경계 경고 — 절기 시각에 바싹 붙어 태어나면 월주(입춘이면 년주·띠까지)가 갈린다.
// 우리 절기 시각은 lunar-javascript 값을 KST로 옮긴 것이고 라이브러리 표현에 ±30초 오차가 있어서,
// 이 폭 안에서는 어느 쪽이라고 단정하지 않고 "분 단위로 확인이 필요하다"고 알린다.
// (144,480건 외부 대조에서 끝까지 남은 불일치 1건이 정확히 절기 시각과 같은 분이었다.)
const JIEQI_EDGE_MIN = 2;
function jieqiBoundaryWarning(solar) {
  const birthMs = Date.UTC(solar.getYear(), solar.getMonth() - 1, solar.getDay(), solar.getHour(), solar.getMinute());
  const table = solar.getLunar().getJieQiTable();
  for (const [name, at] of Object.entries(table)) {
    // 라이브러리 절기는 중국 표준시 → KST로 옮겨서 비교한다.
    const kstMs = Date.UTC(at.getYear(), at.getMonth() - 1, at.getDay(), at.getHour(), at.getMinute()) + CONFIG.JIEQI_TZ_OFFSET_MIN * 60000;
    const diffMin = Math.abs(birthMs - kstMs) / 60000;
    if (diffMin <= JIEQI_EDGE_MIN) {
      const ko = N.JIEQI_KO ? N.JIEQI_KO[name] || name : name;
      return `태어난 시각이 절기(${ko}) 전환 시각과 ${diffMin.toFixed(0)}분 차이입니다. 이 폭에서는 월주(절기가 입춘이면 년주와 띠까지)가 갈릴 수 있으므로, 출생 시각을 분 단위로 확인하기 전에는 단정하지 않습니다.`;
    }
  }
  return null;
}


// 한국 표준시가 UTC+8:30이던 구간 경고 — 1954-03-21 ~ 1961-08-10 사이에 태어난 사람은
// 당시 시계가 지금보다 30분 느렸다(동경 127.5° 기준). 이 구간의 출생 시각을 지금 기준으로
// 그대로 읽으면 시지가 한 칸 밀릴 수 있고, 자시 경계면 일주까지 밀린다.
//
// 왜 고치지 않고 경고만 하나(2026-10-07): 보정을 적용하는 유파와 안 하는 유파가 갈리고,
// **우리 정답지(사용자 만세력 앱)에 이 구간 사주가 한 건도 없다.** 어느 쪽인지 모르는 채
// 추측으로 30분을 더하면 그게 바로 지금까지 세 번 사고 난 방식이다. 외부 엔진 교차 검증도
// 여기선 못 쓴다 — manseryeok·lunar-javascript 둘 다 이 이력을 아예 모르기 때문에 "일치"가
// "맞다"는 뜻이 아니다. 이 구간 정답지가 들어오면 유파를 확정하고 보정을 구현한다.
const KST_830_FROM = Date.UTC(1954, 2, 21);   // 1954-03-21
const KST_830_TO = Date.UTC(1961, 7, 10);     // 1961-08-10
function koreaStandardTimeWarning(solar, timeUnknown) {
  if (timeUnknown) return null;  // 시주를 안 쓰므로 영향 없음
  const ms = Date.UTC(solar.getYear(), solar.getMonth() - 1, solar.getDay());
  if (ms < KST_830_FROM || ms >= KST_830_TO) return null;
  return "1954-03-21 ~ 1961-08-10 사이 출생입니다. 이 기간 한국 표준시는 UTC+8:30으로 지금보다 30분 느렸습니다. 30분 보정을 적용하는 유파에서는 시지(경계에 걸치면 일주까지)가 달라질 수 있어, 이 구간은 시주를 단독으로 단정하지 않습니다.";
}

// 간지 한 쌍에서 납음·공망을 읽는다. 값이 없으면 undefined를 흘리지 않고 throw한다
// (undefined가 사실 블록까지 새어나가 "이번 달 오행: undefined"로 발행된 사고가 있었다).
function nayinOf(hanja) {
  const v = LunarUtil.NAYIN[hanja];
  if (!v) throw new Error(`납음을 읽을 수 없는 간지: ${hanja}`);
  return v;
}

function xunKongOf(hanja) {
  const v = LunarUtil.getXunKong(hanja);
  if (!v) throw new Error(`공망을 읽을 수 없는 간지: ${hanja}`);
  return v;
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

  // ── 절기 시각 보정: lunar-javascript의 절기는 중국 표준시(UTC+8)다 (2026-10-07) ──
  // 라이브러리가 돌려주는 절기 시각을 우리는 KST로 취급해왔는데, 1950~2026년 절기 1,771개를
  // manseryeok(KASI 기준)·k-saju(astronomy-engine 독립 계산)와 3자 대조한 결과 **전부 정확히
  // 60분** 차이였다(2024 대설: 우리 12-06 23:17 / 둘 다 12-07 00:16~00:17 KST).
  // 결과: 절기 직후 1시간 안에 태어난 사람의 월주가 한 칸 앞서 나왔고, 입춘이면 **년주와 띠까지**
  // 틀렸다(1940~2025 전수 대조에서 0.15%). 띠는 우리 글이 가장 많이 쓰는 사실이라 그냥 둘 수 없다.
  // 그래서 절기로 갈리는 년주·월주만 KST→중국시(-60분)로 옮긴 명식에서 읽는다.
  // 일주는 한국 자정 기준(sect 2)이고 시주는 한국 시계 기준이므로 원래 명식에서 그대로 읽는다.
  const termSolarMs = Date.UTC(solar.getYear(), solar.getMonth() - 1, solar.getDay(), solar.getHour(), solar.getMinute()) - CONFIG.JIEQI_TZ_OFFSET_MIN * 60000;
  const td = new Date(termSolarMs);
  const ecTerm = Solar.fromYmdHms(td.getUTCFullYear(), td.getUTCMonth() + 1, td.getUTCDate(), td.getUTCHours(), td.getUTCMinutes(), 0)
    .getLunar().getEightChar();
  ecTerm.setSect(CONFIG.DAY_BOUNDARY_SECT);

  // 년주·월주는 절기 보정 명식에서, 일주는 원래 명식에서. 시주는 아래에서 일간으로 도출한다.
  const rawGanji = { year: ecTerm.getYear(), month: ecTerm.getMonth(), day: ec.getDay(), time: ec.getTime() };
  const usedKeys = timeUnknown ? ["year", "month", "day"] : PILLAR_KEYS;
  // 일간을 먼저 확정해야 십성을 도출할 수 있다.
  const dayGanji = N.parseGanji(rawGanji.day);
  const dayStemKo = dayGanji.stem;

  // ── 라이브러리 버그 보정: getTime()이 setSect를 무시한다 (2026-10-07) ──
  // getDay()는 sect를 반영하는데 getTime()은 항상 야자시(sect 1) 기준 시주를 준다. 우리는
  // 자정 기준(sect 2)이라, 23시대 출생자에게 "일주는 그날 / 시주 천간은 다음날 일간 기준"이라는
  // 모순된 명식이 나왔다(1950~2024 전수 검사에서 23시대 5,400건 전부 불일치). 시간의 천간은
  // 명리 규칙상 일간에서 나오므로 우리가 직접 도출해 일주와 어긋나지 않게 맞춘다.
  // 납음·공망은 간지 쌍에서 나오니 시주 것만 다시 읽는다(12운성은 일간 기준이라 영향 없음).
  if (!timeUnknown) {
    const libTime = N.parseGanji(rawGanji.time);
    const fixedStem = E.timeStemOf(dayStemKo, libTime.branch);
    if (fixedStem !== libTime.stem) {
      const si = N.STEM_KO.indexOf(fixedStem);
      const bi = N.BRANCH_KO.indexOf(libTime.branch);
      rawGanji.time = N.STEM_HANJA[si] + N.BRANCH_HANJA[bi];
    }
  }

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
      // 12운성·납음·공망은 (일간, 간지)에서 결정된다. 라이브러리 getter는 그 객체가 들고 있는
      // 기둥에 묶여 있어 절기 보정과 섞을 수 없으므로 간지에서 직접 구한다.
      twelveStage: E.twelveStageOf(dayStemKo, g.branch),
      nayin: N.nayin(nayinOf(g.hanja)),
      emptyBranches: xunKongOf(g.hanja).split("").map((c) => N.BRANCH_KO[N.branchIndex(c)]),
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
  {
    const w = jieqiBoundaryWarning(solar);
    if (w) chart.warnings.push(w);
  }
  {
    const w = koreaStandardTimeWarning(solar, timeUnknown);
    if (w) chart.warnings.push(w);
  }
  // 라이브러리 핸들을 그대로 들고 있으면 대운 계산(luck.js)에서 재사용할 수 있다.
  Object.defineProperty(chart, "_eightChar", { value: ec, enumerable: false });
  Object.defineProperty(chart, "_solar", { value: solar, enumerable: false });
  return chart;
}

module.exports = { buildChart, PILLAR_KEYS, PILLAR_KO, PILLAR_MEANING };
