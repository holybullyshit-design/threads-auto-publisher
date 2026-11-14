// Cloud recruitment publisher. Never reads the saju queue or THREADS_ACCOUNTS_JSON.
const store = require('./jobsStore');
const { errors, verifyWeb, HANDLES, DAILY_LIMIT, kstDay, replyFor } = require('./jobsRules');
const { publishTextPost, publishImagePost } = require('../server/lib/threadsClient');
// 본문은 카드 이미지와 함께, 답글은 텍스트로 올린다.
const postToThreads = x => (x.imageUrls ? publishImagePost(x) : publishTextPost(x));
function accounts() {
  const raw = process.env.JOB_THREADS_ACCOUNTS_JSON;
  if (!raw) throw new Error('JOB_THREADS_ACCOUNTS_JSON 시크릿이 없습니다.');
  const value = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('채용 계정 시크릿 형식 오류');
  return value;
}
async function readBack(id, auth, expected, handle) {
  const url = new URL(`https://graph.threads.net/v1.0/${id}`);
  url.searchParams.set('fields', 'id,permalink,username,text,timestamp');
  url.searchParams.set('access_token', auth.accessToken);
  const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`Threads 공개 확인 실패 (HTTP ${r.status})`);
  const p = await r.json();
  if (String(p.id) !== String(id) || p.username !== handle || p.text !== expected || !p.permalink) throw new Error('Threads 게시 계정·본문 불일치');
  return { url: p.permalink, timestamp: p.timestamp };
}
// 'account'면 실제 계정 글 목록까지 확인, 'queue-only'면 큐 기록(errors의 dailyLimit·duplicate)으로만 판단했다는 뜻.
async function checkAccountDay(auth, handle, date, fetcher = fetch) {
  const url = new URL(`https://graph.threads.net/v1.0/${auth.userId}/threads`);
  url.searchParams.set('fields', 'id,username,text,timestamp,is_reply');
  url.searchParams.set('limit', '25');
  url.searchParams.set('access_token', auth.accessToken);
  const r = await fetcher(url, { signal: AbortSignal.timeout(15000) });
  // 2026-11-05: @high_quality_hire 토큰은 게시·게시물 조회·한도 조회는 되는데 글 목록만 403(code 10)으로 막혀 글이 못 나갔다.
  if (r.status === 403) return 'queue-only';
  if (!r.ok) throw new Error(`계정 게시 이력 확인 실패 (HTTP ${r.status})`);
  const data = await r.json();
  if (!Array.isArray(data.data)) throw new Error('계정 게시 이력 형식 오류');
  const today = data.data.filter(p => p.username === handle && !p.is_reply && p.timestamp && kstDay(p.timestamp) === date && p.text && !p.text.includes('hirecurator.blogspot.com'));
  if (today.length >= DAILY_LIMIT) throw new Error(`오늘 계정에 이미 본문 ${today.length}개가 게시됐습니다.`);
  return 'account';
}
async function run({ queue = store, publish = postToThreads, web = verifyWeb, now = () => new Date(), getAccounts = accounts, inspect = readBack, checkDay = checkAccountDay } = {}) {
  const initial = await queue.read();
  const due = initial.rows.filter(p => p.status === 'scheduled' && Date.parse(p.scheduledAt) <= now().getTime());
  for (const pending of due) {
    const current = now();
    const row = (await queue.read()).rows.find(p => p.id === pending.id);
    if (!row || row.status !== 'scheduled') continue;
    const list = (await queue.read()).rows;
    const issues = errors(row, list, current);
    if (issues.length) {
      const reason = issues.join(',') + (row.retryError ? ` · 마지막 재시도 사유: ${row.retryError}` : '');
      await queue.change(rows => { const p = rows.find(x => x.id === row.id); if (p?.status === 'scheduled') { p.status = 'blocked'; p.error = reason; } });
      console.error(`[채용 보류] ${row.id}: ${reason}`);
      continue;
    }
    let replyText;
    try {
      const checked = await web(row);
      if (checked?.blogUrl && checked.blogUrl !== row.blogUrl) await queue.change(rows => { const p = rows.find(x => x.id === row.id); if (p) p.blogUrl = checked.blogUrl; });
      // 2026-11-09 댓글 주소 시험: 자리표시는 방금 검증한 블로그 주소로만 바꾼다. 못 바꾸면 아래 catch에서 보류한다.
      replyText = replyFor(row, checked?.blogUrl || row.blogUrl);
    }
    catch (e) {
      // 일시 오류는 예약을 유지하고 다음 실행(errors의 time 조건: 당일 21시 전·슬롯 8시간 안)에서 다시 확인한다.
      if (e.transient) {
        if (row.retryError !== e.message) await queue.change(rows => { const p = rows.find(x => x.id === row.id); if (p?.status === 'scheduled') p.retryError = e.message; });
        console.error(`[채용 원문/블로그 재시도 대기] ${row.id}: ${e.message}`);
        continue;
      }
      await queue.change(rows => { const p = rows.find(x => x.id === row.id); if (p?.status === 'scheduled') { p.status = 'blocked'; p.error = e.message; } });
      console.error(`[채용 원문/블로그 보류] ${row.id}: ${e.message}`);
      continue;
    }
    let auth;
    try {
      auth = getAccounts()[row.handle];
      if (!HANDLES.includes(row.handle) || !auth?.userId || !auth?.accessToken || !Number.isFinite(Date.parse(auth.expiresAt)) || Date.parse(auth.expiresAt) <= current.getTime()) throw new Error('계정 시크릿·만료 확인 필요');
    } catch (e) {
      console.error(`[채용 인증 보류] ${row.id}: ${e.message}`);
      continue;
    }
    let historyCheck;
    try { historyCheck = await checkDay(auth, row.handle, kstDay(current.toISOString())); }
    catch (e) { console.error(`[채용 게시 이력 보류] ${row.id}: ${e.message}`); continue; }
    if (historyCheck === 'queue-only') console.error(`[채용 게시 이력 API 권한 없음] ${row.id} @${row.handle}: 큐 기록으로 하루 개수·중복을 확인함`);
    // Claim in the GitHub queue before the first Meta side effect. CAS retries rerun checks.
    const claimed = await queue.change(rows => {
      const p = rows.find(x => x.id === row.id);
      if (!p || p.status !== 'scheduled' || errors(p, rows, now()).length) return false;
      p.status = 'publishing'; p.attemptedAt = now().toISOString(); p.error = null; delete p.retryError;
      if (historyCheck === 'queue-only') p.historyCheck = 'queue-only';
      return true;
    });
    if (!claimed) continue;
    let mainId;
    try {
      const main = await publish({ text: row.text, imageUrls: [row.imageUrl], waitForReady: true, topicTag: row.topicTag, accessToken: auth.accessToken, threadsUserId: auth.userId });
      mainId = main.publishedId;
      if (!mainId) throw new Error('본문 게시 ID 없음');
      await queue.change(rows => { const p = rows.find(x => x.id === row.id); if (p.status !== 'publishing') throw new Error('본문 상태 충돌'); p.status = 'reply_pending'; p.publishedId = mainId; });
      const mainRead = await inspect(mainId, auth, row.text, row.handle);
      await queue.change(rows => { const p = rows.find(x => x.id === row.id); p.mainUrl = mainRead.url; p.mainTimestamp = mainRead.timestamp; });
    } catch (e) {
      await queue.change(rows => { const p = rows.find(x => x.id === row.id); p.status = 'uncertain'; if (mainId) p.publishedId = mainId; p.error = '본문 결과 수동 확인 필요'; });
      console.error(`[채용 본문 확인 필요] ${row.id}: ${e.message}`);
      continue;
    }
    try {
      const reply = await publish({ text: replyText, replyToId: mainId, accessToken: auth.accessToken, threadsUserId: auth.userId });
      if (!reply.publishedId) throw new Error('답글 게시 ID 없음');
      await queue.change(rows => { const p = rows.find(x => x.id === row.id); p.replyId = reply.publishedId; p.status = 'reply_pending'; if (replyText !== row.replyText) p.replySentText = replyText; });
      const replyRead = await inspect(reply.publishedId, auth, replyText, row.handle);
      await queue.change(rows => { const p = rows.find(x => x.id === row.id); p.status = 'published'; p.replyUrl = replyRead.url; p.replyTimestamp = replyRead.timestamp; p.publishedAt = now().toISOString(); p.error = null; });
      console.log(`[채용 게시 완료] ${row.id} @${row.handle}`);
    } catch (e) {
      await queue.change(rows => { const p = rows.find(x => x.id === row.id); p.status = 'reply_failed'; p.error = '답글 결과 수동 확인 필요'; });
      console.error(`[채용 답글 확인 필요] ${row.id}: ${e.message}`);
    }
  }
}
if (require.main === module) run().catch(e => { console.error('채용 예약 작업 실패:', e.message); process.exitCode = 1; });
module.exports = { run, accounts, readBack, checkAccountDay };
