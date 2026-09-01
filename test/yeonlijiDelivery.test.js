const test=require('node:test'),assert=require('node:assert/strict');
const {createDelivery}=require('../server/lib/yeonlijiDelivery');
const {createDraftPlan}=require('../server/lib/yeonlijiDraftPlanner');
const plan=()=>({...createDraftPlan('zodiac-ox-sheep',{date:'2026-08-30',time:'18:00'}),id:'test-draft'});
function fixture({error=false,username='knot_saju'}={}){
  let posts=[{id:'palja',status:'scheduled',accountKey:'palja'}],calls=0,receipts=[];
  const store={async atomicUpdateSchedule(mutate){const next=structuredClone(posts),r=mutate(next);posts=next;return r;}};
  const instagram={
    async preflightInstagram(){return {account:{username},publishingUserId:'test-ig'};},
    async findPublishedByCaption(){return null;},assertCarousel(){},
    async publishCarousel(){calls++;assert.equal(posts[1].status,'publishing');assert.equal(posts[1].images.length,7);if(error)throw Error('connection lost');return {publishedId:'ig-ok'};}
  };
  const service=createDelivery({store,instagram,media:{async publishImages(){return Array.from({length:7},(_,i)=>'https://example.invalid/'+i);}},receipt:r=>receipts.push(r),clock:()=>new Date('2026-08-30T10:00:00Z')});
  return {service,posts:()=>posts,calls:()=>calls,receipts,store};
}
test('immediate publication persists claim first and repeat request does not publish twice',async()=>{
  const f=fixture(),m=plan(),c={userId:'test',accessToken:'test'};
  const r=await f.service.publishNow(m,[],c);
  assert.equal(r.post.status,'published');assert.equal(r.post.deliveryMode,'immediate');assert.equal(f.calls(),1);
  assert.equal(r.post.scheduledAt,'2026-08-30T10:00:00.000Z');assert.equal(f.receipts.length,1);
  assert.equal((await f.service.publishNow(m,[],c)).duplicatePrevented,true);assert.equal(f.calls(),1);
  assert.deepEqual(f.posts()[0],{id:'palja',status:'scheduled',accountKey:'palja'});
});
test('wrong account and uncertain result stop without an automatic second publication',async()=>{
  const c={userId:'test',accessToken:'test'},m=plan(),wrong=fixture({username:'saju_orbit'});
  await assert.rejects(wrong.service.publishNow(m,[],c),/knot_saju/);assert.equal(wrong.calls(),0);
  const f=fixture({error:true});
  await assert.rejects(f.service.publishNow(m,[],c),/완료했다고 확인/);
  assert.equal(f.posts()[1].status,'failed');
  await assert.rejects(f.service.publishNow(m,[],c),/결과를 먼저/);assert.equal(f.calls(),1);
});
test('changing a future Yeonliji reservation preserves caption/images/other accounts and exact selected time',async()=>{
  const f=fixture(),m=plan();
  await f.store.atomicUpdateSchedule(p=>p.push({id:'y',platform:'instagram',accountKey:'yeonliji',title:m.title,contentHash:m.contentHash,status:'scheduled',scheduledAt:'2026-09-01T09:00:00Z',text:m.caption,images:['untouched']}));
  const r=await f.service.reschedule(m,'2026-09-02','21:43');
  assert.equal(r.post.scheduledAt,'2026-09-02T12:43:00.000Z');assert.equal(r.post.exactTimeKst,'21:43');
  assert.equal(r.post.text,m.caption);assert.deepEqual(r.post.images,['untouched']);assert.equal(f.posts()[0].id,'palja');
  await assert.rejects(f.service.reschedule(m,'2026-08-29','18:00'),/미래/);
  await f.store.atomicUpdateSchedule(p=>p[1].status='published');
  await assert.rejects(f.service.reschedule(m,'2026-09-03','18:00'),/예약만/);
});
test('atomic claim rechecks current records after a GitHub SHA conflict',async()=>{
  const github=require('../server/lib/githubStore'),originalFetch=global.fetch,token=process.env.GITHUB_TOKEN,repo=process.env.GITHUB_REPO;
  process.env.GITHUB_TOKEN='test';process.env.GITHUB_REPO='test/test';
  let posts=[],puts=0;
  global.fetch=async(url,options)=>{
    if(options.method==='PUT'){puts++;posts=[{id:'other-winner',contentHash:'same'}];return {ok:false,status:409};}
    return {ok:true,status:200,json:async()=>({sha:'s'+puts,content:Buffer.from(JSON.stringify(posts)).toString('base64')})};
  };
  try{
    await assert.rejects(github.atomicUpdateSchedule(p=>{if(p.some(x=>x.contentHash==='same'))throw Error('duplicate');p.push({id:'mine',contentHash:'same'});},'test'),/duplicate/);
    assert.equal(puts,1);
  }finally{global.fetch=originalFetch;if(token===undefined)delete process.env.GITHUB_TOKEN;else process.env.GITHUB_TOKEN=token;if(repo===undefined)delete process.env.GITHUB_REPO;else process.env.GITHUB_REPO=repo;}
});
test('reschedule blocks date-specific mismatches, near-due records and another draft revision',async()=>{
  const f=fixture(),m=plan();
  const daily=createDraftPlan('daily-relations',{date:'2026-09-01',time:'18:00'});
  await assert.rejects(f.service.reschedule(daily,'2026-09-02','20:30'),/일진 시안/);
  await f.store.atomicUpdateSchedule(p=>p.push({id:'y',platform:'instagram',accountKey:'yeonliji',title:m.title,contentHash:m.contentHash,status:'scheduled',scheduledAt:'2026-08-30T10:00:30Z'}));
  await assert.rejects(f.service.reschedule(m,'2026-09-02','20:30'),/임박/);
  await f.store.atomicUpdateSchedule(p=>{p[1].scheduledAt='2026-09-01T10:00:00Z';p[1].contentHash='other-revision';});
  await assert.rejects(f.service.reschedule(m,'2026-09-02','20:30'),/다른 버전/);
});
test('scheduled registration rechecks duplicate title before persisting alongside immediate publication',async()=>{
  const schedule=require('../server/lib/scheduleStore'),originalFetch=global.fetch,token=process.env.GITHUB_TOKEN,repo=process.env.GITHUB_REPO;
  process.env.GITHUB_TOKEN='test';process.env.GITHUB_REPO='test/test';let puts=0;
  const existing=[{platform:'instagram',accountKey:'yeonliji',title:'same-title',status:'publishing',contentHash:'other-version'}];
  global.fetch=async(url,options)=>{if(options.method==='PUT'){puts++;throw Error('must not write');}return {ok:true,status:200,json:async()=>({sha:'s',content:Buffer.from(JSON.stringify(existing)).toString('base64')})};};
  try{
    await assert.rejects(schedule.addInstagramPost({accountKey:'yeonliji',accountId:'knot_saju',accountLabel:'연리지 실타래',caption:'test',date:'2099-09-01',time:'21:43',title:'same-title',contentHash:'new-version',validation:{status:'passed'},images:['https://example.invalid/1','https://example.invalid/2']}),/이미 있습니다/);
    assert.equal(puts,0);
  }finally{global.fetch=originalFetch;if(token===undefined)delete process.env.GITHUB_TOKEN;else process.env.GITHUB_TOKEN=token;if(repo===undefined)delete process.env.GITHUB_REPO;else process.env.GITHUB_REPO=repo;}
});
