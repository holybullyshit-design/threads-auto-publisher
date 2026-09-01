const crypto=require('crypto');
const fs=require('fs'),path=require('path');
const github=require('./githubStore'),client=require('./instagramClient'),host=require('./mediaHost');
const planner=require('./yeonlijiDraftPlanner');
const fail=(message,status=409)=>{throw Object.assign(new Error(message),{status});};
const isTarget=(p,m)=>p.platform==='instagram' && (p.accountKey==='yeonliji'||p.accountId==='knot_saju') && (p.contentHash===m.contentHash||p.title===m.title);
function createDelivery({store=github,instagram=client,media=host,receipt=saveReceipt,clock=()=>new Date()}={}){
  async function publishNow(manifest,buffers,credentials){
    if(!credentials?.userId||!credentials?.accessToken) fail('연리지 Instagram 연결을 확인해주세요.');
    const checked=await instagram.preflightInstagram(credentials);
    if(checked.account?.username!=='knot_saju') fail('게시 대상이 @knot_saju가 아니어서 중단했습니다.');
    const config={...credentials,userId:checked.publishingUserId};
    const remote=await instagram.findPublishedByCaption(manifest.caption,null,config);
    const now=clock().toISOString(),id=crypto.randomUUID();
    const claim=await store.atomicUpdateSchedule(posts=>{
      const existing=posts.find(p=>isTarget(p,manifest)&&p.status!=='canceled');
      if(existing){
        if(existing.status==='published') return {duplicatePrevented:true,post:existing};
        fail(existing.status==='scheduled'?'이미 예약된 시안입니다. 예약 시간 변경을 사용해주세요.':'기존 게시 시도의 결과를 먼저 확인해야 합니다. 자동 재게시하지 않습니다.');
      }
      const post={id,platform:'instagram',accountKey:'yeonliji',accountId:'knot_saju',accountLabel:'연리지 실타래',
        title:manifest.title,displayTitle:manifest.displayTitle,contentSeries:manifest.series,text:manifest.caption,
        contentHash:manifest.contentHash,dedupeKey:'instagram:yeonliji:'+manifest.contentHash,images:[],
        status:remote?'published':'publishing',deliveryMode:'immediate',scheduledAt:now,createdAt:now,
        publishedAt:remote?.timestamp||null,publishedId:remote?.id||null,permalink:remote?.permalink||null,
        expectedLocalDate:new Date(clock().getTime()+32400000).toISOString().slice(0,10),
        publishAttemptedAt:now,validation:{...manifest.validation,humanApprovedAt:now},error:null,retryCount:0};
      posts.push(post);return {duplicatePrevented:Boolean(remote),post};
    },'chore: claim Yeonliji immediate publication [skip ci]');
    if(claim.duplicatePrevented) return claim;
    let published;
    const update=fields=>store.atomicUpdateSchedule(posts=>{
      const p=posts.find(p=>p.id===id);
      if(!p||p.status!=='publishing') fail('게시 기록 상태가 변경되어 중단했습니다.');
      Object.assign(p,fields);return p;
    },'chore: update Yeonliji immediate publication [skip ci]');
    try{
      const images=await media.publishImages(buffers);
      instagram.assertCarousel({imageUrls:images,caption:manifest.caption});
      await update({images});
      published=await instagram.publishCarousel({imageUrls:images,caption:manifest.caption,...config});
      receipt({draftId:manifest.id,contentHash:manifest.contentHash,postId:id,publishedId:published.publishedId,at:clock().toISOString()});
      const post=await update({status:'published',publishedId:published.publishedId,publishedAt:clock().toISOString(),error:null});
      return {duplicatePrevented:false,post};
    }catch(error){
      if(published?.publishedId) return {duplicatePrevented:false,post:{...claim.post,status:'published',publishedId:published.publishedId},historyWarning:'실제 게시 완료. 기록 저장 상태를 확인해야 합니다. 다시 게시하지 마세요.'};
      try{await update({status:'failed',error:'게시 결과 수동 확인 필요 — 자동 재게시 금지: '+error.message});}catch{}
      fail('게시를 완료했다고 확인할 수 없습니다. 자동 재게시하지 않습니다. '+error.message,502);
    }
  }
  async function reschedule(manifest,date,time){
    planner.validateDateTime(date,time,{future:true,now:clock().getTime()});
    if(manifest.factPack.kind==='calendar-calculation'&&manifest.date!==date) fail('일진 시안의 날짜가 달라 무료 업데이트와 재승인이 필요합니다.',422);
    return store.atomicUpdateSchedule(posts=>{
      const p=posts.find(p=>isTarget(p,manifest)&&p.status!=='canceled');
      if(!p||p.status!=='scheduled') fail('아직 게시되지 않은 예약만 시간을 변경할 수 있습니다.');
      if(p.contentHash!==manifest.contentHash) fail('예약된 원고와 다른 버전입니다. 해당 예약 시안을 선택해주세요.');
      if(new Date(p.scheduledAt).getTime()<=clock().getTime()+60000) fail('게시 시각이 임박했거나 이미 지났습니다. 게시 상태부터 확인해주세요.');
      p.scheduledAt=planner.validateDateTime(date,time).toISOString();
      p.expectedLocalDate=date;p.exactTimeKst=time;p.rescheduledAt=clock().toISOString();
      return {post:p};
    },'chore: change Yeonliji scheduled time [skip ci]');
  }
  return {publishNow,reschedule};
}
function saveReceipt(data){
  const dir=path.join(__dirname,'../../data');fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,'yeonliji-publication-'+data.contentHash+'.json'),JSON.stringify(data,null,2));
}
module.exports={createDelivery,...createDelivery()};
