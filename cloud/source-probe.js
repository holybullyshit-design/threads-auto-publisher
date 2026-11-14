// 게시 없이, 클라우드 실행기(GitHub Actions)에서 예약 행의 공식 원문·카드·블로그 확인을 미리 돌려 본다(2026-11-11 추가).
// 게시기와 같은 verifyWeb를 쓴다. 블로그가 아직 공개 전이면 원문·카드까지 통과한 것으로 본다(게시 직전에 다시 확인).
// 사용: PROBE_NOTICE=<공고 ID, 비우면 예약 전체> GITHUB_TOKEN=… GITHUB_REPO=… node cloud/source-probe.js
const store = require('./jobsStore');
const { verifyWeb } = require('./jobsRules');

(async () => {
  const want = (process.env.PROBE_NOTICE || '').trim();
  const { rows } = await store.read();
  const targets = rows.filter(r => r.status === 'scheduled' && (!want || r.noticeId === want));
  if (!targets.length) throw new Error(`예약 행 없음: ${want || '(전체)'}`);
  let bad = 0;
  for (const url of [...new Set(targets.map(r => r.sourceUrl))]) {
    try {
      const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15000) });
      const len = (await r.arrayBuffer()).byteLength;
      console.log(`원문 접속 ${r.status} ${len}바이트 ${new URL(r.url).hostname} ← ${url}`);
    } catch (e) { console.log(`원문 접속 실패 ${e.name} ← ${url}`); }
  }
  for (const p of targets) {
    let result = 'ok';
    try { await verifyWeb(p); } catch (e) { result = e.message; }
    const ok = result === 'ok' || (result === '블로그 글이 아직 공개되지 않음' && p.blogTitle && !p.blogUrl);
    if (!ok) bad++;
    console.log(`${ok ? 'PASS' : 'FAIL'} @${p.handle} ${p.noticeId} ${p.scheduledAt} | ${result}`);
  }
  console.log(`확인 ${targets.length}행, 실패 ${bad}행`);
  if (bad) process.exitCode = 1;
})().catch(e => { console.error('실패:', e.message); process.exitCode = 1; });
