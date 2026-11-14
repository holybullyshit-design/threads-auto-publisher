const { test } = require('node:test');
const assert = require('node:assert/strict');
const { errors, verifyWeb, sourceHash } = require('../cloud/jobsRules');
const crypto = require('node:crypto');
const H = 3600000, t = new Date('2026-11-03T13:10:00+09:00');
const base = () => ({ id:'one', status:'scheduled', handle:'jobs_curator', noticeId:'306325', title:'한국남부발전', angle:'인턴', text:'한국남부발전 체험형인턴 세전 월급 225만원 · 11/11(수) 오전 11시 마감', replyText:'👆 공고 원문·지원 링크는 프로필 링크에서', verifiedPay:'225만원', card:{badge:'🔔 새 공고',hook:['[[체험형인턴]]'],org:'한국남부발전',role:'체험형인턴',facts:[['💰','세전 월급 225만원'],['📍','전국'],['📝','서류 → 면접']],deadline:'11/11(수) 오전 11시 마감'}, imageUrl:'https://raw.githubusercontent.com/holybullyshit-design/threads-auto-publisher/main/schedule/cards/a.png', imageSha256:'b'.repeat(64), sourceUrl:'https://www.alio.go.kr/download/a.pdf', sourceSha256:'a'.repeat(64), blogUrl:'https://hirecurator.blogspot.com/2026/11/test.html', blogEvidence:'한국남부발전', employmentType:'체험형인턴', eligibility:'유형별 자격 확인', startsAt:'2026-11-03T11:00:00+09:00', deadlineAt:'2026-11-11T11:00:00+09:00', checkedAt:new Date(t-H).toISOString(), scheduledAt:t.toISOString(), factsChecked:true, blogChecked:true });
test('cloud gate blocks account, pay, link, hash, deadline, review, and time mutations', () => {
  assert.deepEqual(errors(base(), [base()], t), []);
  const changed = [
    ['account',{handle:'wrong'}], ['pay',{text:'체험형인턴 세전 월급 999만원'}],
    ['replyLink',{replyText:'자격 정리'}], ['replyLink',{replyText:'프로필 링크 https://hirecurator.blogspot.com/2026/11/test.html'}],
    ['textLink',{text:'체험형인턴 세전 월급 225만원 hirecurator.blogspot.com/x'}], ['sourceHash',{sourceSha256:'bad'}],
    ['deadline',{deadlineAt:new Date(t.getTime()+119*H).toISOString()}],
    ['staleReview',{checkedAt:new Date(t.getTime()-(7*24+1)*H).toISOString()}],
    ['review',{factsChecked:false}], ['time',{scheduledAt:new Date(t.getTime()+H).toISOString()}],
  ];
  for (const [label, patch] of changed) assert.ok(errors({...base(),...patch},[base()],t).includes(label), label);
  assert.ok(errors(base(),[base()],new Date('2026-11-03T21:01:00+09:00')).includes('time'));
  for (const text of ['세전 월 224만원 · 주 40시간','세전 초임 약 3,800만','기본월봉 199만9천~281만3천원','월 기본급 2,236,300원'])
    assert.ok(!errors({...base(),text,verifiedPay:text},[base()],t).includes('pay'), text);
  assert.ok(errors({...base(),text:'체험형인턴 모집',verifiedPay:'224만원'},[base()],t).includes('pay'));
  assert.ok(!errors({...base(),text:'💰 월 2,561,590~3,338,880원',verifiedPay:'2,561,590~3,338,880원'},[base()],t).includes('pay'));
  assert.ok(!errors({...base(),text:'💰 급여 공고 미공개 (내규 적용)',verifiedPay:'급여 공고 미공개'},[base()],t).includes('pay'));
  assert.deepEqual(errors({...base(),blogUrl:undefined,blogTitle:'한국남부발전 인턴'},[base()],t),[]);
  assert.ok(errors({...base(),blogUrl:undefined},[base()],t).includes('blogUrl'));
  assert.ok(!errors({...base(),checkedAt:new Date(t.getTime()-6*24*H).toISOString()},[base()],t).includes('staleReview'));
  const later=new Date('2026-11-20T13:10:00+09:00');
  assert.deepEqual(errors({...base(),scheduledAt:later.toISOString(),checkedAt:new Date(later-H).toISOString(),startsAt:'2026-11-18T09:00:00+09:00',deadlineAt:'2026-11-30T18:00:00+09:00'},[base()],later),[]);
});
const png=Buffer.alloc(2000,3), pngHash=crypto.createHash('sha256').update(png).digest('hex');
test('card image rules block a missing, foreign or unhashed image and invented card numbers', () => {
  for (const patch of [{imageUrl:undefined},{imageUrl:'https://example.com/a.png'},{imageUrl:base().imageUrl.replace('.png','.jpg')},{imageSha256:'bad'}])
    assert.ok(errors({...base(),...patch},[base()],t).includes('image'), JSON.stringify(patch));
  const card=base().card;
  for (const bad of [undefined,{...card,facts:[['💰','세전 월급 999만원'],card.facts[1],card.facts[2]]},{...card,deadline:'11/12(목) 오전 11시 마감'},
    {...card,org:'한국동서발전'},{...card,facts:card.facts.slice(0,2)},{...card,hook:['인턴 [[300명]]']},{...card,hero:{label:'세전 월',value:'300만원',sub:'인턴'}}])
    assert.ok(errors({...base(),card:bad},[base()],t).includes('cardFacts'), JSON.stringify(bad)?.slice(0,80));
  assert.ok(!errors({...base(),card:{...card,hero:{label:'세전 월급',value:'225만원',sub:'인턴'}}},[base()],t).includes('cardFacts'));
});
test('a changed or missing card image is blocked at publish time',async()=>{
  const original=Buffer.alloc(120,1);
  const p={...base(),sourceSha256:crypto.createHash('sha256').update(original).digest('hex'),imageSha256:pngHash};
  const url=p.blogUrl;
  const fetcher=img=>async u=>u.includes('alio')?{ok:true,status:200,arrayBuffer:async()=>original}:u.includes('raw.githubusercontent')?img:{ok:true,url,text:async()=>'한국남부발전 225만원'};
  assert.deepEqual(await verifyWeb(p,fetcher({ok:true,status:200,arrayBuffer:async()=>png})),{blogUrl:url});
  await assert.rejects(()=>verifyWeb(p,fetcher({ok:true,status:200,arrayBuffer:async()=>Buffer.alloc(2000,4)})),/카드 이미지 변경/);
  await assert.rejects(()=>verifyWeb(p,fetcher({ok:false,status:404})),/카드 이미지 HTTP 404/);
});
test('blog URL is found by title at publish time and pay may be source-only',async()=>{
  const original=Buffer.alloc(120,1);
  const p={...base(),blogUrl:undefined,blogTitle:'남부발전 인턴',sourceSha256:crypto.createHash('sha256').update(original).digest('hex'),imageSha256:pngHash};
  const url='https://hirecurator.blogspot.com/2026/11/x.html';
  const feed={feed:{entry:[{title:{$t:'한국남부발전 인턴 122명'},link:[{rel:'alternate',href:url}]}]}};
  const fetcher=async u=>u.includes('alio')?{ok:true,status:200,arrayBuffer:async()=>original}:u.includes('raw.githubusercontent')?{ok:true,status:200,arrayBuffer:async()=>png}:u.includes('feeds')?{ok:true,json:async()=>feed}:{ok:true,url,text:async()=>'한국남부발전 본문'};
  await assert.rejects(()=>verifyWeb(p,fetcher),/근거 불일치/);
  assert.deepEqual(await verifyWeb({...p,blogPayUnchecked:true},fetcher),{blogUrl:url});
  const empty=async u=>u.includes('feeds')?{ok:true,json:async()=>({feed:{}})}:fetcher(u);
  await assert.rejects(()=>verifyWeb(p,empty),/아직 공개되지 않음/);
});
test('a changed official document is blocked by its approved hash',async()=>{
  const p=base(), original=Buffer.alloc(120,1), changed=Buffer.alloc(120,2);
  p.sourceSha256=crypto.createHash('sha256').update(original).digest('hex');
  await assert.rejects(()=>verifyWeb(p,async()=>({ok:true,status:200,arrayBuffer:async()=>changed})),/공식 공고 내용 변경/);
});
test('2026-11-11: a company page whose only change is the ?v= asset stamp passes; any other change is blocked',async()=>{
  const page=v=>Buffer.from(`<html><link href="/a.css?v=2026-11-11 &#50724;&#54980; ${v}" /><script src="/b.js?v=${v}"></script><p>[11월] Talent hy-way 마감 시간 15:00 지원 기간 2026년 11월 10일(화)~2026년 11월 17일(화)</p>${'x'.repeat(80)}</html>`,'utf8');
  const p={...base(),sourceNormalize:'strip-asset-version',sourceSha256:sourceHash(page('10:43:24'),'strip-asset-version'),imageSha256:pngHash};
  const url=p.blogUrl;
  const fetcher=src=>async u=>u.includes('alio')?{ok:true,status:200,arrayBuffer:async()=>src}:u.includes('raw.githubusercontent')?{ok:true,status:200,arrayBuffer:async()=>png}:{ok:true,url,text:async()=>'한국남부발전 225만원'};
  assert.deepEqual(await verifyWeb(p,fetcher(page('10:43:27'))),{blogUrl:url});
  await assert.rejects(()=>verifyWeb(p,fetcher(Buffer.from(page('10:43:27').toString('utf8').replace('15:00','18:00'),'utf8'))),/공식 공고 내용 변경/);
  // 방식 이름이 없으면 예전처럼 바이트 전체를 대조한다(?v=만 바뀌어도 보류).
  const strict={...p,sourceNormalize:undefined,sourceSha256:sourceHash(page('10:43:24'))};
  await assert.rejects(()=>verifyWeb(strict,fetcher(page('10:43:27'))),/공식 공고 내용 변경/);
  // 허용하지 않은 방식 이름은 예약 검사와 게시 직전 검사 둘 다 막는다.
  assert.ok(errors({...p,sourceNormalize:'strip-everything'},[base()],t).includes('sourceHash'));
  assert.ok(!errors(p,[base()],t).includes('sourceHash'));
  await assert.rejects(()=>verifyWeb({...p,sourceNormalize:'strip-everything'},fetcher(page('10:43:24'))),/공식 공고 내용 변경/);
});
test('2026-11-11: only the user-approved SK hynix notice may be introduced 48h before its deadline',()=>{
  const at=(h)=>new Date(t.getTime()+h*H).toISOString();
  const sk={...base(),noticeId:'skhynix-R262381'};
  assert.ok(!errors({...sk,deadlineAt:at(69)},[base()],t).includes('deadline'));
  assert.ok(errors({...sk,deadlineAt:at(47)},[base()],t).includes('deadline'));
  assert.ok(errors({...base(),deadlineAt:at(69)},[base()],t).includes('deadline'));
  assert.ok(errors({...base(),preparationHours:1,deadlineAt:at(119)},[base()],t).includes('deadline'));
});
test('two posts per KST day and cross-account interval are enforced',()=>{
  const own = {...base(),id:'old',status:'published',noticeId:'other',sourceUrl:'https://example.com/other',attemptedAt:new Date(t.getTime()-H).toISOString()};
  assert.ok(!errors(base(),[own,base()],t).includes('dailyLimit'));
  const second = {...own,id:'old2',noticeId:'other2',sourceUrl:'https://example.com/other2',text:'다른 글'};
  assert.ok(errors(base(),[own,second,base()],t).includes('dailyLimit'));
  const other={...own,handle:'hire_masters',noticeId:'306325',sourceUrl:base().sourceUrl};
  assert.ok(errors(base(),[other,base()],t).includes('crossAccountGap'));
});
test('deadline-day reminder keeps exact-time, remaining-time and duplicate gates',()=>{
  const now=new Date('2026-11-09T09:00:00+09:00');
  const reminder={...base(),id:'reminder',postType:'deadline_reminder',scheduledAt:now.toISOString(),
    deadlineAt:'2026-11-09T17:00:00+09:00',checkedAt:new Date(now.getTime()-H).toISOString(),
    text:'한국남부발전 오늘 마감 17:00 KST · 체험형인턴 세전 월급 225만원',card:{...base().card,deadline:'오늘 마감 17:00 KST'}};
  assert.deepEqual(errors(reminder,[reminder],now),[]);
  const old={...base(),id:'old',status:'published',postType:'initial',attemptedAt:new Date(now.getTime()-4*24*H).toISOString()};
  assert.deepEqual(errors(reminder,[old,reminder],now),[]);
  assert.ok(errors({...reminder,text:'내일 마감 17:00 KST · 세전 월급 225만원'},[reminder],now).includes('deadlineCopy'));
  assert.ok(errors({...reminder,deadlineAt:'2026-11-09T11:00:00+09:00',text:'오늘 마감 11:00 KST · 세전 월급 225만원'},[reminder],now).includes('deadline'));
  assert.ok(errors({...reminder,deadlineAt:'2026-11-10T17:00:00+09:00'},[reminder],now).includes('deadline'));
  assert.ok(errors(reminder,[{...old,attemptedAt:new Date(now.getTime()-24*H).toISOString()},reminder],now).includes('duplicate'));
  assert.ok(errors(reminder,[{...old,postType:'deadline_reminder'},reminder],now).includes('duplicate'));
  const other={...old,handle:'hire_masters',attemptedAt:new Date(now.getTime()-H).toISOString()};
  assert.ok(errors(reminder,[other,reminder],now).includes('crossAccountGap'));
});
test('temporary blog failures are retried and marked transient; content problems are not',async()=>{
  const original=Buffer.alloc(120,1);
  const p={...base(),sourceSha256:crypto.createHash('sha256').update(original).digest('hex'),imageSha256:pngHash};
  const url=p.blogUrl, net={delayMs:0};
  const site=blog=>async u=>u.includes('alio')?{ok:true,status:200,arrayBuffer:async()=>original}:u.includes('raw.githubusercontent')?{ok:true,status:200,arrayBuffer:async()=>png}:blog();
  let n=0;
  assert.deepEqual(await verifyWeb(p,site(()=>++n<3?{ok:false,status:503,url}:{ok:true,status:200,url,text:async()=>'한국남부발전 225만원'}),net),{blogUrl:url});
  const flaky=async(fetcher,re)=>{ try { await verifyWeb(p,fetcher,net); assert.fail('should throw'); } catch(e) { assert.match(e.message,re); return e.transient===true; } };
  assert.equal(await flaky(site(()=>({ok:false,status:503,url})),/블로그 공개 URL 오류 \(HTTP 503\)/),true);
  assert.equal(await flaky(site(()=>({ok:false,status:404,url})),/HTTP 404/),true);
  assert.equal(await flaky(site(()=>({ok:true,status:200,url:'https://www.google.com/sorry/index',text:async()=>''})),/www\.google\.com로 이동/),true);
  assert.equal(await flaky(site(()=>{throw Object.assign(Error('t'),{name:'TimeoutError'})}),/응답 시간 초과/),true);
  assert.equal(await flaky(site(()=>({ok:true,status:200,url,text:async()=>'다른 글'})),/근거 불일치/),false);
  const wrong={...p,blogUrl:'https://wrong.example/x'};
  await assert.rejects(()=>verifyWeb(wrong,site(()=>({ok:true,url:wrong.blogUrl,text:async()=>''})),net),e=>/우리 블로그 주소 아님/.test(e.message)&&!e.transient);
  await assert.rejects(()=>verifyWeb(p,async u=>u.includes('alio')?{ok:true,status:200,arrayBuffer:async()=>Buffer.alloc(120,2)}:site(()=>({}))(u),net),e=>/공식 공고 내용 변경/.test(e.message)&&!e.transient);
});
test('2026-11-11: a blocked post page falls back to the same post body in the public feed',async()=>{
  const original=Buffer.alloc(120,1);
  const p={...base(),sourceSha256:crypto.createHash('sha256').update(original).digest('hex'),imageSha256:pngHash};
  const url=p.blogUrl, net={delayMs:0};
  const sorry={ok:true,status:429,url:'https://www.google.com/sorry/index',text:async()=>''};
  const feedOf=entries=>({ok:true,status:200,url:'https://hirecurator.blogspot.com/feeds/posts/default?alt=json&max-results=50',json:async()=>({feed:{entry:entries}})});
  const entry=(href,body)=>({link:[{rel:'alternate',href}],content:{$t:body}});
  const site=feed=>async u=>u.includes('alio')?{ok:true,status:200,arrayBuffer:async()=>original}:u.includes('raw.githubusercontent')?{ok:true,status:200,arrayBuffer:async()=>png}:u.includes('/feeds/posts/')?feed():sorry;
  assert.deepEqual(await verifyWeb(p,site(()=>feedOf([entry('https://hirecurator.blogspot.com/other.html','다른 글'),entry(url,'<p>한국남부발전 225만원</p>')])),net),{blogUrl:url});
  await assert.rejects(()=>verifyWeb(p,site(()=>feedOf([entry(url,'<p>다른 내용</p>')])),net),e=>/근거 불일치/.test(e.message)&&!e.transient);
  await assert.rejects(()=>verifyWeb(p,site(()=>feedOf([entry('https://hirecurator.blogspot.com/other.html','한국남부발전 225만원')])),net),e=>/HTTP 429, www\.google\.com로 이동/.test(e.message)&&e.transient);
  await assert.rejects(()=>verifyWeb(p,site(()=>({ok:false,status:503})),net),e=>/HTTP 429/.test(e.message)&&e.transient);
  await assert.rejects(()=>verifyWeb(p,site(()=>sorry),net),e=>/HTTP 429/.test(e.message)&&e.transient);
});
test('daily or hourly pay lines count as a pay line, a missing pay line does not',()=>{
  const p={...base(),text:base().text.replace('세전 월급 225만원','일급 117,440원'),verifiedPay:'117,440원'};
  p.card={...p.card,facts:[['💰','일급 117,440원'],...p.card.facts.slice(1)]};
  assert.ok(!errors(p,[p],t).includes('pay'));
  assert.ok(!errors({...p,text:p.text.replace('일급','시급')},[p],t).includes('pay'));
  assert.ok(errors({...p,text:p.text.replace('일급 117,440원','117,440원')},[p],t).includes('pay'));
});
test('the same notice may run on all three accounts with different copy, 24h apart',()=>{
  const p={...base(),handle:'high_quality_hire'};
  const a={...base(),id:'a',status:'published',handle:'jobs_curator',text:'첫 계정 글',attemptedAt:new Date(t.getTime()-50*H).toISOString()};
  const b={...base(),id:'b',status:'published',handle:'hire_masters',text:'둘째 계정 글',attemptedAt:new Date(t.getTime()-26*H).toISOString()};
  assert.deepEqual(errors(p,[a,b,p],t),[]);
  assert.ok(errors(p,[a,{...b,attemptedAt:new Date(t.getTime()-2*H).toISOString()},p],t).includes('crossAccountGap'));
  assert.ok(errors(p,[a,{...b,text:p.text},p],t).includes('copyDuplicate'));
  assert.ok(errors(p,[{...a,handle:'high_quality_hire'},p],t).includes('duplicate'));
});
test('2026-11-09 reply link test: only @high_quality_hire on 11/10~16 may use the blog placeholder', () => {
  const { replyFor, BLOG_PLACEHOLDER } = require('../cloud/jobsRules');
  const at = new Date('2026-11-12T10:30:00+09:00');
  const hq = { ...base(), handle: 'high_quality_hire', scheduledAt: at.toISOString(), checkedAt: new Date(at - H).toISOString(), deadlineAt: '2026-11-20T17:00:00+09:00', replyText: `👆 직무별 급여·자격 비교 전체는 여기\n${BLOG_PLACEHOLDER}` };
  assert.deepEqual(errors(hq, [hq], at), []);
  const blocked = [
    { handle: 'jobs_curator' },                                                        // 다른 계정
    { replyText: `${hq.replyText}\nhttps://hirecurator.blogspot.com/2026/11/x.html` },  // 직접 쓴 주소
    { replyText: `${hq.replyText} ${BLOG_PLACEHOLDER}` },                               // 자리표시 두 번
  ];
  for (const patch of blocked) assert.ok(errors({ ...hq, ...patch }, [hq], at).includes('replyLink'), JSON.stringify(patch));
  const after = new Date('2026-11-17T10:30:00+09:00');                                  // 시험 기간 밖
  assert.ok(errors({ ...hq, scheduledAt: after.toISOString(), checkedAt: new Date(after - H).toISOString() }, [hq], after).includes('replyLink'));
  const before = new Date('2026-11-09T19:30:00+09:00');
  assert.ok(errors({ ...hq, scheduledAt: before.toISOString(), checkedAt: new Date(before - H).toISOString() }, [hq], before).includes('replyLink'));
  // 실제 댓글은 검증된 우리 블로그 주소로만 바뀐다
  const url = 'https://hirecurator.blogspot.com/2026/11/abc.html';
  assert.equal(replyFor(hq, url), `👆 직무별 급여·자격 비교 전체는 여기\n${url}`);
  for (const bad of [undefined, 'https://example.com/x', 'https://hirecurator.blogspot.com/a b']) assert.throws(() => replyFor(hq, bad), /쓸 수 없음/);
  assert.throws(() => replyFor({ ...hq, handle: 'hire_masters' }, url), /쓸 수 없음/);
  assert.equal(replyFor(base(), url), base().replyText);                                // 자리표시 없는 댓글은 그대로
});
