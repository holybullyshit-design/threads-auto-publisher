const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),sharp=require('sharp');
const {generateFortunePackage}=require('../server/lib/fortuneEngine');
const {renderFortunePackage,closeRenderer}=require('../server/lib/instagramCardRenderer');
const root=path.resolve(__dirname,'..'),out=path.join(root,'output','palja-2026-09-01_03');
const dates=['2026-09-01','2026-09-02','2026-09-03'];
(async()=>{
  fs.mkdirSync(out,{recursive:true});const manifest=[];
  try{
    for(const date of dates){
      const pkg=generateFortunePackage(date),dir=path.join(out,date);fs.mkdirSync(dir,{recursive:true});
      const cards=await renderFortunePackage(pkg);const images=[];
      for(const card of cards){
        const file=path.join(dir,`${card.page}.jpg`);fs.writeFileSync(file,card.buffer);
        images.push({file,page:card.page,sha256:crypto.createHash('sha256').update(card.buffer).digest('hex'),renderedText:card.renderedText});
      }
      fs.writeFileSync(path.join(dir,'package.json'),JSON.stringify(pkg,null,2));
      fs.writeFileSync(path.join(dir,'caption.txt'),pkg.caption);
      const tiles=await Promise.all(images.map(async(im,i)=>({input:await sharp(im.file).resize(432,540).toBuffer(),left:(i%4)*432,top:Math.floor(i/4)*540})));
      await sharp({create:{width:1728,height:1080,channels:3,background:'#ddd5c5'}}).composite(tiles).jpeg({quality:94}).toFile(path.join(out,`${date}-review.jpg`));
      manifest.push({date,caption:pkg.caption,contentHash:pkg.contentHash,validation:pkg.validation,images});
      console.log(`${date}: 7장 생성, ${pkg.calendar.day}, ${pkg.caption.length}자`);
    }
    fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2));
    console.log('PREPARED_ONLY: 아직 예약하거나 게시하지 않았습니다.');
  }finally{await closeRenderer();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
