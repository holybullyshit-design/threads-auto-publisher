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
  await assert.rejects(() => run({ env, fetcher: fetcher([rec(1, '20261120')]), now: () => now, gojobsDelayMs: 0 }), /기존 게시판을 유지/);
  await assert.rejects(() => run({ env, fetcher: async () => ({ ok: true, status: 200, text: async () => '<xml>SERVICE KEY IS NOT REGISTERED</xml>' }), now: () => now, gojobsDelayMs: 0 }), /모든 출처|기존 게시판/);
  await assert.rejects(() => run({ env: { ...env, ALIO_SERVICE_KEY: '' }, fetcher: fetcher([]), now: () => now, gojobsDelayMs: 0 }), /기존 게시판을 유지/);
  assert.equal(writes.length, 0);
  const many = Array.from({ length: MIN_JOBS + 5 }, (_, i) => rec(100 + i, '20261120'));
  const board = await run({ env, fetcher: fetcher(many), now: () => now, gojobsDelayMs: 0 });
  assert.equal(writes.length, 1);
  assert.equal(writes[0].count, MIN_JOBS + 5);
  assert.equal(board.jobs[0].org, '기관100');
});
const { parseGojobs, fetchGojobs, regionOf } = require('../cloud/build-jobs-board');
const goRow = (id, title, org, start, end, kind = '국가') => `<tr><td align="center" scope="row">1</td><td class="ta_l elip"><div><img src="/images/icon/rec_img1.png" alt="${kind}"/></div><a style="x" href="javascript:fn_apmView('020', '${id}')"> ${title} </a></td><td align="center"> ${org} </td><td align="center"> ${start}</b> </td><td align="center"> ${end} </td><td align="center"> 3 </td></tr>`;
const goPage = (rows, last) => `<table><tbody>${rows.join('')}</tbody></table>` + Array.from({ length: last }, (_, i) => `<a href="#" onclick="fn_egov_link_page(${i + 1})">${i + 1}</a>`).join('');

test('나라일터 목록 표를 읽고, 합격자·결과 공지는 빼고, 근무지는 기관명의 시·도만 쓴다', async () => {
  const p1 = goPage([goRow(307701, '2026년 제3회 공무직 근로자(조리원) 채용 공고', '법무부 대구지방교정청 경북북부제3교도소', '2026-11-05', '2026-11-13'),
    goRow(307702, '공무직 상시집배원 최종합격자 공고', '김포우체국', '2026-11-06', '2026-11-06')], 2);
  const p2 = goPage([goRow(307703, '산불진화대 채용 서류전형결과 및 체력시험 안내', '남부지방산림청', '2026-11-05', '2026-11-10'),
    goRow(307704, '대학회계직원 채용 공고', '충청북도 보건환경연구원', '2026-11-04', '2026-11-20', '지자체')], 2);
  assert.equal(parseGojobs(p1).rows.length, 2); assert.equal(parseGojobs(p1).last, 2);
  const bodies = [];
  const rows = await fetchGojobs(now, async (url, opts) => { bodies.push(new URLSearchParams(opts.body)); return { ok: true, status: 200, text: async () => (bodies.length === 1 ? p1 : p2) }; }, 0);
  assert.deepEqual(rows.map(r => r.id), [307701, 307704]);
  assert.equal(rows[0].rgn, '경북'); assert.equal(rows[1].rgn, '충북');
  assert.equal(rows[0].url, 'https://www.gojobs.go.kr/apmView.do?empmnsn=307701');
  assert.equal(bodies[0].get('searchListEmpmnsecode'), 'e04'); assert.equal(bodies[0].get('searchSdate'), '20261106'); assert.equal(bodies[1].get('pageIndex'), '2');
  assert.equal(regionOf('경인지방우정청 김포우체국'), '');
});

test('한 출처가 실패하면 그 출처만 직전 게시판 목록을 유지하고, 다른 출처는 새로 받는다', async () => {
  const many = Array.from({ length: 60 }, (_, i) => rec(200 + i, '20261120'));
  const prev = { jobs: [{ id: 1, src: 'gojobs', org: '옛기관', title: '옛 공무직', type: '공무직', n: 0, rgn: '', career: '', edu: '', start: '20261101', end: '20261115', sub: false, url: 'u' }, { id: 9, org: '옛알리오', title: 't', type: '', n: 0, rgn: '', career: '', edu: '', start: '20261101', end: '20261115', sub: false }] };
  const writes = [];
  const fetcher = async (url, opts = {}) => {
    const u = String(url);
    if (u.startsWith('https://apis.data.go.kr')) return page(many, many.length);
    if (u.startsWith('https://www.gojobs.go.kr')) return { ok: false, status: 503 };
    if (opts.method === 'PUT') { writes.push(JSON.parse(Buffer.from(JSON.parse(opts.body).content, 'base64').toString())); return { ok: true, status: 200 }; }
    if (opts.headers?.Accept === 'application/vnd.github.raw+json') return { ok: true, status: 200, text: async () => JSON.stringify(prev) };
    return { ok: true, status: 200, json: async () => ({ sha: 'x' }) };
  };
  const board = await run({ env: { ALIO_SERVICE_KEY: 'k', GITHUB_TOKEN: 't', GITHUB_REPO: 'o/r' }, fetcher, now: () => now, gojobsDelayMs: 0 });
  assert.equal(board.sources.alio.ok, true); assert.equal(board.sources.gojobs.ok, false); assert.equal(board.sources.gojobs.kept, 1);
  assert.equal(board.jobs.filter(j => j.src === 'gojobs').length, 1);
  assert.equal(board.jobs.filter(j => j.src === 'alio').length, 60, '알리오는 새 목록으로 바뀌고 옛 알리오 항목은 남지 않는다');
  // 알리오 키가 없어도 나라일터가 되면 갱신하고, 알리오는 직전 목록을 쓴다
  const goOk = async (url, opts = {}) => String(url).startsWith('https://www.gojobs.go.kr') ? { ok: true, status: 200, text: async () => goPage(Array.from({ length: 25 }, (_, i) => goRow(308000 + i, '공무직 채용 공고 ' + i, '국립기관', '2026-11-05', '2026-11-20')), 1) } : fetcher(url, opts);
  const prev2 = { jobs: many.map(r => ({ ...require('../cloud/build-jobs-board').compact(r) })) };
  const goOk2 = async (url, opts = {}) => (opts.headers?.Accept === 'application/vnd.github.raw+json' ? { ok: true, status: 200, text: async () => JSON.stringify(prev2) } : goOk(url, opts));
  const b2 = await run({ env: { GITHUB_TOKEN: 't', GITHUB_REPO: 'o/r' }, fetcher: goOk2, now: () => now, gojobsDelayMs: 0 });
  assert.equal(b2.sources.alio.ok, false); assert.equal(b2.sources.alio.kept, 60); assert.equal(b2.sources.gojobs.count, 25);
});
