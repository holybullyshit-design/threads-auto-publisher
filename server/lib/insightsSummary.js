// threadsInsights.js가 만든 캐시(계정 레벨 + 글 레벨 조회수/좋아요/답글 등)를 사람이 보기 좋은
// 계정별 요약 + "노출을 늘리려면" 추천으로 변환한다.
//
// server/index.js(로컬 앱의 관제탑 탭)와 tools/ops-dashboard/generate.js(claude.ai 모바일
// 아티팩트) 양쪽이 똑같은 로직을 쓰도록 이 파일 하나로 뽑아뒀다 - 그래야 두 화면의 숫자/추천
// 문구가 갈라지지 않는다.

const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"];

function toKst(dateInput) {
  const d = new Date(dateInput);
  const kstMs = d.getTime() + 9 * 60 * 60 * 1000;
  const k = new Date(kstMs);
  return {
    year: k.getUTCFullYear(),
    month: k.getUTCMonth() + 1,
    date: k.getUTCDate(),
    hour: k.getUTCHours(),
    minute: k.getUTCMinutes(),
    weekday: WEEKDAY_KO[k.getUTCDay()],
  };
}

function buildInsightsSummary(cache, accounts, posts) {
  const accountRows = accounts.map((account) => {
    const entry = cache[account.id];
    if (!entry || (!entry.account && !entry.accountError)) {
      return { id: account.id, label: account.label, noData: true };
    }

    const mediaList = Object.values(entry.media || {}).filter(Boolean);
    const totalLikes = mediaList.reduce((s, m) => s + (m.likes || 0), 0);
    const totalReplies = mediaList.reduce((s, m) => s + (m.replies || 0), 0);
    const totalReposts = mediaList.reduce((s, m) => s + (m.reposts || 0), 0);

    const topPost = mediaList.slice().sort((a, b) => (b.views || 0) - (a.views || 0))[0] || null;

    // 시간대별 평균 조회수 - 오전(0-12) / 오후(12-18) / 저녁(18-24)
    const buckets = { morning: [], afternoon: [], evening: [] };
    mediaList.forEach((m) => {
      if (!m.scheduledAt || typeof m.views !== "number") return;
      const k = toKst(m.scheduledAt);
      const bucket = k.hour < 12 ? "morning" : k.hour < 18 ? "afternoon" : "evening";
      buckets[bucket].push(m.views);
    });
    const bucketAvg = (arr) => (arr.length ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length) : null);
    const timeBuckets = {
      morning: bucketAvg(buckets.morning),
      afternoon: bucketAvg(buckets.afternoon),
      evening: bucketAvg(buckets.evening),
    };

    const viewsDaily = (entry.account?.viewsDaily || []).slice().sort((a, b) => (a.date < b.date ? -1 : 1));
    const recent7 = viewsDaily.slice(-7).reduce((s, d) => s + d.value, 0);
    const prior7 = viewsDaily.slice(-14, -7).reduce((s, d) => s + d.value, 0);
    // 직전 7일 조회수가 너무 작으면(신생 계정 초기 등) 분모가 작아 % 변화가 수백~수천%로
    // 튀어서 의미가 없어진다 - 그럴 땐 그냥 추세를 안 보여준다(null).
    const viewsChangePct = prior7 >= 50 ? Math.round(((recent7 - prior7) / prior7) * 100) : null;

    return {
      id: account.id,
      label: account.label,
      followersCount: entry.account?.followersCount ?? null,
      viewsRecent7d: recent7,
      viewsChangePct,
      likes: entry.account?.likes ?? totalLikes,
      replies: entry.account?.replies ?? totalReplies,
      reposts: entry.account?.reposts ?? totalReposts,
      topPost: topPost
        ? { text: topPost.text, views: topPost.views, likes: topPost.likes, replies: topPost.replies, publishedAt: topPost.publishedAt }
        : null,
      timeBuckets,
      trackedPosts: mediaList.length,
      fetchedAt: entry.account?.fetchedAt || null,
      error: entry.accountError || null,
    };
  });

  const BUCKET_KO = { morning: "오전(0-12시)", afternoon: "오후(12-18시)", evening: "저녁(18-24시)" };
  const recommendations = [];
  accountRows.forEach((r) => {
    if (r.noData || r.error) return;

    const bucketEntries = Object.entries(r.timeBuckets).filter(([, v]) => v !== null);
    if (bucketEntries.length >= 2) {
      bucketEntries.sort((a, b) => b[1] - a[1]);
      const [bestBucket, bestAvg] = bucketEntries[0];
      const [worstBucket, worstAvg] = bucketEntries[bucketEntries.length - 1];
      if (worstAvg > 0 && bestAvg / worstAvg >= 1.4) {
        recommendations.push(
          `'${r.label}' — ${BUCKET_KO[bestBucket]} 발행 글이 ${BUCKET_KO[worstBucket]} 발행 글보다 평균 조회수가 ${(bestAvg / worstAvg).toFixed(1)}배 높습니다. ${BUCKET_KO[bestBucket]} 비중을 늘려보세요.`
        );
      }
    }

    if (r.viewsChangePct !== null) {
      if (r.viewsChangePct <= -20) {
        recommendations.push(`'${r.label}' — 최근 7일 조회수가 지난 주 대비 ${Math.abs(r.viewsChangePct)}% 감소했습니다. 최근 훅/주제 변화를 점검해볼 시점입니다.`);
      } else if (r.viewsChangePct >= 30) {
        recommendations.push(`'${r.label}' — 최근 7일 조회수가 지난 주 대비 ${r.viewsChangePct}% 상승 중입니다. 지금 통하는 주제/훅 패턴을 유지하세요.`);
      }
    }

    if (r.topPost && r.topPost.views > 0) {
      recommendations.push(
        `'${r.label}' 최고 성과 글: "${r.topPost.text}" — 조회수 ${r.topPost.views.toLocaleString()} · 답글 ${r.topPost.replies}건. 비슷한 훅/주제를 반복 활용해볼 만합니다.`
      );
    }
  });

  return { generatedAt: new Date().toISOString(), accounts: accountRows, recommendations };
}

module.exports = { buildInsightsSummary, toKst };
