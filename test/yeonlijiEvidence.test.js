const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('crypto');
const evidence=require('../server/lib/yeonlijiEvidence');
const planner=require('../server/lib/yeonlijiDraftPlanner');
const editorial=require('../server/lib/yeonlijiEditorial');
const automation=require('../server/lib/yeonlijiAutomation');
const schedule=require('../server/lib/scheduleStore');
const plan=id=>planner.createDraftPlan(id,{date:'2026-08-30',time:'18:00'});
test('known day pillar, leap dates, all branch pairs and rule examples',()=>{
  assert.equal(evidence.day('2026-08-30').ganZhi,'丙子');
  assert.equal(evidence.day('2026-08-31').ganZhi,'丁丑');
  assert.match(plan('daily-relations').cards[3].body.join(' '),/축\(丑\)은.*오\(午\)는/);
  for(const d of ['2026-02-29','2026-13-01','1899-12-31','2101-01-01']) assert.throws(()=>evidence.day(d));
  assert(evidence.day('2024-02-29').ganZhi);
  let he=0,chong=0;
  for(const a of [...'子丑寅卯辰巳午未申酉戌亥']) for(const b of [...'子丑寅卯辰巳午未申酉戌亥']){
    const x=evidence.pair(a,b),y=evidence.pair(b,a);
    assert.equal(x.he,y.he);assert.equal(x.chong,y.chong);
    he+=Number(x.he);chong+=Number(x.chong);
  }
  assert.equal(he,12);assert.equal(chong,12);
  assert(evidence.pair('丑','子').he);assert(evidence.pair('丑','未').chong);
  assert.deepEqual(evidence.pack('wealth').examples.shiShen,[['戊','偏财'],['己','正财']]);
  assert.deepEqual(evidence.pack('expression').examples.shiShen,[['丙','食神'],['丁','伤官']]);
});
test('date-specific drafts reject a different publishing date before upload',async()=>{
  const fs=require('fs'),path=require('path'),generator=require('../server/lib/yeonlijiImageGenerator');
  const root=path.join(__dirname,'..'),original=schedule.listSchedule;
  schedule.listSchedule=async()=>[];
  let result;
  try{
    result=await generator.generateDraft(plan('daily-relations'),{provider:async()=>({buffer:fs.readFileSync(path.join(root,'assets/yeonliji/relationship-sensitive-storyboard-v1.png')),reusedFromDraftId:'test-only'})});
    await assert.rejects(automation.scheduleApprovedDraft(result.draftId,{date:'2099-09-01',time:'18:00'}),/예약 날짜가 다릅니다/);
  }finally{
    schedule.listSchedule=original;
    if(result) fs.rmSync(path.join(root,'output',result.draftId),{recursive:true,force:true});
  }
});
test('all topics carry matched facts; unknown data and changed copy fail closed',()=>{
  for(const t of planner.getTopicCatalog()){
    const p=plan(t.id);
    assert(editorial.validatePlan(p));
    assert.equal(p.factPack.personalBirthDataUsed,false);
    assert(p.cards.slice(2,5).every(c=>c.evidenceRefs.length));
    assert.equal(p.editorial.copyRevision,'yeonliji-editorial-v4');
  }
  assert.throws(()=>evidence.pack('made-up-shinsal'));
  const p=plan('divorce-guilt');
  p.cards[2].body=['틀린 주장입니다.','개인 사주를 계산했다고 주장합니다.'];
  p.contentHash=crypto.createHash('sha256').update(JSON.stringify(p.cards)+p.caption).digest('hex');
  p.editorial.contentBinding=editorial.binding(p);
  assert.throws(()=>editorial.validatePlan(p),/근거 원고/);
});
test('old drafts cannot be newly scheduled and payment needs explicit consent',async()=>{
  const original=schedule.listSchedule;
  schedule.listSchedule=async()=>[];
  try{
    await assert.rejects(automation.scheduleApprovedDraft('yeonliji-2026-08-30-divorce-guilt-7d3a644d',{date:'2099-09-01',time:'18:00'}),/구버전/);
    await assert.rejects(automation.generateDraft({topicId:'pace',date:'2099-09-01',time:'18:00'}),/비용 동의/);
    await assert.rejects(automation.generateDraft({mode:'recompose',topicId:'pace',date:'2099-09-01',time:'18:00'}),/기존 시안/);
  }finally{schedule.listSchedule=original;}
});
