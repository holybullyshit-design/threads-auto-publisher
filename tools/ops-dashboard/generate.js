// "자동화 관제탑" 대시보드 HTML을 실제 데이터(schedule/posts.json, git status, 벤치마크 기록)로
// 채워서 생성한다. 매주 월요일 벤치마크 스케줄 작업이 이 스크립트를 실행한 뒤 그 결과물을
// Artifact로 republish한다. 수동으로 새로고침하고 싶을 때도 그냥 `node tools/ops-dashboard/generate.js`.
//
// 사용법: node tools/ops-dashboard/generate.js
// 출력: tools/ops-dashboard/output.html (git에는 안 올라감 - .gitignore 처리됨, 매번 재생성되는 파일이라)

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const DIR = __dirname;

const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"];

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
  // 오늘이 월요일이고 아직 09:09 이전이면 오늘, 아니면 다음 주
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
    else acc.other++;
  }

  const entries = [...byAccount.entries()].sort((a, b) => {
    const totalA = a[1].published + a[1].scheduled + a[1].failed + a[1].other;
    const totalB = b[1].published + b[1].scheduled + b[1].failed + b[1].other;
    return totalB - totalA;
  });

  const maxTotal = Math.max(1, ...entries.map(([, v]) => v.published + v.scheduled + v.failed + v.other));

  return entries
    .map(([label, v]) => {
      const total = v.published + v.scheduled + v.failed + v.other;
      const pct = Math.round((total / maxTotal) * 100);
      const chips = [...v.platforms].map((p) => `<span class="chip">${escapeHtml(p)}</span>`).join("");
      const failedNote = v.failed > 0
        ? `<div class="acct-numbers"><span class="num mono" style="color:var(--attn)">${v.failed}</span><span class="label">실패</span></div>`
        : "";
      return `      <div class="acct-card">
        <div class="acct-name">${escapeHtml(label)}</div>
        <div class="platform-chips">${chips}</div>
        <div class="acct-numbers">
          <span class="num mono">${v.published}</span><span class="label">발행</span>
          <span class="divider"></span>
          <span class="num mono">${v.scheduled}</span><span class="label">예약</span>
        </div>
        ${failedNote}
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
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
      const preview = (p.text || "").replace(/\s+/g, " ").trim().slice(0, 42);
      return `        <div class="queue-row">
          <div class="queue-time mono">${pad2(k.hour)}:${pad2(k.minute)}<span class="day">${k.month}/${k.date} ${k.weekday}</span></div>
          <div class="queue-acct">${escapeHtml(p.accountLabel || "")}</div>
          <div class="queue-text">${escapeHtml(preview)}${(p.text || "").length > 42 ? "..." : ""}</div>
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
  const lines = statusOutput.split("\n").map((l) => l.trim()).filter(Boolean);

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

function buildBenchmarkLog() {
  const logPath = path.join(DIR, "benchmark-log.json");
  let log = [];
  try {
    log = JSON.parse(fs.readFileSync(logPath, "utf8"));
  } catch (e) {
    log = [];
  }

  if (!Array.isArray(log) || log.length === 0) {
    return `      <p class="log-empty">아직 기록이 없습니다 — 다음 월요일 벤치마크 점검에서 첫 기록이 남습니다.</p>`;
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

function main() {
  const posts = loadPosts();
  const template = fs.readFileSync(path.join(DIR, "template.html"), "utf8");

  const output = template
    .replace("{{GENERATED_AT}}", formatGeneratedAt())
    .replace("{{TOTAL_POSTS}}", String(posts.length))
    .replace("{{ACCOUNT_CARDS}}", buildAccountCards(posts))
    .replace("{{QUEUE_ROWS}}", buildQueueRows(posts))
    .replace("{{NEXT_MONDAY}}", formatNextMonday())
    .replace("{{DECISION_ROWS}}", buildDecisionRows())
    .replace("{{BENCHMARK_LOG}}", buildBenchmarkLog());

  const outPath = path.join(DIR, "output.html");
  fs.writeFileSync(outPath, output, "utf8");
  console.log(`generated: ${outPath}`);
}

main();
