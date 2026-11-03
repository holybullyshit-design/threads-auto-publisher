const { test } = require('node:test');
const assert = require('node:assert/strict');
const { errors, verifyWeb } = require('../cloud/jobsRules');
const crypto = require('node:crypto');
const H = 3600000, t = new Date('2026-11-03T13:10:00+09:00');
const base = () => ({ id:'one', status:'scheduled', handle:'jobs_curator', noticeId:'306325', title:'한국남부발전', angle:'인턴', text:'체험형인턴 세전 월급 225만원', replyText:'자격 정리 https://hirecurator.blogspot.com/2026/11/test.html', verifiedPay:'225만원', sourceUrl:'https://www.alio.go.kr/download/a.pdf', sourceSha256:'a'.repeat(64), blogUrl:'https://hirecurator.blogspot.com/2026/11/test.html', blogEvidence:'한국남부발전', employmentType:'체험형인턴', eligibility:'유형별 자격 확인', startsAt:'2026-11-03T11:00:00+09:00', deadlineAt:'2026-11-11T11:00:00+09:00', checkedAt:new Date(t-H).toISOString(), scheduledAt:t.toISOString(), factsChecked:true, blogChecked:true });
test('cloud gate blocks account, pay, link, hash, deadline, review, and time mutations', () => {
  assert.deepEqual(errors(base(), [base()], t), []);
  const changed = [
    ['account',{handle:'wrong'}], ['pay',{text:'체험형인턴 세전 월급 999만원'}],
    ['replyLink',{replyText:'자격 정리'}], ['sourceHash',{sourceSha256:'bad'}],
    ['deadline',{deadlineAt:new Date(t.getTime()+119*H).toISOString()}],
    ['staleReview',{checkedAt:new Date(t.getTime()-25*H).toISOString()}],
    ['review',{factsChecked:false}], ['time',{scheduledAt:new Date(t.getTime()+H).toISOString()}],
  ];
  for (const [label, patch] of changed) assert.ok(errors({...base(),...patch},[base()],t).includes(label), label);
  assert.ok(errors(base(),[base()],new Date('2026-11-03T21:01:00+09:00')).includes('time'));
});
test('a changed official document is blocked by its approved hash',async()=>{
  const p=base(), original=Buffer.alloc(120,1), changed=Buffer.alloc(120,2);
  p.sourceSha256=crypto.createHash('sha256').update(original).digest('hex');
  await assert.rejects(()=>verifyWeb(p,async()=>({ok:true,status:200,arrayBuffer:async()=>changed})),/공식 공고 내용 변경/);
});
test('one post per KST day and cross-account interval are enforced',()=>{
  const own = {...base(),id:'old',status:'published',noticeId:'other',sourceUrl:'https://example.com/other',attemptedAt:new Date(t.getTime()-H).toISOString()};
  assert.ok(errors(base(),[own,base()],t).includes('dailyLimit'));
  const other={...own,handle:'hire_masters',noticeId:'306325',sourceUrl:base().sourceUrl};
  assert.ok(errors(base(),[other,base()],t).includes('crossAccountGap'));
});
