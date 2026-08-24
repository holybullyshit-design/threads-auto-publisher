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
    await this.scheduled(null, env, ctx);
    return new Response("pinged\n");
  },
};
