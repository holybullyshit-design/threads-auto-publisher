const crypto = require('node:crypto');
const HANDLES = ['jobs_curator', 'hire_masters', 'high_quality_hire'];
const H = 3600000;
// 2026-11-04 사용자 결정: 계정당 하루 2개(오전 1개, 17시 이후 1개).
const DAILY_LIMIT = 2;
// 게시 직전 verifyWeb가 원문 해시·블로그 공개를 다시 확인하므로 사전 검수는 일정 기간 유효하다.
// 2026-11-04 7일(헌법 v2.3) → 2026-11-14 사용자 지시("14일로 늘려 지금 올려", 헌법 v2.15) 14일.
const REVIEW_VALID_HOURS = 14 * 24;
const BLOG = 'https://hirecurator.blogspot.com/';
// 2026-11-04 사용자 결정: 모든 글에 자체 카드 이미지를 붙인다. 이미지는 이 저장소에 올린 PNG만 쓴다.
const CARD_BASE = 'https://raw.githubusercontent.com/holybullyshit-design/threads-auto-publisher/';
const numbers = value => (String(value).match(/\d[\d,]*/g) || []).map(n => n.replace(/,/g, ''));
function cardStrings(c) {
  const hero = c.hero ? [c.hero.label, c.hero.value, c.hero.sub] : [];
  return [c.badge, ...(c.hook || []), c.org, c.role, ...hero, ...(c.tags || []), ...(c.facts || []).flat(), c.deadline]
    .filter(Boolean).map(s => String(s).replace(/\[\[|\]\]/g, ''));
}
// 카드에는 검수된 본문에 있는 숫자만 쓴다. 기관명과 마감 문구는 본문 그대로 쓴다.
function cardIssues(p) {
  const c = p.card, text = p.text || '';
  if (!c || !c.org || !c.deadline || !Array.isArray(c.facts) || c.facts.length !== 3) return true;
  if (!text.includes(c.org) || !text.includes(c.deadline)) return true;
  const allowed = new Set(numbers(text));
  return cardStrings(c).some(s => numbers(s).some(n => !allowed.has(n)));
}
// 2026-11-11: 기업 채용 사이트(SK Careers)는 같은 공고 화면도 열 때마다 자원 주소의 ?v=<현재 시각>만 바뀐다(나머지는 글자 하나까지 같음).
// 이런 원문은 그 표시만 지우고 나머지 전체를 해시로 대조한다. 공고 글자가 하나라도 바뀌면 지금처럼 보류된다. 허용한 방식 이름만 쓴다.
const SOURCE_NORMALIZERS = { 'strip-asset-version': bytes => Buffer.from(bytes.toString('utf8').replace(/\?v=[^"']*/g, '?v='), 'utf8') };
const sourceHash = (bytes, normalize) => crypto.createHash('sha256').update(normalize === undefined ? bytes : SOURCE_NORMALIZERS[normalize](bytes)).digest('hex');
// 첫 소개는 마감 120시간 전까지 한다(헌법). 예외는 사용자가 공고별로 허락한 것만 여기 적는다. 행 값(preparationHours)으로는 늘릴 수만 있다.
// 2026-11-11 사용자 지시("120시간 규칙 때문에..? 그래도 넣어보자. 사람들의 초유의 관심사거든"): SK하이닉스 [11월] Talent hy-way만 48시간.
const LEAD_EXCEPTIONS = { 'skhynix-R262381': 48 };
const leadHours = p => Object.hasOwn(LEAD_EXCEPTIONS, p.noticeId) ? LEAD_EXCEPTIONS[p.noticeId] : Math.max(120, Number(p.preparationHours) || 120);
const kstDay = value => new Date(Date.parse(value) + 9 * H).toISOString().slice(0, 10);
// 2026-11-09 사용자 결정("시험해보자"): 프로필 링크 클릭이 주 3번뿐이라 @high_quality_hire만 11/10~16(KST) 1주일 동안
// 첫 댓글에 그 공고의 블로그 글 주소를 넣어 노출·클릭을 비교한다. 댓글에는 주소 대신 자리표시를 쓰고,
// 게시기가 게시 직전에 검증한 우리 블로그 주소로만 바꿔 넣는다. 다른 계정·기간 밖·직접 쓴 주소는 계속 막는다.
const REPLY_LINK_TEST = { handle: 'high_quality_hire', from: '2026-11-10', to: '2026-11-16' };
const BLOG_PLACEHOLDER = '{블로그주소}';
const replyLinkTest = p => Number.isFinite(Date.parse(p.scheduledAt)) && p.handle === REPLY_LINK_TEST.handle
  && kstDay(p.scheduledAt) >= REPLY_LINK_TEST.from && kstDay(p.scheduledAt) <= REPLY_LINK_TEST.to;
// 실제로 올릴 댓글. 자리표시가 있으면 검증된 블로그 주소로 바꾸고, 쓸 수 없는 경우는 throw한다(보류).
function replyFor(p, blogUrl) {
  const reply = p.replyText || '';
  if (!reply.includes(BLOG_PLACEHOLDER)) return reply;
  if (!replyLinkTest(p) || reply.split(BLOG_PLACEHOLDER).length !== 2 || !String(blogUrl || '').startsWith(BLOG) || /\s/.test(blogUrl)) throw new Error('댓글 블로그 주소를 쓸 수 없음');
  return reply.split(BLOG_PLACEHOLDER).join(blogUrl);
}
const kstHour = value => new Date(Date.parse(value) + 9 * H).getUTCHours();
function errors(p, rows, now = new Date()) {
  const out = [];
  const time = now.getTime(), slot = Date.parse(p.scheduledAt), end = Date.parse(p.deadlineAt), checked = Date.parse(p.checkedAt);
  const reminder = p.postType === 'deadline_reminder';
  if (p.postType && !['initial', 'deadline_reminder'].includes(p.postType)) out.push('postType');
  if (!HANDLES.includes(p.handle)) out.push('account');
  if (!p.id || !p.noticeId || !p.title || !p.angle) out.push('identity');
  if (!p.text?.trim() || p.text.length > 500 || !p.replyText?.trim() || p.replyText.length > 500) out.push('copy');
  // 급여 줄은 항상 있어야 한다. 공고문이 세전이라고 밝히지 않은 금액·미공개는 공고 표기 그대로 쓴다. 일급·시급만 공고된 경우 그대로 쓴다.
  if (!/(세전|연봉|월급|일급|시급|기본월봉|기본급|월\s*[\d,]+(?:~[\d,]+)?(?:만|원)|연\s*환산|미공개)/.test(p.text || '') || !p.verifiedPay || !p.text.includes(p.verifiedPay)) out.push('pay');
  if (/https?:\/\/|blogspot\.com/.test(p.text || '')) out.push('textLink');
  // 예약 시점에 아직 공개 전인 블로그 글은 blogUrl 대신 blogTitle로 게시 직전에 찾는다.
  for (const key of ['sourceUrl', 'blogUrl']) { if (key === 'blogUrl' && !p.blogUrl && p.blogTitle?.trim()) continue; try { const u = new URL(p[key]); if (u.protocol !== 'https:' || u.username || u.password) out.push(key); } catch { out.push(key); } }
  // 2026-11-04 사용자 결정: 댓글에 URL을 넣지 않고 프로필 링크(블로그)로 보낸다. blogUrl은 게시 전 검증에만 쓴다.
  const reply = p.replyText || '', holders = reply.split(BLOG_PLACEHOLDER).length - 1;
  if (/https?:\/\/|blogspot\.com/.test(reply) || holders > 1 || (holders === 1 && !replyLinkTest(p)) || (holders === 0 && !reply.includes('프로필 링크'))) out.push('replyLink');
  if (!/^[a-f0-9]{64}$/.test(p.sourceSha256 || '') || (p.sourceNormalize !== undefined && !Object.hasOwn(SOURCE_NORMALIZERS, p.sourceNormalize))) out.push('sourceHash');
  if (!p.imageUrl?.startsWith(CARD_BASE) || !p.imageUrl.endsWith('.png') || !/^[a-f0-9]{64}$/.test(p.imageSha256 || '')) out.push('image');
  if (cardIssues(p)) out.push('cardFacts');
  if (!p.factsChecked || !p.blogChecked || !p.employmentType || !p.eligibility || !p.blogEvidence) out.push('review');
  const start = Date.parse(p.startsAt);
  if (!Number.isFinite(slot) || !Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(checked) || start >= end) out.push('date');
  else {
    if (slot > time || time - slot > 8 * H || kstDay(p.scheduledAt) !== kstDay(now.toISOString()) || kstHour(now.toISOString()) >= 21) out.push('time');
    if (reminder) {
      const exactKstTime = new Date(end + 9 * H).toISOString().slice(11, 16);
      if (kstDay(p.scheduledAt) !== kstDay(p.deadlineAt) || kstDay(now.toISOString()) !== kstDay(p.deadlineAt) || end - time < 4 * H || end - time > 24 * H) out.push('deadline');
      if (!p.text.includes('오늘 마감') || !p.text.includes(exactKstTime)) out.push('deadlineCopy');
    } else if (end - time < leadHours(p) * H) out.push('deadline');
    if (checked > time || time - checked > REVIEW_VALID_HOURS * H) out.push('staleReview');
    if (start > time && !/접수\s*예정/.test(p.text || '')) out.push('notOpen');
  }
  const history = rows.filter(x => x.id !== p.id && ['publishing', 'reply_pending', 'published', 'reply_failed', 'uncertain'].includes(x.status));
  if (history.filter(x => x.handle === p.handle && x.attemptedAt && kstDay(x.attemptedAt) === kstDay(now.toISOString())).length >= DAILY_LIMIT) out.push('dailyLimit');
  const same = history.filter(x => x.noticeId === p.noticeId || x.sourceUrl === p.sourceUrl);
  const own = same.filter(x => x.handle === p.handle);
  if (!reminder && own.length) out.push('duplicate');
  if (reminder && (own.some(x => x.postType === 'deadline_reminder') || own.some(x => !Number.isFinite(Date.parse(x.attemptedAt || x.publishedAt)) || time - Date.parse(x.attemptedAt || x.publishedAt) < 72 * H))) out.push('duplicate');
  // 2026-11-05 사용자 결정: 같은 공고를 세 계정 모두 소개해도 된다(계정별 문체·카드가 다르면 됨). 같은 계정 반복·24시간 간격·같은 문구는 계속 막는다.
  if (same.some(x => x.handle !== p.handle && time - Date.parse(x.attemptedAt || x.publishedAt) < 24 * H)) out.push('crossAccountGap');
  if (history.some(x => x.text?.trim() === p.text?.trim())) out.push('copyDuplicate');
  return out;
}
// 2026-11-05: 같은 블로그 주소가 10:30엔 열리고 10:45엔 안 열려 글 2개가 영구 보류됐다.
// 일시 오류(연결·429·5xx·블로그 미공개)는 transient로 표시해 큐가 다음 실행에 다시 시도하게 한다.
// 원문 해시·카드 해시·블로그 근거 불일치는 내용 문제이므로 그대로 보류한다.
const transient = message => Object.assign(new Error(message), { transient: true });
const retryable = status => status === 429 || status >= 500;
async function get(fetcher, url, net) {
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await fetcher(url, { redirect: 'follow', signal: AbortSignal.timeout(15000) });
      if (!retryable(r.status) || attempt >= net.attempts) return r;
    } catch (e) {
      if (attempt >= net.attempts) throw transient(`${e.name === 'TimeoutError' || e.name === 'AbortError' ? '응답 시간 초과' : '연결 실패'} (${new URL(url).hostname})`);
    }
    await new Promise(done => setTimeout(done, net.delayMs * attempt));
  }
}
async function findBlogUrl(title, fetcher, net) {
  const feed = await get(fetcher, `${BLOG}feeds/posts/default?alt=json&max-results=50`, net);
  if (!feed.ok) throw transient(`블로그 목록 HTTP ${feed.status}`);
  const entries = (await feed.json()).feed?.entry || [];
  const found = entries.filter(e => e.title?.$t?.includes(title));
  if (found.length > 1) throw new Error('블로그 제목이 여러 글과 일치');
  if (!found.length) throw transient('블로그 글이 아직 공개되지 않음');
  return found[0].link.find(l => l.rel === 'alternate').href;
}
// 2026-11-11: GitHub 실행기에서 공개된 글 페이지가 매번 HTTP 429(www.google.com 차단 화면으로 이동)로 막혔고, 같은 실행기에서 피드는 열렸다.
// 글 페이지를 못 열면 공개 글만 담는 피드에서 같은 주소의 글 본문을 찾아 근거를 확인한다. 피드도 못 열거나 글이 없으면 null(원래 오류로 재시도).
async function feedBody(blogUrl, fetcher, net) {
  try {
    const feed = await get(fetcher, `${BLOG}feeds/posts/default?alt=json&max-results=50`, net);
    if (!feed.ok || (feed.url && !feed.url.startsWith(BLOG))) return null;
    const norm = u => String(u || '').split(/[?#]/)[0].replace(/^http:/, 'https:');
    const entry = ((await feed.json()).feed?.entry || []).find(e => (e.link || []).some(l => l.rel === 'alternate' && norm(l.href) === norm(blogUrl)));
    return typeof entry?.content?.$t === 'string' ? entry.content.$t : null;
  } catch { return null; }
}
// 공식 원문 해시와 블로그 공개·근거를 확인하고, 확인한 블로그 주소를 돌려준다.
async function verifyWeb(p, fetcher = fetch, { attempts = 3, delayMs = 3000 } = {}) {
  const net = { attempts, delayMs };
  const source = await get(fetcher, p.sourceUrl, net);
  if (!source.ok) throw (retryable(source.status) ? transient : m => new Error(m))(`공식 자료 HTTP ${source.status}`);
  const bytes = Buffer.from(await source.arrayBuffer());
  if (bytes.length < 100 || bytes.length > 30_000_000 || (p.sourceNormalize !== undefined && !Object.hasOwn(SOURCE_NORMALIZERS, p.sourceNormalize)) || sourceHash(bytes, p.sourceNormalize) !== p.sourceSha256) throw new Error('공식 공고 내용 변경 또는 파일 오류');
  const image = await get(fetcher, p.imageUrl, net);
  if (!image.ok) throw (retryable(image.status) ? transient : m => new Error(m))(`카드 이미지 HTTP ${image.status}`);
  const card = Buffer.from(await image.arrayBuffer());
  if (card.length < 1000 || card.length > 8_000_000 || crypto.createHash('sha256').update(card).digest('hex') !== p.imageSha256) throw new Error('카드 이미지 변경 또는 파일 오류');
  const blogUrl = p.blogUrl || await findBlogUrl(p.blogTitle, fetcher, net);
  if (!String(blogUrl).startsWith(BLOG)) throw new Error('블로그 공개 URL 오류 (우리 블로그 주소 아님)');
  const blog = await get(fetcher, blogUrl, net);
  const moved = blog.url && !blog.url.startsWith(BLOG) ? `, ${new URL(blog.url).hostname}로 이동` : '';
  let html;
  if (!blog.ok || moved) {
    html = await feedBody(blogUrl, fetcher, net);
    if (html === null) throw transient(`블로그 공개 URL 오류 (HTTP ${blog.status}${moved})`);
  } else html = await blog.text();
  // blogPayUnchecked: 예약 시점에 블로그 본문을 볼 수 없어 급여를 공식 원문(해시 고정)으로만 확인한 글.
  if (!html.includes(p.blogEvidence) || (!p.blogPayUnchecked && !html.includes(p.verifiedPay))) throw new Error('블로그 본문 근거 불일치');
  return { blogUrl };
}
module.exports = { HANDLES, DAILY_LIMIT, REVIEW_VALID_HOURS, CARD_BASE, REPLY_LINK_TEST, BLOG_PLACEHOLDER, SOURCE_NORMALIZERS, LEAD_EXCEPTIONS, errors, verifyWeb, kstDay, replyFor, sourceHash, leadHours };
