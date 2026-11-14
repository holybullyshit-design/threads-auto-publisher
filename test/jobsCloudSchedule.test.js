const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createWorkspace } = require('../server/lib/jobsWorkspace');
const clock = Date.parse('2026-11-02T20:00:00+09:00');
const scheduledAt = '2026-11-03T13:10:00+09:00';
// 2026-11-14 사용자 지시("현재 규칙에 맞게 고쳐"): 채용 예약은 queue_threads.sh로만 등록한다(카드 이미지·원문 해시·블로그 근거 사전 검사).
// 바탕화면 화면의 예약은 클라우드 큐를 건드리지 않고 거부해야 한다.
const draft = {handle:'jobs_curator',title:'한국남부발전',noticeId:'306325',angle:'인턴',text:'체험형인턴 세전 월급 225만원',replyText:'👆 공고 원문·지원 링크는 프로필 링크에서',verifiedPay:'225만원',sourceUrl:'https://www.alio.go.kr/download/a.pdf',blogUrl:'https://hirecurator.blogspot.com/2026/11/test.html',blogEvidence:'한국남부발전',employmentType:'체험형인턴',eligibility:'유형별 자격 확인',startsAt:'2026-11-03T11:00:00+09:00',deadlineAt:'2026-11-11T11:00:00+09:00',checkedAt:'2026-11-02T20:00:00+09:00',factsChecked:true,blogChecked:true};
let fetched = 0;
const fakeFetch = async url => { fetched++; return url.includes('alio.go.kr') ? {ok:true,arrayBuffer:async()=>Buffer.alloc(120,1)} : {ok:true,url, text:async()=>'<html>한국남부발전 세전 월급 225만원</html>'}; };
function queue(secret=true) { let rows=[], changes=0; return { secretPresent:async()=>secret, read:async()=>({rows:structuredClone(rows)}), change:async fn=>{changes++;const next=structuredClone(rows),result=fn(next);rows=next;return result}, rows:()=>rows, changes:()=>changes }; }
for (const secret of [true, false]) test(`desktop schedule is refused and never touches the cloud queue (secret ${secret})`,async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'job-cloud-'));
  try {
    fetched=0;
    const ws=createWorkspace({file:path.join(dir,'workspace.json')}), saved=ws.save(draft), q=queue(secret);
    await assert.rejects(()=>ws.schedule(saved.id,saved.updatedAt,true,scheduledAt,{queue:q,fetcher:fakeFetch,clock:()=>clock}),/queue_threads\.sh/);
    assert.equal(q.rows().length,0);assert.equal(q.changes(),0);assert.equal(fetched,0);
    assert.equal(ws.read()[0].status,'draft');
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
