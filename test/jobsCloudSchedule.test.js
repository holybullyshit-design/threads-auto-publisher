const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createWorkspace } = require('../server/lib/jobsWorkspace');
const clock = Date.parse('2026-11-02T20:00:00+09:00');
const scheduledAt = '2026-11-03T13:10:00+09:00';
const draft = {handle:'jobs_curator',title:'한국남부발전',noticeId:'306325',angle:'인턴',text:'체험형인턴 세전 월급 225만원',replyText:'자격 https://hirecurator.blogspot.com/2026/11/test.html',verifiedPay:'225만원',sourceUrl:'https://www.alio.go.kr/download/a.pdf',blogUrl:'https://hirecurator.blogspot.com/2026/11/test.html',blogEvidence:'한국남부발전',employmentType:'체험형인턴',eligibility:'유형별 자격 확인',startsAt:'2026-11-03T11:00:00+09:00',deadlineAt:'2026-11-11T11:00:00+09:00',checkedAt:'2026-11-02T20:00:00+09:00',factsChecked:true,blogChecked:true};
const fakeFetch = async url => url.includes('alio.go.kr') ? {ok:true,arrayBuffer:async()=>Buffer.alloc(120,1)} : {ok:true,url, text:async()=>'<html>한국남부발전 세전 월급 225만원</html>'};
function queue(secret=true) { let rows=[]; return { secretPresent:async()=>secret, read:async()=>({rows:structuredClone(rows)}), change:async fn=>{const next=structuredClone(rows),result=fn(next);rows=next;return result}, rows:()=>rows }; }
test('reservation persists a separate cloud queue entry with KST slot and hash',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'job-cloud-'));
  try {
    const ws=createWorkspace({file:path.join(dir,'workspace.json'),preflight:()=>{}}), saved=ws.save(draft), q=queue();
    const result=await ws.schedule(saved.id,saved.updatedAt,true,scheduledAt,{queue:q,fetcher:fakeFetch,clock:()=>clock});
    assert.equal(result.status,'scheduled');assert.equal(q.rows()[0].scheduledAt,'2026-11-03T04:10:00.000Z');assert.match(q.rows()[0].sourceSha256,/^[a-f0-9]{64}$/);
    await assert.rejects(()=>ws.schedule(saved.id,saved.updatedAt,true,scheduledAt,{queue:q,fetcher:fakeFetch,clock:()=>clock}),/예약 가능한 초안/);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
test('missing cloud credential blocks queue write',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'job-cloud-'));
  try {
    const ws=createWorkspace({file:path.join(dir,'workspace.json'),preflight:()=>{}}), saved=ws.save(draft), q=queue(false);
    await assert.rejects(()=>ws.schedule(saved.id,saved.updatedAt,true,scheduledAt,{queue:q,fetcher:fakeFetch,clock:()=>clock}),/시크릿이 없어 예약을 차단/);
    assert.equal(q.rows().length,0);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
