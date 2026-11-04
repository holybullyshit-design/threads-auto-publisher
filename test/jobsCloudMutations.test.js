const { test } = require('node:test');
const assert = require('node:assert/strict');
const { errors, verifyWeb } = require('../cloud/jobsRules');
const crypto = require('node:crypto');
const H = 3600000, t = new Date('2026-11-03T13:10:00+09:00');
const base = () => ({ id:'one', status:'scheduled', handle:'jobs_curator', noticeId:'306325', title:'한국남부발전', angle:'인턴', text:'체험형인턴 세전 월급 225만원', replyText:'👆 공고 원문·지원 링크는 프로필 링크에서', verifiedPay:'225만원', sourceUrl:'https://www.alio.go.kr/download/a.pdf', sourceSha256:'a'.repeat(64), blogUrl:'https://hirecurator.blogspot.com/2026/11/test.html', blogEvidence:'한국남부발전', employmentType:'체험형인턴', eligibility:'유형별 자격 확인', startsAt:'2026-11-03T11:00:00+09:00', deadlineAt:'2026-11-11T11:00:00+09:00', checkedAt:new Date(t-H).toISOString(), scheduledAt:t.toISOString(), factsChecked:true, blogChecked:true });
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
test('blog URL is found by title at publish time and pay may be source-only',async()=>{
  const original=Buffer.alloc(120,1);
  const p={...base(),blogUrl:undefined,blogTitle:'남부발전 인턴',sourceSha256:crypto.createHash('sha256').update(original).digest('hex')};
  const url='https://hirecurator.blogspot.com/2026/11/x.html';
  const feed={feed:{entry:[{title:{$t:'한국남부발전 인턴 122명'},link:[{rel:'alternate',href:url}]}]}};
  const fetcher=async u=>u.includes('alio')?{ok:true,status:200,arrayBuffer:async()=>original}:u.includes('feeds')?{ok:true,json:async()=>feed}:{ok:true,url,text:async()=>'한국남부발전 본문'};
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
    text:'오늘 마감 17:00 KST · 체험형인턴 세전 월급 225만원'};
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
