'use strict';
// 실행: node --test test/searchConsoleStatus.test.js
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const { run, categorize, summarize, readStatus, writeStatus, STATUS_PATH, INSPECT, TOKEN_URI } = require('../cloud/search-console-status');

const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const SA = { client_email: 'bot@example.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) };
const NOW = Date.parse('2026-11-17T06:45:00+09:00');
const A = 'https://a.blogspot.com/', B = 'https://b.blogspot.com/';
const entry = u => ({ link: [{ rel: 'alternate', href: u }] });

// posts·pages: 블로그별 피드 주소 목록. results: 주소별 URL 검사 결과. codes: 주소별(또는 블로그별) 오류 코드.
function fakeGoogle({ posts = {}, pages = {}, results = {}, inspectStatus = {}, sitemapStatus = 200, feedStatus = {} }) {
  const calls = [];
  const fetcher = async (url, opts = {}) => {
    calls.push({ url, opts });
    const m = url.match(/^(https:\/\/[^/]+\/)feeds\/(posts|pages)\//);
    if (m) {
      if (feedStatus[m[1]]) return { ok: false, status: feedStatus[m[1]] };
      const list = (m[2] === 'posts' ? posts : pages)[m[1]] || [];
      return { ok: true, json: async () => ({ feed: { entry: list.map(entry) } }) };
    }
    if (url === TOKEN_URI) return { ok: true, json: async () => ({ access_token: 'tok' }) };
    if (url.includes('/webmasters/v3/sites/')) return { ok: sitemapStatus === 200, status: sitemapStatus };
    if (url === INSPECT) {
      const u = JSON.parse(opts.body).inspectionUrl;
      const code = inspectStatus[u] || inspectStatus[JSON.parse(opts.body).siteUrl];
      if (code) return { ok: false, status: code, json: async () => ({}) };
      return { ok: true, json: async () => ({ inspectionResult: { indexStatusResult: results[u] || { verdict: 'NEUTRAL', coverageState: 'URL is unknown to Google', pageFetchState: 'PAGE_FETCH_STATE_UNSPECIFIED' } } }) };
    }
    return { ok: false, status: 404 };
  };
  return { fetcher, calls };
}
const inspected = calls => calls.filter(c => c.url === INSPECT).map(c => JSON.parse(c.opts.body).inspectionUrl);
const noSleep = async () => {};

test('갈래 나누기: PASS는 색인됨, REDIRECT_ERROR는 리디렉션 오류, 나머지는 문구로 가른다', () => {
  assert.strictEqual(categorize({ verdict: 'PASS', coverage: 'Submitted and indexed' }), 'indexed');
  assert.strictEqual(categorize({ verdict: 'NEUTRAL', coverage: 'Redirect error', fetch: 'REDIRECT_ERROR' }), 'redirectError');
  assert.strictEqual(categorize({ verdict: 'NEUTRAL', coverage: 'URL is unknown to Google' }), 'unknown');
  assert.strictEqual(categorize({ verdict: 'NEUTRAL', coverage: 'Discovered - currently not indexed' }), 'discovered');
  assert.strictEqual(categorize({ verdict: 'NEUTRAL', coverage: 'Crawled - currently not indexed' }), 'crawledNotIndexed');
  assert.strictEqual(categorize({ verdict: 'FAIL', coverage: 'Excluded by noindex tag' }), 'other');
  assert.deepStrictEqual(summarize({ x: { verdict: 'PASS' }, y: { fetch: 'REDIRECT_ERROR' }, z: { verdict: 'PASS' } }),
    { total: 3, indexed: 2, redirectError: 1, unknown: 0, discovered: 0, crawledNotIndexed: 0, other: 0, error: 0 });
});

test('첫 화면·페이지·글을 모두 검사하고, 사이트맵을 다시 제출하고, 합계를 남긴다', async () => {
  const p1 = `${A}2026/11/p1.html`, p2 = `${A}2026/11/p2.html`, about = `${A}p/about.html`;
  const { fetcher, calls } = fakeGoogle({ posts: { [A]: [p1, p2, 'https://evil.example.com/x.html'] }, pages: { [A]: [about] },
    results: { [p1]: { verdict: 'PASS', coverageState: 'Submitted and indexed' }, [p2]: { verdict: 'NEUTRAL', coverageState: 'Redirect error', pageFetchState: 'REDIRECT_ERROR' } } });
  const { status, changed, lines } = await run({ sa: SA, fetcher, now: NOW, status: {}, blogs: [A], sleep: noSleep });
  assert.ok(changed);
  assert.deepStrictEqual(inspected(calls).sort(), [A, about, p1, p2].sort(), '다른 사이트 주소는 검사하지 않는다');
  assert.strictEqual(calls.filter(c => c.url.includes('/webmasters/v3/sites/') && c.opts.method === 'PUT').length, 1);
  const b = status.blogs[A];
  assert.strictEqual(b.sitemapSubmittedAt, new Date(NOW).toISOString());
  assert.deepStrictEqual([b.summary.total, b.summary.indexed, b.summary.redirectError, b.summary.unknown], [4, 1, 1, 2]);
  assert.match(lines.join('\n'), /색인됨 1\/4 · 리디렉션 오류 1/);
});

test('20시간 안에 검사한 주소와 제출한 사이트맵은 다시 하지 않는다(하루 세 번 돌아도 하루 한 번)', async () => {
  const p1 = `${A}2026/11/p1.html`, p2 = `${A}2026/11/p2.html`;
  const recent = new Date(NOW - 5 * 3600e3).toISOString(), old = new Date(NOW - 25 * 3600e3).toISOString();
  const status = { blogs: { [A]: { sitemapSubmittedAt: recent, urls: { [A]: { verdict: 'NEUTRAL', checkedAt: recent }, [p1]: { verdict: 'NEUTRAL', checkedAt: old } } } } };
  const { fetcher, calls } = fakeGoogle({ posts: { [A]: [p1, p2] } });
  await run({ sa: SA, fetcher, now: NOW, status, blogs: [A], sleep: noSleep });
  assert.deepStrictEqual(inspected(calls).sort(), [p1, p2].sort(), '오래된 주소와 새 주소만 검사한다');
  assert.ok(!calls.some(c => c.opts.method === 'PUT'), '사이트맵은 5시간 전에 냈으므로 다시 내지 않는다');
  const again = fakeGoogle({ posts: { [A]: [p1, p2] } });
  const second = await run({ sa: SA, fetcher: again.fetcher, now: NOW + 3600e3, status, blogs: [A], sleep: noSleep });
  assert.strictEqual(inspected(again.calls).length, 0);
  assert.ok(!again.calls.some(c => c.url === TOKEN_URI), '할 일이 없으면 구글 인증도 하지 않는다');
  assert.match(second.lines.join('\n'), /이미 점검함/);
});

test('지운 글은 합계에서 빠진다', async () => {
  const gone = `${A}2026/11/gone.html`, p1 = `${A}2026/11/p1.html`;
  const status = { blogs: { [A]: { urls: { [gone]: { verdict: 'PASS', checkedAt: new Date(NOW).toISOString() } } } } };
  const { fetcher } = fakeGoogle({ posts: { [A]: [p1] } });
  const { status: out } = await run({ sa: SA, fetcher, now: NOW, status, blogs: [A], sleep: noSleep });
  assert.ok(!out.blogs[A].urls[gone]);
  assert.strictEqual(out.blogs[A].summary.indexed, 0);
});

test('한 블로그가 소유권 오류(403)여도 다른 블로그는 검사하고, 한도 초과(429)면 그 실행을 멈춘다', async () => {
  const a1 = `${A}2026/11/a1.html`, b1 = `${B}2026/11/b1.html`;
  const first = fakeGoogle({ posts: { [A]: [a1], [B]: [b1] }, inspectStatus: { [A]: 403 } });
  const r1 = await run({ sa: SA, fetcher: first.fetcher, now: NOW, status: {}, blogs: [A, B], sleep: noSleep });
  assert.ok(inspected(first.calls).includes(b1), '403은 그 블로그만 멈춘다');
  assert.ok(!inspected(first.calls).includes(a1), '403이 난 블로그의 나머지 주소는 이번 실행에서 더 검사하지 않는다');
  assert.match(r1.lines.join('\n'), /URL 검사 HTTP 403/);
  const second = fakeGoogle({ posts: { [A]: [a1], [B]: [b1] }, inspectStatus: { [A]: 429 } });
  await run({ sa: SA, fetcher: second.fetcher, now: NOW, status: {}, blogs: [A, B], sleep: noSleep });
  assert.ok(!inspected(second.calls).includes(b1), '429는 전체를 멈춘다');
});

test('글 목록을 못 읽은 블로그는 건너뛰고, 상태 기록을 지우지 않는다', async () => {
  const keep = { [`${A}2026/11/p1.html`]: { verdict: 'PASS', checkedAt: new Date(NOW - 30 * 3600e3).toISOString() } };
  const status = { blogs: { [A]: { urls: { ...keep } } } };
  const { fetcher, calls } = fakeGoogle({ feedStatus: { [A]: 503 } });
  const { lines } = await run({ sa: SA, fetcher, now: NOW, status, blogs: [A], sleep: noSleep });
  assert.match(lines.join('\n'), /글 목록 실패/);
  assert.deepStrictEqual(status.blogs[A].urls, keep);
  assert.strictEqual(inspected(calls).length, 0);
});

test('시험 실행(dry-run)은 구글에 인증·검사·제출을 하지 않는다', async () => {
  const { fetcher, calls } = fakeGoogle({ posts: { [A]: [`${A}2026/11/p1.html`] } });
  const { changed, lines } = await run({ sa: null, fetcher, now: NOW, status: {}, blogs: [A], dryRun: true, sleep: noSleep });
  assert.strictEqual(changed, false);
  assert.ok(!calls.some(c => c.url === TOKEN_URI || c.url === INSPECT || c.opts.method === 'PUT'));
  assert.match(lines.join('\n'), /검사할 주소 2\/2 · 사이트맵 제출 예정/);
});

test('상태 파일: 없으면 빈 기록, 읽기 실패는 멈추고, 저장은 sha를 붙여 [skip ci]로 덮어쓴다', async () => {
  const gh = { token: 't', repo: 'o/r' };
  assert.deepStrictEqual(await readStatus({ ...gh, fetcher: async () => ({ ok: false, status: 404 }) }), {});
  await assert.rejects(readStatus({ ...gh, fetcher: async () => ({ ok: false, status: 500 }) }), /읽기 실패/);
  const puts = [];
  await writeStatus({ updatedAt: 'x' }, { ...gh, fetcher: async (url, opts = {}) => {
    if (opts.method === 'PUT') { puts.push({ url, body: JSON.parse(opts.body) }); return { ok: true, status: 200 }; }
    return { ok: true, status: 200, json: async () => ({ sha: 'abc' }) };
  } });
  assert.strictEqual(puts[0].url, `https://api.github.com/repos/o/r/contents/${STATUS_PATH}`);
  assert.strictEqual(puts[0].body.sha, 'abc');
  assert.match(puts[0].body.message, /\[skip ci\]/);
});
