// 채용 큐레이터 블로그 첫 화면 게시판용 공고 목록(board/jobs.json)을 공식 출처에서 만든다.
// 2026-11-06 사용자 지시: 블로그 첫 화면을 채용공고 게시판으로 바꾸고, 잡알리오 밖 공고(나라일터)도 넣는다.
// 클린아이 잡플러스는 robots.txt가 전체 수집을 막아(Disallow: /) 넣지 않는다. 게시는 하지 않고 공개 목록 파일만 갱신한다.
const ALIO = 'https://apis.data.go.kr/1051000/recruitment/list';
const GOJOBS = 'https://www.gojobs.go.kr/apmList.do';
const PATH = 'board/jobs.json';
const MIN_JOBS = 50; // 전체가 이보다 적으면 이상으로 보고 기존 파일을 덮어쓰지 않는다
const MIN_BY_SOURCE = { alio: 50, gojobs: 20 }; // 출처별로 이보다 적으면 그 출처는 직전 목록을 유지한다
const MAX_PAGES = { alio: 20, gojobs: 60 };
const UA = 'Mozilla/5.0 (compatible; hirecurator-board/1.0; +https://hirecurator.blogspot.com/)';
const kstToday = (now = new Date()) => new Date(now.getTime() + 9 * 3600000).toISOString().slice(0, 10).replace(/-/g, '');
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchPage(key, pageNo, fetcher = fetch) {
  const url = new URL(ALIO);
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
  for (let page = 1; page <= MAX_PAGES.alio && seen.size < total; page++) {
    const { total: t, rows } = await fetchPage(key, page, fetcher);
    total = t;
    if (!rows.length) break;
    for (const r of rows) if (r.recrutPblntSn != null) seen.set(String(r.recrutPblntSn), r);
  }
  return [...seen.values()];
}

function compact(r) {
  return {
    id: Number(r.recrutPblntSn), src: 'alio', org: String(r.instNm || '').trim(), title: String(r.recrutPbancTtl || '').trim(),
    type: String(r.hireTypeNmLst || '').replace(/청년인턴\(체험형\)/g, '체험형 인턴').replace(/청년인턴\(채용형\)/g, '채용형 인턴'),
    n: Number(r.recrutNope) || 0, rgn: String(r.workRgnNmLst || '').replace(/전남광주/g, '광주·전남'), career: r.recrutSeNm || '',
    edu: r.acbgCondNmLst || '', start: String(r.pbancBgngYmd || ''), end: String(r.pbancEndYmd || ''), sub: r.replmprYn === 'Y',
  };
}

// 나라일터 '일반채용 > 모집공고' 중 공무직 등 채용(e04). 합격자·결과 발표 글은 모집공고가 아니므로 뺀다.
const NOT_RECRUIT = /합격자|결과|발표|채용\s*취소|모집\s*취소/;
// 나라일터 목록에는 근무지 칸이 없다. 기관명·공고명에 시·도 이름이 있으면 그것만 쓰고, 없으면 비워 둔다(추정하지 않음).
const REGIONS = [['서울', '서울'], ['부산', '부산'], ['대구', '대구'], ['인천', '인천'], ['광주', '광주·전남'], ['대전', '대전'], ['울산', '울산'], ['세종', '세종'], ['경기', '경기'], ['강원', '강원'],
  ['충청북', '충북'], ['충북', '충북'], ['충청남', '충남'], ['충남', '충남'], ['전라북', '전북'], ['전북', '전북'], ['전라남', '광주·전남'], ['전남', '광주·전남'], ['경상북', '경북'], ['경북', '경북'], ['경상남', '경남'], ['경남', '경남'], ['제주', '제주']];
// 기관명은 '상급기관 하급기관' 순이라 맨 뒤 지명이 근무지에 가깝다(예: 대구지방교정청 경북북부제3교도소 → 경북).
const hits = text => REGIONS.map(([k, v]) => [text.lastIndexOf(k), v]).filter(([i]) => i >= 0).sort((a, b) => b[0] - a[0]);
const regionOf = (org, title = '') => (hits(org)[0] || hits(title).reverse()[0] || [0, ''])[1];
const strip = s => String(s).replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
function parseGojobs(html) {
  const out = [];
  const re = /alt="([^"]*)"[^>]*\/?>\s*<\/div>\s*<a[^>]*href="javascript:fn_apmView\('(\d+)',\s*'(\d+)'\)"[^>]*>([\s\S]*?)<\/a>\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>\s*([\d-]{10})[\s\S]*?<\/td>\s*<td[^>]*>\s*([\d-]{10})\s*<\/td>/g;
  for (let m; (m = re.exec(html));) {
    out.push({ kind: strip(m[1]), code: m[2], id: m[3], title: strip(m[4]), org: strip(m[5]), start: m[6].replace(/-/g, ''), end: m[7].replace(/-/g, '') });
  }
  const pages = [...html.matchAll(/fn_egov_link_page\((\d+)\)/g)].map(x => Number(x[1]));
  return { rows: out, last: pages.length ? Math.max(...pages) : 1 };
}
async function fetchGojobs(now = new Date(), fetcher = fetch, delayMs = 400) {
  const today = kstToday(now), until = kstToday(new Date(now.getTime() + 180 * 864e5));
  const body = page => new URLSearchParams({ menuNo: '401', selMenuNo: '400', mngrMenuYn: 'N', pageIndex: String(page), searchSdate: today, searchEdate: until, searchOrdr: '2', searchListEmpmnsecode: 'e04' }).toString();
  const seen = new Map();
  let last = 1;
  for (let page = 1; page <= Math.min(last, MAX_PAGES.gojobs); page++) {
    if (page > 1) await sleep(delayMs);
    const r = await fetcher(GOJOBS, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA }, body: body(page), signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error(`나라일터 목록 HTTP ${r.status}`);
    const { rows, last: l } = parseGojobs(await r.text());
    if (page === 1) last = l;
    if (!rows.length) break;
    for (const x of rows) seen.set(x.id, x);
  }
  return [...seen.values()].filter(x => !NOT_RECRUIT.test(x.title)).map(x => ({
    id: Number(x.id), src: 'gojobs', org: x.org, title: x.title, type: '공무직', n: 0, rgn: regionOf(x.org, x.title), career: '', edu: '', start: x.start, end: x.end, sub: false,
    url: `https://www.gojobs.go.kr/apmView.do?empmnsn=${x.id}`, kind: x.kind,
  }));
}

function buildBoard(records, now = new Date()) {
  const today = kstToday(now);
  const jobs = records.map(r => (r.src ? r : compact(r))).filter(j => j.id && j.org && j.title && /^\d{8}$/.test(j.end) && j.end >= today)
    .sort((a, b) => a.end.localeCompare(b.end) || a.id - b.id);
  return { updatedAt: now.toISOString(), source: '잡알리오·나라일터 공식 공개 정보', count: jobs.length, jobs };
}

async function readBoard({ token, repo, fetcher = fetch }) {
  const r = await fetcher(`https://api.github.com/repos/${repo}/contents/${PATH}?ref=main`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.raw+json', 'X-GitHub-Api-Version': '2022-11-28' } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`게시판 파일 읽기 실패 (HTTP ${r.status})`);
  try { return JSON.parse(await r.text()); } catch { return null; }
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

// 출처마다 따로 받는다. 한 출처가 실패하거나 너무 적으면 그 출처만 직전 게시판의 항목을 그대로 쓴다.
async function collect({ env, fetcher, now, previous, gojobsDelayMs }) {
  const prevOf = src => (previous?.jobs || []).filter(j => (j.src || 'alio') === src).map(j => ({ ...j, src }));
  const tasks = {
    alio: async () => { if (!env.ALIO_SERVICE_KEY) throw new Error('ALIO_SERVICE_KEY 시크릿 없음'); return (await fetchAll(env.ALIO_SERVICE_KEY, fetcher)).map(compact); },
    gojobs: () => fetchGojobs(now, fetcher, gojobsDelayMs),
  };
  const items = [], status = {};
  for (const [src, task] of Object.entries(tasks)) {
    try {
      const got = await task();
      if (got.length < MIN_BY_SOURCE[src]) throw new Error(`${got.length}건뿐`);
      items.push(...got); status[src] = { ok: true, count: got.length };
    } catch (e) {
      const keep = prevOf(src);
      items.push(...keep); status[src] = { ok: false, kept: keep.length, error: e.message };
    }
  }
  return { items, status };
}

async function run({ env = process.env, fetcher = fetch, now = () => new Date(), gojobsDelayMs = 400 } = {}) {
  if (!env.GITHUB_TOKEN || !/^[\w.-]+\/[\w.-]+$/.test(env.GITHUB_REPO || '')) throw new Error('GitHub 설정이 없습니다.');
  const gh = { token: env.GITHUB_TOKEN, repo: env.GITHUB_REPO, fetcher };
  const previous = await readBoard(gh).catch(() => null);
  const { items, status } = await collect({ env, fetcher, now: now(), previous, gojobsDelayMs });
  const board = { ...buildBoard(items, now()), sources: status };
  for (const [src, s] of Object.entries(status)) console.log(s.ok ? `[게시판] ${src} ${s.count}건` : `[게시판] ${src} 실패(${s.error}) → 직전 목록 ${s.kept}건 유지`);
  if (board.count < MIN_JOBS) throw new Error(`진행 중 공고가 ${board.count}건뿐이라 기존 게시판을 유지합니다.`);
  if (!Object.values(status).some(s => s.ok)) throw new Error('모든 출처를 받지 못해 기존 게시판을 유지합니다.');
  await writeBoard(board, gh);
  console.log(`[게시판 갱신] 진행 중 ${board.count}건`);
  return board;
}

if (require.main === module) run().catch(e => { console.error('게시판 갱신 실패:', e.message); process.exitCode = 1; });
module.exports = { PATH, MIN_JOBS, kstToday, fetchAll, compact, parseGojobs, regionOf, NOT_RECRUIT, fetchGojobs, buildBoard, collect, writeBoard, run };
