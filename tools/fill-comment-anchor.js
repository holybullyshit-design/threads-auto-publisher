// 연리지 실타래 / 아해사주의 "댓글유도 글"(생년월일시를 받는 상담체, 하루 1개)을 빈 날짜에 채운다.
//
// 배경(2026-10-04): 이 글들은 2026-08-27에 한 번에 대량 생성해둔 묶음이었고 9/30분에서 소진됐다.
// 그 뒤 10/1부터는 fill-schedule.js가 만드는 바이럴 글 4개만 올라가서, 사용자가 "하루 1번은
// 생년월일을 받아야 운영이 된다"고 못 박은 핵심 글이 매일 빠지고 있었다(CLAUDE.md 참고).
// fill-schedule.js는 이 글을 "완전히 다른 경로에서 생성되는 앵커"로 보고 절대 만들지 않으므로,
// 그 경로를 이 스크립트로 되살린다 - 엔진은 페르소나 기반 writeDraft(server/skills/sajuDraftWriter.js).
//
// 시각 규칙은 CLAUDE.md의 사주 계정 규칙을 그대로 따른다: 그 날 이미 있는 글 전부와 최소 2시간,
// 22시 이전, 현재 시각 + 15분 이후. 보통은 그 날 마지막 글 뒤 2~3시간에 붙고, 뒤가 꽉 찼으면
// 중간에 4시간 이상 벌어진 구간을 찾아 넣는다. 자리가 없으면 그 날은 건너뛴다(기존 글은 절대
// 안 건드린다).
//
// 사용법:
//   node tools/fill-comment-anchor.js "<연리지 실타래|아해사주>" <종료일 YYYY-MM-DD> [--dry-run]

require("dotenv").config();
const crypto = require("crypto");
const accountsStore = require("../server/lib/accountsStore");
const { readSchedule, writeSchedule } = require("../server/lib/githubStore");
const { writeDraft } = require("../server/skills/sajuDraftWriter");

const SUPPORTED = ["연리지 실타래", "아해사주"];
const RETRY_ATTEMPTS = 3;
const MIN_GAP = 122; // 분 - 초 단위 반올림 여유 2분 포함(fill-schedule.js의 planDayTimes와 동일)
const MAX_GAP = 180;
const DAY_END = 22 * 60;

const DRY_RUN = process.argv.includes("--dry-run");
const ACCOUNT_LABEL = process.argv[2];
const END_DATE = process.argv[3];

if (!SUPPORTED.includes(ACCOUNT_LABEL) || !END_DATE || !/^\d{4}-\d{2}-\d{2}$/.test(END_DATE)) {
  console.error(`사용법: node tools/fill-comment-anchor.js "<${SUPPORTED.join("|")}>" <종료일 YYYY-MM-DD> [--dry-run]`);
  process.exit(1);
}

function nowKstDateStr() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
function addDaysStr(dateStr, days) {
  return new Date(Date.parse(`${dateStr}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}
function kstDateOf(iso) {
  return new Date(new Date(iso).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
function hhmm(totalMinutes) {
  const m = Math.round(totalMinutes);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

// 그 날 기존 글 시각(분, KST)들을 받아서 앵커를 놓을 분(分)을 고른다. 못 찾으면 null.
function planAnchorMinute(existingMins) {
  const sorted = existingMins.slice().sort((a, b) => a - b);
  if (sorted.length === 0) return 17 * 60 + Math.floor(Math.random() * 60); // 17:00~17:59(기존 묶음과 같은 결)
  const last = sorted[sorted.length - 1];
  // 1순위: 마지막 글 뒤 2~3시간
  if (last + MIN_GAP <= DAY_END) {
    const hi = Math.min(last + MAX_GAP, DAY_END);
    return last + MIN_GAP + Math.random() * (hi - (last + MIN_GAP));
  }
  // 2순위: 글 사이에 4시간 이상 벌어진 구간이 있으면 그 가운데
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - sorted[i - 1] >= MIN_GAP * 2) {
      const lo = sorted[i - 1] + MIN_GAP;
      const hi = sorted[i] - MIN_GAP;
      return lo + Math.random() * (hi - lo);
    }
  }
  // 3순위: 첫 글보다 2시간 이상 앞이 비어 있으면 그 앞(단, 07시 이후)
  if (sorted[0] - MIN_GAP >= 7 * 60) return 7 * 60 + Math.random() * (sorted[0] - MIN_GAP - 7 * 60);
  return null;
}

async function writeDraftWithRetry(args) {
  let lastErr;
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      const { draft } = await writeDraft(args);
      if (!draft || !draft.trim()) throw new Error("빈 초안");
      if (!/생년월일|태어난 날/.test(draft)) throw new Error("생년월일시 요청(CTA)이 없는 초안");
      if (draft.length > 500) throw new Error(`본문 ${draft.length}자 - 500자 초과`);
      return draft.trim();
    } catch (err) {
      lastErr = err;
      console.log(`  (시도 ${attempt}/${RETRY_ATTEMPTS} 실패: ${err.message} - 재시도)`);
    }
  }
  throw lastErr;
}

async function saveOnePost(account, text, when) {
  const { posts, sha } = await readSchedule();
  const newPost = {
    id: crypto.randomUUID(),
    accountId: account.id,
    accountLabel: account.label,
    text,
    replyChain: [],
    status: "scheduled",
    scheduledAt: when.toISOString(),
    createdAt: new Date().toISOString(),
    publishedAt: null,
    publishedId: null,
    error: null,
    viralEngine: false, // fill-schedule.js가 이 글을 "앵커"로 알아보고 비껴가게 하는 표시
    commentAnchor: true, // 댓글유도(생년월일시 수집) 글 표시
  };
  await writeSchedule(posts.concat([newPost]), {
    sha,
    message: `chore: fill comment anchor for ${ACCOUNT_LABEL}`,
    basePosts: posts.slice(),
  });
}

async function main() {
  const account = accountsStore.listAccounts().find((a) => a.label === ACCOUNT_LABEL);
  if (!account) throw new Error(`계정을 찾을 수 없습니다: "${ACCOUNT_LABEL}"`);

  const { posts } = await readSchedule();
  const mine = posts.filter(
    (p) => p.accountId === account.id && p.status !== "canceled" && p.platform !== "instagram" && p.scheduledAt
  );
  const timesByDate = {};
  const anchorCountByDate = {};
  for (const p of mine) {
    const d = kstDateOf(p.scheduledAt);
    const k = new Date(new Date(p.scheduledAt).getTime() + 9 * 3600 * 1000);
    (timesByDate[d] = timesByDate[d] || []).push(k.getUTCHours() * 60 + k.getUTCMinutes() + k.getUTCSeconds() / 60);
    const isAnchor = p.commentAnchor === true || !(p.viralEngine === true || (p.viralEngine === undefined && k.getUTCHours() < 12));
    if (isAnchor) anchorCountByDate[d] = (anchorCountByDate[d] || 0) + 1;
  }

  const jobs = [];
  let cursor = nowKstDateStr();
  while (cursor <= END_DATE) {
    if ((anchorCountByDate[cursor] || 0) === 0) {
      const minute = planAnchorMinute(timesByDate[cursor] || []);
      if (minute === null) {
        console.log(`  ${cursor}: 2시간 간격/22시 이전을 지킬 자리가 없어 건너뜀 - 확인 필요`);
      } else {
        const utcMs = Date.parse(`${cursor}T00:00:00Z`) - 9 * 3600 * 1000 + Math.round(minute) * 60000;
        if (utcMs > Date.now() + 15 * 60 * 1000) {
          console.log(`  ${cursor} 기존: ${(timesByDate[cursor] || []).map(hhmm).sort().join(", ") || "없음"} / 댓글유도: ${hhmm(minute)}`);
          jobs.push({ dateStr: cursor, label: hhmm(minute), utcTime: new Date(utcMs) });
        } else {
          console.log(`  ${cursor} ${hhmm(minute)}: 이미 지난 시각이라 건너뜀`);
        }
      }
    }
    cursor = addDaysStr(cursor, 1);
  }

  console.log(`계정: ${account.label} / 채울 댓글유도 글: ${jobs.length}개 (오늘 ~ ${END_DATE})`);
  if (DRY_RUN) {
    console.log("[dry-run] 시각 계획만 출력하고 종료 - 글 생성/저장 안 함.");
    return;
  }
  if (jobs.length === 0) {
    console.log("채울 자리가 없습니다. 종료.");
    return;
  }

  // 카테고리를 섞어서 돌린다 - 같은 소재가 연달아 나오지 않게 한다(2026-09-07 반응 급감 원인).
  const catIds = account.persona.categories.map((c) => c.id);
  const order = [];
  while (order.length < jobs.length) {
    const bag = catIds.slice().sort(() => Math.random() - 0.5);
    if (order.length && bag[0] === order[order.length - 1]) bag.push(bag.shift());
    order.push(...bag);
  }

  // 같은 글이 반복되지 않게, 직전에 만든 글들을 "피할 글"로 넘긴다.
  const recentTexts = mine
    .filter((p) => p.commentAnchor === true || p.viralEngine === false)
    .sort((a, b) => new Date(b.scheduledAt) - new Date(a.scheduledAt))
    .slice(0, 8)
    .map((p) => p.text);

  let saved = 0;
  for (let i = 0; i < jobs.length; i++) {
    const { dateStr, label, utcTime } = jobs[i];
    const categoryId = order[i];
    console.log(`[${i + 1}/${jobs.length}] 생성 중... (예정: ${dateStr} ${label} KST / 소재: ${categoryId})`);
    let text;
    try {
      text = await writeDraftWithRetry({ account, categoryId, recentTexts: recentTexts.slice(0, 5) });
    } catch (err) {
      console.log(`  -> ${RETRY_ATTEMPTS}번 다 실패, 이 슬롯은 건너뜀: ${err.message}`);
      continue;
    }
    await saveOnePost(account, text, utcTime);
    recentTexts.unshift(text);
    saved++;
    console.log(`  -> 저장됨 (${text.length}자)`);
  }

  console.log(`\n완료: ${ACCOUNT_LABEL} 댓글유도 글 - ${saved}/${jobs.length}건 추가 (${END_DATE}까지).`);
}

main().catch((err) => {
  console.error("실패:", err);
  process.exit(1);
});
