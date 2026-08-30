const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const {publicCaption,captionMatches}=require('../server/lib/instagramCaption');
const {assertCarousel}=require('../server/lib/instagramClient');

test('internal tags are stripped for both accounts, real hashtags and text retained',()=>{
  for(const account of ['palja','yeonliji']) {
    const clean='본문\n\n#궁합 #연리지실타래';
    assert.equal(publicCaption(clean+'\n\n#자동게시_'+account+'_12345678'),clean);
    assert(captionMatches(clean,clean));
    assert(captionMatches(clean+'\n\n#자동게시_'+account+'_12345678',clean));
    assert(!captionMatches('다른 글',clean));
    assert.throws(()=>assertCarousel({imageUrls:['https://x/a','https://x/b'],caption:'#자동게시_'+account+'_12345678'}),{code:'INTERNAL_CAPTION'});
  }
});

async function simulate({account='yeonliji',existing=null,publishError=false,writeError=false}={}) {
  let posts=[{id:'12345678-abc',accountKey:account,platform:'instagram',status:'scheduled',scheduledAt:'2020-01-01T00:00:00Z',validation:{status:'passed'},contentHash:'hash',text:'승인한 본문\n\n#궁합',images:['https://x/a','https://x/b']}];
  const events=[];
  const context={module:{exports:{}},console:{log(){},error(){}},process:{env:{INSTAGRAM_ACCOUNTS_JSON:JSON.stringify({[account]:{userId:'test',accessToken:'not-real'}})}},require(name){
    if(name.endsWith('threadsClient')) return {};
    if(name.endsWith('instagramCaption')) return require('../server/lib/instagramCaption');
    if(name.endsWith('instagramClient')) return {
      async findPublishedByCaption(caption,marker){events.push(['find',caption,marker]);return existing;},
      async publishCarousel(args){events.push(['publish',args.caption,posts[0].status]);if(publishError)throw new Error('connection lost');return {publishedId:'ig-new'};}
    };
    if(name.endsWith('githubStore'))return {
      async readSchedule(){return {posts:structuredClone(posts),sha:'mock'};},
      async writeSchedule(next,{basePosts}){events.push(['write',next[0].status,basePosts[0].status]);if(writeError)throw new Error('storage unavailable');posts=structuredClone(next);}
    };
    throw new Error('Unexpected dependency '+name);
  }};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../cloud/publish-scheduled.js'),'utf8'),context);
  let error;
  try{await context.module.exports.main();}catch(e){error=e;}
  return {posts,events,error,rerun:()=>context.module.exports.main()};
}
for(const account of ['palja','yeonliji']) test(account+' publishes only approved public caption after durable claim',async()=>{
  const result=await simulate({account});
  assert.deepEqual(result.events.find(e=>e[0]==='publish'),['publish','승인한 본문\n\n#궁합','publishing']);
  assert.deepEqual(result.events.find(e=>e[0]==='write'),['write','publishing','scheduled']);
  assert.equal(result.posts[0].status,'published');
});
test('existing remote publication recovered without a new publish call',async()=>{
  const result=await simulate({existing:{id:'ig-old'}});
  assert(!result.events.some(e=>e[0]==='publish'));
  assert.equal(result.posts[0].publishedId,'ig-old');
});
test('uncertain publication result does not automatically retry',async()=>{
  const result=await simulate({publishError:true});
  assert.equal(result.posts[0].status,'failed');
  await result.rerun();
  assert.equal(result.events.filter(e=>e[0]==='publish').length,1);
});
test('cannot publish if durable claim cannot be saved',async()=>{
  const result=await simulate({writeError:true});
  assert(!result.events.some(e=>e[0]==='publish'));
  assert(result.error);
});
