// Recruitment stays outside the existing saju schedule and cloud credentials.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const HANDLES = ['jobs_curator', 'hire_masters', 'high_quality_hire'];
const ROOT = '/Users/choitaehwan/Documents/ChatGPT/스레드 채용공고 자동화/automation';
const HOUR = 3600000;
const fail = (message, status = 422) => Object.assign(new Error(message), { status });
const httpUrl = s => { try { const u = new URL(s); return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password; } catch { return false; } };
function runMutationPreflight() {
  const appRoot = path.resolve(__dirname, '../..');
  execFileSync(process.execPath, ['--test', 'test/jobsWorkspaceMutations.test.js', 'test/jobsWorkspace.test.js', 'test/jobsCloudMutations.test.js', 'test/jobsCloudPublisher.test.js'], { cwd: appRoot, timeout: 30000, stdio: 'pipe' });
  execFileSync('python3', [path.join(ROOT, 'threads_schedule_check.py')], { cwd: ROOT, timeout: 10000, stdio: 'pipe' });
}
function validate(p, all = [], now = Date.now()) {
  const errors = [];
  const reminder = p.postType === 'deadline_reminder';
  if (p.postType && !['initial', 'deadline_reminder'].includes(p.postType)) errors.push('게시 유형을 확인하세요.');
  if (!HANDLES.includes(p.handle)) errors.push('채용 계정을 선택하세요.');
  if (!p.noticeId || !p.title || !p.angle) errors.push('공고 ID·제목·소개할 핵심 정보를 입력하세요.');
  if (!p.text?.trim() || p.text.length > 500) errors.push('본문은 1~500자로 작성하세요.');
  if (!/(세전\s*(?:기본|초임)?연봉|세전\s*월(?:급|\s*기본급)|연\s*환산)/.test(p.text || '')) errors.push('이번 모집 직무의 세전 보수를 본문에 표시하세요.');
  if (!p.verifiedPay || !p.text?.includes(p.verifiedPay)) errors.push('공식 공고에서 확인한 급여와 본문 금액이 일치해야 합니다.');
  if (!httpUrl(p.sourceUrl) || !httpUrl(p.blogUrl)) errors.push('공식 공고와 공개 블로그 주소를 확인하세요.');
  if (!p.replyText?.includes(p.blogUrl) || p.replyText.length > 500) errors.push('답글에 블로그 주소를 넣고 500자 이내로 작성하세요.');
  const start = Date.parse(p.startsAt), end = Date.parse(p.deadlineAt), checked = Date.parse(p.checkedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) errors.push('정확한 접수 시작·마감 시각을 입력하세요.');
  if (start > now && !/접수\s*예정/.test(p.text || '')) errors.push('접수 시작 전 공고는 본문에 접수 예정임을 명시하세요.');
  if (reminder && Number.isFinite(end)) {
    const kstDay = value => new Date(value + 9 * HOUR).toISOString().slice(0, 10);
    const exactKstTime = new Date(end + 9 * HOUR).toISOString().slice(11, 16);
    if (kstDay(now) !== kstDay(end) || end - now < 4 * HOUR || end - now > 24 * HOUR) errors.push('마감 당일 알림은 정확한 마감일의 4시간 이상 전에만 게시하세요.');
    if (!p.text?.includes('오늘 마감') || !p.text.includes(exactKstTime)) errors.push(`본문에 '오늘 마감'과 정확한 마감 시각 ${exactKstTime} KST를 적으세요.`);
  } else if (!Number.isFinite(end) || end - now < Math.max(120, Number(p.preparationHours) || 120) * HOUR) errors.push('최초 소개는 마감까지 최소 120시간과 필요한 준비 기간을 확보해야 합니다.');
  if (!Number.isFinite(checked) || checked > now || now - checked > 24 * HOUR) errors.push('게시 전 24시간 안에 공식 자료를 다시 확인하세요.');
  if (!p.factsChecked || !p.blogChecked) errors.push('원문·첨부파일의 조건과 공개 블로그·모바일 화면을 확인하세요.');
  const history = all.filter(x => x.id !== p.id && ['publishing', 'published', 'reply_failed', 'uncertain'].includes(x.status));
  const same = history.filter(x => x.noticeId === p.noticeId || x.sourceUrl === p.sourceUrl);
  const kstDate = value => new Date(Date.parse(value) + 9 * HOUR).toISOString().slice(0, 10);
  const targetDay = kstDate(new Date(now).toISOString());
  if (history.some(x => x.handle === p.handle && (x.publishedAt || x.attemptedAt) && kstDate(x.publishedAt || x.attemptedAt) === targetDay)) errors.push('이 계정은 오늘 이미 게시했거나 게시 결과를 확인 중입니다.');
  const own = same.filter(x => x.handle === p.handle);
  if (!reminder && own.length) errors.push('이 계정에서 이미 소개한 공고입니다.');
  if (reminder && (own.some(x => x.postType === 'deadline_reminder') || own.some(x => !Number.isFinite(Date.parse(x.publishedAt || x.attemptedAt)) || now - Date.parse(x.publishedAt || x.attemptedAt) < 72 * HOUR))) errors.push('같은 계정의 마감 알림은 1회만, 앞선 소개와 72시간 이상 간격을 둡니다.');
  const todayKst = new Date(now + 9 * HOUR).toISOString().slice(0, 10);
  const approvedLaunchException = p.launchException === '2026-11-01:306304' && p.noticeId === '306304' && todayKst === '2026-11-01';
  if (!approvedLaunchException && new Set([...same.map(x => x.handle), p.handle]).size > 2) errors.push('동일 공고는 2개 계정까지만 운영합니다.');
  if (!approvedLaunchException && same.some(x => x.handle !== p.handle && now - Date.parse(x.publishedAt || x.attemptedAt) < 24 * HOUR)) errors.push('다른 계정의 같은 공고 소개와 24시간 간격이 필요합니다.');
  if (history.some(x => x.text?.trim() === p.text?.trim())) errors.push('동일한 본문을 이미 게시했거나 결과 확인 중입니다.');
  return errors;
}
function createWorkspace({ file = process.env.JOB_THREADS_DRAFT_FILE || path.join(ROOT, 'state/threads-workspace.json'), tokenDir = process.env.JOB_THREADS_TOKEN_DIR || path.join(ROOT, 'secrets/threads'), publish, preflight = runMutationPreflight } = {}) {
  const read = () => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
  function write(rows) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temp = `${file}.${crypto.randomUUID()}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(rows, null, 2), { mode: 0o600 }); fs.renameSync(temp, file);
  }
  function account(handle) {
    if (!HANDLES.includes(handle)) throw fail('등록된 채용 계정이 아닙니다.');
    return JSON.parse(fs.readFileSync(path.join(tokenDir, `${handle}.json`), 'utf8'));
  }
  function accounts() {
    return HANDLES.map(handle => {
      try { const a = account(handle); return { handle, connected: !!(a.user_id && a.access_token) && a.expires_at * 1000 > Date.now(), expiresAt: a.expires_at * 1000, insights: handle !== 'high_quality_hire' }; }
      catch { return { handle, connected: false, expiresAt: null, insights: false }; }
    });
  }
  function save(input) {
    const all = read(); const old = input.id && all.find(x => x.id === input.id);
    if (input.id && !old) throw fail('초안을 찾을 수 없습니다.', 404);
    if (old && old.status !== 'draft') throw fail('게시를 시도한 기록은 수정할 수 없습니다.', 409);
    const row = { id: old?.id || crypto.randomUUID(), status: 'draft', createdAt: old?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
    for (const k of ['handle', 'title', 'noticeId', 'angle', 'text', 'replyText', 'sourceUrl', 'blogUrl', 'startsAt', 'deadlineAt', 'checkedAt', 'verifiedPay', 'employmentType', 'eligibility', 'blogEvidence']) row[k] = String(input[k] || '').trim().slice(0, 6000);
    if (!HANDLES.includes(row.handle)) throw fail('채용 계정을 선택하세요.');
    row.postType = input.postType === 'deadline_reminder' ? 'deadline_reminder' : 'initial';
    row.preparationHours = Math.max(120, Math.min(8760, Number(input.preparationHours) || 120));
    row.factsChecked = input.factsChecked === true; row.blogChecked = input.blogChecked === true;
    if (input.launchException === '2026-11-01:306304' && row.noticeId === '306304') row.launchException = input.launchException;
    if (old) all[all.indexOf(old)] = row; else all.push(row);
    write(all); return read().find(x => x.id === row.id);
  }
  function update(id, changes) { const all = read(), row = all.find(x => x.id === id); if (!row) throw fail('초안이 없습니다.', 404); Object.assign(row, changes); write(all); return row; }
  async function post(id, revision, approved) {
    let row = read().find(x => x.id === id);
    if (!row) throw fail('초안을 찾을 수 없습니다.', 404);
    if (row.status !== 'draft') throw fail('이미 게시를 시도한 글입니다. Threads에서 결과를 확인하세요.', 409);
    if (approved !== true || revision !== row.updatedAt) throw fail('저장된 최신 글과 계정을 확인하고 게시를 승인하세요.', 409);
    const errors = validate(row, read()); if (errors.length) throw fail(errors.join('\n'));
    try { preflight(); } catch { throw fail('돌연변이 테스트 또는 예약 저장값 검수에 실패했습니다. 게시를 보류합니다.', 409); }
    const a = account(row.handle);
    if (!a.access_token || !a.user_id || a.expires_at * 1000 <= Date.now()) throw fail('계정 토큰 연결을 확인하세요.');
    row = update(id, { status: 'publishing', attemptedAt: new Date().toISOString() });
    // Persist intent before API call. An ambiguous failure must never trigger an automatic duplicate.
    const auth = { accessToken: a.access_token, threadsUserId: a.user_id };
    try {
      const main = await publish({ ...auth, text: row.text });
      if (!main?.publishedId) throw new Error('Missing published ID');
      row = update(id, { publishedId: main.publishedId, publishedAt: new Date().toISOString(), status: 'reply_failed' });
    } catch { update(id, { status: 'uncertain' }); throw fail('게시 결과를 확인하지 못했습니다. 중복 게시를 막기 위해 재시도를 중단했습니다. 해당 Threads 계정을 확인하세요.', 502); }
    try {
      const reply = await publish({ ...auth, text: row.replyText, replyToId: row.publishedId });
      if (!reply?.publishedId) throw new Error('Missing reply ID');
      return update(id, { status: 'published', replyId: reply.publishedId });
    } catch { return update(id, { status: 'reply_failed' }); }
  }
  async function schedule(id, revision, approved, scheduledAt, { queue = require('../../cloud/jobsStore'), fetcher = fetch, clock = () => Date.now() } = {}) {
    const row = read().find(x => x.id === id);
    if (!row || row.status !== 'draft') throw fail('예약 가능한 초안을 찾을 수 없습니다.', 409);
    if (approved !== true || revision !== row.updatedAt) throw fail('최신 초안의 계정과 본문을 확인하세요.', 409);
    const slot = Date.parse(scheduledAt), current = clock();
    if (!Number.isFinite(slot) || slot < current + 10 * 60000) throw fail('현재보다 10분 뒤의 한국 시각을 선택하세요.');
    const kstDay = new Date(slot + 9 * HOUR).toISOString().slice(0, 10);
    if (kstDay < '2026-11-02' || kstDay > '2026-11-14') throw fail('실험 기간인 11월 2~14일 안에서 예약하세요.');
    if (new Date(slot + 9 * HOUR).getUTCHours() >= 21) throw fail('21시 이후 발행은 예약하지 않습니다.');
    const issues = validate(row, read(), slot);
    if (issues.length) throw fail(issues.join('\n'));
    if (!row.employmentType || !row.eligibility || !row.blogEvidence) throw fail('고용형태·지원자격·블로그 확인 문구를 입력하세요.');
    try { preflight(); } catch { throw fail('돌연변이 검사에 실패하여 예약하지 않았습니다.', 409); }
    if (!await queue.secretPresent()) throw fail('GitHub Actions에 채용 계정 시크릿이 없어 예약을 차단했습니다.', 409);
    const source = await fetcher(row.sourceUrl, { signal: AbortSignal.timeout(15000) });
    if (!source.ok) throw fail('공식 공고 파일을 읽지 못했습니다.');
    const bytes = Buffer.from(await source.arrayBuffer());
    if (bytes.length < 100 || bytes.length > 30_000_000) throw fail('공식 공고 파일 크기 오류');
    const sourceSha256 = crypto.createHash('sha256').update(bytes).digest('hex');
    const blog = await fetcher(row.blogUrl, { signal: AbortSignal.timeout(15000) });
    if (!blog.ok || !blog.url?.startsWith('https://hirecurator.blogspot.com/')) throw fail('블로그 공개 URL을 확인하지 못했습니다.');
    const html = await blog.text();
    if (!html.includes(row.blogEvidence) || !html.includes(row.verifiedPay)) throw fail('블로그 본문·보수 확인에 실패했습니다.');
    const cloud = { ...row, status: 'scheduled', scheduledAt: new Date(slot).toISOString(), sourceSha256 };
    const { errors: cloudErrors } = require('../../cloud/jobsRules');
    await queue.change(rows => {
      if (rows.some(x => x.id === id)) throw fail('이미 GitHub 채용 예약 목록에 있습니다.', 409);
      const more = cloudErrors(cloud, rows, new Date(slot));
      if (more.length) throw fail('클라우드 예약 검수 실패: ' + more.join(','));
      if (rows.some(x => x.handle === row.handle && x.scheduledAt && new Date(Date.parse(x.scheduledAt) + 9 * HOUR).toISOString().slice(0,10) === kstDay && !['canceled','blocked'].includes(x.status))) throw fail('이 계정은 해당 날짜에 예약이 있습니다.');
      rows.push(cloud);
    }, `chore: schedule recruitment ${id} [skip ci]`);
    const saved = (await queue.read()).rows.find(x => x.id === id);
    if (!saved || saved.status !== 'scheduled' || saved.scheduledAt !== cloud.scheduledAt || saved.handle !== cloud.handle) throw fail('GitHub 예약 저장 결과가 일치하지 않습니다.', 502);
    try { preflight(); }
    catch {
      await queue.change(rows => { const p = rows.find(x => x.id === id); if (p?.status === 'scheduled') { p.status = 'blocked'; p.error = '예약 후 돌연변이 검사 실패'; } });
      throw fail('예약 후 돌연변이 검사 실패. 클라우드 예약을 차단했습니다.', 409);
    }
    return update(id, { status: 'scheduled', scheduledAt: cloud.scheduledAt, sourceSha256 });
  }
  function archive(id) { const row = read().find(x => x.id === id); if (!row || row.status !== 'draft') throw fail('초안만 보관할 수 있습니다.'); return update(id, { status: 'archived' }); }
  return { accounts, read, save, post, schedule, archive };
}
function router() {
  const r = require('express').Router();
  const ws = createWorkspace({ publish: require('./threadsClient').publishTextPost });
  // Only same-origin local UI may mutate this workspace. Never serialize token or API errors.
  r.use((req, res, next) => {
    if (req.method !== 'GET' && (req.get('sec-fetch-site') === 'cross-site' || (req.get('origin') && req.get('origin') !== `${req.protocol}://${req.get('host')}`))) return res.status(403).json({ error: '앱 화면에서 요청하세요.' });
    next();
  });
  const run = fn => async (req, res) => { try { res.json(await fn(req)); } catch(e) { res.status(e.status || 500).json({ error: e.status ? e.message : '채용 작업 데이터를 읽거나 저장하지 못했습니다.' }); } };
  r.get('/', run(() => ({ accounts: ws.accounts(), posts: ws.read().filter(x => x.status !== 'archived') })));
  r.post('/drafts', run(req => ({ post: ws.save(req.body) })));
  r.post('/drafts/:id/check', run(req => { const p = ws.read().find(x => x.id === req.params.id); if (!p) throw fail('초안을 찾을 수 없습니다.', 404); return { errors: validate(p, ws.read()) }; }));
  r.post('/drafts/:id/archive', run(req => ({ post: ws.archive(req.params.id) })));
  r.post('/drafts/:id/publish', run(async req => ({ post: await ws.post(req.params.id, req.body.revision, req.body.approved) })));
  r.post('/drafts/:id/schedule', run(async req => ({ post: await ws.schedule(req.params.id, req.body.revision, req.body.approved, req.body.scheduledAt) })));
  r.get('/schedule', run(async () => ({ posts: (await require('../../cloud/jobsStore').read()).rows.map(p => ({ id:p.id, handle:p.handle, title:p.title, text:p.text, status:p.status, scheduledAt:p.scheduledAt, mainUrl:p.mainUrl, replyUrl:p.replyUrl, error:p.error })) })));
  return r;
}
module.exports = { createWorkspace, validate, router };
