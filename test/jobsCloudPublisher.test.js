const { test } = require('node:test');
const assert = require('node:assert/strict');
const { run } = require('../cloud/publish-jobs');
const { errors } = require('../cloud/jobsRules');
const H = 3600000, now = new Date('2026-11-03T13:10:00+09:00');
const post = () => ({id:'one',status:'scheduled',handle:'jobs_curator',noticeId:'306325',title:'한국남부발전',angle:'인턴',text:'체험형인턴 세전 월급 225만원',replyText:'👆 공고 원문·지원 링크는 프로필 링크에서',topicTag:'취업',verifiedPay:'225만원',sourceUrl:'https://www.alio.go.kr/download/a.pdf',sourceSha256:'a'.repeat(64),blogUrl:'https://hirecurator.blogspot.com/2026/11/test.html',blogEvidence:'한국남부발전',employmentType:'체험형인턴',eligibility:'유형별 자격 확인',startsAt:'2026-11-03T11:00:00+09:00',deadlineAt:'2026-11-11T11:00:00+09:00',checkedAt:new Date(now-H).toISOString(),scheduledAt:now.toISOString(),factsChecked:true,blogChecked:true});
function queue(p=post()) { let rows=[p]; return {read:async()=>({rows:structuredClone(rows)}),change:async fn=>{const next=structuredClone(rows),result=fn(next);rows=next;return result},rows:()=>rows}; }
const auth = () => ({jobs_curator:{userId:'1',accessToken:'secret',expiresAt:'2026-12-30T00:00:00Z'}});
test('publishes body then reply once and records readback', async()=>{
  const q=queue(), calls=[];
  await run({queue:q,now:()=>now,getAccounts:auth,web:async()=>{},checkDay:async()=>{},publish:async x=>{calls.push(x);return {publishedId:String(calls.length)}},inspect:async(id)=>({url:'https://www.threads.com/post/'+id,timestamp:now.toISOString()})});
  assert.equal(q.rows()[0].status,'published'); assert.equal(calls.length,2); assert.equal(calls[1].replyToId,'1');
  assert.equal(calls[0].topicTag,'취업'); assert.equal(calls[1].topicTag,undefined);
  await run({queue:q,now:()=>now,getAccounts:auth,web:async()=>{},publish:async()=>{throw Error('duplicate')}});
});
test('blog URL found at publish time is recorded on the row',async()=>{
  const q=queue({...post(),blogUrl:undefined,blogTitle:'남부발전'});
  await run({queue:q,now:()=>now,getAccounts:auth,web:async()=>({blogUrl:'https://hirecurator.blogspot.com/2026/11/x.html'}),checkDay:async()=>{},publish:async()=>({publishedId:'9'}),inspect:async id=>({url:'https://www.threads.com/post/'+id,timestamp:now.toISOString()})});
  assert.equal(q.rows()[0].blogUrl,'https://hirecurator.blogspot.com/2026/11/x.html'); assert.equal(q.rows()[0].status,'published');
});
test('ambiguous body result is never retried',async()=>{
  const q=queue(); let count=0;
  const options={queue:q,now:()=>now,getAccounts:auth,web:async()=>{},checkDay:async()=>{},publish:async()=>{count++;throw Error('timeout')}};
  await run(options); await run(options);
  assert.equal(count,1);assert.equal(q.rows()[0].status,'uncertain');
});
test('preflight mutation blocks before Meta call',async()=>{
  const p=post();p.deadlineAt=new Date(now.getTime()+119*H).toISOString();const q=queue(p);let count=0;
  await run({queue:q,now:()=>now,getAccounts:auth,web:async()=>{},checkDay:async()=>{},publish:async()=>{count++}});
  assert.equal(count,0);assert.equal(q.rows()[0].status,'blocked');
});
