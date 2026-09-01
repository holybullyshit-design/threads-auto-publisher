const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const insights=require('../server/lib/instagramInsights'),growth=require('../server/lib/instagramGrowth'),store=require('../server/lib/instagramAnalyticsStore');
const ui=require('../public/instagram-analytics');
const ok=value=>({value,status:'ok',reason:null});
const credentials={userId:'123',accessToken:'test-not-real'};
test('missing data stays unknown; genuine zero stays zero; aggregate reach is never summed',()=>{
  assert.equal(ui.value(ok(0)),'0');assert.equal(ui.value({status:'missing',value:null}),'—');
  assert.equal(insights.parseMetric({data:[]},'views').value,null);
  assert.equal(insights.parseMetric({data:[{name:'reach',values:[{value:2},{value:3}]}]},'reach',{account:true}).value,null);
  assert.equal(insights.parseMetric({data:[{name:'reach',total_value:{value:2}}]},'reach',{account:true}).value,2);
});
test('KST period boundaries and UI safe URLs, escaping, and sorted missing metrics',()=>{
  const p=insights.range(7,new Date('2026-08-30T12:00:00Z'));assert.equal(p.startKst,'2026-08-24');assert.equal(p.endKst,'2026-08-30');
  assert.equal(ui.safeUrl('javascript:alert(1)'),'');assert.equal(ui.safeUrl('https://evil.test/a'),'');assert.equal(ui.escape('<img>'),'&lt;img&gt;');
  assert.deepEqual(ui.sorted([{id:1,metrics:{}},{id:2,metrics:{reach:ok(0)}},{id:3,metrics:{reach:ok(5)}}],'reach').map(p=>p.id),[3,2,1]);
  assert.equal(ui.rate({metrics:{reach:ok(0),saved:ok(0)}}),'—');
});
test('one unsupported/permission metric does not hide other valid account and post metrics',async()=>{
  const calls=[];const request=async(c,p,q)=>{calls.push(p);if(p==='me')return {user_id:'123',username:'saju_orbit',followers_count:1};if(p==='123/media')return {data:[{id:'post',timestamp:'2026-08-29T09:00:00Z',like_count:0,comments_count:0,caption:'테스트'}]};if(q.metric==='profile_links_taps')throw {code:10};return {data:[{name:q.metric,total_value:{value:q.metric==='reach'?2:0}}]};};
  const s=await insights.collect('palja',7,{credentials,request,now:new Date('2026-08-30T12:00:00Z')});
  assert.equal(s.metrics.views.value,0);assert.equal(s.metrics.profile_links_taps.status,'permission');assert.equal(s.needsInsightsPermission,false);assert.equal(s.posts[0].metrics.reach.value,2);assert.equal(s.posts[0].metrics.likes.value,0);
});
test('identity mismatch blocks all metrics; optional profile failure permits minimum identity',async()=>{
  let calls=0;const mismatch=await insights.collect('palja',7,{credentials,request:async()=>{calls++;return {username:'knot_saju'};}});assert.equal(calls,1);assert.equal(mismatch.connection,'wrong-account');
  const s=await insights.collect('palja',7,{credentials,request:async(c,p,q)=>{if(p==='me'){if(q.fields.includes('followers_count'))throw {code:100};return {username:'saju_orbit',user_id:'123'};}return {data:[]};}});assert.equal(s.connection,'connected');assert.equal(s.followers.value,null);
});
test('approval is explicit, durable, isolated by account, and never publishes',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'instagram-analytics-test-'));const old=process.env.INSTAGRAM_ANALYTICS_DIR;process.env.INSTAGRAM_ANALYTICS_DIR=dir;
  try{const snapshot={id:'sample',accountKey:'palja',period:{days:7},followers:ok(1),metrics:{reach:ok(2),views:ok(7)},posts:[]};const [a,b]=growth.propose(snapshot);assert.equal(growth.active('palja'),null);assert.throws(()=>growth.decide(a.id,'approve',false));growth.decide(a.id,'approve',true);assert.equal(growth.active('palja').id,a.id);assert.equal(growth.active('yeonliji'),null);assert.throws(()=>growth.decide(b.id,'approve',true));assert.equal(store.read('experiments',[]).length,2);growth.decide(a.id,'pause');assert.equal(growth.active('palja'),null);assert.throws(()=>growth.propose({...snapshot,stale:true}));}
  finally{if(old===undefined)delete process.env.INSTAGRAM_ANALYTICS_DIR;else process.env.INSTAGRAM_ANALYTICS_DIR=old;fs.rmSync(dir,{recursive:true,force:true});}
});
test('small samples never become a winning experiment',()=>{const e={id:'test',metric:'reach',baselinePostIds:['base']};const rows=[{id:'base',ageHours:72,type:'FEED',metrics:{reach:ok(2)}},{id:'variant',experimentId:'test',ageHours:72,type:'FEED',metrics:{reach:ok(7)}}];assert.equal(growth.evaluate(e,[{posts:rows}]).status,'waiting');});

test('approved experiments preserve evidence and all other story cards across the topic catalog',()=>{
  const planner=require('../server/lib/yeonlijiDraftPlanner'),generator=require('../server/lib/yeonlijiImageGenerator');
  for(const kind of ['cover','cta'])for(const topic of planner.getTopicCatalog()){
    const original=planner.createDraftPlan(topic.id,{date:'2099-09-01',time:'18:00'});
    const experiment={id:'unit-test-experiment',kind,accountKey:'yeonliji',status:'approved',expiresAt:'2099-12-31T00:00:00Z',approvedAt:'2026-08-30T12:00:00Z',change:'한 요소만 변경'};
    const changed=growth.applyToPlan(original,{experiment});
    assert.deepEqual(changed.cards.slice(1,6),original.cards.slice(1,6));assert.notEqual(changed.contentHash,original.contentHash);
    for(const c of changed.cards){assert(generator.wrap(c.title,17).length<=3,topic.id);assert(generator.wrap(c.body,30).length<=4,topic.id);}
  }
});

test('dashboard renderer exposes actual metrics and preserves account separation on selection',async()=>{
  const vm=require('node:vm'),nodes={};
  const node=id=>nodes[id]||(nodes[id]={id,innerHTML:'',textContent:'',value:'7',addEventListener(type,fn){this[type]=fn;}});
  const win={};const document={getElementById:node,querySelector:()=>null};
  const fetch=async url=>{const key=url.includes('yeonliji')?'yeonliji':'palja';return {ok:true,json:async()=>({snapshot:{accountKey:key,period:{startKst:'2026-08-24',endKst:'2026-08-30'},fetchedAt:'2026-08-30T12:00:00Z',metrics:{views:ok(key==='palja'?7:1),reach:ok(2),likes:ok(0)},followers:ok(1),posts:[{title:'<unsafe>',id:key,timestamp:'2026-08-29T09:00:00Z',ageHours:24,type:'FEED',metrics:{reach:ok(0),likes:ok(0)}}],warnings:[]},diagnosis:['표본이 작음'],experiments:[],history:[]})};};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/instagram-analytics.js'),'utf8'),{window:win,document,fetch,URL,console});
  await new Promise(resolve=>setImmediate(resolve));
  assert.match(node('ig-analytics-dashboard').innerHTML,/게시물별 성과/);assert.match(node('ig-analytics-dashboard').innerHTML,/&lt;unsafe&gt;/);
  assert.match(node('ig-analytics-dashboard').innerHTML,/data-account="palja" aria-pressed="true"/);
  await node('ig-analytics-dashboard').click({target:{closest:()=>({dataset:{account:'yeonliji'}})}});
  assert.match(node('ig-analytics-dashboard').innerHTML,/data-account="yeonliji" aria-pressed="true"/);
  assert.match(node('ig-analytics-dashboard').innerHTML,/현재 데이터로 개선안 만들기/);
});
