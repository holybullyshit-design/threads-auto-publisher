const crypto = require('node:crypto');
const HANDLES = ['jobs_curator', 'hire_masters', 'high_quality_hire'];
const H = 3600000;
// 2026-11-04 사용자 결정: 계정당 하루 2개(오전 1개, 17시 이후 1개).
const DAILY_LIMIT = 2;
// 게시 직전 verifyWeb가 원문 해시·블로그 공개를 다시 확인하므로 사전 검수는 7일까지 유효하다.
const REVIEW_VALID_HOURS = 7 * 24;
const BLOG = 'https://hirecurator.blogspot.com/';
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
  // 급여 줄은 항상 있어야 한다. 공고문이 세전이라고 밝히지 않은 금액·미공개는 공고 표기 그대로 쓴다.
  if (!/(세전|연봉|월급|기본월봉|기본급|월\s*[\d,]+(?:~[\d,]+)?(?:만|원)|연\s*환산|미공개)/.test(p.text || '') || !p.verifiedPay || !p.text.includes(p.verifiedPay)) out.push('pay');
  if (/https?:\/\/|blogspot\.com/.test(p.text || '')) out.push('textLink');
  // 예약 시점에 아직 공개 전인 블로그 글은 blogUrl 대신 blogTitle로 게시 직전에 찾는다.
  for (const key of ['sourceUrl', 'blogUrl']) { if (key === 'blogUrl' && !p.blogUrl && p.blogTitle?.trim()) continue; try { const u = new URL(p[key]); if (u.protocol !== 'https:' || u.username || u.password) out.push(key); } catch { out.push(key); } }
  // 2026-11-04 사용자 결정: 댓글에 URL을 넣지 않고 프로필 링크(블로그)로 보낸다. blogUrl은 게시 전 검증에만 쓴다.
  if (/https?:\/\/|blogspot\.com/.test(p.replyText || '') || !p.replyText?.includes('프로필 링크')) out.push('replyLink');
  if (!/^[a-f0-9]{64}$/.test(p.sourceSha256 || '')) out.push('sourceHash');
  if (!p.factsChecked || !p.blogChecked || !p.employmentType || !p.eligibility || !p.blogEvidence) out.push('review');
  const start = Date.parse(p.startsAt);
  if (!Number.isFinite(slot) || !Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(checked) || start >= end) out.push('date');
  else {
    if (slot > time || time - slot > 8 * H || kstDay(p.scheduledAt) !== kstDay(now.toISOString()) || kstHour(now.toISOString()) >= 21) out.push('time');
    if (reminder) {
      const exactKstTime = new Date(end + 9 * H).toISOString().slice(11, 16);
      if (kstDay(p.scheduledAt) !== kstDay(p.deadlineAt) || kstDay(now.toISOString()) !== kstDay(p.deadlineAt) || end - time < 4 * H || end - time > 24 * H) out.push('deadline');
      if (!p.text.includes('오늘 마감') || !p.text.includes(exactKstTime)) out.push('deadlineCopy');
    } else if (end - time < Math.max(120, Number(p.preparationHours) || 120) * H) out.push('deadline');
    if (checked > time || time - checked > REVIEW_VALID_HOURS * H) out.push('staleReview');
    if (start > time && !/접수\s*예정/.test(p.text || '')) out.push('notOpen');
  }
  const history = rows.filter(x => x.id !== p.id && ['publishing', 'reply_pending', 'published', 'reply_failed', 'uncertain'].includes(x.status));
  if (history.filter(x => x.handle === p.handle && x.attemptedAt && kstDay(x.attemptedAt) === kstDay(now.toISOString())).length >= DAILY_LIMIT) out.push('dailyLimit');
  const same = history.filter(x => x.noticeId === p.noticeId || x.sourceUrl === p.sourceUrl);
  const own = same.filter(x => x.handle === p.handle);
  if (!reminder && own.length) out.push('duplicate');
  if (reminder && (own.some(x => x.postType === 'deadline_reminder') || own.some(x => !Number.isFinite(Date.parse(x.attemptedAt || x.publishedAt)) || time - Date.parse(x.attemptedAt || x.publishedAt) < 72 * H))) out.push('duplicate');
  if (new Set([...same.map(x => x.handle), p.handle]).size > 2) out.push('crossAccountLimit');
  if (same.some(x => x.handle !== p.handle && time - Date.parse(x.attemptedAt || x.publishedAt) < 24 * H)) out.push('crossAccountGap');
  if (history.some(x => x.text?.trim() === p.text?.trim())) out.push('copyDuplicate');
  return out;
}
async function findBlogUrl(title, fetcher) {
  const feed = await fetcher(`${BLOG}feeds/posts/default?alt=json&max-results=50`, { signal: AbortSignal.timeout(15000) });
  if (!feed.ok) throw new Error(`블로그 목록 HTTP ${feed.status}`);
  const entries = (await feed.json()).feed?.entry || [];
  const found = entries.filter(e => e.title?.$t?.includes(title));
  if (found.length !== 1) throw new Error(found.length ? '블로그 제목이 여러 글과 일치' : '블로그 글이 아직 공개되지 않음');
  return found[0].link.find(l => l.rel === 'alternate').href;
}
// 공식 원문 해시와 블로그 공개·근거를 확인하고, 확인한 블로그 주소를 돌려준다.
async function verifyWeb(p, fetcher = fetch) {
  const source = await fetcher(p.sourceUrl, { redirect: 'follow', signal: AbortSignal.timeout(15000) });
  if (!source.ok) throw new Error(`공식 자료 HTTP ${source.status}`);
  const bytes = Buffer.from(await source.arrayBuffer());
  if (bytes.length < 100 || bytes.length > 30_000_000 || crypto.createHash('sha256').update(bytes).digest('hex') !== p.sourceSha256) throw new Error('공식 공고 내용 변경 또는 파일 오류');
  const blogUrl = p.blogUrl || await findBlogUrl(p.blogTitle, fetcher);
  const blog = await fetcher(blogUrl, { redirect: 'follow', signal: AbortSignal.timeout(15000) });
  if (!blog.ok || !blog.url.startsWith(BLOG)) throw new Error('블로그 공개 URL 오류');
  const html = await blog.text();
  // blogPayUnchecked: 예약 시점에 블로그 본문을 볼 수 없어 급여를 공식 원문(해시 고정)으로만 확인한 글.
  if (!html.includes(p.blogEvidence) || (!p.blogPayUnchecked && !html.includes(p.verifiedPay))) throw new Error('블로그 본문 근거 불일치');
  return { blogUrl };
}
module.exports = { HANDLES, DAILY_LIMIT, errors, verifyWeb, kstDay };
