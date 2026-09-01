const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const os=require('os');
const path=require('path');
const sharp=require('sharp');
const planner=require('../server/lib/yeonlijiDraftPlanner');
const generator=require('../server/lib/yeonlijiImageGenerator');
const automation=require('../server/lib/yeonlijiAutomation');
const schedule=require('../server/lib/scheduleStore');
const auth=require('../server/lib/instagramAuthStore');
const media=require('../server/lib/mediaHost');
const reference=fs.readFileSync(path.join(__dirname,'../assets/yeonliji/relationship-sensitive-storyboard-v1.png'));

test('29 unique plans cover reunion, destiny, divorce, couples, compatibility; every story has seven fitting slides',()=>{
  const topics=planner.getTopicCatalog();
  assert.equal(topics.length,29); assert.equal(new Set(topics.map(t=>t.id)).size,29);
  for(const category of ['재회','궁합','운명·인연','이혼·관계 정리','부부·결혼']) assert(topics.some(t=>t.category===category));
  const hashes=new Set();
  for(const t of topics) {
    const p=planner.createDraftPlan(t.id,{date:'2099-09-01',time:'18:00'});
    assert.equal(p.cards.length,7); assert.equal(p.generation.scenes.length,6); hashes.add(p.contentHash);
    assert.match(p.caption,/보장하지 않습니다/);
    for(const c of p.cards) { assert(generator.wrap(c.title,17).length<=3,t.id); assert(generator.wrap(c.body,30).length<=4,t.id); }
  }
  assert.equal(hashes.size,29);
});
test('caption and hashtags follow the selected story instead of a fixed reunion set',()=>{
  const plan=id=>planner.createDraftPlan(id,{date:'2099-09-01',time:'18:00'});
  assert.match(plan('pace').caption,/#궁합/);
  assert.match(plan('return').caption,/#재회운/);
  assert.match(plan('divorce-word').caption,/#관계정리/);
  assert.doesNotMatch(plan('divorce-word').caption,/#재회/);
  assert.match(plan('gyeongjin').caption,/#경진일주/);
  assert.match(plan('destiny-familiar').caption,/#인연운/);
  assert.notEqual(plan('pace').caption,plan('different').caption);
});
test('dates reject invalid rollover, past and malformed values',()=>{
  for(const [d,t] of [['2026-02-30','18:00'],['2026-09-01','24:00'],['../x','10:00'],['2026-13-01','18:00']]) assert.throws(()=>planner.validateDateTime(d,t));
  assert.throws(()=>planner.validateDateTime('2020-01-01','18:00',{future:true}));
  assert.equal(planner.validateDateTime('2099-09-01','18:00').toISOString(),'2099-09-01T09:00:00.000Z');
  assert.throws(()=>planner.createDraftPlan('unknown',{date:'2099-09-01',time:'18:00'}));
});
test('renderer creates seven real images, preserves copy and never schedules',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yeonliji-test-'));
  try {
    const plan=planner.createDraftPlan('divorce-word',{date:'2099-09-01',time:'18:00'});
    const result=await generator.generateDraft(plan,{outputDir:dir,provider:async()=>({buffer:reference,requestId:'test-only'})});
    const manifest=JSON.parse(fs.readFileSync(path.join(dir,result.draftId,'manifest.json')));
    assert.equal(manifest.validation.scope,'technical-only'); assert.equal(manifest.validation.requiresHumanReview,true);
    assert.equal(manifest.caption,plan.caption); assert.equal(manifest.validation.imageHashes.length,7);
    for(const f of manifest.files) { const meta=await sharp(path.join(dir,result.draftId,f)).metadata(); assert.equal(meta.width,1080); assert.equal(meta.height,1350); }
    const result2=await generator.generateDraft(plan,{outputDir:dir,provider:async()=>({buffer:reference})});
    assert.notEqual(result.draftId,result2.draftId); assert(fs.existsSync(path.join(dir,result.draftId,'manifest.json')));
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
test('double generation is blocked and provider failure releases the lock',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yeonliji-lock-test-'));
  let release;
  const plan=planner.createDraftPlan('pace',{date:'2099-09-01',time:'18:00'});
  const first=generator.generateDraft(plan,{outputDir:dir,provider:()=>new Promise((_,reject)=>{release=reject;})});
  try {
    await assert.rejects(generator.generateDraft(plan,{outputDir:dir}),{status:409});
    release(new Error('provider failed'));
    await assert.rejects(first,/provider failed/); assert.equal(generator.getStatus().inProgress,false);
    assert.deepEqual(fs.readdirSync(dir),[]);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
test('recommendations exclude local draft and cloud-used topics, refresh changes the set',async()=>{
  const original=schedule.listSchedule;
  schedule.listSchedule=async()=>[{platform:'instagram',accountKey:'yeonliji',title:'같이 사는데 더 외롭다는 마음',status:'published'}];
  try {
    const first=await automation.getTopics(); assert.equal(first.topics.length,10);
    assert(new Set(first.topics.map(t=>t.category)).size>=7);
    assert(!first.topics.some(t=>['distance','divorce-lonely'].includes(t.id)));
    const next=await automation.getTopics(first.topics.map(t=>t.id));
    assert.equal(next.topics.length,10); assert(next.topics.some(t=>!first.topics.some(x=>x.id===t.id)));
  } finally { schedule.listSchedule=original; }
});
test('approval uses chosen date/time, preserves all old posts, and repeat click performs no upload',async()=>{
  const originals={list:schedule.listSchedule,add:schedule.addInstagramPost,auth:auth.getCredentials,media:media.publishImages};
  const old=[{id:'existing-palja',accountKey:'palja',text:'unchanged',status:'scheduled'}];
  let added, uploads=0;
  const fixture=await generator.generateDraft(planner.createDraftPlan('divorce-word',{date:'2099-09-01',time:'18:00'}),{provider:async()=>({buffer:reference,reusedFromDraftId:'test-only'})});
  schedule.listSchedule=async()=>old;
  schedule.addInstagramPost=async item=>{added=item;return {id:'test-new',...item};};
  auth.getCredentials=()=>({username:'knot_saju'});
  media.publishImages=async buffers=>{uploads++;assert.equal(buffers.length,7);return buffers.map((_,i)=>`https://example.invalid/${i}.jpg`);};
  try {
    const result=await automation.scheduleApprovedDraft(fixture.draftId,{date:'2099-09-03',time:'19:25'});
    assert.equal(result.duplicatePrevented,false);assert.equal(added.date,'2099-09-03');assert.equal(added.time,'19:25');assert.equal(added.accountKey,'yeonliji');
    assert.deepEqual(old,[{id:'existing-palja',accountKey:'palja',text:'unchanged',status:'scheduled'}]);
    schedule.listSchedule=async()=>[{...added,platform:'instagram',status:'scheduled'}];
    assert.equal((await automation.scheduleApprovedDraft(fixture.draftId,{date:'2099-09-04',time:'19:25'})).duplicatePrevented,true);
    assert.equal(uploads,1);
  } finally { fs.rmSync(path.join(__dirname,'../output',fixture.draftId),{recursive:true,force:true}); schedule.listSchedule=originals.list;schedule.addInstagramPost=originals.add;auth.getCredentials=originals.auth;media.publishImages=originals.media; }
});
