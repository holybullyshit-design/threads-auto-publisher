const crypto=require('crypto');
const store=require('./instagramAnalyticsStore'),auth=require('./instagramAuthStore'),client=require('./instagramClient');
const ACCOUNTS={palja:{label:'팔자명가',username:'saju_orbit'},yeonliji:{label:'연리지 실타래',username:'knot_saju'}};
const ACCOUNT_METRICS=['views','reach','accounts_engaged','total_interactions','likes','comments','shares','saves','profile_links_taps'];
const MEDIA_METRICS=['views','reach','saved','shares'];
const inFlight=new Map();
function validate(key,days){if(!ACCOUNTS[key]||![7,30].includes(Number(days)))throw Object.assign(new Error('계정과 조회 기간(7일/30일)을 확인해주세요.'),{status:400});}
function range(days,now=new Date()){const day=new Date(now.getTime()+32400000).toISOString().slice(0,10);const since=new Date(day+'T00:00:00+09:00').getTime()-(days-1)*86400000;return {since:Math.floor(since/1000),until:Math.floor(now.getTime()/1000),startKst:new Date(since+32400000).toISOString().slice(0,10),endKst:day,days};}
const unavailable=(status='missing',reason='API에서 값을 제공하지 않았습니다.')=>({value:null,status,reason});
function number(value){return typeof value==='number'&&Number.isFinite(value)&&value>=0?{value,status:'ok',reason:null}:unavailable();}
function parseMetric(data,name,{account=false}={}){const m=data.data?.find(m=>m.name===name);if(!m)return unavailable();return number(account?m.total_value?.value:(m.total_value?.value??m.values?.[0]?.value));}
function apiError(e){const code=Number(e.code);if([10,200].includes(code))return unavailable('permission','통계 권한 추가 승인 필요 (Meta '+code+')');if(code===190)return unavailable('auth','Instagram 연결이 만료됐습니다. 다시 로그인해주세요.');if(code===100)return unavailable('unsupported','이 계정 또는 미디어에서 해당 지표를 제공하지 않습니다.');return unavailable('error','Instagram 응답 실패. 잠시 후 다시 수집해주세요.');}
async function api(conf,pathname,params={}){const url=new URL(conf.graphBase+'/'+conf.graphVersion+'/'+pathname);url.search=new URLSearchParams({...params,access_token:conf.accessToken});const r=await fetch(url,{signal:AbortSignal.timeout(15000)});const b=await r.json().catch(()=>({}));if(!r.ok||b.error)throw Object.assign(new Error('Instagram request failed'),{code:b.error?.code||r.status});return b;}
async function collect(key,days,{request=api,credentials=auth.getCredentials(key),now=new Date(),scheduled=[]}={}){
  validate(key,days);days=Number(days);const period=range(days,now);
  const result={id:crypto.randomUUID(),accountKey:key,...ACCOUNTS[key],period,fetchedAt:now.toISOString(),source:'Instagram Graph API',metrics:{},posts:[],warnings:[],coverage:{limit:50,truncated:false},followers:unavailable()};
  if(!credentials){result.connection='disconnected';result.error='Instagram 계정 연결이 필요합니다.';return result;}
  const conf=client.getConfig(credentials);
  let profile;
  try{profile=await request(conf,'me',{fields:'id,user_id,username,followers_count,media_count'});}catch(e){
    try{profile=await request(conf,'me',{fields:'user_id,username'});result.warnings.push('팔로워·게시물 총수는 현재 제공되지 않습니다. 통계 조회는 계속합니다.');}
    catch(identityError){result.connection='error';result.error=apiError(identityError).reason;return result;}
  }
  if(profile.username!==ACCOUNTS[key].username){result.connection='wrong-account';result.error='예상 계정과 실제 연결 계정이 다릅니다. 수집을 중단했습니다.';return result;}
  conf.userId=String(profile.user_id||conf.userId);result.connection='connected';result.followers=number(profile.followers_count);result.totalMedia=number(profile.media_count);
  let denied=null;
  for(const name of ACCOUNT_METRICS){
    if(denied){result.metrics[name]={...denied};continue;}
    try{result.metrics[name]=parseMetric(await request(conf,conf.userId+'/insights',{metric:name,period:'day',metric_type:'total_value',since:String(period.since),until:String(period.until)}),name,{account:true});}
    catch(e){result.metrics[name]=apiError(e);if(result.metrics[name].status==='auth')denied=result.metrics[name];}
  }
  result.needsInsightsPermission=['views','reach'].every(name=>result.metrics[name]?.status==='permission');
  let all=[],after;
  try{
    for(let page=0;page<2;page++){
      const body=await request(conf,conf.userId+'/media',{fields:'id,caption,timestamp,permalink,media_type,media_product_type,like_count,comments_count,media_url,thumbnail_url',limit:'25',...(after?{after}: {})});
      all.push(...(body.data||[]));after=body.paging?.cursors?.after;result.coverage.truncated=Boolean(body.paging?.next);
      if(!body.paging?.next||!after)break;
    }
  }catch(e){result.mediaError=apiError(e).reason;}
  const unique=[...new Map(all.map(m=>[m.id,m])).values()];
  for(const media of unique.filter(m=>{const t=new Date(m.timestamp).getTime()/1000;return t>=period.since&&t<=period.until;})){
    const p={id:media.id,title:(media.caption||'제목 없음').split('\n')[0].slice(0,180),caption:media.caption||'',timestamp:media.timestamp,permalink:media.permalink,thumbnail:media.thumbnail_url||media.media_url||null,type:media.media_product_type||media.media_type,ageHours:Math.max(0,(now-new Date(media.timestamp))/3600000),metrics:{likes:number(media.like_count),comments:number(media.comments_count)}};
    const linked=scheduled.find(s=>s.platform==='instagram'&&s.accountKey===key&&String(s.publishedId)===String(media.id));
    p.experimentId=linked?.experimentId||null;
    for(const name of MEDIA_METRICS){
      if(denied){p.metrics[name]={...denied};continue;}
      try{p.metrics[name]=parseMetric(await request(conf,p.id+'/insights',{metric:name}),name);}
      catch(e){p.metrics[name]=apiError(e);if(p.metrics[name].status==='auth')denied=p.metrics[name];}
    }
    result.posts.push(p);
  }
  result.posts.sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp));
  if(result.coverage.truncated)result.warnings.push('최신 50개까지만 수집했습니다. 게시물 목록은 전체 기간을 포함하지 않을 수 있습니다.');
  result.warnings.push('계정 지표는 선택 기간의 활동, 게시물 지표는 해당 기간에 게시된 콘텐츠의 수집 시점 누적값입니다. 서로 합산하지 않습니다.');
  result.warnings.push('도달은 중복 제거 계정 수입니다. 게시물별 도달을 더해 계정 도달로 표시하지 않습니다.');
  if(result.followers.status==='ok'&&result.followers.value<100)result.warnings.push('팔로워 100명 미만 계정은 일부 통계가 제공되지 않을 수 있습니다.');
  return result;
}
function cached(key,days){validate(key,days);return store.read('snapshot-'+key+'-'+days,null);}
async function refresh(key,days,{force=false}={}){
  validate(key,days);const cacheKey=key+'-'+days,old=cached(key,days);
  if(!force&&old&&!old.error&&!old.needsInsightsPermission&&Date.now()-new Date(old.fetchedAt).getTime()<300000)return {...old,cached:true};
  if(inFlight.has(cacheKey))return inFlight.get(cacheKey);
  const job=(async()=>{let scheduled=[],historyWarning=null;try{scheduled=await require('./scheduleStore').listSchedule();}catch{historyWarning='게시 이력을 읽지 못해 실험 귀속 확인을 보류했습니다.';}
    scheduled=require('./instagramGrowth').attribution(scheduled);
    const next=await collect(key,days,{scheduled});if(historyWarning)next.warnings.push(historyWarning);
    if(next.error&&old)return {...old,stale:true,refreshError:next.error};
    store.write('snapshot-'+cacheKey,next);
    store.transaction('history-'+key,list=>{list.push(next);if(list.length>240)list.splice(0,list.length-240);return next;},[]);
    return next;
  })().finally(()=>inFlight.delete(cacheKey));inFlight.set(cacheKey,job);return job;
}
function history(key){validate(key,7);return store.read('history-'+key,[]);}
function diagnose(snapshot){
  if(!snapshot||snapshot.error)return ['연결 또는 수집 오류를 먼저 해결해야 합니다. 없는 통계를 0으로 판단하지 않습니다.'];
  const notes=[],posts=snapshot.posts,mature=posts.filter(p=>p.ageHours>=72);
  notes.push('관측: 최근 '+snapshot.period.days+'일 게시물 '+posts.length+'개, 팔로워 '+(snapshot.followers.value??'미확인')+'명.');
  if(snapshot.needsInsightsPermission)notes.push('조회수·도달은 권한 부족으로 미확인입니다. 현재 수치로 노출 실패나 콘텐츠 실패를 단정할 수 없습니다.');
  if(mature.length<3)notes.push('게시 후 72시간 이상 지난 게시물이 3개 미만입니다. 방향 전환 판정은 보류하고 작은 실험부터 진행합니다.');
  const reach=snapshot.metrics.reach;
  if(reach?.status==='ok'&&reach.value<100)notes.push('관측: 기간 도달 '+reach.value+'명. 낮은 반응의 원인보다 아직 노출 표본이 적다는 점이 먼저 확인됩니다.');
  notes.push(snapshot.accountKey==='palja'?'가설: 날짜 중심 표지에 일상 상황을 더하거나, 캡션에 저장할 이유를 제시하는 실험을 각각 검토합니다. 띠별 풀이·그림체·게시 시간은 유지합니다.':'가설: 표지의 구체적인 관계 상황과 마지막 장의 댓글 질문을 각각 시험합니다. 해시태그·그림체·게시 시간까지 한꺼번에 바꾸지 않습니다.');
  notes.push('앱에서 추천 자격/계정 상태도 직접 확인해주세요. 현재 통계만으로 추천 제한 여부를 판정하지 않습니다.');
  return notes;
}
module.exports={ACCOUNTS,range,number,parseMetric,apiError,collect,refresh,cached,history,diagnose};
