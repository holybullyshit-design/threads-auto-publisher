// 채용 큐레이터 블로그 첫 화면 게시판용 공고 목록(board/jobs.json)을 잡알리오 공식 API로 만든다.
// 2026-11-06 사용자 지시: 블로그 첫 화면을 채용공고 게시판으로 바꾼다. 게시는 하지 않고 공개 목록 파일만 갱신한다.
const BASE = 'https://apis.data.go.kr/1051000/recruitment/list';
const PATH = 'board/jobs.json';
const MIN_JOBS = 50; // 이보다 적으면 API 이상으로 보고 기존 파일을 덮어쓰지 않는다
const MAX_PAGES = 20;
const kstToday = (now = new Date()) => new Date(now.getTime() + 9 * 3600000).toISOString().slice(0, 10).replace(/-/g, '');

async function fetchPage(key, pageNo, fetcher = fetch) {
  const url = new URL(BASE);
  url.search = new URLSearchParams({ serviceKey: decodeURIComponent(key.trim()), resultType: 'json', pageNo: String(pageNo), numOfRows: '100', ongoingYn: 'Y' }).toString();
  const r = await fetcher(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`잡알리오 목록 HTTP ${r.status}`);
  let data;
  try { data = JSON.parse(await r.text()); } catch { throw new Error('잡알리오 목록이 JSON이 아님(인증키·한도 확인)'); }
  if (!['0', '00', '200'].includes(String(data.resultCode))) throw new Error(`잡알리오 목록 거부 (code=${data.resultCode})`);
  if (!Array.isArray(data.result)) throw new Error('잡알리오 목록 형식 오류');
  return { total: Number(data.totalCount) || 0, rows: data.result.map(x => x.item || x) };
}

async function fetchAll(key, fetcher = fetch) {
  const seen = new Map();
  let total = Infinity;
  for (let page = 1; page <= MAX_PAGES && seen.size < total; page++) {
    const { total: t, rows } = await fetchPage(key, page, fetcher);
    total = t;
    if (!rows.length) break;
    for (const r of rows) if (r.recrutPblntSn != null) seen.set(String(r.recrutPblntSn), r);
  }
  return [...seen.values()];
}

function compact(r) {
  return {
    id: Number(r.recrutPblntSn), org: String(r.instNm || '').trim(), title: String(r.recrutPbancTtl || '').trim(),
    type: String(r.hireTypeNmLst || '').replace(/청년인턴\(체험형\)/g, '체험형 인턴').replace(/청년인턴\(채용형\)/g, '채용형 인턴'),
    n: Number(r.recrutNope) || 0, rgn: String(r.workRgnNmLst || '').replace(/전남광주/g, '광주·전남'), career: r.recrutSeNm || '',
    edu: r.acbgCondNmLst || '', start: String(r.pbancBgngYmd || ''), end: String(r.pbancEndYmd || ''), sub: r.replmprYn === 'Y',
  };
}

function buildBoard(records, now = new Date()) {
  const today = kstToday(now);
  const jobs = records.map(compact).filter(j => j.id && j.org && j.title && /^\d{8}$/.test(j.end) && j.end >= today)
    .sort((a, b) => a.end.localeCompare(b.end) || a.id - b.id);
  return { updatedAt: now.toISOString(), source: '잡알리오 공공기관 채용정보 오픈API', count: jobs.length, jobs };
}

async function writeBoard(board, { token, repo, fetcher = fetch }) {
  const api = `https://api.github.com/repos/${repo}/contents/${PATH}`;
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  for (let attempt = 0; attempt < 4; attempt++) {
    const cur = await fetcher(`${api}?ref=main`, { headers });
    if (!cur.ok && cur.status !== 404) throw new Error(`게시판 파일 읽기 실패 (HTTP ${cur.status})`);
    const sha = cur.ok ? (await cur.json()).sha : undefined;
    const body = JSON.stringify({ message: `chore: refresh jobs board (${board.count}) [skip ci]`, sha, content: Buffer.from(JSON.stringify(board)).toString('base64') });
    const put = await fetcher(api, { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' }, body });
    if (put.ok) return;
    if (put.status !== 409 && put.status !== 422) throw new Error(`게시판 파일 저장 실패 (HTTP ${put.status})`);
  }
  throw new Error('게시판 파일 동시 변경으로 중단했습니다.');
}

async function run({ env = process.env, fetcher = fetch, now = () => new Date() } = {}) {
  if (!env.ALIO_SERVICE_KEY) throw new Error('ALIO_SERVICE_KEY 시크릿이 없습니다.');
  if (!env.GITHUB_TOKEN || !/^[\w.-]+\/[\w.-]+$/.test(env.GITHUB_REPO || '')) throw new Error('GitHub 설정이 없습니다.');
  const board = buildBoard(await fetchAll(env.ALIO_SERVICE_KEY, fetcher), now());
  if (board.count < MIN_JOBS) throw new Error(`진행 중 공고가 ${board.count}건뿐이라 기존 게시판을 유지합니다.`);
  await writeBoard(board, { token: env.GITHUB_TOKEN, repo: env.GITHUB_REPO, fetcher });
  console.log(`[게시판 갱신] 진행 중 ${board.count}건`);
  return board;
}

if (require.main === module) run().catch(e => { console.error('게시판 갱신 실패:', e.message); process.exitCode = 1; });
module.exports = { PATH, MIN_JOBS, kstToday, fetchAll, compact, buildBoard, writeBoard, run };
