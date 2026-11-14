// Recruitment stays outside the existing saju schedule and cloud credentials.
// 2026-11-14 사용자 지시("현재 규칙에 맞게 고쳐"): 이 화면은 초안 작성·검사만 한다.
// 게시는 GitHub 클라우드 큐로만 하고(헌법 v2.2), 예약 등록은 automation/ops/queue_threads.sh로만 한다
// (카드 이미지·원문 해시·블로그 근거 사전 검사와 변이 검사, 헌법 v2.4·v2.5). 검사 기준은 cloud/jobsRules의 값을 쓴다.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DAILY_LIMIT, REVIEW_VALID_HOURS, leadHours } = require('../../cloud/jobsRules');
const HANDLES = ['jobs_curator', 'hire_masters', 'high_quality_hire'];
const ROOT = '/Users/choitaehwan/Documents/ChatGPT/스레드 채용공고 자동화/automation';
const HOUR = 3600000;
const fail = (message, status = 422) => Object.assign(new Error(message), { status });
const httpUrl = s => { try { const u = new URL(s); return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password; } catch { return false; } };
function validate(p, all = [], now = Date.now()) {
  const errors = [];
  const reminder = p.postType === 'deadline_reminder';
  if (p.postType && !['initial', 'deadline_reminder'].includes(p.postType)) errors.push('게시 유형을 확인하세요.');
  if (!HANDLES.includes(p.handle)) errors.push('채용 계정을 선택하세요.');
  if (!p.noticeId || !p.title || !p.angle) errors.push('공고 ID·제목·소개할 핵심 정보를 입력하세요.');
  if (!p.text?.trim() || p.text.length > 500) errors.push('본문은 1~500자로 작성하세요.');
  if (/https?:\/\/|blogspot\.com/.test(p.text || '')) errors.push('본문에는 주소를 넣지 않습니다. 블로그는 프로필 링크로 보냅니다.');
  if (!p.verifiedPay || !p.text?.includes(p.verifiedPay)) errors.push('공식 공고에서 확인한 급여와 본문 금액이 일치해야 합니다.');
  if (!httpUrl(p.sourceUrl) || !httpUrl(p.blogUrl)) errors.push('공식 공고와 공개 블로그 주소를 확인하세요.');
  else if (!String(p.blogUrl).startsWith('https://hirecurator.blogspot.com/')) errors.push('블로그 주소는 채용 큐레이터 블로그(hirecurator.blogspot.com) 글이어야 합니다.');
  if (!p.replyText?.includes('프로필 링크') || /https?:\/\/|blogspot\.com/.test(p.replyText || '') || p.replyText.length > 500) errors.push("첫 댓글은 주소 없이 '프로필 링크' 안내로 500자 이내로 씁니다.");
  const start = Date.parse(p.startsAt), end = Date.parse(p.deadlineAt), checked = Date.parse(p.checkedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) errors.push('정확한 접수 시작·마감 시각을 입력하세요.');
  if (start > now && !/접수\s*예정/.test(p.text || '')) errors.push('접수 시작 전 공고는 본문에 접수 예정임을 명시하세요.');
  if (reminder && Number.isFinite(end)) {
    const kstDay = value => new Date(value + 9 * HOUR).toISOString().slice(0, 10);
    const exactKstTime = new Date(end + 9 * HOUR).toISOString().slice(11, 16);
    if (kstDay(now) !== kstDay(end) || end - now < 4 * HOUR || end - now > 24 * HOUR) errors.push('마감 당일 알림은 정확한 마감일의 4시간 이상 전에만 게시하세요.');
    if (!p.text?.includes('오늘 마감') || !p.text.includes(exactKstTime)) errors.push(`본문에 '오늘 마감'과 정확한 마감 시각 ${exactKstTime} KST를 적으세요.`);
  } else if (!Number.isFinite(end) || end - now < leadHours(p) * HOUR) errors.push('최초 소개는 마감까지 최소 120시간과 필요한 준비 기간을 확보해야 합니다.');
  if (!Number.isFinite(checked) || checked > now || now - checked > REVIEW_VALID_HOURS * HOUR) errors.push(`사전 검수는 ${REVIEW_VALID_HOURS / 24}일까지 유효합니다. 공식 자료를 다시 확인하세요.`);
  if (!p.factsChecked || !p.blogChecked) errors.push('원문·첨부파일의 조건과 공개 블로그·모바일 화면을 확인하세요.');
  const history = all.filter(x => x.id !== p.id && ['publishing', 'published', 'reply_failed', 'uncertain'].includes(x.status));
  const same = history.filter(x => x.noticeId === p.noticeId || x.sourceUrl === p.sourceUrl);
  const kstDate = value => new Date(Date.parse(value) + 9 * HOUR).toISOString().slice(0, 10);
  const targetDay = kstDate(new Date(now).toISOString());
  if (history.filter(x => x.handle === p.handle && (x.publishedAt || x.attemptedAt) && kstDate(x.publishedAt || x.attemptedAt) === targetDay).length >= DAILY_LIMIT) errors.push(`이 계정은 오늘 이미 ${DAILY_LIMIT}개를 게시했거나 게시 결과를 확인 중입니다.`);
  const own = same.filter(x => x.handle === p.handle);
  if (!reminder && own.length) errors.push('이 계정에서 이미 소개한 공고입니다.');
  if (reminder && (own.some(x => x.postType === 'deadline_reminder') || own.some(x => !Number.isFinite(Date.parse(x.publishedAt || x.attemptedAt)) || now - Date.parse(x.publishedAt || x.attemptedAt) < 72 * HOUR))) errors.push('같은 계정의 마감 알림은 1회만, 앞선 소개와 72시간 이상 간격을 둡니다.');
  // 같은 공고는 세 계정 모두 소개할 수 있다(헌법 v2.7). 계정 사이 24시간 간격은 지킨다.
  if (same.some(x => x.handle !== p.handle && now - Date.parse(x.publishedAt || x.attemptedAt) < 24 * HOUR)) errors.push('다른 계정의 같은 공고 소개와 24시간 간격이 필요합니다.');
  if (history.some(x => x.text?.trim() === p.text?.trim())) errors.push('동일한 본문을 이미 게시했거나 결과 확인 중입니다.');
  return errors;
}
const LOCAL_PUBLISH_REFUSED = '채용 글은 이 화면에서 바로 게시하지 않습니다. 게시는 GitHub 클라우드 큐로만 하고, 예약 등록은 automation/ops/queue_threads.sh로 합니다(헌법 v2.2).';
const LOCAL_SCHEDULE_REFUSED = '채용 예약은 automation/ops/queue_threads.sh로만 등록합니다. 카드 이미지·원문 해시·블로그 근거 사전 검사와 변이 검사가 거기서 이뤄집니다(헌법 v2.4·v2.5).';
function createWorkspace({ file = process.env.JOB_THREADS_DRAFT_FILE || path.join(ROOT, 'state/threads-workspace.json'), tokenDir = process.env.JOB_THREADS_TOKEN_DIR || path.join(ROOT, 'secrets/threads') } = {}) {
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
  // 2026-11-14: 로컬 즉시 게시·카드 없는 예약은 현재 규칙 위반이라 받지 않는다. Threads API와 클라우드 큐를 건드리지 않는다.
  async function post() { throw fail(LOCAL_PUBLISH_REFUSED, 409); }
  async function schedule() { throw fail(LOCAL_SCHEDULE_REFUSED, 409); }
  function archive(id) { const row = read().find(x => x.id === id); if (!row || row.status !== 'draft') throw fail('초안만 보관할 수 있습니다.'); return update(id, { status: 'archived' }); }
  return { accounts, read, save, post, schedule, archive };
}
function router() {
  const r = require('express').Router();
  const ws = createWorkspace();
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
