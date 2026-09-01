// Build a local review sheet. Never approves, schedules, or calls an image API.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),sharp=require('sharp');
const editor=require('../server/lib/yeonlijiEditorial');
const id=process.argv[2];
if(!/^yeonliji-\d{4}-\d{2}-\d{2}(?:-[a-z0-9_-]+)?$/.test(id||'')) throw new Error('올바른 시안 ID가 필요합니다.');
const dir=path.join(__dirname,'../output',id);
(async()=>{
  const m=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json')));
  editor.validatePlan(m);
  const layers=[];
  for(let i=0;i<7;i++){
    const data=fs.readFileSync(path.join(dir,`card-${String(i+1).padStart(2,'0')}.jpg`));
    const hash=crypto.createHash('sha256').update(data).digest('hex');
    if(hash!==m.validation.imageHashes[i]) throw new Error(`${i+1}장 파일 변경 감지`);
    const size=await sharp(data).metadata();
    if(size.width!==1080||size.height!==1350) throw new Error('규격 불일치');
    layers.push({input:await sharp(data).resize(432,540).toBuffer(),left:i%4*432,top:Math.floor(i/4)*540});
  }
  const file=path.join(dir,'review-sheet.png');
  await sharp({create:{width:1728,height:1080,channels:3,background:'#fff'}}).composite(layers).png().toFile(file);
  console.log(JSON.stringify({file,editorialVersion:m.editorial.copyRevision,checks:'7장 규격·원고 근거·파일 해시 일치',humanReviewRequired:true}));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
