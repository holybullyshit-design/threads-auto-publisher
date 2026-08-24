// 15분마다(Cron Trigger) GitHub Actions의 "Publish scheduled Threads posts" 워크플로를
// workflow_dispatch로 직접 실행시킨다. GitHub 자체 schedule 트리거가 부하 상황에 따라
// 1~4시간까지 지연되는 문제(2026-08-24 실측)를 우회하기 위한 백업 트리거.
//
// GITHUB_TOKEN은 코드에 하드코딩하지 않고 Cloudflare Worker Secret으로 등록해서 쓴다:
//   npx wrangler secret put GITHUB_TOKEN

const REPO = "holybullyshit-design/threads-auto-publisher";
const WORKFLOW = "publish-scheduled.yml";

export default {
  async scheduled(event, env, ctx) {
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.GITHUB_TOKEN}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "threads-publish-pinger",
        },
        body: JSON.stringify({ ref: "main" }),
      }
    );
    console.log(`workflow_dispatch -> HTTP ${res.status}`);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`디스패치 실패: ${res.status} ${text}`);
    }
  },

  // 수동으로 상태 확인하고 싶을 때 브라우저로 워커 URL 열면 바로 한 번 실행해볼 수 있게.
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/status") {
      return this.status(env);
    }
    await this.scheduled(null, env, ctx);
    return new Response("pinged\n");
  },

  // 하루 2번(오전/오후) 상태 보고용 — 토큰 없이도 이 주소 하나만 GET 하면 예약 큐 건강 상태를
  // 읽기 전용으로 확인할 수 있게 만든다 (토큰은 이 워커 안에만 있고 바깥으로 안 나감).
  async status(env) {
    const headers = {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "threads-publish-pinger",
    };

    const [contentRes, runsRes] = await Promise.all([
      fetch(`https://api.github.com/repos/${REPO}/contents/schedule/posts.json`, { headers }),
      fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/runs?per_page=5`, {
        headers,
      }),
    ]);

    let posts = [];
    if (contentRes.ok) {
      const data = await contentRes.json();
      try {
        posts = JSON.parse(atob(data.content));
      } catch {
        posts = [];
      }
    }

    const now = Date.now();
    const scheduled = posts.filter((p) => p.status === "scheduled");
    const overdue = scheduled.filter((p) => new Date(p.scheduledAt).getTime() < now);
    const failed = posts.filter((p) => p.status === "failed");
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const publishedLast24h = posts.filter(
      (p) => p.status === "published" && p.publishedAt && new Date(p.publishedAt).getTime() > oneDayAgo
    );
    const retrying = scheduled.filter((p) => (p.retryCount || 0) > 0);

    let recentRuns = [];
    if (runsRes.ok) {
      const data = await runsRes.json();
      recentRuns = (data.workflow_runs || []).map((r) => ({
        status: r.status,
        conclusion: r.conclusion,
        event: r.event,
        created_at: r.created_at,
      }));
    }

    const healthy = overdue.length === 0 && failed.length === 0;

    return new Response(
      JSON.stringify(
        {
          healthy,
          scheduledCount: scheduled.length,
          overdueCount: overdue.length,
          overdue: overdue.slice(0, 10).map((p) => ({
            accountLabel: p.accountLabel,
            scheduledAt: p.scheduledAt,
            retryCount: p.retryCount || 0,
          })),
          failedCount: failed.length,
          failed: failed.slice(0, 10).map((p) => ({
            accountLabel: p.accountLabel,
            scheduledAt: p.scheduledAt,
            error: p.error,
          })),
          retryingCount: retrying.length,
          publishedLast24h: publishedLast24h.length,
          recentRuns,
        },
        null,
        2
      ),
      { headers: { "Content-Type": "application/json" } }
    );
  },
};
