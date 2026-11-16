'use strict';
// 블로그 3개의 구글 색인 상태를 서치 콘솔 API로 하루 한 번 점검하고, 사이트맵을 하루 한 번 다시 제출한다.
// 클라우드(GitHub Actions jobs-board.yml)에서 돌기 때문에 Claude가 꺼져 있어도 된다(2026-11-16 사용자 지시
// "클로드가 꺼져있는 상태에서도 자동으로 색인을 해줘").
//
// - 서치 콘솔의 '색인 생성 요청' 버튼은 공식 API가 없다. 여기서는 공식 API로 할 수 있는 것만 한다:
//   사이트맵 다시 제출(sitemaps.submit)과 URL 검사(urlInspection.index.inspect, 읽기 전용).
// - 결과는 저장소 board/index-status.json에 남긴다. 블로그별 합계(색인됨·리디렉션 오류·구글이 모름·발견됨 등)와
//   주소별 상태다. 애드센스 다시 신청 기준('색인 생성됨' 15편 이상)을 이 파일로 확인한다.
// - 같은 주소는 20시간 안에 다시 검사하지 않고, 사이트맵도 20시간에 한 번만 제출한다. 그래서 하루 세 번 도는
//   게시판 실행 어디에 붙여도 하루 한 번만 일한다.
// - 서비스 계정은 세 블로그 서치 콘솔 속성의 소유자다(2026-11-15). 비밀값이 없으면 아무것도 하지 않는다.
// 사용: GOOGLE_INDEXING_SA='<서비스 계정 JSON>' GITHUB_TOKEN=… GITHUB_REPO=owner/repo node search-console-status.js [--dry-run]
// 비밀값·토큰은 출력하지 않는다.
const crypto = require('crypto');
const { BLOGS } = require('./notify-indexing');

const SCOPE = 'https://www.googleapis.com/auth/webmasters';
const TOKEN_URI = 'https://oauth2.googleapis.com/token';
const INSPECT = 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect';
const SITEMAPS = site => `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/sitemaps/${encodeURIComponent(site + 'sitemap.xml')}`;
const STATUS_PATH = 'board/index-status.json';
const RECHECK_HOURS = 20;
const MAX_PER_BLOG = 150;   // URL 검사 한도는 속성마다 하루 2,000건이다. 블로그 하나에 글이 150편을 넘으면 다음 날로 넘긴다.

const b64url = b => Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
function jwt(sa, now) {
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const iat = Math.floor(now / 1000);
  const body = b64url(JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: TOKEN_URI, iat, exp: iat + 3600 }));
  return `${head}.${body}.${b64url(crypto.createSign('RSA-SHA256').update(`${head}.${body}`).sign(sa.private_key))}`;
}
async function accessToken(sa, fetcher, now) {
  const res = await fetcher(TOKEN_URI, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt(sa, now) }).toString() });
  if (!res.ok) throw new Error(`구글 인증 실패 HTTP ${res.status}`);
  const token = (await res.json()).access_token;
  if (!token) throw new Error('구글 인증 응답에 토큰 없음');
  return token;
}

// 서치 콘솔 결과를 다섯 갈래로 나눈다. verdict PASS가 '색인 생성됨'이다.
function categorize(r) {
  if (!r || r.error) return 'error';
  if (r.verdict === 'PASS') return 'indexed';
  if (r.fetch === 'REDIRECT_ERROR') return 'redirectError';
  if (/unknown to Google/i.test(r.coverage || '')) return 'unknown';
  if (/^Discovered/i.test(r.coverage || '')) return 'discovered';
  if (/^Crawled/i.test(r.coverage || '')) return 'crawledNotIndexed';
  return 'other';
}
function summarize(urls) {
  const s = { total: 0, indexed: 0, redirectError: 0, unknown: 0, discovered: 0, crawledNotIndexed: 0, other: 0, error: 0 };
  for (const r of Object.values(urls)) { s.total++; s[categorize(r)]++; }
  return s;
}

// 블로그의 첫 화면·정적 페이지·공개 글 주소. 다른 사이트 주소는 넣지 않는다.
async function blogUrls(blog, fetcher) {
  const out = [blog];
  for (const kind of ['pages', 'posts']) {
    const r = await fetcher(`${blog}feeds/${kind}/default?alt=json&max-results=${MAX_PER_BLOG}`);
    if (!r.ok) throw new Error(`${kind} 피드 HTTP ${r.status}`);
    for (const e of ((await r.json()).feed?.entry || [])) {
      const u = (e.link || []).find(l => l.rel === 'alternate')?.href || '';
      if (u.startsWith(blog) && !out.includes(u)) out.push(u);
    }
  }
  return out.slice(0, MAX_PER_BLOG + 10);
}

async function run({ sa, fetcher = fetch, now = Date.now(), status = {}, blogs = BLOGS, dryRun = false, sleep = ms => new Promise(r => setTimeout(r, ms)) }) {
  status.blogs ||= {};
  const lines = [];
  let token = null, changed = false, stopAll = false;
  const fresh = at => at && now - Date.parse(at) < RECHECK_HOURS * 3600e3;
  for (const blog of blogs) {
    if (stopAll) break;
    const b = status.blogs[blog] ||= { urls: {} };
    let urls;
    try { urls = await blogUrls(blog, fetcher); } catch (e) { lines.push(`${blog} → 글 목록 실패: ${e.message}`); continue; }
    const due = urls.filter(u => !fresh(b.urls[u]?.checkedAt));
    if (dryRun) { lines.push(`${blog} → 검사할 주소 ${due.length}/${urls.length}${fresh(b.sitemapSubmittedAt) ? '' : ' · 사이트맵 제출 예정'}`); continue; }
    if (!due.length && fresh(b.sitemapSubmittedAt)) { lines.push(`${blog} → 20시간 안에 이미 점검함`); continue; }
    token ||= await accessToken(sa, fetcher, now);
    const auth = { Authorization: `Bearer ${token}` };
    if (!fresh(b.sitemapSubmittedAt)) {
      const r = await fetcher(SITEMAPS(blog), { method: 'PUT', headers: auth });
      if (r.ok) { b.sitemapSubmittedAt = new Date(now).toISOString(); changed = true; lines.push(`${blog} → 사이트맵 다시 제출`); }
      else lines.push(`${blog} → 사이트맵 제출 HTTP ${r.status}`);
    }
    for (const u of due) {
      const r = await fetcher(INSPECT, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ inspectionUrl: u, siteUrl: blog }) });
      if (!r.ok) {
        lines.push(`${u} → URL 검사 HTTP ${r.status}`);
        if (r.status === 429 || r.status === 401) { stopAll = true; break; } // 한도·인증 문제는 이번 실행을 멈춘다
        if (r.status === 403) break; // 그 블로그 소유권 문제: 그 블로그만 멈춘다
        continue;
      }
      const s = (await r.json()).inspectionResult?.indexStatusResult || {};
      b.urls[u] = { verdict: s.verdict || '', coverage: s.coverageState || '', fetch: s.pageFetchState || '', lastCrawl: s.lastCrawlTime || '', checkedAt: new Date(now).toISOString() };
      changed = true;
      await sleep(250);
    }
    // 피드에서 사라진 주소(지운 글)는 합계에서 뺀다
    for (const u of Object.keys(b.urls)) if (!urls.includes(u)) { delete b.urls[u]; changed = true; }
    b.summary = summarize(b.urls);
    const s = b.summary;
    lines.push(`${blog} → 색인됨 ${s.indexed}/${s.total} · 리디렉션 오류 ${s.redirectError} · 구글이 모름 ${s.unknown} · 발견됨 ${s.discovered} · 크롤링됨(미색인) ${s.crawledNotIndexed} · 기타 ${s.other}`);
  }
  if (changed) status.updatedAt = new Date(now).toISOString();
  return { status, changed, lines };
}

async function readStatus({ token, repo, fetcher = fetch }) {
  const r = await fetcher(`https://api.github.com/repos/${repo}/contents/${STATUS_PATH}?ref=main`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.raw+json', 'X-GitHub-Api-Version': '2022-11-28' } });
  if (r.status === 404) return {};
  if (!r.ok) throw new Error(`색인 상태 파일 읽기 실패 (HTTP ${r.status})`);
  return JSON.parse(await r.text());
}
async function writeStatus(status, { token, repo, fetcher = fetch }) {
  const api = `https://api.github.com/repos/${repo}/contents/${STATUS_PATH}`;
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  for (let attempt = 0; attempt < 4; attempt++) {
    const cur = await fetcher(`${api}?ref=main`, { headers });
    if (!cur.ok && cur.status !== 404) throw new Error(`색인 상태 파일 읽기 실패 (HTTP ${cur.status})`);
    const sha = cur.ok ? (await cur.json()).sha : undefined;
    const put = await fetcher(api, { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'chore: update Google index status [skip ci]', sha, content: Buffer.from(JSON.stringify(status, null, 1) + '\n').toString('base64') }) });
    if (put.ok) return;
    if (put.status !== 409 && put.status !== 422) throw new Error(`색인 상태 파일 저장 실패 (HTTP ${put.status})`);
  }
  throw new Error('색인 상태 파일 동시 변경으로 중단했습니다.');
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const raw = process.env.GOOGLE_INDEXING_SA || '';
  if (!raw.trim() && !dryRun) { console.log('서치 콘솔 상태: 비밀값 GOOGLE_INDEXING_SA가 없어 건너뜀'); return; }
  const gh = process.env.GITHUB_TOKEN && /^[\w.-]+\/[\w.-]+$/.test(process.env.GITHUB_REPO || '') ? { token: process.env.GITHUB_TOKEN, repo: process.env.GITHUB_REPO } : null;
  const status = gh ? await readStatus(gh) : {};
  const { changed, lines } = await run({ sa: raw.trim() ? JSON.parse(raw) : null, status, dryRun });
  for (const l of lines) console.log(`서치 콘솔 상태: ${l}`);
  if (changed && !dryRun && gh) { await writeStatus(status, gh); console.log(`서치 콘솔 상태: ${STATUS_PATH} 저장`); }
  if (lines.some(l => / HTTP \d|실패/.test(l))) process.exitCode = 1;
}

if (require.main === module) main().catch(e => { console.error(`서치 콘솔 상태 실패: ${e.message}`); process.exit(1); });
module.exports = { run, categorize, summarize, readStatus, writeStatus, STATUS_PATH, INSPECT, SITEMAPS, TOKEN_URI, RECHECK_HOURS };
