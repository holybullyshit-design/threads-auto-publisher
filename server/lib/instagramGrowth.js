const crypto=require('crypto'),fs=require('fs'),path=require('path');
const store=require('./instagramAnalyticsStore'),insights=require('./instagramInsights');
const OUTPUT=()=>process.env.INSTAGRAM_GROWTH_OUTPUT_DIR||path.join(__dirname,'../../output');
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
function list(){return store.read('experiments',[]);}
function manifests(){if(!fs.existsSync(OUTPUT()))return [];return fs.readdirSync(OUTPUT()).filter(n=>/^yeonliji-/.test(n)).flatMap(n=>{try{return [JSON.parse(fs.readFileSync(path.join(OUTPUT(),n,'manifest.json'),'utf8'))];}catch{return [];}});}
function active(key){return list().find(e=>e.accountKey===key&&e.status==='approved'&&new Date(e.expiresAt)>new Date())||null;}
function attribution(posts){const drafts=manifests();return posts.map(p=>({...p,experimentId:p.experimentId||drafts.find(d=>d.contentHash===p.contentHash)?.experiment?.id||null}));}
function propose(snapshot){
  if(!snapshot||snapshot.error||snapshot.stale)fail('연결된 계정의 최신 데이터를 먼저 수집해주세요.');
  const key=snapshot.accountKey;if(!insights.ACCOUNTS[key])fail('지원하지 않는 계정입니다.');
  return store.transaction('experiments',all=>{
    const existing=all.filter(e=>e.accountKey===key&&e.snapshotId===snapshot.id);
    if(existing.length)return existing;
    const base={accountKey:key,snapshotId:snapshot.id,createdAt:new Date().toISOString(),status:'proposed',
      evidence:insights.diagnose(snapshot),baselinePostIds:snapshot.posts.map(p=>p.id),
      baseline:{followers:snapshot.followers,reach:snapshot.metrics.reach,views:snapshot.metrics.views,postCount:snapshot.posts.length},
      sampleRule:'기준 3개·실험 3개 이상, 같은 형식의 게시 후 48~96시간 관측 중 72시간에 가장 가까운 값으로 비교. 도달 100 이상 표본 필요. 내부 실험 기준이며 Instagram 공식 기준이 아닙니다.',
      preserved:['여성 캐릭터·그림체·무드','검증된 명리 내용·한자','계정 분리·기존 예약','최종 이미지 승인 절차'],
      expiresAfterDays:14,maxDrafts:3,cost:'계획·원고 미리보기 무료. 새 그림 제작은 기존 API 비용 동의가 별도로 필요합니다.',
      caveat:'노출 증가를 보장하지 않는 가설입니다. 서로 다른 게시물의 관찰 비교이므로 인과관계를 증명하지 않습니다.'};
    const defs=key==='yeonliji'?
      [{kind:'cover',title:'표지만 관계 상황형으로 바꾸기',before:'명리 용어 중심 질문',after:'예: 나는 매일 보고 싶고 / 그는 혼자 쉬고 싶었다',change:'다음 미사용 주제의 2장 상황 문장을 표지 제목으로 옮깁니다. 원래 명리 질문은 부제로 유지합니다.',metric:'reach',goal:'게시 72시간 전후 도달 중앙값 비교'},
       {kind:'cta',title:'키워드 댓글에서 구체적인 질문으로',before:'키워드와 궁금한 점 남기기',after:'지금 떠오른 관계의 궁금한 점을 / 댓글에 한 문장으로 남겨주세요.',change:'마지막 장과 캡션의 참여 요청만 바꿉니다. 생년월일·민감한 관계 정보는 요구하지 않습니다.',metric:'comments',goal:'게시 72시간 전후 댓글 수 / 도달 × 100 비교'}]:
      [{kind:'cover',title:'날짜 표지를 일상 상황형으로 바꾸기',before:'8월 31일 / 오늘의 운세',after:'중요한 대화를 앞두고 있다면?',change:'선택 날짜의 계산·12띠·생년별 문구는 그대로 두고 표지 문장만 시험합니다. 기존 자동 게시물은 변경하지 않습니다.',metric:'reach',goal:'게시 72시간 전후 도달 중앙값 비교'},
       {kind:'cta',title:'캡션 첫줄에 저장할 이유 보여주기',before:'오늘, 내 띠에게 들어온 한 줄을 찾아보세요.',after:'내 띠와 가까운 사람의 띠를 저장해두고, 대화 전에 가볍게 살펴보세요.',change:'별도 실험 원고에서 캡션 첫 문장만 바꿉니다. 운세 내용·그림·해시태그는 그대로 유지합니다.',metric:'saved',goal:'게시 72시간 전후 저장 수 / 도달 × 100 비교'}];
    const entries=defs.map(d=>({...base,...d,id:crypto.randomUUID()}));all.push(...entries);return entries;
  },[]);
}
function decide(id,decision,confirm){
  if(!['approve','reject','pause'].includes(decision))fail('지원하지 않는 결정입니다.');
  if(decision==='approve'&&confirm!==true)fail('설명을 읽고 승인 체크를 해야 합니다.');
  return store.transaction('experiments',all=>{
    const e=all.find(e=>e.id===id);if(!e)fail('실험 제안을 찾을 수 없습니다.',404);
    if(decision==='approve'){
      if(e.status==='approved')return e;
      if(e.status!=='proposed')fail('새 제안만 승인할 수 있습니다.',409);
      if(all.some(x=>x.accountKey===e.accountKey&&x.status==='approved'&&new Date(x.expiresAt)>new Date()))fail('계정당 한 실험만 진행합니다. 기존 실험을 중지한 뒤 승인해주세요.',409);
      e.status='approved';e.approvedAt=new Date().toISOString();e.expiresAt=new Date(Date.now()+14*86400000).toISOString();
    }else if(decision==='pause'){if(e.status!=='approved')fail('승인된 실험만 중지할 수 있습니다.',409);e.status='paused';e.pausedAt=new Date().toISOString();}
    else{if(e.status!=='proposed')fail('검토 중인 제안만 보류할 수 있습니다.',409);e.status='rejected';}
    return e;
  },[]);
}
function applyToPlan(original,{experiment=active('yeonliji')}={}){
  if(!experiment||experiment.status!=='approved'||experiment.accountKey!=='yeonliji'||new Date(experiment.expiresAt)<=new Date())return original;
  const drafts=manifests().filter(d=>d.experiment?.id===experiment.id);
  if(drafts.length>=3)return original;
  const p=structuredClone(original),oldTitle=p.displayTitle;
  if(experiment.kind==='cover'){
    p.cards[0].title=[...p.cards[1].title];p.cards[0].body=[oldTitle];
    p.displayTitle=p.cards[0].title.join(' ');p.caption=p.caption.replace(oldTitle,p.displayTitle);
  }else if(experiment.kind==='cta'){
    p.cards[6].body=['지금 떠오른 관계의 궁금한 점을','댓글에 한 문장으로 남겨주세요.'];
    p.caption=p.caption.replace(/댓글에 ‘[^’]+’ 키워드와 함께 궁금한 점을 남겨주세요\./,'지금 떠오른 관계의 궁금한 점을 댓글에 한 문장으로 남겨주세요.');
  }else return original;
  p.experiment={id:experiment.id,kind:experiment.kind,accountKey:'yeonliji',approvedAt:experiment.approvedAt,originalTitle:oldTitle};
  p.editorial.prompt+='\n승인된 단일 변수 실험: '+experiment.change+'\n명리 근거·캐릭터·나머지 카드는 변경하지 않는다.';
  p.contentHash=crypto.createHash('sha256').update(JSON.stringify(p.cards)+p.caption).digest('hex');
  const editorial=require('./yeonlijiEditorial');p.editorial.contentBinding=editorial.binding(p);editorial.validatePlan(p);return p;
}
function paljaPilot(date){
  const e=active('palja');if(!e)fail('팔자명가의 실험 제안을 먼저 승인해주세요.',409);
  const pkg=require('./fortuneEngine').generateFortunePackage(date);
  if(e.kind==='cover')pkg.slides[0].growthHeadline='중요한 대화를 앞두고 있다면?';
  else pkg.caption='내 띠와 가까운 사람의 띠를 저장해두고, 대화 전에 가볍게 살펴보세요.\n\n'+pkg.caption;
  pkg.experiment={id:e.id,kind:e.kind,approvedAt:e.approvedAt};pkg.experimentalPreviewOnly=true;
  pkg.contentHash=crypto.createHash('sha256').update(JSON.stringify({slides:pkg.slides,caption:pkg.caption})).digest('hex');
  return pkg;
}
const median=values=>{const a=[...values].sort((a,b)=>a-b);return a.length?a.length%2?a[(a.length-1)/2]:(a[a.length/2-1]+a[a.length/2])/2:null;};
function evaluate(e,snapshots){
  const best=new Map();
  for(const s of snapshots)for(const p of s.posts||[]){
    if(p.ageHours<48||p.ageHours>96||p.type==='STORY')continue;
    const old=best.get(p.id);if(!old||Math.abs(p.ageHours-72)<Math.abs(old.ageHours-72))best.set(p.id,p);
  }
  const usable=p=>p.metrics.reach?.status==='ok'&&p.metrics.reach.value>=100&&p.metrics[e.metric]?.status==='ok';
  const rows=[...best.values()],test=rows.filter(p=>p.experimentId===e.id&&usable(p));
  const base=rows.filter(p=>e.baselinePostIds.includes(p.id)&&!p.experimentId&&usable(p)&&test.some(t=>t.type===p.type));
  if(base.length<3||test.length<3)return {status:'waiting',baselineCount:base.length,testCount:test.length,message:'판정 보류: 같은 형식·게시 후 48~96시간·도달 100 이상인 기준 3개와 실험 3개가 필요합니다. 앞으로 수집할 관측값을 기다립니다.'};
  const score=p=>e.metric==='reach'?p.metrics.reach.value:p.metrics[e.metric].value/p.metrics.reach.value*100;
  const a=median(base.map(score)),b=median(test.map(score));
  return {status:'observed',baselineCount:base.length,testCount:test.length,baselineMedian:a,testMedian:b,changePct:a>0?(b/a-1)*100:null,message:b>a?'이번 표본에서 실험값이 높았습니다. 지속 여부를 사람이 검토해주세요.':'이번 표본에서 개선이 확인되지 않았습니다. 현재 실험을 중지하고 다른 가설을 검토할 수 있습니다. 인과관계나 실패를 확정하지 않습니다.'};
}
function summary(key){const m=manifests();return list().filter(e=>e.accountKey===key).map(e=>({...e,draftCount:m.filter(d=>d.experiment?.id===e.id).length,evaluation:evaluate(e,insights.history(key))})).reverse();}
module.exports={list,active,propose,decide,applyToPlan,paljaPilot,evaluate,summary,attribution};
