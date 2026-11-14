const { test } = require('node:test');
const assert = require('node:assert/strict');
const { currentSlot, decide, run } = require('../cloud/jobs-board-trigger');
const at = kst => Date.parse(`${kst}+09:00`);
const runAt = (kst, status = 'completed', conclusion = 'success') => ({ created_at: new Date(at(kst)).toISOString(), status, conclusion });

test('slot windows follow KST 06:40, 08:00, 17:00 and close before the next slot', () => {
  const label = kst => currentSlot(at(kst))?.label ?? null;
  assert.equal(label('2026-11-10T06:39:59'), null);
  assert.equal(label('2026-11-10T06:45:47'), '06:40');
  assert.equal(label('2026-11-10T07:59:59'), '06:40');
  assert.equal(label('2026-11-10T08:00:47'), '08:00');
  assert.equal(label('2026-11-10T09:59:59'), '08:00');
  assert.equal(label('2026-11-10T10:00:00'), null);
  assert.equal(label('2026-11-10T16:59:59'), null);
  assert.equal(label('2026-11-10T17:00:47'), '17:00');
  assert.equal(label('2026-11-10T19:00:00'), null);
  assert.equal(label('2026-11-11T00:30:00'), null);
  assert.equal(currentSlot(at('2026-11-11T08:15:00')).startMs, at('2026-11-11T08:00:00'));
});

test('dispatches once per slot and ignores runs from before the slot', () => {
  const now = at('2026-11-10T17:00:47');
  assert.equal(decide(now, []).dispatch, true);
  assert.equal(decide(now, [runAt('2026-11-10T10:48:31'), runAt('2026-11-10T03:50:12')]).dispatch, true);
  assert.equal(decide(now, [runAt('2026-11-10T17:00:50', 'in_progress', null)]).dispatch, false);
  assert.equal(decide(now, [runAt('2026-11-10T17:00:50', 'queued', null)]).dispatch, false);
  assert.equal(decide(at('2026-11-10T17:15:47'), [runAt('2026-11-10T17:01:10')]).dispatch, false);
  assert.equal(decide(at('2026-11-10T13:00:00'), []).dispatch, false);
});

test('cancelled runs do not count, a failure is retried once, two failures wait for the next slot', () => {
  const now = at('2026-11-10T08:30:47');
  assert.equal(decide(now, [runAt('2026-11-10T08:01:00', 'completed', 'cancelled')]).dispatch, true);
  assert.equal(decide(now, [runAt('2026-11-10T08:16:00', 'completed', 'cancelled'), runAt('2026-11-10T08:01:00', 'completed', 'failure')]).dispatch, true);
  const once = decide(now, [runAt('2026-11-10T08:01:00', 'completed', 'failure')]);
  assert.equal(once.dispatch, true);
  assert.match(once.reason, /재시도/);
  assert.equal(decide(now, [runAt('2026-11-10T08:16:00', 'completed', 'failure'), runAt('2026-11-10T08:01:00', 'completed', 'failure')]).dispatch, false);
});

function fakeGithub(runs, dispatchStatus = 204) {
  const calls = [];
  const fetcher = async (url, opts = {}) => {
    calls.push({ url: String(url), method: opts.method || 'GET', body: opts.body, auth: opts.headers?.Authorization });
    if (String(url).endsWith('/dispatches')) return { ok: dispatchStatus < 300, status: dispatchStatus };
    return { ok: true, status: 200, json: async () => ({ workflow_runs: runs }) };
  };
  return { fetcher, calls };
}
const env = { GITHUB_TOKEN: 't', GITHUB_REPO: 'holybullyshit-design/threads-auto-publisher' };

test('outside a slot nothing is requested from GitHub', async () => {
  const gh = fakeGithub([]);
  const d = await run({ env, fetcher: gh.fetcher, now: () => at('2026-11-10T12:00:47') });
  assert.equal(d.dispatch, false);
  assert.equal(gh.calls.length, 0);
});

test('inside a slot it dispatches jobs-board.yml on main only, never the publish workflow', async () => {
  const gh = fakeGithub([runAt('2026-11-10T10:48:31')]);
  const d = await run({ env, fetcher: gh.fetcher, now: () => at('2026-11-10T17:00:47') });
  assert.equal(d.dispatch, true);
  assert.equal(gh.calls.length, 2);
  assert.match(gh.calls[0].url, /\/actions\/workflows\/jobs-board\.yml\/runs\?per_page=20$/);
  assert.equal(gh.calls[1].method, 'POST');
  assert.equal(gh.calls[1].url, 'https://api.github.com/repos/holybullyshit-design/threads-auto-publisher/actions/workflows/jobs-board.yml/dispatches');
  assert.deepEqual(JSON.parse(gh.calls[1].body), { ref: 'main', inputs: { slot: '17:00' } });
  assert.ok(gh.calls.every(c => !/publish-scheduled/.test(c.url)));
});

test('an already refreshed slot is not dispatched again and errors are reported', async () => {
  const done = fakeGithub([runAt('2026-11-10T17:01:10')]);
  await run({ env, fetcher: done.fetcher, now: () => at('2026-11-10T17:15:47') });
  assert.equal(done.calls.length, 1);
  const refused = fakeGithub([], 403);
  await assert.rejects(run({ env, fetcher: refused.fetcher, now: () => at('2026-11-10T17:00:47') }), /HTTP 403/);
  await assert.rejects(run({ env: {}, fetcher: refused.fetcher, now: () => at('2026-11-10T17:00:47') }), /GitHub 설정/);
});
