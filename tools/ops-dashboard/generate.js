// "자동화 관제탑" 모바일(claude.ai 아티팩트) 대시보드 HTML을 실제 데이터로 채워서 생성한다.
// 클라우드 루틴("자동화 관제탑 갱신", 매시간)이 이 스크립트를 실행한 뒤 결과물을 Artifact로
// republish한다. 수동으로 새로고침하고 싶을 때도 그냥 `node tools/ops-dashboard/generate.js`.
//
// 2026-08-30: 데스크탑 앱의 관제탑 탭/캘린더에 비해 너무 초라하다는 지적을 받고 전면 개편함.
// - 계정 카드에 실제 Threads 핸들 링크 추가
// - 데스크탑 "콘텐츠 캘린더"와 같은 방식(계정별 요약 칩, 취소 제외, IG는 별도 표시)의 7일 미리보기 추가
// - 데스크탑 관제탑 탭에 있던 4개 스탯 카드(예약대기/이번주발행예정/발행완료/실패)를 여기도 추가
// - 성장 리서치 기록(growth-research-log.json)도 벤치마크 기록과 같이 노출 (전엔 여기 빠져있었음)
// - 색상/폰트를 앱 실제 다크 테마(파랑/보라/청록 계열)에 맞춰서 데스크탑과 같은 제품처럼 보이게 함
//
// 사용법: node tools/ops-dashboard/generate.js
// 출력: tools/ops-dashboard/output.html (git에는 안 올라감 - .gitignore 처리됨, 매번 재생성되는 파일이라)

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const DIR = __dirname;

const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"];

// 계정별 고정 색상 + 실제 Threads 핸들. 이름 기준으로 고정해둬야(런타임 순서 의존 X) 매번
// 똑같은 색으로 보인다 (2026-08-28 확인된 실제 핸들 - Threads API로 직접 조회해서 검증함).
const ACCOUNT_META = {
  "연리지 실타래": { color: "#6ea8fe", handle: "knot_saju" },
  "아해사주": { color: "#81b29a", handle: "read_saju" },
  "팔자명가": { color: "#f2b56f", handle: "saju_orbit" },
  "팔자장인": { color: "#d88fd8", handle: "plaja_saju" },
  "팔자궤도": { color: "#7fd1ae", handle: "orbit_saju" },
  "엄마가 직접 써본 꿀템": { color: "#e07a5f", handle: "mother_items" },
};
const DEFAULT_COLOR = "#8b93a1";

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function accountMeta(label) {
  return ACCOUNT_META[label] || { color: DEFAULT_COLOR, handle: null };
}

// KST(UTC+9) 기준 Date 필드 추출. 서버가 어느 타임존에서 돌든 항상 KST로 표시하기 위함.
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
    dateKey: `${k.getUTCFullYear()}-${String(k.getUTCMonth() + 1).padStart(2, "0")}-${String(k.getUTCDate()).padStart(2, "0")}`,
  };
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatGeneratedAt() {
  const k = toKst(new Date());
  return `${k.year}-${pad2(k.month)}-${pad2(k.date)} (${k.weekday}) ${pad2(k.hour)}:${pad2(k.minute)} KST`;
}

// 다음 월요일 09:09 KST 날짜 계산 (스케줄 작업의 실제 cron: "0 9 * * 1", 앱이 09:09로 표시함)
function formatNextMonday() {
  const now = new Date();
  const k = toKst(now);
  const kstNow = new Date(Date.UTC(k.year, k.month - 1, k.date, k.hour, k.minute));
  const dow = kstNow.getUTCDay(); // 0=일 ... 1=월
  let daysUntilMonday = (1 - dow + 7) % 7;
  if (daysUntilMonday === 0 && (k.hour > 9 || (k.hour === 9 && k.minute >= 9))) {
    daysUntilMonday = 7;
  }
  const next = new Date(kstNow);
  next.setUTCDate(next.getUTCDate() + daysUntilMonday);
  return `${next.getUTCMonth() + 1}/${next.getUTCDate()} (월) 09:09`;
}

function loadPosts() {
  const raw = fs.readFileSync(path.join(ROOT, "schedule", "posts.json"), "utf8");
  return JSON.parse(raw);
}

// ---------- 상단 4개 스탯 카드 (데스크탑 관제탑 탭과 동일 지표) ----------
function buildStatCards(posts) {
  let totalScheduled = 0, totalPublished = 0, totalFailed = 0, dueThisWeek = 0;
  const in7d = Date.now() + 7 * 24 * 60 * 60 * 1000;
  for (const p of posts) {
    if (p.status === "scheduled") {
      totalScheduled++;
      if (p.scheduledAt && new Date(p.scheduledAt).getTime() <= in7d) dueThisWeek++;
    } else if (p.status === "published") totalPublished++;
    else if (p.status === "failed") totalFailed++;
  }
  const cards = [
    { label: "예약 대기", value: totalScheduled, grad: "grad-blue" },
    { label: "이번 주 발행 예정", value: dueThisWeek, grad: "grad-teal" },
    { label: "발행 완료", value: totalPublished, grad: "grad-purple" },
    { label: "실패", value: totalFailed, grad: totalFailed > 0 ? "grad-red" : "grad-teal" },
  ];
  return cards
    .map((c) => `      <div class="stat-card ${c.grad}">
        <div class="stat-label">${c.label}</div>
        <div class="stat-value">${c.value}<span class="stat-unit">건</span></div>
      </div>`)
    .join("\n");
}

// ---------- 계정 카드 (실제 핸들 링크 포함) ----------
function buildAccountCards(posts) {
  const byAccount = new Map();
  for (const p of posts) {
    const label = p.accountLabel || "(알 수 없음)";
    if (!byAccount.has(label)) {
      byAccount.set(label, { published: 0, scheduled: 0, failed: 0, other: 0, platforms: new Set() });
    }
    const acc = byAccount.get(label);
    acc.platforms.add((p.platform || "threads").toUpperCase());
    if (p.status === "published") acc.published++;
    else if (p.status === "scheduled") acc.scheduled++;
    else if (p.status === "failed") acc.failed++;
    else if (p.status !== "canceled") acc.other++;
  }

  const entries = [...byAccount.entries()].sort((a, b) => {
    const totalA = a[1].published + a[1].scheduled + a[1].failed + a[1].other;
    const totalB = b[1].published + b[1].scheduled + b[1].failed + b[1].other;
    return totalB - totalA;
  });

  const maxTotal = Math.max(1, ...entries.map(([, v]) => v.published + v.scheduled + v.failed + v.other));

  return entries
    .map(([label, v]) => {
      const meta = accountMeta(label);
      const total = v.published + v.scheduled + v.failed + v.other;
      const pct = Math.round((total / maxTotal) * 100);
      const chips = [...v.platforms].map((p) => `<span class="chip">${escapeHtml(p)}</span>`).join("");
      const failedNote = v.failed > 0
        ? `<span class="acct-failed">실패 ${v.failed}</span>`
        : "";
      const handleLink = meta.handle
        ? `<a class="acct-handle" href="https://www.threads.com/@${meta.handle}" target="_blank" rel="noopener">@${meta.handle} ↗</a>`
        : "";
      return `      <div class="acct-card" style="--acct-color:${meta.color}">
        <div class="acct-top">
          <span class="acct-dot"></span>
          <span class="acct-name">${escapeHtml(label)}</span>
          ${failedNote}
        </div>
        ${handleLink}
        <div class="platform-chips">${chips}</div>
        <div class="acct-numbers">
          <span class="num mono">${v.published}</span><span class="label">발행</span>
          <span class="divider"></span>
          <span class="num mono">${v.scheduled}</span><span class="label">예약</span>
        </div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
      </div>`;
    })
    .join("\n");
}

// ---------- 7일 미리보기 (데스크탑 콘텐츠 캘린더와 동일 집계 방식) ----------
// 취소된 글은 뺀다. 같은 라벨이라도 platform이 다르면(팔자명가 Threads vs Instagram) 따로 센다.
function buildWeekStrip(posts) {
  const days = [];
  const todayKst = toKst(new Date());
  const todayUtcMidnight = Date.UTC(todayKst.year, todayKst.month - 1, todayKst.date);

  for (let i = 0; i < 7; i++) {
    const dayUtc = new Date(todayUtcMidnight + i * 86400000 - 9 * 60 * 60 * 1000); // 그날 KST 00:00의 UTC 시각
    const k = toKst(dayUtc);
    days.push({ dateKey: k.dateKey, month: k.month, date: k.date, weekday: k.weekday, isToday: i === 0, byAccount: new Map() });
  }
  const dayByKey = new Map(days.map((d) => [d.dateKey, d]));

  for (const p of posts) {
    if (p.status === "canceled" || !p.scheduledAt) continue;
    const k = toKst(p.scheduledAt);
    const day = dayByKey.get(k.dateKey);
    if (!day) continue;
    const platform = p.platform === "instagram" ? "instagram" : "threads";
    const key = `${p.accountId || p.accountLabel}|${platform}`;
    if (!day.byAccount.has(key)) {
      const label = (p.accountLabel || "계정") + (platform === "instagram" ? " (IG)" : "");
      day.byAccount.set(key, { label, color: accountMeta(p.accountLabel).color, count: 0 });
    }
    day.byAccount.get(key).count += 1;
  }

  return days
    .map((d) => {
      const chips = [...d.byAccount.values()]
        .sort((a, b) => b.count - a.count)
        .map((a) => `<span class="week-chip" style="--acct-color:${a.color}"><span class="week-chip-dot"></span>${escapeHtml(a.label)}<b>${a.count}</b></span>`)
        .join("");
      const total = [...d.byAccount.values()].reduce((sum, a) => sum + a.count, 0);
      return `        <div class="week-day${d.isToday ? " today" : ""}">
          <div class="week-day-head"><span>${d.weekday}</span><span class="mono">${d.month}/${d.date}</span></div>
          <div class="week-day-total mono">${total}</div>
          <div class="week-chips">${chips || '<span class="week-empty">-</span>'}</div>
        </div>`;
    })
    .join("\n");
}

function buildQueueRows(posts, limit = 8) {
  const upcoming = posts
    .filter((p) => p.status === "scheduled" && p.scheduledAt)
    .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt))
    .slice(0, limit);

  if (upcoming.length === 0) {
    return `        <p class="log-empty">예약된 게시물이 없습니다.</p>`;
  }

  return upcoming
    .map((p) => {
      const k = toKst(p.scheduledAt);
      const meta = accountMeta(p.accountLabel);
      const preview = (p.text || "").replace(/\s+/g, " ").trim().slice(0, 40);
      return `        <div class="queue-row">
          <div class="queue-top-line">
            <span class="queue-time mono">${pad2(k.hour)}:${pad2(k.minute)}<span class="day">${k.month}/${k.date} ${k.weekday}</span></span>
            <span class="queue-text">${escapeHtml(preview)}${(p.text || "").length > 40 ? "…" : ""}</span>
          </div>
          <div class="queue-acct" style="--acct-color:${meta.color}"><span class="queue-acct-dot"></span>${escapeHtml(p.accountLabel || "")}</div>
        </div>`;
    })
    .join("\n");
}

function buildDecisionRows() {
  let statusOutput = "";
  try {
    statusOutput = execSync("git status --porcelain", { cwd: ROOT, encoding: "utf8" });
  } catch (e) {
    statusOutput = "";
  }
  // NOTE: don't .trim() before slicing — porcelain's leading space (unstaged
  // changes look like " M path") is part of the fixed-width status prefix;
  // trimming it first shifts slice(3) and eats the filename's first letter.
  const lines = statusOutput.split("\n").filter((l) => l.trim().length > 0);

  if (lines.length === 0) {
    return `      <div class="decision-row resolved">
        <span class="decision-mark">완료</span>
        <div class="decision-copy">
          <div class="title">작업 트리 깨끗함</div>
          <div class="detail">미커밋 변경사항 없음</div>
        </div>
      </div>`;
  }

  const files = lines.map((l) => l.slice(3).trim()).slice(0, 6);
  const more = lines.length > 6 ? ` 외 ${lines.length - 6}건` : "";
  return `      <div class="decision-row open">
        <span class="decision-mark">대기</span>
        <div class="decision-copy">
          <div class="title">미커밋 변경사항 ${lines.length}건</div>
          <div class="detail">${escapeHtml(files.join(", "))}${more}</div>
        </div>
      </div>`;
}

function buildLogSection(fileName, emptyText) {
  const logPath = path.join(DIR, fileName);
  let log = [];
  try {
    log = JSON.parse(fs.readFileSync(logPath, "utf8"));
  } catch (e) {
    log = [];
  }

  if (!Array.isArray(log) || log.length === 0) {
    return `      <p class="log-empty">${emptyText}</p>`;
  }

  return log
    .slice(-3)
    .reverse()
    .map((entry) => {
      const items = (entry.findings || [])
        .map((f) => `<li>${escapeHtml(f)}</li>`)
        .join("");
      return `      <div class="log-entry">
        <div class="log-date mono">${escapeHtml(entry.date || "")}</div>
        <ul>${items}</ul>
      </div>`;
    })
    .join("\n");
}

// ---------- 성과 분석 (실제 Threads Insights API) ----------
// 로컬 서버(server/index.js)가 매시간 백그라운드로 Threads Insights를 가져와서
// tools/ops-dashboard/insights-summary.json으로 GitHub에 커밋해둔다(server/lib/githubStore.js
// writeJsonFile). 이 스크립트는 클라우드 루틴이 fresh git clone에서 돌리기 때문에 계정
// 토큰(data/accounts.json)에 접근할 수 없다 - 그래서 여기선 그 요약 파일을 그냥 읽기만 한다.
// 숫자/추천 계산 로직 자체는 server/lib/insightsSummary.js와 동일해야 하므로(안 갈라지게)
// 그 파일을 그대로 require해서 쓴다.
function fmtNum(n) {
  return typeof n === "number" ? n.toLocaleString("ko-KR") : "-";
}

function loadInsightsSummary() {
  try {
    const raw = fs.readFileSync(path.join(DIR, "insights-summary.json"), "utf8");
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function buildInsightsSection() {
  const summary = loadInsightsSummary();
  if (!summary || !Array.isArray(summary.accounts) || summary.accounts.length === 0) {
    return {
      updated: "아직 데이터가 없습니다 — 로컬 앱이 다음 갱신 주기에 채웁니다.",
      rows: `<p class="log-empty">아직 데이터가 없습니다.</p>`,
      recs: "",
    };
  }

  const gen = new Date(summary.generatedAt);
  const updated = `${gen.getMonth() + 1}월 ${gen.getDate()}일 ${pad2(toKst(gen).hour)}:${pad2(toKst(gen).minute)} 기준 (로컬 앱 기준 시각) · 계정당 최근 발행 글 최대 12개 추적`;

  const rows = summary.accounts
    .map((a) => {
      const meta = accountMeta(a.label);
      if (a.noData) {
        return `        <div class="insight-account">
          <div class="insight-account-head"><span class="insight-account-name">${escapeHtml(a.label)}</span></div>
          <p class="log-empty">아직 데이터가 없습니다.</p>
        </div>`;
      }
      if (a.error) {
        return `        <div class="insight-account">
          <div class="insight-account-head"><span class="insight-account-name">${escapeHtml(a.label)}</span></div>
          <p class="log-empty">불러오기 실패: ${escapeHtml(a.error)}</p>
        </div>`;
      }
      const changeBadge =
        a.viewsChangePct === null
          ? ""
          : a.viewsChangePct >= 0
          ? `<span class="insight-change up">▲ ${a.viewsChangePct}%</span>`
          : `<span class="insight-change down">▼ ${Math.abs(a.viewsChangePct)}%</span>`;
      const topPost = a.topPost
        ? `<div class="insight-top"><span class="insight-top-label">최고 성과</span><span class="insight-top-text">${escapeHtml(a.topPost.text)}</span><span class="insight-top-nums">조회 ${fmtNum(a.topPost.views)} · 답글 ${fmtNum(a.topPost.replies)}</span></div>`
        : "";
      return `        <div class="insight-account" style="--acct-color:${meta.color}">
          <div class="insight-account-head">
            <span class="insight-account-dot"></span><span class="insight-account-name">${escapeHtml(a.label)}</span>
            <span class="insight-followers">팔로워 ${fmtNum(a.followersCount)}</span>
          </div>
          <div class="insight-nums">
            <div class="insight-num"><b class="mono">${fmtNum(a.viewsRecent7d)}</b><span>7일 조회수</span>${changeBadge}</div>
            <div class="insight-num"><b class="mono">${fmtNum(a.likes)}</b><span>좋아요</span></div>
            <div class="insight-num"><b class="mono">${fmtNum(a.replies)}</b><span>답글</span></div>
            <div class="insight-num"><b class="mono">${fmtNum(a.reposts)}</b><span>리포스트</span></div>
          </div>
          ${topPost}
        </div>`;
    })
    .join("\n");

  const recs = (summary.recommendations || []).length
    ? `<div class="insight-recs-title">💡 노출을 늘리려면</div><ul>${summary.recommendations.map((r) => `<li>${escapeHtml(r)}</li>`).join("")}</ul>`
    : "";

  return { updated, rows, recs };
}

function main() {
  const posts = loadPosts();
  const template = fs.readFileSync(path.join(DIR, "template.html"), "utf8");
  const insights = buildInsightsSection();

  const output = template
    .replace("{{GENERATED_AT}}", formatGeneratedAt())
    .replace("{{TOTAL_POSTS}}", String(posts.length))
    .replace("{{STAT_CARDS}}", buildStatCards(posts))
    .replace("{{INSIGHTS_UPDATED}}", insights.updated)
    .replace("{{INSIGHTS_ROWS}}", insights.rows)
    .replace("{{INSIGHTS_RECS}}", insights.recs)
    .replace("{{WEEK_STRIP}}", buildWeekStrip(posts))
    .replace("{{ACCOUNT_CARDS}}", buildAccountCards(posts))
    .replace("{{QUEUE_ROWS}}", buildQueueRows(posts))
    .replace("{{NEXT_MONDAY}}", formatNextMonday())
    .replace("{{DECISION_ROWS}}", buildDecisionRows())
    .replace("{{BENCHMARK_LOG}}", buildLogSection("benchmark-log.json", "아직 기록이 없습니다 — 다음 월요일 벤치마크 점검에서 첫 기록이 남습니다."))
    .replace("{{GROWTH_LOG}}", buildLogSection("growth-research-log.json", "아직 기록이 없습니다 — 다음 월요일 성장 리서치에서 첫 기록이 남습니다."));

  const outPath = path.join(DIR, "output.html");
  fs.writeFileSync(outPath, output, "utf8");
  console.log(`generated: ${outPath}`);
}

main();
