// 블로그 첫 화면 채용 게시판(board/jobs.json) 갱신(jobs-board.yml)을 정시에 깨운다.
// 2026-11-10: jobs-board.yml의 GitHub 자체 schedule이 3~10시간씩 밀리거나 빠졌다(11/9~10 실측,
// 11/10 오전 두 번은 10:50 KST까지 실행 안 됨). 그래서 Cloudflare 워커가 15분마다 정확히 깨우는
// publish-scheduled.yml 안에서 KST 슬롯을 보고 jobs-board.yml을 workflow_dispatch로 실행한다.
// 워커(사주 게시와 공유)는 바꾸지 않는다. 게시는 하지 않고 게시판 갱신 실행만 요청한다.
//
// 슬롯마다 한 번만 깨운다: 슬롯 시작 이후 jobs-board 실행이 진행 중이거나 성공했으면 건너뛰고,
// 실패만 있으면 다음 15분 틱에 다시 깨운다(슬롯당 최대 MAX_ATTEMPTS번). 취소된 실행은 세지 않는다.
const WORKFLOW = 'jobs-board.yml';
const SLOTS_KST = ['06:40', '08:00', '17:00']; // 아침, 블로그 08:00·17:00 공개 직후
const WINDOW_MIN = 120; // 슬롯 시작부터 이 시간 안에서만 깨운다(다음 슬롯 시작 전까지)
const MAX_ATTEMPTS = 2;
const KST = 9 * 3600000;
const toMin = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const fmtKst = ms => new Date(ms + KST).toISOString().slice(0, 16).replace('T', ' ') + ' KST';

// 지금이 어느 슬롯 창 안인지. 창 밖이면 null.
function currentSlot(nowMs) {
  const k = new Date(nowMs + KST);
  const minOfDay = k.getUTCHours() * 60 + k.getUTCMinutes();
  const dayStartMs = Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate()) - KST;
  const starts = SLOTS_KST.map(toMin);
  for (let i = starts.length - 1; i >= 0; i--) {
    const end = Math.min(starts[i] + WINDOW_MIN, starts[i + 1] ?? Infinity);
    if (minOfDay >= starts[i] && minOfDay < end) return { label: SLOTS_KST[i], startMs: dayStartMs + starts[i] * 60000 };
  }
  return null;
}

// runs: GitHub API workflow_runs 항목(created_at, status, conclusion)
function decide(nowMs, runs) {
  const slot = currentSlot(nowMs);
  if (!slot) return { dispatch: false, slot: null, reason: '슬롯 밖' };
  const since = (runs || []).filter(r => Date.parse(r.created_at) >= slot.startMs && !['cancelled', 'skipped'].includes(r.conclusion));
  if (since.some(r => r.status !== 'completed')) return { dispatch: false, slot, reason: '이번 슬롯 실행이 진행 중' };
  if (since.some(r => r.conclusion === 'success')) return { dispatch: false, slot, reason: '이번 슬롯에 이미 갱신됨' };
  if (since.length >= MAX_ATTEMPTS) return { dispatch: false, slot, reason: `이번 슬롯에 ${since.length}번 실패해 다음 슬롯까지 기다림` };
  return { dispatch: true, slot, reason: since.length ? `재시도(앞선 실패 ${since.length}번)` : '이번 슬롯 첫 실행' };
}

async function run({ env = process.env, fetcher = fetch, now = Date.now } = {}) {
  const nowMs = now();
  if (!currentSlot(nowMs)) {
    console.log(`[게시판 깨우기] ${fmtKst(nowMs)} 슬롯(${SLOTS_KST.join('·')} KST) 밖이라 건너뜀`);
    return { dispatch: false, slot: null, reason: '슬롯 밖' };
  }
  if (!env.GITHUB_TOKEN || !/^[\w.-]+\/[\w.-]+$/.test(env.GITHUB_REPO || '')) throw new Error('GitHub 설정이 없습니다.');
  const api = `https://api.github.com/repos/${env.GITHUB_REPO}/actions/workflows/${WORKFLOW}`;
  const headers = { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'hirecurator-board-trigger' };
  const list = await fetcher(`${api}/runs?per_page=20`, { headers, signal: AbortSignal.timeout(20000) });
  if (!list.ok) throw new Error(`게시판 실행 목록 읽기 실패 (HTTP ${list.status})`);
  const d = decide(nowMs, (await list.json()).workflow_runs);
  console.log(`[게시판 깨우기] ${fmtKst(nowMs)} 슬롯 ${d.slot.label}: ${d.reason}`);
  if (!d.dispatch) return d;
  // slot을 넘겨서 jobs-board.yml의 뒤 단계(예: 블로그 공개 직후 구글 색인 알림)가 어느 슬롯 실행인지 알 수 있게 한다.
  const res = await fetcher(`${api}/dispatches`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: 'main', inputs: { slot: d.slot.label } }), signal: AbortSignal.timeout(20000) });
  if (res.status !== 204) throw new Error(`게시판 갱신 실행 요청 실패 (HTTP ${res.status})`);
  console.log(`[게시판 깨우기] ${WORKFLOW} 실행 요청 완료`);
  return d;
}

if (require.main === module) run().catch(e => { console.error('게시판 깨우기 실패:', e.message); process.exitCode = 1; });
module.exports = { WORKFLOW, SLOTS_KST, WINDOW_MIN, MAX_ATTEMPTS, currentSlot, decide, run };
