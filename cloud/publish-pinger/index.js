// 15분마다(Cron Trigger) GitHub Actions의 "Publish scheduled Threads posts" 워크플로를
// workflow_dispatch로 직접 실행시킨다. GitHub 자체 schedule 트리거가 부하 상황에 따라
// 1~4시간까지 지연되는 문제(2026-08-24 실측)를 우회하기 위한 백업 트리거.
//
// GITHUB_TOKEN은 코드에 하드코딩하지 않고 Cloudflare Worker Secret으로 등록해서 쓴다:
//   npx wrangler secret put GITHUB_TOKEN
//
// /dashboard : 모바일에서 아무 때나 열어서 예약 큐 상태를 볼 수 있는 사람이 읽기 편한 페이지.
// (원래 하루 2번 Claude 예약 작업이 알아서 보고하게 만들려 했는데, 그 실행 환경 자체가
// 외부 네트워크 접근이 막혀있어서(egress 차단, 2026-08-24 확인) 안 됐다 — 대신 사용자가
// 직접 열어보는 이 페이지로 대체했었다.)
// /status    : 위와 같은 데이터를 JSON으로 (프로그램에서 쓰기용)
//
// 실제 푸시 알림(2026-08-26 추가): 이 워커는 항상 떠있으니(egress 차단 없음), 매일
// 06:00 / 18:00 KST에 ntfy.sh(무료 푸시 알림 중계)로 상태 요약을 폰에 쏴준다.
// 토픽 이름 = 사실상 비밀번호이므로 반드시 추측 불가능한 랜덤 값으로 등록:
//   npx wrangler secret put NTFY_TOPIC
// 알림 본문엔 GITHUB_TOKEN 등 민감정보를 절대 넣지 않는다 — 건수 요약만 전송.

const REPO = "holybullyshit-design/threads-auto-publisher";
const WORKFLOW = "publish-scheduled.yml";
const NTFY_SERVER = "https://ntfy.sh";
const DIGEST_HOURS_KST = [6, 18]; // 오전 6시 / 오후 6시

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

    // 15분 간격 크론 중, 06:00·18:00 KST 정각 슬롯에서만 하루 2번 요약 알림을 보낸다.
    // event.scheduledTime(크론이 원래 잡혔던 시각)을 기준으로 판단 — 실행이 살짝 늦어져도
    // 슬롯 판정이 흔들리지 않는다.
    const scheduledMs = event && event.scheduledTime ? event.scheduledTime : Date.now();
    const kst = new Date(scheduledMs + 9 * 60 * 60 * 1000);
    const isDigestSlot = DIGEST_HOURS_KST.includes(kst.getUTCHours()) && kst.getUTCMinutes() < 15;
    if (isDigestSlot) {
      await sendStatusDigest(env).catch((err) => console.error("[warn] ntfy 알림 실패:", err.message));
    }
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/status") {
      const data = await getStatusData(env);
      return new Response(JSON.stringify(data, null, 2), {
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.pathname === "/dashboard") {
      const data = await getStatusData(env);
      return new Response(renderDashboard(data), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }
    if (url.pathname === "/test-notify") {
      // 06:00/18:00 슬롯을 안 기다리고 지금 바로 ntfy 알림이 오는지 확인해보는 수동 테스트용.
      await sendStatusDigest(env);
      return new Response("알림을 보냈습니다. 폰에서 확인해주세요.\n");
    }
    // 그 외(루트 등)는 기존처럼 수동 즉시 발행 트리거.
    await this.scheduled(null, env, ctx);
    return new Response("pinged\n");
  },
};

// 매일 06:00 / 18:00 KST에 그 시점 예약 큐 상태를 요약해서 ntfy.sh로 폰에 푸시 알림을 보낸다.
// NTFY_TOPIC이 등록 안 돼있으면(로컬 개발 등) 조용히 건너뛴다.
async function sendStatusDigest(env) {
  if (!env.NTFY_TOPIC) {
    console.log("[알림 건너뜀] NTFY_TOPIC이 설정되지 않음");
    return;
  }
  const data = await getStatusData(env);

  const problems = [];
  if (data.failedCount) problems.push(`실패 ${data.failedCount}건`);
  if (data.overdueCount) problems.push(`밀린 글 ${data.overdueCount}건`);

  const title = data.healthy ? "🧵 스레드 자동화 — 정상 작동 중" : "🧵 스레드 자동화 — 확인 필요";
  const message = data.healthy
    ? `문제 없음 · 예약 ${data.scheduledCount}건 대기 중 · 최근 24시간 ${data.publishedLast24h}건 발행`
    : `${problems.join(", ")} — 눌러서 자세히 확인하세요`;

  // ntfy 헤더 방식은 비ASCII(한글)를 넣으려면 RFC2047 인코딩이 필요해서 번거롭다 —
  // 대신 JSON 발행 방식을 쓰면 본문에 UTF-8을 그대로 담을 수 있다.
  const payload = {
    topic: env.NTFY_TOPIC,
    title,
    message,
    priority: data.healthy ? 3 : 4, // 3=기본, 4=high(문제 있을 때 더 눈에 띄게)
    tags: data.healthy ? ["white_check_mark"] : ["warning"],
  };
  if (env.WORKER_URL) payload.click = `${env.WORKER_URL}/dashboard`;

  const headers = { "Content-Type": "application/json" };
  if (env.NTFY_TOKEN) headers["Authorization"] = `Bearer ${env.NTFY_TOKEN}`;

  const res = await fetch(NTFY_SERVER, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`ntfy 발행 실패: HTTP ${res.status} ${text}`);
  }
  console.log(`ntfy 알림 전송 완료 (healthy=${data.healthy})`);
}

async function getStatusData(env) {
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
      // atob()는 결과를 Latin-1로 취급해서 한글(멀티바이트 UTF-8)이 깨진다 —
      // 바이트 배열로 받은 뒤 TextDecoder로 UTF-8로 디코딩해야 한다.
      const binary = atob(data.content);
      const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
      posts = JSON.parse(new TextDecoder("utf-8").decode(bytes));
    } catch {
      posts = [];
    }
  }

  const now = Date.now();
  const scheduled = posts.filter((p) => p.status === "scheduled");
  const overdue = scheduled
    .filter((p) => new Date(p.scheduledAt).getTime() < now)
    .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
  const failed = posts.filter((p) => p.status === "failed");
  const oneDayAgo = now - 24 * 60 * 60 * 1000;
  const publishedLast24h = posts.filter(
    (p) => p.status === "published" && p.publishedAt && new Date(p.publishedAt).getTime() > oneDayAgo
  );
  const retrying = scheduled.filter((p) => (p.retryCount || 0) > 0);
  const upcoming = scheduled
    .filter((p) => new Date(p.scheduledAt).getTime() >= now)
    .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt))
    .slice(0, 5);

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

  return {
    healthy: overdue.length === 0 && failed.length === 0,
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
    upcoming: upcoming.map((p) => ({
      accountLabel: p.accountLabel,
      scheduledAt: p.scheduledAt,
      text: (p.text || "").split("\n")[0].slice(0, 40),
    })),
    recentRuns,
    checkedAt: new Date().toISOString(),
  };
}

function fmtKst(iso) {
  const d = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function renderDashboard(data) {
  const statusLabel = data.healthy ? "정상 작동 중" : "확인 필요";
  const statusColor = data.healthy ? "#4ade80" : "#f87171";

  const overdueHtml = data.overdue.length
    ? data.overdue
        .map(
          (p) =>
            `<div class="row"><span>${esc(p.accountLabel)}</span><span class="dim">${fmtKst(p.scheduledAt)} · 재시도 ${p.retryCount}회</span></div>`
        )
        .join("")
    : `<div class="empty">없음</div>`;

  const failedHtml = data.failed.length
    ? data.failed
        .map(
          (p) =>
            `<div class="row"><span>${esc(p.accountLabel)}</span><span class="dim">${fmtKst(p.scheduledAt)}</span></div><div class="err">${esc(p.error)}</div>`
        )
        .join("")
    : `<div class="empty">없음</div>`;

  const upcomingHtml = data.upcoming
    .map(
      (p) =>
        `<div class="row"><span>${esc(p.accountLabel)}</span><span class="dim">${fmtKst(p.scheduledAt)}</span></div><div class="preview">${esc(p.text)}</div>`
    )
    .join("");

  const runsHtml = data.recentRuns
    .map((r) => {
      const label = r.status === "completed" ? (r.conclusion === "success" ? "✅ 성공" : "❌ 실패") : "⏳ 진행중";
      return `<div class="row"><span>${label} (${r.event === "schedule" ? "GitHub 자체" : "워커 트리거"})</span><span class="dim">${fmtKst(r.created_at)}</span></div>`;
    })
    .join("");

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>스레드 자동화 상태</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 20px 16px 40px;
    background: #0f1115; color: #e5e7eb;
    font-family: -apple-system, BlinkMacSystemFont, "Pretendard", sans-serif;
    max-width: 480px; margin-left: auto; margin-right: auto;
  }
  h1 { font-size: 17px; font-weight: 700; margin: 0 0 4px; }
  .updated { color: #9ca3af; font-size: 12px; margin-bottom: 20px; }
  .status-badge {
    display: inline-flex; align-items: center; gap: 8px;
    background: #1a1d24; border: 1px solid #2a2e37; border-radius: 12px;
    padding: 14px 16px; margin-bottom: 18px; width: 100%;
  }
  .dot { width: 10px; height: 10px; border-radius: 50%; background: ${statusColor}; flex-shrink: 0; }
  .status-text { font-size: 16px; font-weight: 700; }
  .stats { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 18px; }
  .stat { background: #1a1d24; border: 1px solid #2a2e37; border-radius: 10px; padding: 12px; }
  .stat .num { font-size: 22px; font-weight: 700; }
  .stat .label { font-size: 11.5px; color: #9ca3af; margin-top: 2px; }
  section { margin-bottom: 18px; }
  section h2 { font-size: 13px; color: #9ca3af; margin: 0 0 8px; font-weight: 600; }
  .card { background: #1a1d24; border: 1px solid #2a2e37; border-radius: 10px; padding: 4px 14px; }
  .row { display: flex; justify-content: space-between; padding: 9px 0; font-size: 13.5px; border-bottom: 1px solid #23262e; }
  .row:last-child { border-bottom: none; }
  .dim { color: #9ca3af; font-size: 12px; }
  .err { color: #f87171; font-size: 11.5px; padding: 0 0 9px; }
  .preview { color: #9ca3af; font-size: 12px; padding: 0 0 9px; }
  .empty { color: #6b7280; font-size: 13px; padding: 10px 0; }
  .refresh-note { color: #6b7280; font-size: 11.5px; text-align: center; margin-top: 24px; }
</style>
</head>
<body>
  <h1>🧵 스레드 자동화 상태</h1>
  <div class="updated">확인 시각(KST): ${fmtKst(data.checkedAt)}</div>

  <div class="status-badge">
    <span class="dot"></span>
    <span class="status-text">${statusLabel}</span>
  </div>

  <div class="stats">
    <div class="stat"><div class="num">${data.scheduledCount}</div><div class="label">예약 대기중</div></div>
    <div class="stat"><div class="num">${data.publishedLast24h}</div><div class="label">최근 24시간 발행</div></div>
    <div class="stat"><div class="num" style="color:${data.overdueCount ? "#f87171" : "#e5e7eb"}">${data.overdueCount}</div><div class="label">밀린 글</div></div>
    <div class="stat"><div class="num" style="color:${data.failedCount ? "#f87171" : "#e5e7eb"}">${data.failedCount}</div><div class="label">실패</div></div>
  </div>

  <section>
    <h2>밀린 글 (예약시각 지났는데 대기중)</h2>
    <div class="card">${overdueHtml}</div>
  </section>

  <section>
    <h2>실패한 글</h2>
    <div class="card">${failedHtml}</div>
  </section>

  <section>
    <h2>다음 예약 (가까운 순 5개)</h2>
    <div class="card">${upcomingHtml || '<div class="empty">없음</div>'}</div>
  </section>

  <section>
    <h2>최근 발행 시도 기록</h2>
    <div class="card">${runsHtml || '<div class="empty">없음</div>'}</div>
  </section>

  <div class="refresh-note">당겨서 새로고침하거나 다시 열면 최신 상태로 갱신됩니다</div>
</body>
</html>`;
}
