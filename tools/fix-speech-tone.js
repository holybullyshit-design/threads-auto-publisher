/**
 * 계정 페르소나 어체와 어긋난 예약글만 골라 다시 쓴다.
 *
 * 왜 필요한가 (2026-11-14):
 *   fill-schedule.js의 comprehensive 모드(팔자궤도·팔자장인)는 VIRAL_PROFILES에 없어
 *   profile이 null이었고, 그래서 speechLevel이 엔진에 **아예 넘어가지 않았다**.
 *   어체 지시가 없으면 훅 예시 문장의 톤을 그대로 따라가므로 글마다 반말/존댓말이
 *   들쭉날쭉해지고, 본문은 반말인데 마지막 CTA 한 줄만 존댓말로 끝나기도 한다.
 *   발행본 90건 중 88건이 존댓말인데 신규 예약 83건 중 32건이 반말로 흘러갔다.
 *
 * 이 도구는 시각·개수·댓글유도 배치를 그대로 두고 **내용만** 교체한다.
 *
 * 사용법:
 *   node tools/fix-speech-tone.js "<계정라벨>" <시작일 YYYY-MM-DD> [종료일] [--dry-run]
 */
require("dotenv").config();
const accountsStore = require("../server/lib/accountsStore");
const { readSchedule, atomicUpdateSchedule } = require("../server/lib/githubStore");
const { writeThreadDraft } = require("../server/skills/taebaekSajuDraftWriter");

const DRY_RUN = process.argv.includes("--dry-run");
const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const ACCOUNT_LABEL = args[0];
const START_DATE = args[1];
const END_DATE = args[2] || "2099-12-31";
const RETRY_ATTEMPTS = 3;

if (!ACCOUNT_LABEL || !START_DATE) {
  console.error('사용법: node tools/fix-speech-tone.js "<계정라벨>" <시작일 YYYY-MM-DD> [종료일] [--dry-run]');
  process.exit(1);
}

const kstDate = (iso) => new Date(new Date(iso).getTime() + 9 * 3600e3).toISOString().slice(0, 10);
const kstTime = (iso) => new Date(new Date(iso).getTime() + 9 * 3600e3).toISOString().slice(11, 16);

// 문장 끝만 본다. "~야/어/지/해/줘/봐/거든"으로 끝나면서 "요/다/까"로 끝나지 않는 줄을 반말로 센다.
function banmalRatio(text) {
  const lines = String(text || "").split("\n").map((s) => s.trim()).filter(Boolean);
  if (!lines.length) return 0;
  const banmal = lines.filter(
    (l) => /(야|어|지|해|돼|줘|봐|거든|잖아|더라|구나|대|네)[.?!]?$/.test(l) && !/(요|다|까)[.?!]?$/.test(l)
  );
  return banmal.length / lines.length;
}

async function writeWithRetry(baseArgs) {
  let lastErr;
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      // 2번째 시도부터는 직전 실패 이유를 같이 넘긴다 - 안 그러면 모델이 같은 실수를 반복한다.
      const extra = attempt === 1 || !lastErr ? baseArgs.extraBans : [...(baseArgs.extraBans || []), `직전 시도 실패 사유: ${lastErr.message}`];
      return await writeThreadDraft({ ...baseArgs, extraBans: extra });
    } catch (err) {
      lastErr = err;
      console.log(`  (시도 ${attempt}/${RETRY_ATTEMPTS} 실패: ${String(err.message).slice(0, 160)} - 재시도)`);
    }
  }
  throw lastErr;
}

// atomicUpdateSchedule의 콜백은 { posts } 객체가 아니라 **글 배열 자체**를 받고,
// 그 배열을 제자리에서 고쳐야 한다(반환값은 쓰기에 쓰이지 않는다).
async function saveOneUpdate(id, patch) {
  let found = false;
  await atomicUpdateSchedule((posts) => {
    const target = posts.find((p) => p.id === id);
    if (!target) throw new Error(`글을 찾을 수 없습니다: ${id}`);
    Object.assign(target, patch);
    found = true;
  }, `chore: fix speech tone for ${id}`);
  if (!found) throw new Error(`저장되지 않았습니다: ${id}`);
}

async function main() {
  const account = accountsStore.listAccounts().find((a) => a.label === ACCOUNT_LABEL);
  if (!account) throw new Error(`계정을 찾을 수 없습니다: "${ACCOUNT_LABEL}"`);
  const want = account.persona && account.persona.speechLevel;
  if (!want) throw new Error(`이 계정에는 speechLevel이 설정돼 있지 않습니다: "${ACCOUNT_LABEL}"`);

  const { posts } = await readSchedule();
  const now = Date.now();
  const targets = posts
    .filter((p) => p.accountLabel === ACCOUNT_LABEL && p.platform !== "instagram" && p.status === "scheduled" && p.scheduledAt)
    .filter((p) => kstDate(p.scheduledAt) >= START_DATE && kstDate(p.scheduledAt) <= END_DATE)
    // 이미 지난 시각/곧 발행될 글은 건드리지 않는다(재배치 사고와 같은 이유).
    .filter((p) => new Date(p.scheduledAt).getTime() > now + 15 * 60e3)
    .filter((p) => {
      const all = [p.text || "", ...(p.replyChain || []).map((r) => (typeof r === "string" ? r : (r && r.text) || ""))].join("\n");
      const r = banmalRatio(all);
      return want === "존댓말" ? r > 0.18 : r < 0.08;
    })
    .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));

  console.log(`계정: ${ACCOUNT_LABEL} / 설정 어체: ${want} / 어긋난 예약글: ${targets.length}건`);
  if (DRY_RUN) {
    targets.forEach((p) => console.log(`   ${kstDate(p.scheduledAt)} ${kstTime(p.scheduledAt)}${p.ctaMode === "comment" || p.commentCta ? " ← 댓글유도" : ""}`));
    return;
  }

  let done = 0;
  for (let i = 0; i < targets.length; i++) {
    const post = targets[i];
    const dateKey = kstDate(post.scheduledAt);
    const isComment = post.ctaMode === "comment" || post.commentCta === true;
    console.log(`[${i + 1}/${targets.length}] 다시 쓰는 중... (${dateKey} ${kstTime(post.scheduledAt)} KST)${isComment ? " [댓글유도]" : ""}`);
    let draft;
    try {
      draft = await writeWithRetry({
        dateKey,
        accountLabel: ACCOUNT_LABEL,
        speechLevel: want,
        hitFormula: true,
        ctaMode: isComment ? "comment" : undefined,
      });
    } catch (err) {
      console.log(`  -> ${RETRY_ATTEMPTS}번 다 실패, 기존 내용 그대로 둠: ${String(err.message).slice(0, 160)}`);
      continue;
    }
    try {
      await saveOneUpdate(post.id, { text: draft.text, replyChain: draft.replyChain, toneFixed: true });
    } catch (err) {
      console.log(`  -> 저장 실패(다음 재실행 때 다시 시도됨): ${err.message}`);
      continue;
    }
    done++;
    console.log(`  -> 교체됨. 소재: ${draft.topic} / 훅: ${draft.hookFormat} / 파트 ${1 + draft.replyChain.length}개`);
  }
  console.log(`\n완료: ${ACCOUNT_LABEL} - ${done}/${targets.length}건 교체.`);
}

main().catch((err) => {
  console.error("실패:", err);
  process.exit(1);
});
