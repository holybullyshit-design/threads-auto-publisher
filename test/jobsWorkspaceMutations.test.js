// 2026-11-14 현재 규칙(프로필 링크 댓글 v2.2, 계정당 하루 2개 v2.3, 사전 검수 14일 v2.15)에 맞춘 변이 시험.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {validate}=require('../server/lib/jobsWorkspace');
const H=3600000, now=Date.parse('2026-11-02T13:10:00+09:00');
const base=()=>({id:'draft',handle:'jobs_curator',title:'시설관리 6명',noticeId:'306294',angle:'근무지별 차이',text:'세전 기본연봉 2,608만~2,736만원, 기관별 자격과 근무시간 확인',verifiedPay:'2,608만~2,736만원',replyText:'👆 직무별 자격과 공식 링크는 프로필 링크에서',sourceUrl:'https://www.alio.go.kr/download/download.json?fileNo=3082436',blogUrl:'https://hirecurator.blogspot.com/2026/10/6.html',startsAt:new Date(now-H).toISOString(),deadlineAt:new Date(now+190*H).toISOString(),checkedAt:new Date(now-H).toISOString(),factsChecked:true,blogChecked:true});
test('normal candidate passes, injected bad values are rejected',()=>{
 assert.deepEqual(validate(base(),[],now),[]);
 const changes=[
 ['salary changed in text',{text:'세전 기본연봉 9,999만원, 기관별 자격과 근무시간 확인'}],
 ['salary evidence changed',{verifiedPay:'9,999만원'}],
 ['blog link swapped',{blogUrl:'https://another.example/blog'}],
 ['comment profile-link guide removed',{replyText:'블로그에서 확인'}],
 ['comment carries a URL',{replyText:'프로필 링크 https://hirecurator.blogspot.com/2026/10/6.html'}],
 ['body carries a URL',{text:'세전 기본연봉 2,608만~2,736만원, https://hirecurator.blogspot.com/2026/10/6.html'}],
 ['deadline too close',{deadlineAt:new Date(now+119*H).toISOString()}],
 ['deadline time unknown',{deadlineAt:''}],
 ['stale official check',{checkedAt:new Date(now-(14*24+1)*H).toISOString()}],
 ['facts unchecked',{factsChecked:false}],
 ['wrong account',{handle:'other_account'}],
 ['too long',{text:'세전 연봉 '+('가'.repeat(501))}],
 ];
 for(const [label,patch] of changes)assert.ok(validate({...base(),...patch},[],now).length,label);
});
test('same account third post in KST day is blocked (two a day allowed) even with different notices',()=>{
 const one={...base(),id:'old',noticeId:'different',sourceUrl:'https://example.com/another',text:'세전 연봉 다른 글',status:'published',publishedAt:new Date(now-2*H).toISOString()};
 assert.deepEqual(validate(base(),[one],now),[]);
 const two=[one,{...one,id:'old2',noticeId:'different2',sourceUrl:'https://example.com/another2',text:'세전 연봉 다른 글2',publishedAt:new Date(now-3*H).toISOString()}];
 assert.ok(validate(base(),two,now).some(x=>x.includes('오늘 이미')));
 const priorDay=two.map(x=>({...x,publishedAt:new Date(now-14*H).toISOString()}));
 assert.deepEqual(validate(base(),priorDay,now),[]);
});
test('before application window requires explicit upcoming wording',()=>{
 const future={...base(),startsAt:new Date(now+24*H).toISOString()};
 assert.ok(validate(future,[],now).some(x=>x.includes('접수 예정')));
 assert.deepEqual(validate({...future,text:future.text+' · 내일 접수 예정'},[],now),[]);
});
test('deadline-day alert is allowed with four hours left but a rushed or repeated alert is blocked',()=>{
 const at=Date.parse('2026-11-09T09:00:00+09:00');
 const reminder={...base(),id:'reminder',postType:'deadline_reminder',startsAt:new Date(at-7*24*H).toISOString(),
   deadlineAt:'2026-11-09T17:00:00+09:00',checkedAt:new Date(at-H).toISOString(),
   text:'오늘 마감 17:00 KST · 세전 기본연봉 2,608만~2,736만원, 자격 확인'};
 assert.deepEqual(validate(reminder,[],at),[]);
 const old={...base(),id:'old',status:'published',postType:'initial',publishedAt:new Date(at-4*24*H).toISOString()};
 assert.deepEqual(validate(reminder,[old],at),[]);
 assert.ok(validate({...reminder,deadlineAt:'2026-11-09T11:00:00+09:00',text:'오늘 마감 11:00 KST · 세전 기본연봉 2,608만~2,736만원'},[],at).some(x=>x.includes('4시간')));
 assert.ok(validate({...reminder,text:'오늘 마감 · 세전 기본연봉 2,608만~2,736만원'},[],at).some(x=>x.includes('17:00')));
 assert.ok(validate(reminder,[{...old,publishedAt:new Date(at-24*H).toISOString()}],at).some(x=>x.includes('72시간')));
});
