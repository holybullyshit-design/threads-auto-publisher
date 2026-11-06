const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildBoard, fetchAll, run, compact, MIN_JOBS } = require('../cloud/build-jobs-board');
const now = new Date('2026-11-06T01:00:00Z'); // 11-06 10:00 KST
const rec = (id, end, extra = {}) => ({ recrutPblntSn: id, instNm: '기관' + id, recrutPbancTtl: '공고 ' + id, hireTypeNmLst: '청년인턴(체험형),정규직', recrutNope: 3, workRgnNmLst: '전남광주', recrutSeNm: '신입', acbgCondNmLst: '학력무관', pbancBgngYmd: '20261101', pbancEndYmd: end, replmprYn: 'N', ...extra });
const page = (rows, total) => ({ ok: true, status: 200, text: async () => JSON.stringify({ resultCode: 200, totalCount: total, result: rows }) });

test('board keeps only notices still open today in KST, sorted by deadline', () => {
  const b = buildBoard([rec(3, '20261110'), rec(1, '20261105'), rec(2, '20261106'), rec(4, 'bad')], now);
  assert.deepEqual(b.jobs.map(j => j.id), [2, 3]);
  assert.equal(b.count, 2);
  assert.equal(compact(rec(9, '20261110')).type, '체험형 인턴,정규직');
  assert.equal(compact(rec(9, '20261110')).rgn, '광주·전남');
});

test('all pages are fetched until the total is reached', async () => {
  const pages = [[rec(1, '20261120'), rec(2, '20261120')], [rec(3, '20261120')]];
  let calls = 0;
  const rows = await fetchAll('k', async url => page(pages[Number(url.searchParams.get('pageNo')) - 1] || [], 3, calls++));
  assert.deepEqual(rows.map(r => r.recrutPblntSn), [1, 2, 3]);
  assert.equal(calls, 2);
});

test('an API error or a suspiciously small list never overwrites the board', async () => {
  const writes = [];
  const fetcher = rows => async (url, opts) => {
    if (String(url).startsWith('https://apis.data.go.kr')) return page(rows, rows.length);
    if (opts?.method === 'PUT') { writes.push(JSON.parse(Buffer.from(JSON.parse(opts.body).content, 'base64').toString())); return { ok: true, status: 200 }; }
    return { ok: false, status: 404 };
  };
  const env = { ALIO_SERVICE_KEY: 'k', GITHUB_TOKEN: 't', GITHUB_REPO: 'o/r' };
  await assert.rejects(() => run({ env, fetcher: fetcher([rec(1, '20261120')]), now: () => now }), /기존 게시판을 유지/);
  await assert.rejects(() => run({ env, fetcher: async () => ({ ok: true, status: 200, text: async () => '<xml>SERVICE KEY IS NOT REGISTERED</xml>' }), now: () => now }), /JSON이 아님/);
  await assert.rejects(() => run({ env: { ...env, ALIO_SERVICE_KEY: '' }, fetcher: fetcher([]), now: () => now }), /ALIO_SERVICE_KEY/);
  assert.equal(writes.length, 0);
  const many = Array.from({ length: MIN_JOBS + 5 }, (_, i) => rec(100 + i, '20261120'));
  const board = await run({ env, fetcher: fetcher(many), now: () => now });
  assert.equal(writes.length, 1);
  assert.equal(writes[0].count, MIN_JOBS + 5);
  assert.equal(board.jobs[0].org, '기관100');
});
