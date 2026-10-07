// 사주 엔진 공개 API. 바깥(콘텐츠 엔진·도구·상담)에서는 이 파일만 쓴다.
//
// 결정론: 시점이 필요한 계산(삼재·세운)은 전부 기준일을 인자로 받는다. 안 주면 계산하지 않는다.

const { buildChart } = require("./chart");
const { analyzeStrength, elementFooting } = require("./strength");
const { analyzeSinsal } = require("./sinsal");
const { analyzeRelations } = require("./relations");
const { daeun, daeunAt, seun } = require("./luck");
const { analyzeCompatibility } = require("./compat");
const CONFIG = require("./config");

/**
 * 한 사람의 사주를 통째로 분석한다.
 * @param {object} birth { year, month, day, hour?, minute?, gender, calendar?, isLeapMonth? }
 * @param {object} opts  { refDate: "YYYY-MM-DD" } 삼재·현재 대운 판정에 쓸 기준일(선택)
 */
function analyze(birth, opts = {}) {
  const chart = buildChart(birth);
  const strength = analyzeStrength(chart);
  const sinsal = analyzeSinsal(chart, strength, { refDate: opts.refDate });
  const relations = analyzeRelations(chart);
  const luck = daeun(chart, opts.daeunCount || 10);
  const refYear = opts.refDate ? Number(opts.refDate.slice(0, 4)) : null;
  return {
    chart,
    strength,
    sinsal,
    relations,
    daeun: luck,
    currentDaeun: refYear ? daeunAt(chart, refYear) : null,
    seun: refYear ? seun(chart, refYear, opts.seunCount || 10) : null,
    refDate: opts.refDate || null,
    config: { dayBoundarySect: CONFIG.DAY_BOUNDARY_SECT, trueSolarTime: CONFIG.APPLY_TRUE_SOLAR_TIME, yongsinAsserted: CONFIG.ASSERT_YONGSIN },
  };
}

/** 두 사람의 궁합. 각 인자는 analyze()의 결과이거나 생년 정보다. */
function compatibility(a, b, opts = {}) {
  const A = a.chart ? a : analyze(a, opts);
  const B = b.chart ? b : analyze(b, opts);
  return analyzeCompatibility(A, B, opts);
}

module.exports = {
  analyze, compatibility,
  buildChart, analyzeStrength, elementFooting, analyzeSinsal, analyzeRelations,
  daeun, daeunAt, seun, analyzeCompatibility, CONFIG,
};
