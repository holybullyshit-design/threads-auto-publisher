const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const os=require('os');
const path=require('path');
const planner=require('../server/lib/yeonlijiDraftPlanner');
const editor=require('../server/lib/yeonlijiEditorial');
const generator=require('../server/lib/yeonlijiImageGenerator');
const plan=id=>planner.createDraftPlan(id,{date:'2099-09-01',time:'18:00'});

test('all 29 plans remove footer signatures and introduce selective Hanja',()=>{
  for(const topic of planner.getTopicCatalog()){
    const p=plan(topic.id);
    editor.validateEditorialCards(p.cards);
    assert.match(p.cards[0].eyebrow,/[\u4e00-\u9fff]/);
    p.cards.forEach((card,i)=>{
      const svg=generator.overlay(card,i).toString();
      assert.doesNotMatch(svg,/연리지 실타래|[1-7]\/7|y="1275"/);
      assert(svg.includes('<svg'));
    });
  }
  assert.equal(editor.withHanja('재회운'),'재회운(再會運)');
  assert.equal(editor.withHanja('미확인용어'),'미확인용어');
});

test('timing uses substantive saju comparison and honest revision metadata',()=>{
  const p=plan('timing');
  assert.equal(p.editorial.copyRevision,editor.VERSION);
  assert.deepEqual(p.cards.map(c=>c.role),['hook','situation','concept','condition','comparison','application','participation']);
  assert.match(p.cards[2].body.join(' '),/원국.*네 기둥/);
  assert.match(p.cards[3].body.join(' '),/10년 단위/);
  assert(p.cards[4].evidenceRefs.length>=2);
  assert(p.cards[5].body.join('').length>=40);
  assert.match(p.caption,/再會|재회/);
  assert.match(p.caption,/歲運/);
  assert.match(p.cards[6].body.join(' '),/댓글에/);
  assert.equal(plan('pace').editorial.copyRevision,editor.VERSION);
  assert.equal(p.title,'재회운이 좋다는데 연락해도 될까?','keep the original topic title for old publication matching');
});

test('emphasis is rendered without HTML injection and notes fit before artwork',()=>{
  const cards=plan('timing').cards;
  assert.match(generator.overlay(cards[0],0).toString(),/fill="#883d50"/);
  assert.match(generator.overlay({...cards[1],body:['강조 테스트'],bodyEmphasis:'강조'},1).toString(),/<tspan[^>]*>강조<\/tspan>/);
  const malicious={eyebrow:'<label>',title:['<script>'],body:['A & B'],note:'<note>'};
  const svg=generator.overlay(malicious,0).toString();
  assert(svg.includes('&lt;script&gt;'));assert(!svg.includes('<script>'));
  assert.throws(()=>generator.overlay({...cards[0],note:'가'.repeat(40)},0));
});

test('bad copy is rejected before a paid provider is invoked',async()=>{
  const p=plan('timing');p.cards[0].title=['가'.repeat(200)];
  let calls=0;
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yeonliji-no-provider-'));
  try {
    await assert.rejects(generator.generateDraft(p,{outputDir:dir,provider:async()=>{calls++;throw new Error('must not run');}}),/변경|길어/);
    assert.equal(calls,0);assert.deepEqual(fs.readdirSync(dir),[]);
    assert.equal(generator.getStatus().inProgress,false);
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});

test('internal markers and invalid emphasis fail before rendering',()=>{
  const p=plan('timing');
  p.cards[0].note='#자동게시_palja_secret';
  assert.throws(()=>editor.validateEditorialCards(p.cards),/내부/);
  p.cards[0].note='연리지 실타래 · 1/7';
  assert.throws(()=>editor.validateEditorialCards(p.cards),/내부/);
  p.cards[0].note='정상';p.cards[0].accentTitleLine=99;
  assert.throws(()=>editor.validateEditorialCards(p.cards),/제목/);
});
