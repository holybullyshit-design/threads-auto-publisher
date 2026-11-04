const crypto = require('node:crypto');
const HANDLES = ['jobs_curator', 'hire_masters', 'high_quality_hire'];
const H = 3600000;
const kstDay = value => new Date(Date.parse(value) + 9 * H).toISOString().slice(0, 10);
const kstHour = value => new Date(Date.parse(value) + 9 * H).getUTCHours();
function errors(p, rows, now = new Date()) {
  const out = [];
  const time = now.getTime(), slot = Date.parse(p.scheduledAt), end = Date.parse(p.deadlineAt), checked = Date.parse(p.checkedAt);
  const reminder = p.postType === 'deadline_reminder';
  if (p.postType && !['initial', 'deadline_reminder'].includes(p.postType)) out.push('postType');
  if (!HANDLES.includes(p.handle)) out.push('account');
  if (!p.id || !p.noticeId || !p.title || !p.angle) out.push('identity');
  if (!p.text?.trim() || p.text.length > 500 || !p.replyText?.trim() || p.replyText.length > 500) out.push('copy');
  if (!/(세전\s*(?:기본|초임)?연봉|세전\s*월(?:급|\s*기본급)|연\s*환산)/.test(p.text || '') || !p.verifiedPay || !p.text.includes(p.verifiedPay)) out.push('pay');
  for (const key of ['sourceUrl', 'blogUrl']) { try { const u = new URL(p[key]); if (u.protocol !== 'https:' || u.username || u.password) out.push(key); } catch { out.push(key); } }
  if (!p.replyText?.includes(p.blogUrl)) out.push('replyLink');
  if (!/^[a-f0-9]{64}$/.test(p.sourceSha256 || '')) out.push('sourceHash');
  if (!p.factsChecked || !p.blogChecked || !p.employmentType || !p.eligibility || !p.blogEvidence) out.push('review');
  const start = Date.parse(p.startsAt);
  if (!Number.isFinite(slot) || !Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(checked) || start >= end) out.push('date');
  else {
    if (kstDay(p.scheduledAt) < '2026-11-02' || kstDay(p.scheduledAt) > '2026-11-14') out.push('period');
    if (slot > time || time - slot > 8 * H || kstDay(p.scheduledAt) !== kstDay(now.toISOString()) || kstHour(now.toISOString()) >= 21) out.push('time');
    if (reminder) {
      const exactKstTime = new Date(end + 9 * H).toISOString().slice(11, 16);
      if (kstDay(p.scheduledAt) !== kstDay(p.deadlineAt) || kstDay(now.toISOString()) !== kstDay(p.deadlineAt) || end - time < 4 * H || end - time > 24 * H) out.push('deadline');
      if (!p.text.includes('오늘 마감') || !p.text.includes(exactKstTime)) out.push('deadlineCopy');
    } else if (end - time < Math.max(120, Number(p.preparationHours) || 120) * H) out.push('deadline');
    if (checked > time || time - checked > 24 * H) out.push('staleReview');
    if (start > time && !/접수\s*예정/.test(p.text || '')) out.push('notOpen');
  }
  const history = rows.filter(x => x.id !== p.id && ['publishing', 'reply_pending', 'published', 'reply_failed', 'uncertain'].includes(x.status));
  if (history.some(x => x.handle === p.handle && x.attemptedAt && kstDay(x.attemptedAt) === kstDay(now.toISOString()))) out.push('dailyLimit');
  const same = history.filter(x => x.noticeId === p.noticeId || x.sourceUrl === p.sourceUrl);
  const own = same.filter(x => x.handle === p.handle);
  if (!reminder && own.length) out.push('duplicate');
  if (reminder && (own.some(x => x.postType === 'deadline_reminder') || own.some(x => !Number.isFinite(Date.parse(x.attemptedAt || x.publishedAt)) || time - Date.parse(x.attemptedAt || x.publishedAt) < 72 * H))) out.push('duplicate');
  if (new Set([...same.map(x => x.handle), p.handle]).size > 2) out.push('crossAccountLimit');
  if (same.some(x => x.handle !== p.handle && time - Date.parse(x.attemptedAt || x.publishedAt) < 24 * H)) out.push('crossAccountGap');
  if (history.some(x => x.text?.trim() === p.text?.trim())) out.push('copyDuplicate');
  return out;
}
async function verifyWeb(p, fetcher = fetch) {
  const source = await fetcher(p.sourceUrl, { redirect: 'follow', signal: AbortSignal.timeout(15000) });
  if (!source.ok) throw new Error(`공식 자료 HTTP ${source.status}`);
  const bytes = Buffer.from(await source.arrayBuffer());
  if (bytes.length < 100 || bytes.length > 30_000_000 || crypto.createHash('sha256').update(bytes).digest('hex') !== p.sourceSha256) throw new Error('공식 공고 내용 변경 또는 파일 오류');
  const blog = await fetcher(p.blogUrl, { redirect: 'follow', signal: AbortSignal.timeout(15000) });
  if (!blog.ok || !blog.url.startsWith('https://hirecurator.blogspot.com/')) throw new Error('블로그 공개 URL 오류');
  const html = await blog.text();
  if (!html.includes(p.blogEvidence) || !html.includes(p.verifiedPay)) throw new Error('블로그 본문 근거 불일치');
}
module.exports = { HANDLES, errors, verifyWeb, kstDay };
