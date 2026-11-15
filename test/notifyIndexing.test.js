'use strict';
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const { run, findJobPosting, jwt, readLog, writeLog, BLOG, BLOGS, ENDPOINT, METADATA, TOKEN_URI, LOG_PATH } = require('../cloud/notify-indexing');
const [, MASTERS, JOBSC] = BLOGS;

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const SA = { client_email: 'indexer@example.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) };
const NOW = Date.parse('2026-11-12T08:10:00+09:00');
const ld = o => `<script type="application/ld+json">${JSON.stringify(o)}</script>`;
const job = (until, id = '306801') => ({ '@context': 'https://schema.org', '@type': 'JobPosting', title: 't', validThrough: until, identifier: { '@type': 'PropertyValue', name: '잡알리오', value: id } });

// googleNotified: 구글 알림 기록(metadata)에 이미 있는 주소. publishStatus·metaStatus로 오류를 흉내 낸다.
// feedContent=true면 Blogger 실제 피드처럼 글 본문을 피드에 넣는다(기본). false면 본문 없는 피드를 흉내 낸다.
// posts는 채용 큐레이터 피드다. 다른 블로그 피드는 otherFeeds[블로그 주소](없으면 글 없는 피드), feedStatus[블로그 주소]로 실패를 흉내 낸다.
// publishStatusFor(url)이 있으면 그 값이 알림 응답 코드다.
function fakeWeb(pages, posts, { googleNotified = [], publishStatus = 200, metaStatus = null, feedContent = true, otherFeeds = {}, feedStatus = {}, publishStatusFor = null } = {}) {
  const calls = [];
  const entries = list => ({ feed: { entry: list.map(([u, p]) => ({ link: [{ rel: 'alternate', href: u }], published: { $t: p }, ...(feedContent && u in pages ? { content: { $t: pages[u] } } : {}) })) } });
  const fetcher = async (url, opts = {}) => {
    calls.push({ url, opts });
    const blog = BLOGS.find(b => url.startsWith(`${b}feeds/`));
    if (blog && feedStatus[blog]) return { ok: false, status: feedStatus[blog], json: async () => ({}) };
    if (blog === BLOG) return { ok: true, json: async () => entries(posts) };
    if (blog) return { ok: true, json: async () => (otherFeeds[blog] ? entries(otherFeeds[blog]) : { feed: {} }) };
    if (url === TOKEN_URI) return { ok: true, json: async () => ({ access_token: 'tok' }) };
    if (url.startsWith(`${METADATA}?url=`)) {
      const u = decodeURIComponent(url.split('?url=')[1]);
      if (metaStatus) return { ok: false, status: metaStatus, json: async () => ({}) };
      return googleNotified.includes(u)
        ? { ok: true, status: 200, json: async () => ({ url: u, latestUpdate: { type: 'URL_UPDATED', notifyTime: '2026-11-11T00:00:00Z' } }) }
        : { ok: false, status: 404, json: async () => ({}) };
    }
    if (url === ENDPOINT) {
      const code = publishStatusFor ? publishStatusFor(JSON.parse(opts.body).url) : publishStatus;
      return { ok: code === 200, status: code, json: async () => ({}) };
    }
    if (url in pages) return { ok: true, status: 200, text: async () => pages[url] };
    return { ok: false, status: 404, text: async () => '' };
  };
  return { fetcher, calls };
}
const sent = calls => calls.filter(c => c.url === ENDPOINT).map(c => JSON.parse(c.opts.body));

test('JobPosting가 있고 마감 전이며 알린 기록이 없는 글만 알리고 기록에 남긴다', async () => {
  const A = `${BLOG}2026/11/a.html`, B = `${BLOG}2026/11/b.html`, C = `${BLOG}2026/11/c.html`, D = `${BLOG}2026/10/old.html`, E = `${BLOG}2026/11/e.html`, F = `${BLOG}2026/11/f.html`;
  const open = `<html>${ld(job('2026-11-20T17:00:00+09:00'))}</html>`;
  const { fetcher, calls } = fakeWeb({
    [A]: open, [B]: '<html>구조화 데이터 없음</html>', [C]: `<html>${ld(job('2026-11-11T17:00:00+09:00'))}</html>`, [E]: open, [F]: open,
  }, [[A, '2026-11-12T08:00:00+09:00'], [B, '2026-11-11T17:00:00+09:00'], [C, '2026-11-11T08:00:00+09:00'], [E, '2026-11-10T17:00:00+09:00'], [F, '2026-11-10T08:00:00+09:00'], [D, '2026-10-20T08:00:00+09:00']],
  { googleNotified: [E] });
  const log = { [F]: { notifiedAt: '2026-11-10T06:18:48Z', validThrough: '2026-11-19T13:00:00+09:00', noticeId: '306729' } };
  const { results, changed } = await run({ sa: SA, fetcher, now: NOW, log });
  assert.deepStrictEqual(results.map(r => [r.url, r.notified || r.skipped]), [
    [A, true], [B, 'JobPosting 구조화 데이터 없음'], [C, '접수 마감 지남'], [E, '이미 알림(구글 기록)'], [F, '이미 알림(기록)'],
  ]);
  assert.deepStrictEqual(sent(calls), [{ url: A, type: 'URL_UPDATED' }]);
  assert.ok(!calls.some(c => !c.url.startsWith(`${BLOG}feeds/`) && c.url.startsWith(BLOG)), '피드에 본문이 있으면 글 페이지를 열지 않는다(Blogger 429 회피)');
  assert.ok(changed);
  assert.deepStrictEqual(Object.keys(log).sort(), [A, E, F].sort());
  assert.strictEqual(log[A].noticeId, '306801');
});

test('한 번 알린 글은 다음 실행에서 다시 알리지 않는다(구글 기록이 늦게 반영돼도)', async () => {
  const A = `${BLOG}2026/11/a.html`;
  const page = ld(job('2026-11-20T17:00:00+09:00'));
  const log = {};
  const first = fakeWeb({ [A]: page }, [[A, '2026-11-12T08:00:00+09:00']]);
  await run({ sa: SA, fetcher: first.fetcher, now: NOW, log });
  const second = fakeWeb({ [A]: page }, [[A, '2026-11-12T08:00:00+09:00']]); // 구글 metadata는 여전히 404
  const { results, changed } = await run({ sa: SA, fetcher: second.fetcher, now: NOW + 9 * 3600e3, log });
  assert.deepStrictEqual(results, [{ url: A, skipped: '이미 알림(기록)' }]);
  assert.strictEqual(changed, false);
  assert.strictEqual(sent(second.calls).length, 0);
});

test('아직 공개 전(미래 시각) 글과 다른 사이트 주소는 보지 않는다', async () => {
  const F = `${BLOG}2026/11/future.html`;
  const { fetcher, calls } = fakeWeb({ [F]: ld(job('2026-11-30T17:00:00+09:00')) },
    [[F, '2026-11-12T17:00:00+09:00'], ['https://evil.example.com/x.html', '2026-11-12T08:00:00+09:00']]);
  const { results } = await run({ sa: SA, fetcher, now: NOW });
  assert.strictEqual(results.length, 0);
  assert.ok(!calls.some(c => c.url === ENDPOINT || c.url === TOKEN_URI));
});

test('시험 실행(dry-run)은 구글에 인증·조회·알림을 하지 않고 기록도 바꾸지 않는다', async () => {
  const A = `${BLOG}2026/11/a.html`;
  const { fetcher, calls } = fakeWeb({ [A]: ld(job('2026-11-20T17:00:00+09:00')) }, [[A, '2026-11-12T08:00:00+09:00']]);
  const log = {};
  const { results, changed } = await run({ sa: null, fetcher, now: NOW, dryRun: true, log });
  assert.deepStrictEqual(results, [{ url: A, wouldNotify: true }]);
  assert.deepStrictEqual([changed, log], [false, {}]);
  assert.ok(!calls.some(c => c.url === ENDPOINT || c.url === TOKEN_URI || c.url.startsWith(METADATA)));
});

test('알림이 권한 오류(403)면 기록하지 않고 그 실행에서 더 보내지 않는다', async () => {
  const A = `${BLOG}2026/11/a.html`, B = `${BLOG}2026/11/b.html`;
  const page = ld(job('2026-11-20T17:00:00+09:00'));
  const { fetcher, calls } = fakeWeb({ [A]: page, [B]: page }, [[A, '2026-11-12T08:00:00+09:00'], [B, '2026-11-11T17:00:00+09:00']], { publishStatus: 403 });
  const log = {};
  const { results } = await run({ sa: SA, fetcher, now: NOW, log });
  assert.deepStrictEqual(results, [{ url: A, error: '알림 HTTP 403' }]);
  assert.strictEqual(sent(calls).length, 1);
  assert.deepStrictEqual(log, {});
});

test('알림 기록 조회가 권한 오류(403)면 알리지 않고 멈춘다', async () => {
  const A = `${BLOG}2026/11/a.html`, B = `${BLOG}2026/11/b.html`;
  const page = ld(job('2026-11-20T17:00:00+09:00'));
  const { fetcher, calls } = fakeWeb({ [A]: page, [B]: page }, [[A, '2026-11-12T08:00:00+09:00'], [B, '2026-11-11T17:00:00+09:00']], { metaStatus: 403 });
  const { results } = await run({ sa: SA, fetcher, now: NOW, log: {} });
  assert.deepStrictEqual(results, [{ url: A, error: '알림 기록 조회 HTTP 403' }]);
  assert.strictEqual(sent(calls).length, 0);
});

test('저장소 기록 파일: 없으면 빈 기록, 읽기 실패는 멈추고, 저장은 sha를 붙여 덮어쓴다', async () => {
  const gh = { token: 't', repo: 'o/r' };
  const api = `https://api.github.com/repos/o/r/contents/${LOG_PATH}`;
  assert.deepStrictEqual(await readLog({ ...gh, fetcher: async () => ({ ok: false, status: 404 }) }), {});
  await assert.rejects(readLog({ ...gh, fetcher: async () => ({ ok: false, status: 500 }) }), /알림 기록 읽기 실패/);
  assert.deepStrictEqual(await readLog({ ...gh, fetcher: async () => ({ ok: true, status: 200, text: async () => '{"u":{"notifiedAt":"x"}}' }) }), { u: { notifiedAt: 'x' } });
  const puts = [];
  await writeLog({ u: { notifiedAt: 'x' } }, { ...gh, fetcher: async (url, opts = {}) => {
    if (opts.method === 'PUT') { puts.push({ url, body: JSON.parse(opts.body) }); return { ok: true, status: 200 }; }
    return { ok: true, status: 200, json: async () => ({ sha: 'abc' }) };
  } });
  assert.strictEqual(puts.length, 1);
  assert.strictEqual(puts[0].url, api);
  assert.strictEqual(puts[0].body.sha, 'abc');
  assert.match(puts[0].body.message, /\[skip ci\]/);
  assert.deepStrictEqual(JSON.parse(Buffer.from(puts[0].body.content, 'base64').toString()), { u: { notifiedAt: 'x' } });
});

test('피드에 본문이 없으면 글 페이지를 열어 확인하고, 막히면(429) 기록하지 않고 다음 실행으로 넘긴다', async () => {
  const A = `${BLOG}2026/11/a.html`, B = `${BLOG}2026/11/b.html`;
  const page = ld(job('2026-11-20T17:00:00+09:00'));
  const { fetcher, calls } = fakeWeb({ [A]: page }, [[A, '2026-11-12T08:00:00+09:00'], [B, '2026-11-11T17:00:00+09:00']], { feedContent: false });
  const log = {};
  const { results } = await run({ sa: SA, fetcher, now: NOW, log });
  assert.deepStrictEqual(results.map(r => [r.url, r.notified || r.skipped]), [[A, true], [B, '글 HTTP 404']]);
  assert.ok(calls.some(c => c.url === A));
  assert.deepStrictEqual(Object.keys(log), [A]);
});

test('Blogger가 기호를 HTML 표기로 바꿔도 JobPosting을 찾는다', () => {
  const html = `<script type='application/ld+json'>{&quot;@type&quot;:&quot;JobPosting&quot;,&quot;title&quot;:&quot;a&#183;b&quot;,&quot;validThrough&quot;:&quot;2026-11-20T17:00:00+09:00&quot;}</script>`;
  assert.strictEqual(findJobPosting(html).title, 'a·b');
  assert.strictEqual(findJobPosting(ld({ '@type': 'BlogPosting' })), null);
});

test('서비스 계정 서명(JWT)은 공개키로 검증되고 색인 권한 범위만 요청한다', () => {
  const [h, b, s] = jwt(SA, NOW).split('.');
  const ok = crypto.createVerify('RSA-SHA256').update(`${h}.${b}`).verify(publicKey, Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64'));
  assert.ok(ok);
  const claims = JSON.parse(Buffer.from(b.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
  assert.deepStrictEqual([claims.iss, claims.scope, claims.aud, claims.exp - claims.iat], [SA.client_email, 'https://www.googleapis.com/auth/indexing', TOKEN_URI, 3600]);
});

test('블로그 3개를 모두 보고, JobPosting이 있는 채용 마스터스 글만 더 알린다(취업 큐레이터 비교 글은 대상 아님)', async () => {
  const A = `${BLOG}2026/11/a.html`, M = `${MASTERS}2026/11/hyundai.html`, J = `${JOBSC}2026/11/nurse.html`;
  const open = ld(job('2026-11-30T17:00:00+09:00', ''));
  const { fetcher, calls } = fakeWeb({ [A]: ld(job('2026-11-20T17:00:00+09:00')), [M]: open, [J]: '<html>비교 글</html>' },
    [[A, '2026-11-12T08:00:00+09:00']], { otherFeeds: { [MASTERS]: [[M, '2026-11-12T07:00:00+09:00']], [JOBSC]: [[J, '2026-11-12T06:00:00+09:00']] } });
  const log = {};
  const { results } = await run({ sa: SA, fetcher, now: NOW, log });
  assert.deepStrictEqual(results.map(r => [r.url, r.notified || r.skipped]), [[A, true], [M, true], [J, 'JobPosting 구조화 데이터 없음']]);
  assert.deepStrictEqual(sent(calls).map(x => x.url), [A, M]);
  assert.deepStrictEqual(Object.keys(log).sort(), [A, M].sort());
  for (const b of BLOGS) assert.ok(calls.some(c => c.url === `${b}feeds/posts/default?alt=json&max-results=50`), `${b} 피드를 읽는다`);
});

test('한 블로그가 서치 콘솔 권한 오류(403)여도 다른 블로그 글은 알린다', async () => {
  const A = `${BLOG}2026/11/a.html`, M1 = `${MASTERS}2026/11/m1.html`, M2 = `${MASTERS}2026/11/m2.html`;
  const page = ld(job('2026-11-30T17:00:00+09:00', ''));
  const { fetcher, calls } = fakeWeb({ [A]: page, [M1]: page, [M2]: page }, [[A, '2026-11-12T06:00:00+09:00']],
    { otherFeeds: { [MASTERS]: [[M1, '2026-11-12T08:00:00+09:00'], [M2, '2026-11-12T07:00:00+09:00']] }, publishStatusFor: u => u.startsWith(MASTERS) ? 403 : 200 });
  const log = {};
  const { results } = await run({ sa: SA, fetcher, now: NOW, log });
  assert.deepStrictEqual(results.map(r => [r.url, r.notified || r.error]), [[M1, '알림 HTTP 403'], [A, true]]);
  assert.deepStrictEqual(sent(calls).map(x => x.url), [M1, A], '403 뒤 같은 블로그 글(M2)은 보내지 않는다');
  assert.deepStrictEqual(Object.keys(log), [A]);
});

test('인증·한도 오류(429)는 블로그와 관계없이 그 실행을 멈춘다', async () => {
  const A = `${BLOG}2026/11/a.html`, M = `${MASTERS}2026/11/m.html`;
  const page = ld(job('2026-11-30T17:00:00+09:00', ''));
  const { fetcher, calls } = fakeWeb({ [A]: page, [M]: page }, [[A, '2026-11-12T06:00:00+09:00']],
    { otherFeeds: { [MASTERS]: [[M, '2026-11-12T08:00:00+09:00']] }, publishStatus: 429 });
  const { results } = await run({ sa: SA, fetcher, now: NOW, log: {} });
  assert.deepStrictEqual(results, [{ url: M, error: '알림 HTTP 429' }]);
  assert.strictEqual(sent(calls).length, 1);
});

test('한 블로그 피드를 못 읽으면 그 블로그만 오류로 남기고 나머지는 알린다', async () => {
  const A = `${BLOG}2026/11/a.html`;
  const { fetcher } = fakeWeb({ [A]: ld(job('2026-11-20T17:00:00+09:00')) }, [[A, '2026-11-12T08:00:00+09:00']], { feedStatus: { [JOBSC]: 503 } });
  const { results } = await run({ sa: SA, fetcher, now: NOW, log: {} });
  assert.deepStrictEqual(results.map(r => [r.url, r.notified || r.error]), [[JOBSC, '블로그 글 목록 HTTP 503'], [A, true]]);
});

test('다른 블로그 피드에 섞인 남의 주소는 보지 않는다', async () => {
  const X = `${BLOG}2026/11/x.html`;
  const { fetcher, calls } = fakeWeb({ [X]: ld(job('2026-11-30T17:00:00+09:00')) }, [], { otherFeeds: { [MASTERS]: [[X, '2026-11-12T08:00:00+09:00'], ['https://evil.example.com/y.html', '2026-11-12T08:00:00+09:00']] } });
  const { results } = await run({ sa: SA, fetcher, now: NOW, log: {} });
  assert.strictEqual(results.length, 0);
  assert.ok(!calls.some(c => c.url === ENDPOINT));
});
