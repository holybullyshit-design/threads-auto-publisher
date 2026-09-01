// Reviewed 5-second Palja Reels. No generated tracking tags in public captions.
const crypto = require('node:crypto');
const { getConfig, graphRequest, waitForContainer } = require('./instagramClient');
const { assertPublicCaption, publicCaption } = require('./instagramCaption');
const fail = (message, code='INVALID_REEL') => Object.assign(new Error(message), {code});
const digest = value => crypto.createHash('sha256').update(value).digest('hex');

function reelContentHash(post) {
  return digest(JSON.stringify({accountKey:post.accountKey, accountId:post.accountId,
    mediaType:post.mediaType, title:post.title, text:post.text, videoUrl:post.videoUrl,
    videoSha256:post.videoSha256, scheduledAt:post.scheduledAt}));
}

function assertReelPost(post) {
  if(post.accountKey!=='palja' || post.accountId!=='saju_orbit' || post.mediaType!=='REELS')
    throw fail('팔자명가 릴스 계정·유형이 일치하지 않습니다.');
  assertPublicCaption(post.text);
  if(!post.text || post.text.length>2200 || publicCaption(post.text)!==post.text)
    throw fail('릴스 공개 캡션 검수 실패.');
  if(!/^https:\/\/cdn\.jsdelivr\.net\/gh\/holybullyshit-design\/threads-media-host@[a-f0-9]{40}\/images\/[a-zA-Z0-9-]+\.mp4$/.test(post.videoUrl || ''))
    throw fail('검수한 고정 버전 영상 주소가 아닙니다.');
  if(!/^[a-f0-9]{64}$/.test(post.videoSha256 || '') || post.contentHash!==reelContentHash(post))
    throw fail('승인 후 영상·캡션·예약 정보가 바뀌어 발행을 차단했습니다.', 'REEL_INTEGRITY');
  const v=post.validation;
  if(v?.status!=='passed' || v?.visualReview!=='passed' || v?.captionReview!=='passed' ||
    v?.duration!==5 || v?.width!==1080 || v?.height!==1920 || v?.frames!==150)
    throw fail('릴스 최종 검수 증거가 없습니다.', 'VALIDATION_REQUIRED');
  if(!Number.isFinite(Date.parse(post.scheduledAt))) throw fail('예약 날짜가 올바르지 않습니다.');
}

async function verifyReelSource(post, credentials) {
  assertReelPost(post);
  const config=getConfig(credentials);
  const profile=await graphRequest(config,'me',{params:{fields:'id,user_id,username'}});
  if(profile.username!=='saju_orbit') throw fail('실제 인증 계정이 팔자명가가 아닙니다.', 'REEL_ACCOUNT_MISMATCH');
  config.userId=String(profile.user_id || config.userId);
  const res=await fetch(post.videoUrl,{signal:AbortSignal.timeout(45000)});
  if(!res.ok) throw fail('공개 릴스 영상 접근 실패: HTTP '+res.status);
  const bytes=Buffer.from(await res.arrayBuffer());
  if(digest(bytes)!==post.videoSha256) throw fail('공개 영상과 검수한 영상이 다릅니다.', 'REEL_INTEGRITY');
  return config;
}

async function prepareReel(post, credentials) {
  const config=await verifyReelSource(post,credentials);
  const container=await graphRequest(config,`${config.userId}/media`,{method:'POST',params:{
    media_type:'REELS',video_url:post.videoUrl,caption:post.text,share_to_feed:'true',thumb_offset:'0'
  }});
  if(!container.id) throw fail('Instagram 릴스 준비 ID를 받지 못했습니다.');
  await waitForContainer(config,container.id,{timeoutMs:180000,intervalMs:3000});
  return {containerId:String(container.id),preparedAt:new Date().toISOString(),contentHash:post.contentHash};
}

async function publishScheduledReel(post, credentials) {
  const config=await verifyReelSource(post,credentials);
  let ready=post.reelPreparation;
  if(!ready || ready.contentHash!==post.contentHash || Date.now()-Date.parse(ready.preparedAt)>20*3600000)
    ready=await prepareReel(post,credentials);
  await waitForContainer(config,ready.containerId,{timeoutMs:180000,intervalMs:3000});
  const result=await graphRequest(config,`${config.userId}/media_publish`,{method:'POST',params:{creation_id:ready.containerId}});
  if(!result.id) throw fail('릴스 발행 결과 ID가 없어 수동 확인이 필요합니다.');
  return {publishedId:String(result.id),containerId:ready.containerId};
}

async function claimScheduledReel(post) {
  const {atomicUpdateSchedule}=require('./githubStore');
  return atomicUpdateSchedule(posts=>{
    const target=posts.find(p=>p.id===post.id);
    if(!target || target.status!=='scheduled') throw fail('이미 처리 중인 릴스입니다.', 'REEL_ALREADY_CLAIMED');
    assertReelPost(target);
    if(target.contentHash!==post.contentHash || Date.parse(target.scheduledAt)>Date.now())
      throw fail('예약 내용 또는 시간이 변경되어 발행하지 않습니다.', 'REEL_ALREADY_CLAIMED');
    Object.assign(target,{status:'publishing',publishAttemptedAt:new Date().toISOString(),error:null});
  },`chore: claim reviewed Reel ${post.id} [skip ci]`);
}
module.exports={digest,reelContentHash,assertReelPost,verifyReelSource,prepareReel,publishScheduledReel,claimScheduledReel};
