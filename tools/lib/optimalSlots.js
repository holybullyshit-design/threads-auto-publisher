// "몇 시에 올리면 조회수가 많이 나오나"를 매번 대화로 다시 분석하지 않도록, 실제 Threads
// Insights 데이터(data/insights-cache.json)에서 코드로 직접 계산한다. LLM 호출이 전혀 없으니
// 토큰 비용 없이 몇 번이든 다시 돌릴 수 있다 - tools/fill-schedule.js가 매 실행마다 이 함수를
// 호출해서, 백그라운드 갱신(server/index.js, 매시간)으로 데이터가 쌓일수록 자동으로 더
// 정확해진다.
//
// 2026-08-30: 사용자가 "관제탑에 만들어둔 시간대 분석을 실제로 적용하고, 앞으로도 계속
// 알아서 최적화해라, 근데 토큰은 아껴라"고 요청 - 그래서 이 판단 자체를 코드로 내렸다.

const fs = require("fs");
const path = require("path");
const accountsStore = require("../../server/lib/accountsStore");

const CACHE_FILE = path.join(__dirname, "..", "..", "data", "insights-cache.json");

// 새벽/이른 오전은 데이터가 있어도 원천 배제한다 - 표본이 우연히 하나 잘 나와도 "새벽에
// 올리는 게 좋다"는 결론을 내면 안 된다는 게 사용자의 명시적 지침.
const DEAD_ZONE_START_HOUR = 0;
const DEAD_ZONE_END_HOUR = 9;

// 버킷 하나가 이 정도 표본은 있어야 "믿을 만하다"고 본다. 못 미치면 그 버킷은 후보에서 뺀다
// (신생 계정이라 표본이 워낙 적어서, 최소치를 너무 높게 잡으면 아예 계산이 안 된다).
const MIN_SAMPLES_PER_BUCKET = 2;

// 계산이 아예 불가능할 때(트래킹된 글이 거의 없을 때)를 위한 안전한 기본값 - 지금까지의
// 실측 결과(2026-08-30, 팔자명가/팔자궤도/팔자장인 풀링 19건)를 반영한 값이다.
const FALLBACK_SLOTS_KST = ["11:00", "13:30", "16:30", "18:30", "21:00"];

function toKst(iso) {
  const d = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
  return { hour: d.getUTCHours(), minute: d.getUTCMinutes() };
}

function minutesToHHMM(totalMinutes) {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// accountLabels에 해당하는 계정들의 트래킹된 글(조회수 + 발행 시각)을 그냥 하나의 목록으로
// 모은다. 계정별 표본이 적으므로(계정당 5~10건) 여러 계정을 풀링해야 최소한의 신뢰도가 생긴다
// - 같은 "바이럴 클리프행어" 스타일을 쓰는 계정들끼리만 묶어야 의미가 있다.
function collectSamples(accountLabels) {
  let cache;
  try {
    cache = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
  } catch {
    return [];
  }
  const accounts = accountsStore.listAccounts().filter((a) => accountLabels.includes(a.label));
  const samples = [];
  accounts.forEach((acc) => {
    const entry = cache[acc.id];
    if (!entry) return;
    Object.values(entry.media || {})
      .filter(Boolean)
      .forEach((m) => {
        if (!m.scheduledAt || typeof m.views !== "number") return;
        const { hour, minute } = toKst(m.scheduledAt);
        if (hour >= DEAD_ZONE_START_HOUR && hour < DEAD_ZONE_END_HOUR) return;
        samples.push({ minuteOfDay: hour * 60 + minute, views: m.views });
      });
  });
  return samples;
}

// 하루를(새벽 제외 구간을) slotCount개의 동일한 폭 "구간(zone)"으로 나눈 뒤, 구간마다
// 대표 시각 1개씩을 뽑아 정확히 slotCount개의 시각을 만든다. 이렇게 하면 "하루 전체에 골고루
// 분산"이라는 사용자 요구를 구조적으로 보장하면서, 각 구간 안에서는 실측 데이터가 있는 쪽으로
// (조회수로 가중한 평균 시각) 슬롯을 당겨 배치한다 - 즉 "고르게 분산 + 데이터로 미세조정".
function computeBucketAverages(accountLabels, bucketSizeHours = 3) {
  const samples = collectSamples(accountLabels);
  const buckets = {};
  samples.forEach((s) => {
    const hour = Math.floor(s.minuteOfDay / 60);
    const bucketStart = Math.floor(hour / bucketSizeHours) * bucketSizeHours;
    (buckets[bucketStart] = buckets[bucketStart] || []).push(s.views);
  });
  return Object.entries(buckets)
    .map(([start, views]) => ({
      startHour: Number(start),
      avgViews: views.reduce((s, v) => s + v, 0) / views.length,
      sampleSize: views.length,
    }))
    .filter((b) => b.sampleSize >= MIN_SAMPLES_PER_BUCKET)
    .sort((a, b) => a.startHour - b.startHour);
}

// accountLabels 그룹에 대해 하루 slotCount개의 발행 시각(KST, "HH:MM")을 데이터 기반으로
// 정한다. 표본이 거의 없으면 조용히 FALLBACK_SLOTS_KST를 쓴다(값을 지어내지 않는다).
function computeOptimalSlots(accountLabels, slotCount = 5) {
  const samples = collectSamples(accountLabels);
  if (samples.length < slotCount * 2) {
    return { slots: FALLBACK_SLOTS_KST.slice(0, slotCount), usedFallback: true, zones: [] };
  }

  const dayStart = DEAD_ZONE_END_HOUR * 60;
  const dayEnd = 24 * 60;
  const zoneWidth = (dayEnd - dayStart) / slotCount;

  const zones = Array.from({ length: slotCount }, (_, i) => {
    const zoneStart = dayStart + i * zoneWidth;
    const zoneEnd = zoneStart + zoneWidth;
    const inZone = samples.filter((s) => s.minuteOfDay >= zoneStart && s.minuteOfDay < zoneEnd);
    return { zoneStart, zoneEnd, samples: inZone };
  });

  const slots = zones.map((zone) => {
    const totalViews = zone.samples.reduce((s, x) => s + x.views, 0);
    let representativeMinute;
    if (zone.samples.length > 0 && totalViews > 0) {
      // 조회수로 가중한 평균 시각 - 그 구간 안에서 실제로 잘 나온 시각 쪽으로 슬롯을 당긴다.
      representativeMinute = zone.samples.reduce((s, x) => s + x.minuteOfDay * x.views, 0) / totalViews;
    } else if (zone.samples.length > 0) {
      // 데이터는 있는데 전부 조회수 0(방금 발행돼 아직 안 걷힌 글) - 단순 평균 시각 사용.
      representativeMinute = zone.samples.reduce((s, x) => s + x.minuteOfDay, 0) / zone.samples.length;
    } else {
      // 이 구간엔 트래킹된 글이 아예 없다 - 구간 시작 지점을 그대로 쓴다(뒤로 밀어붙여
      // 추측하지 않는다 - 나중에 실제 데이터가 쌓이면 자동으로 조정된다).
      representativeMinute = zone.zoneStart;
    }
    const rounded = Math.round(representativeMinute / 30) * 30;
    return Math.min(Math.max(rounded, zone.zoneStart), zone.zoneEnd - 1);
  });

  // 반올림 과정에서 겹치면 뒤 슬롯을 30분씩 밀어서 항상 오름차순 · 서로 다른 시각을 보장한다.
  for (let i = 1; i < slots.length; i++) {
    if (slots[i] <= slots[i - 1]) slots[i] = slots[i - 1] + 30;
  }

  return { slots: slots.map(minutesToHHMM), usedFallback: false, zones };
}

module.exports = { computeOptimalSlots, computeBucketAverages, FALLBACK_SLOTS_KST };
