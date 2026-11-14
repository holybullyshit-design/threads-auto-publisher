const { test } = require('node:test');
const assert = require('node:assert/strict');
const { run } = require('../cloud/publish-jobs');
const { errors } = require('../cloud/jobsRules');
const H = 3600000, now = new Date('2026-11-03T13:10:00+09:00');
const post = () => ({id:'one',status:'scheduled',handle:'jobs_curator',noticeId:'306325',title:'한국남부발전',angle:'인턴',text:'한국남부발전 체험형인턴 세전 월급 225만원 · 11/11(수) 오전 11시 마감',replyText:'👆 공고 원문·지원 링크는 프로필 링크에서',card:{badge:'🔔 새 공고',hook:['[[체험형인턴]]'],org:'한국남부발전',role:'체험형인턴',facts:[['💰','세전 월급 225만원'],['📍','전국'],['📝','서류 → 면접']],deadline:'11/11(수) 오전 11시 마감'},imageUrl:'https://raw.githubusercontent.com/holybullyshit-design/threads-auto-publisher/main/schedule/cards/a.png',imageSha256:'b'.repeat(64),topicTag:'취업',verifiedPay:'225만원',sourceUrl:'https://www.alio.go.kr/download/a.pdf',sourceSha256:'a'.repeat(64),blogUrl:'https://hirecurator.blogspot.com/2026/11/test.html',blogEvidence:'한국남부발전',employmentType:'체험형인턴',eligibility:'유형별 자격 확인',startsAt:'2026-11-03T11:00:00+09:00',deadlineAt:'2026-11-11T11:00:00+09:00',checkedAt:new Date(now-H).toISOString(),scheduledAt:now.toISOString(),factsChecked:true,blogChecked:true});
function queue(p=post()) { let rows=[p]; return {read:async()=>({rows:structuredClone(rows)}),change:async fn=>{const next=structuredClone(rows),result=fn(next);rows=next;return result},rows:()=>rows}; }
const auth = () => ({jobs_curator:{userId:'1',accessToken:'secret',expiresAt:'2026-12-30T00:00:00Z'}});
test('publishes body then reply once and records readback', async()=>{
  const q=queue(), calls=[];
  await run({queue:q,now:()=>now,getAccounts:auth,web:async()=>{},checkDay:async()=>{},publish:async x=>{calls.push(x);return {publishedId:String(calls.length)}},inspect:async(id)=>({url:'https://www.threads.com/post/'+id,timestamp:now.toISOString()})});
  assert.equal(q.rows()[0].status,'published'); assert.equal(calls.length,2); assert.equal(calls[1].replyToId,'1');
  assert.equal(calls[0].topicTag,'취업'); assert.equal(calls[1].topicTag,undefined);
  assert.deepEqual(calls[0].imageUrls,[post().imageUrl]); assert.equal(calls[0].waitForReady,true); assert.equal(calls[1].imageUrls,undefined);
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
const { checkAccountDay } = require('../cloud/publish-jobs');
const readOk = async id=>({url:'https://www.threads.com/post/'+id,timestamp:now.toISOString()});
test('temporary blog failure keeps the post scheduled and the next run publishes it',async()=>{
  const q=queue(); let fail=true, calls=0;
  const web=async()=>{ if(fail) throw Object.assign(Error('블로그 공개 URL 오류 (HTTP 503)'),{transient:true}); };
  const options={queue:q,now:()=>now,getAccounts:auth,web,checkDay:async()=>'account',publish:async()=>({publishedId:String(++calls)}),inspect:readOk};
  await run(options);
  assert.equal(q.rows()[0].status,'scheduled'); assert.match(q.rows()[0].retryError,/HTTP 503/); assert.equal(calls,0);
  fail=false; await run(options);
  assert.equal(q.rows()[0].status,'published'); assert.equal(q.rows()[0].retryError,undefined); assert.equal(calls,2);
});
test('content mismatch is still blocked for good',async()=>{
  const q=queue(); let calls=0;
  await run({queue:q,now:()=>now,getAccounts:auth,web:async()=>{throw Error('블로그 본문 근거 불일치')},checkDay:async()=>'account',publish:async()=>{calls++}});
  assert.equal(q.rows()[0].status,'blocked'); assert.equal(calls,0);
});
test('a retry that runs past the publish window is blocked with the last retry reason',async()=>{
  const p=post(); p.retryError='블로그 공개 URL 오류 (HTTP 503)'; const q=queue(p); let calls=0;
  await run({queue:q,now:()=>new Date(now.getTime()+9*H),getAccounts:auth,web:async()=>{},checkDay:async()=>'account',publish:async()=>{calls++}});
  assert.equal(q.rows()[0].status,'blocked'); assert.match(q.rows()[0].error,/time.*마지막 재시도 사유: 블로그 공개 URL 오류/); assert.equal(calls,0);
});
test('history list permission loss falls back to queue records and still publishes',async()=>{
  const q=queue(); let calls=0;
  await run({queue:q,now:()=>now,getAccounts:auth,web:async()=>{},checkDay:async()=>'queue-only',publish:async()=>({publishedId:String(++calls)}),inspect:readOk});
  assert.equal(q.rows()[0].status,'published'); assert.equal(q.rows()[0].historyCheck,'queue-only');
});
test('account history check: 403 falls back, other failures and full days stop',async()=>{
  const a={userId:'1',accessToken:'t'}, res=(status,data)=>async()=>({ok:status===200,status,json:async()=>data});
  assert.equal(await checkAccountDay(a,'high_quality_hire','2026-11-05',res(403)),'queue-only');
  await assert.rejects(()=>checkAccountDay(a,'high_quality_hire','2026-11-05',res(500)),/HTTP 500/);
  const posts=[1,2].map(i=>({username:'high_quality_hire',is_reply:false,timestamp:`2026-11-05T01:0${i}:00+0000`,text:'본문'+i}));
  await assert.rejects(()=>checkAccountDay(a,'high_quality_hire','2026-11-05',res(200,{data:posts})),/이미 본문 2개/);
  assert.equal(await checkAccountDay(a,'high_quality_hire','2026-11-05',res(200,{data:posts.slice(0,1)})),'account');
});
test('2026-11-09 reply link test: the reply carries the verified blog URL and the read-back checks it', async () => {
  const at = new Date('2026-11-12T10:30:00+09:00');
  const url = 'https://hirecurator.blogspot.com/2026/11/hq.html';
  const p = { ...post(), handle: 'high_quality_hire', scheduledAt: at.toISOString(), checkedAt: new Date(at - H).toISOString(), deadlineAt: '2026-11-20T17:00:00+09:00', blogUrl: undefined, blogTitle: '남부발전', replyText: '👆 직무별 급여·자격 비교 전체는 여기\n{블로그주소}' };
  const q = queue(p), calls = [], reads = [];
  const hqAuth = () => ({ high_quality_hire: { userId: '3', accessToken: 'secret', expiresAt: '2026-12-30T00:00:00Z' } });
  await run({ queue: q, now: () => at, getAccounts: hqAuth, web: async () => ({ blogUrl: url }), checkDay: async () => 'account',
    publish: async x => { calls.push(x); return { publishedId: String(calls.length) }; },
    inspect: async (id, auth, expected) => { reads.push(expected); return { url: 'https://www.threads.com/post/' + id, timestamp: at.toISOString() }; } });
  assert.equal(q.rows()[0].status, 'published');
  assert.equal(calls[1].text, `👆 직무별 급여·자격 비교 전체는 여기\n${url}`);
  assert.equal(reads[1], calls[1].text);
  assert.equal(q.rows()[0].replySentText, calls[1].text);
  assert.equal(q.rows()[0].replyText, p.replyText, '원본 댓글 문구(자리표시)는 그대로 둔다');
  // 블로그 주소를 확인하지 못하면 본문도 올리지 않는다
  const q2 = queue({ ...p, id: 'two' }); let count = 0;
  await run({ queue: q2, now: () => at, getAccounts: hqAuth, web: async () => ({ blogUrl: 'https://wrong.example/x' }), checkDay: async () => 'account', publish: async () => { count++; return { publishedId: '1' }; }, inspect: readOk });
  assert.equal(count, 0); assert.equal(q2.rows()[0].status, 'blocked'); assert.match(q2.rows()[0].error, /쓸 수 없음/);
});
