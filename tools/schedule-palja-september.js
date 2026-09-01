require('dotenv').config();
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),sharp=require('sharp');
const {execFileSync}=require('node:child_process');
const {generateFortunePackage}=require('../server/lib/fortuneEngine');
const {assertPublicCaption}=require('../server/lib/instagramCaption');
const {readSchedule,atomicUpdateSchedule}=require('../server/lib/githubStore');
const {getCredentials}=require('../server/lib/instagramAuthStore');
const {graphRequest,getConfig}=require('../server/lib/instagramClient');
const {publishImages}=require('../server/lib/mediaHost');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'output/palja-2026-09-01_03');
const uploadFile=path.join(dir,'uploaded.json');
const dates=['2026-09-01','2026-09-02','2026-09-03'];
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
const sameAccount=p=>p.platform==='instagram' && (p.accountKey==='palja'||(!p.accountKey&&p.accountId==='saju_orbit'));
async function verifiedItems(){
  const manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8'));
  assert.deepEqual(manifest.map(x=>x.date),dates);
  const buffers=[];
  for(const item of manifest){
    const pkg=generateFortunePackage(item.date);
    assert.equal(item.contentHash,pkg.contentHash);assert.equal(item.caption,pkg.caption);assertPublicCaption(item.caption);
    assert.equal(item.validation.status,'passed');assert.equal(item.images.length,7);
    for(const [i,im] of item.images.entries()){
      assert.equal(im.page,i+1);const b=fs.readFileSync(im.file);assert.equal(digest(b),im.sha256);
      const m=await sharp(b).metadata();assert.equal(m.width,1080);assert.equal(m.height,1350);assert.equal(m.format,'jpeg');
      assert.ok(im.renderedText.length>0);assert.ok(!/#자동게시_|7,000|2,100/.test(im.renderedText.join('\n')));
      buffers.push({buffer:b,ext:'jpg'});
    }
  }
  assert.equal(new Set(manifest.flatMap(x=>x.images.map(im=>im.sha256))).size,21);
  return {manifest,buffers};
}
(async()=>{
  const mode=process.argv[2];assert.ok(['upload','schedule'].includes(mode),'upload 또는 schedule 모드를 지정하세요.');
  const {manifest,buffers}=await verifiedItems();
  if(mode==='upload'){
    if(fs.existsSync(uploadFile)){console.log('기존 업로드 기록이 있습니다. 재업로드하지 않습니다.');return;}
    assert.equal(execFileSync('git',['status','--porcelain'],{cwd:path.join(root,'media-host'),encoding:'utf8'}).trim(),'','이미지 저장소에 다른 변경이 있어 중단합니다.');
    const {posts}=await readSchedule();
    assert.ok(!posts.some(p=>sameAccount(p)&&p.status!=='canceled'&&dates.includes(p.expectedLocalDate)),'이미 예약된 날짜가 있어 중단합니다.');
    const urls=await publishImages(buffers);
    const uploaded=manifest.map((x,i)=>({...x,images:urls.slice(i*7,i*7+7),imageHashes:x.images.map(im=>im.sha256)}));
    fs.writeFileSync(uploadFile,JSON.stringify(uploaded,null,2));console.log('21개 이미지 업로드 완료. 아직 예약 전입니다.');return;
  }
  const items=JSON.parse(fs.readFileSync(uploadFile,'utf8'));
  const account=getCredentials('palja');assert.ok(account);
  const profile=await graphRequest(getConfig(account),'me',{params:{fields:'id,username'}});
  assert.equal(profile.username,'saju_orbit','팔자명가 계정이 아닙니다.');
  for(const [i,item] of items.entries()){
    assert.equal(item.contentHash,manifest[i].contentHash);assert.equal(item.caption,manifest[i].caption);assert.equal(item.images.length,7);
    for(const [n,url] of item.images.entries()){
      assert.ok(url.startsWith('https://cdn.jsdelivr.net/gh/holybullyshit-design/threads-media-host@'));
      const r=await fetch(url,{signal:AbortSignal.timeout(45000)});if(!r.ok)throw Error('이미지 접근 실패 HTTP '+r.status);
      assert.equal(digest(Buffer.from(await r.arrayBuffer())),item.imageHashes[n],'공개 이미지와 검수 이미지가 다릅니다.');
    }
    console.log(item.date+': 공개 7장 원본 해시 대조 완료');
  }
  const receipt=await atomicUpdateSchedule(posts=>{
    const result=[];
    for(const item of items){
      const when=`${item.date}T06:00:00+09:00`,dedupeKey=`instagram:palja-daily:${item.date}`;
      const existing=posts.filter(p=>p.status!=='canceled'&&(p.dedupeKey===dedupeKey||(sameAccount(p)&&p.expectedLocalDate===item.date)));
      if(existing.length){
        assert.equal(existing.length,1,'중복 예약 존재');const p=existing[0];
        assert.equal(p.contentHash,item.contentHash,'다른 원고가 이미 예약되어 있습니다.');
        assert.deepEqual(p.images,item.images);assert.equal(p.text,item.caption);
        assert.ok(['scheduled','published'].includes(p.status));result.push({id:p.id,date:item.date,status:p.status,scheduledAt:p.scheduledAt});continue;
      }
      assert.ok(Date.parse(when)>Date.now(),'지난 시각은 예약하지 않습니다.');
      const post={id:crypto.randomUUID(),platform:'instagram',accountKey:'palja',accountId:'saju_orbit',accountLabel:'팔자명가',
        title:item.caption.split('\n')[0],text:item.caption,images:item.images,status:'scheduled',scheduledAt:new Date(when).toISOString(),
        expectedLocalDate:item.date,exactTimeKst:'06:00',dedupeKey,contentHash:item.contentHash,validation:{...item.validation,imageReview:'passed',publicImageHashMatch:true},
        createdAt:new Date().toISOString(),publishedAt:null,publishedId:null,error:null,retryCount:0};
      posts.push(post);result.push({id:post.id,date:item.date,status:post.status,scheduledAt:post.scheduledAt});
    }return result;
  },'chore: schedule reviewed Palja fortunes Sep 1–3 at 06:00 KST');
  const {posts}=await readSchedule();
  for(const item of items){
    const matches=posts.filter(p=>sameAccount(p)&&p.status!=='canceled'&&p.expectedLocalDate===item.date);
    assert.equal(matches.length,1);assert.equal(matches[0].contentHash,item.contentHash);assert.deepEqual(matches[0].images,item.images);
    assert.equal(matches[0].text,item.caption);assert.equal(matches[0].scheduledAt,new Date(item.date+'T06:00:00+09:00').toISOString());
    const previewDir=path.join(root,'public/generated/instagram',item.date);fs.mkdirSync(previewDir,{recursive:true});
    const pkg=generateFortunePackage(item.date);pkg.snapshotImageBase='/generated/instagram/'+item.date;
    pkg.scheduledAt=matches[0].scheduledAt;pkg.scheduleStatus=matches[0].status;
    fs.writeFileSync(path.join(previewDir,'package.json'),JSON.stringify(pkg,null,2));
    for(const im of manifest.find(x=>x.date===item.date).images)fs.copyFileSync(im.file,path.join(previewDir,im.page+'.jpg'));
  }
  fs.writeFileSync(path.join(dir,'schedule-receipt.json'),JSON.stringify({checkedAt:new Date().toISOString(),account:'saju_orbit',posts:receipt},null,2));
  console.log(JSON.stringify(receipt,null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
