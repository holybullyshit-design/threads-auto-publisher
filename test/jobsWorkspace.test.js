// 2026-11-14 사용자 지시("현재 규칙에 맞게 고쳐"): 바탕화면 채용 작업 화면은 초안·검사만 한다. 게시·예약은 거부한다.
const {test}=require('node:test'); const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const {createWorkspace,validate}=require('../server/lib/jobsWorkspace');
const hour=3600000, now=Date.now();
const sample=()=>({handle:'jobs_curator',title:'test',noticeId:'n1',angle:'초임 근거',text:'💰 연봉 2,500만원 본문',verifiedPay:'2,500만원',replyText:'👆 공고 원문·지원 링크는 프로필 링크에서',blogUrl:'https://hirecurator.blogspot.com/2026/11/test.html',sourceUrl:'https://example.com/notice',startsAt:new Date(now-hour).toISOString(),deadlineAt:new Date(now+200*hour).toISOString(),checkedAt:new Date(now-hour).toISOString(),factsChecked:true,blogChecked:true});
function setup(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jobs-workspace-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));fs.writeFileSync(path.join(dir,'jobs_curator.json'),JSON.stringify({access_token:'test-only',user_id:'test',expires_at:Math.floor(now/1000)+99999}));return createWorkspace({file:path.join(dir,'drafts.json'),tokenDir:dir});}
test('deadline boundary, 14-day review window, unknown dates and source blocked',()=>{
  assert.deepEqual(validate(sample(),[],now),[]);
  for(const patch of [{deadlineAt:new Date(now+119*hour).toISOString()},{checkedAt:new Date(now-(14*24+1)*hour).toISOString()},{checkedAt:new Date(now+hour).toISOString()},{deadlineAt:''},{sourceUrl:'javascript:alert(1)'},{blogChecked:false},{startsAt:new Date(now+hour).toISOString()}])
    assert.ok(validate({...sample(),...patch},[],now).length,JSON.stringify(patch));
  assert.deepEqual(validate({...sample(),deadlineAt:new Date(now+120*hour).toISOString()},[],now),[]);
  assert.deepEqual(validate({...sample(),checkedAt:new Date(now-13*24*hour).toISOString()},[],now),[]);
});
test('reply and body follow the profile-link rule (v2.2)',()=>{
  assert.ok(validate({...sample(),replyText:'👆 자세한 건 https://hirecurator.blogspot.com/2026/11/x.html'},[],now).some(x=>x.includes('프로필 링크')));
  assert.ok(validate({...sample(),replyText:'👆 블로그에서 확인'},[],now).some(x=>x.includes('프로필 링크')));
  assert.ok(validate({...sample(),text:'💰 연봉 2,500만원 hirecurator.blogspot.com/x'},[],now).some(x=>x.includes('주소')));
});
test('cross-account spacing; the same notice may run on all three accounts (v2.7)',()=>{
  const base={...sample(),id:'a',status:'published',publishedAt:new Date(now-2*hour).toISOString(),handle:'hire_masters',text:'다른 글'};
  assert.ok(validate(sample(),[base],now).some(x=>x.includes('24시간')));
  const history=[{...base,publishedAt:new Date(now-50*hour).toISOString()},{...base,id:'b',handle:'high_quality_hire',publishedAt:new Date(now-25*hour).toISOString(),text:'다른 글2'}];
  assert.deepEqual(validate(sample(),history,now),[]);
  assert.ok(validate(sample(),[{...base,handle:'jobs_curator',publishedAt:new Date(now-50*hour).toISOString()}],now).some(x=>x.includes('이미 소개')));
});
test('saved drafts survive reload; archiving preserves record; token stays server-side',t=>{const ws=setup(t);const p=ws.save(sample());assert.equal(ws.read()[0].id,p.id);assert.equal(JSON.stringify(ws.accounts()).includes('test-only'),false);ws.archive(p.id);assert.equal(ws.read()[0].status,'archived');});
test('local immediate publishing is refused and the draft stays untouched (v2.2)',async t=>{
  const ws=setup(t);const p=ws.save(sample());
  await assert.rejects(ws.post(p.id,p.updatedAt,true),/바로 게시하지 않습니다/);
  await assert.rejects(ws.post(p.id,p.updatedAt,false),/queue_threads\.sh/);
  assert.equal(ws.read()[0].status,'draft');assert.equal(ws.read()[0].publishedId,undefined);
});
