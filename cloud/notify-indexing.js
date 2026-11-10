'use strict';
// 블로그에 새로 공개된 글을 구글 Indexing API(URL_UPDATED)로 알린다. 클라우드(GitHub Actions)에서 돈다.
// 구글 정책상 Indexing API는 채용공고(JobPosting) 페이지에만 쓴다. 그래서 글 HTML에 JobPosting
// 구조화 데이터가 있고 접수 마감(validThrough)이 지나지 않은 글만 알린다. 첫 화면 같은 다른 페이지는 알리지 않는다.
// 이미 알린 글인지는 구글 Indexing API의 알림 기록(urlNotifications/metadata)으로 확인한다. 따로 저장하는 파일이 없다.
//
// 사용: GOOGLE_INDEXING_SA='<서비스 계정 JSON 전체>' node notify-indexing.js [--dry-run]
//   비밀값이 없으면 아무것도 하지 않고 정상 종료한다(설정 전에도 작업이 실패로 뜨지 않게).
//   --dry-run은 구글 인증·조회·알림 없이 알릴 후보만 보여 준다.
// 비밀값·토큰은 출력하지 않는다.
const crypto = require('crypto');

const BLOG = 'https://hirecurator.blogspot.com/';
const FEED = `${BLOG}feeds/posts/default?alt=json&max-results=50`;
const SCOPE = 'https://www.googleapis.com/auth/indexing';
const ENDPOINT = 'https://indexing.googleapis.com/v3/urlNotifications:publish';
const METADATA = 'https://indexing.googleapis.com/v3/urlNotifications/metadata';
const TOKEN_URI = 'https://oauth2.googleapis.com/token';
const MAX_PER_RUN = 10;      // 한 번에 보는 최대 글 수(구글 기본 한도는 하루 알림 200건)
const LOOKBACK_DAYS = 14;    // 공개된 지 이 기간 안의 글만 본다

const b64url = b => Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

function jwt(sa, now) {
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const iat = Math.floor(now / 1000);
  const body = b64url(JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: TOKEN_URI, iat, exp: iat + 3600 }));
  const sig = crypto.createSign('RSA-SHA256').update(`${head}.${body}`).sign(sa.private_key);
  return `${head}.${body}.${b64url(sig)}`;
}

async function accessToken(sa, fetcher, now) {
  const res = await fetcher(TOKEN_URI, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt(sa, now) }).toString(),
  });
  if (!res.ok) throw new Error(`구글 인증 실패 HTTP ${res.status}`);
  const token = (await res.json()).access_token;
  if (!token) throw new Error('구글 인증 응답에 토큰 없음');
  return token;
}

const unescapeHtml = s => s.replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&amp;/g, '&');

// 글 HTML에서 JobPosting JSON-LD를 찾아 돌려준다(없으면 null).
function findJobPosting(html) {
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let data = null;
    for (const text of [m[1], unescapeHtml(m[1])]) { try { data = JSON.parse(text); break; } catch { /* 다음 */ } }
    if (!data) continue;
    for (const d of [].concat(data, data['@graph'] || [])) if (d && d['@type'] === 'JobPosting') return d;
  }
  return null;
}

async function run({ sa, fetcher = fetch, now = Date.now(), dryRun = false }) {
  const feed = await fetcher(FEED);
  if (!feed.ok) throw new Error(`블로그 글 목록 HTTP ${feed.status}`);
  const entries = ((await feed.json()).feed?.entry || []).map(e => ({
    url: (e.link || []).find(l => l.rel === 'alternate')?.href || '',
    published: Date.parse(e.published?.$t),
  }));
  const due = entries
    .filter(e => e.url.startsWith(BLOG) && e.published <= now && now - e.published < LOOKBACK_DAYS * 864e5)
    .sort((a, b) => b.published - a.published)
    .slice(0, MAX_PER_RUN);
  const results = [];
  let token = null;
  for (const e of due) {
    const page = await fetcher(e.url);
    if (!page.ok) { results.push({ url: e.url, skipped: `글 HTTP ${page.status}` }); continue; }
    const jp = findJobPosting(await page.text());
    if (!jp) { results.push({ url: e.url, skipped: 'JobPosting 구조화 데이터 없음' }); continue; }
    if (!(Date.parse(jp.validThrough) > now)) { results.push({ url: e.url, skipped: '접수 마감 지남' }); continue; }
    if (dryRun) { results.push({ url: e.url, wouldNotify: true }); continue; }
    token ||= await accessToken(sa, fetcher, now);
    const auth = { Authorization: `Bearer ${token}` };
    const meta = await fetcher(`${METADATA}?url=${encodeURIComponent(e.url)}`, { headers: auth });
    if (meta.ok && (await meta.json()).latestUpdate) { results.push({ url: e.url, skipped: '이미 알림' }); continue; }
    if (!meta.ok && meta.status !== 404) {
      results.push({ url: e.url, error: `알림 기록 조회 HTTP ${meta.status}` });
      if ([401, 403, 429].includes(meta.status)) break;
      continue;
    }
    const res = await fetcher(ENDPOINT, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: e.url, type: 'URL_UPDATED' }),
    });
    if (!res.ok) {
      results.push({ url: e.url, error: `알림 HTTP ${res.status}` });
      if ([401, 403, 429].includes(res.status)) break; // 권한·한도 문제는 같은 실행에서 더 시도하지 않는다
      continue;
    }
    results.push({ url: e.url, notified: true });
  }
  return { results };
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const raw = process.env.GOOGLE_INDEXING_SA || '';
  if (!raw.trim() && !dryRun) { console.log('구글 색인 알림: 비밀값 GOOGLE_INDEXING_SA가 없어 건너뜀'); return; }
  const sa = raw.trim() ? JSON.parse(raw) : null;
  const { results } = await run({ sa, dryRun });
  for (const r of results) console.log(`구글 색인 알림: ${r.url} → ${r.notified ? '알림 완료' : r.wouldNotify ? '알릴 대상(시험 실행)' : r.skipped || r.error}`);
  if (!results.length) console.log('구글 색인 알림: 최근 14일 안에 공개된 글 없음');
  if (results.some(r => r.error)) process.exitCode = 1;
}

if (require.main === module) main().catch(e => { console.error(`구글 색인 알림 실패: ${e.message}`); process.exit(1); });
module.exports = { run, findJobPosting, jwt, BLOG, ENDPOINT, METADATA, TOKEN_URI };
