const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const { validatePlan, VERSION } = require('./yeonlijiEditorial');
const ROOT = path.join(__dirname,'../..');
const OUTPUT = path.join(ROOT,'output');
const REFERENCE = path.join(ROOT,'assets/yeonliji/relationship-sensitive-storyboard-v1.png');
const MODEL = 'gpt-image-2';
let active = false;
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const esc = text => String(text ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));

function wrap(lines, limit) {
  const result=[];
  for (const line of lines) {
    let rest=line;
    while (rest.length>limit) {
      let end=rest.lastIndexOf(' ',limit);
      if (end<Math.floor(limit/2)) end=limit;
      result.push(rest.slice(0,end).trim()); rest=rest.slice(end).trim();
    }
    if(rest) result.push(rest);
  }
  return result;
}
function overlay(card,index) {
  const title=card.title.flatMap((text,sourceLine)=>wrap([text],16).map(text=>({text,sourceLine}))), body=wrap(card.body,30);
  if(title.length>3 || body.length>4) throw Object.assign(new Error('문구가 너무 길어 카드 밖으로 넘칠 수 있습니다.'),{status:422});
  if(card.eyebrow.length>35 || (card.note && wrap([card.note],32).length>1)) throw Object.assign(new Error('라벨 또는 강조 문구가 너무 깁니다.'),{status:422});
  const titleSvg=title.map((row,i)=>`<text x="84" y="${205+i*70}" font-size="56" font-weight="800" fill="${row.sourceLine===card.accentTitleLine?'#883d50':'#31282b'}">${esc(row.text)}</text>`).join('');
  const bodyY=205+(title.length-1)*70+66;
  const bodySvg=body.map((text,i)=>{
    const emphasis=card.bodyEmphasis;
    const rendered=emphasis && text.includes(emphasis) ? text.split(emphasis).map(esc).join(`<tspan fill="#883d50" font-weight="800">${esc(emphasis)}</tspan>`) : esc(text);
    return `<text x="84" y="${bodyY+i*41}" font-size="30" font-weight="500" fill="#5d5050">${rendered}</text>`;
  }).join('');
  // Keep the original palette and art area. Reserve a compact takeaway above the art.
  const noteY=Math.max(500,bodyY+(body.length-1)*41+34);
  if(card.note && noteY+48>590) throw Object.assign(new Error('본문과 강조 문구가 그림 영역을 침범합니다.'),{status:422});
  const noteSvg=card.note?`<rect x="80" y="${noteY}" width="920" height="48" rx="12" fill="#efe0d8"/><text x="103" y="${noteY+33}" font-size="27" font-weight="700" fill="#7b4050">${esc(card.note)}</text>`:'';
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350"><g font-family="Apple SD Gothic Neo, Noto Sans KR, sans-serif">
  <rect x="42" y="42" width="996" height="1266" rx="34" fill="none" stroke="#d9c5b8" stroke-width="2"/>
  <rect x="80" y="74" width="${Math.min(920,50+card.eyebrow.length*24)}" height="48" rx="24" fill="#efe0d8"/>
  <text x="105" y="107" font-size="24" font-weight="700" fill="#7b4050">${esc(card.eyebrow)}</text>
  ${titleSvg}${bodySvg}${noteSvg}
  ${index===6?'<path d="M180 865 C300 735 435 1005 565 865 S820 735 930 870" fill="none" stroke="#9b3347" stroke-width="12" stroke-linecap="round"/><circle cx="565" cy="865" r="34" fill="#f5eee4" stroke="#9b3347" stroke-width="10"/><circle cx="565" cy="865" r="10" fill="#9b3347"/>':''}
  </g></svg>`);
}
function buildPrompt(plan) {
  if(plan.generation.scenes.length!==6) throw new Error('6개 장면이 필요합니다.');
  return `Use the attached reference as the locked visual bible. Make ONE 1536x1024 image with EXACTLY 3 columns and 2 rows of six equal panels, read left to right, then top to bottom. Thin white gutters only.
Keep the same adult Korean woman, shoulder-length dark hair, cream blouse, muted plum cardigan, and tiny red-thread knot spirit. Preserve the reference face, age, clothing, proportions and delicate gouache/colored-pencil Korean webtoon style. Mature, warm expressions for women aged 20-40. Cream, coral, burgundy, plum. No chibi, no 3D, no glossy rendering. Each scene distinct in pose and composition; keep full subjects within each panel. Communicate the specific action in each scene rather than repeating a woman sadly looking at a phone. Use the red thread as a subtle story motif, never as a promise of reunion.
ABSOLUTELY NO TEXT, letters, numbers, speech bubbles, logos, watermarks, readable screens, occult fear imagery. No brand signature, footer, page count or fake fortune chart. Verified Korean and selected Hanja terms, emphasis and captions are added separately by the app; do not paint any typography into the art.
Scenes:\n${plan.generation.scenes.map((s,i)=>`${i+1}. ${s}`).join('\n')}`;
}
async function requestStoryboard(plan) {
  if(!process.env.OPENAI_API_KEY) throw Object.assign(new Error('OpenAI API 키가 설정되지 않았습니다. 이미지 생성 연결을 확인해주세요.'),{status:409});
  const form=new FormData();
  for(const [k,v] of Object.entries({model:MODEL,prompt:buildPrompt(plan),size:'1536x1024',quality:'medium',output_format:'png',n:'1'})) form.append(k,v);
  form.append('image[]',new Blob([fs.readFileSync(REFERENCE)],{type:'image/png'}),'character-reference.png');
  let response;
  try { response=await fetch('https://api.openai.com/v1/images/edits',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`},body:form,signal:AbortSignal.timeout(240000)}); }
  catch(error) { throw Object.assign(new Error(error.name==='TimeoutError'?'이미지 생성 시간이 초과되었습니다. 자동 재요청하지 않았습니다. 잠시 뒤 다시 확인해주세요.':'OpenAI에 연결하지 못했습니다. 인터넷 연결을 확인해주세요.'),{status:502}); }
  const data=await response.json().catch(()=>({}));
  if(!response.ok) {
    const detail=response.status===429?'OpenAI API 사용량 또는 결제 한도를 확인해주세요.':response.status===401?'OpenAI API 키를 확인해주세요.':`이미지 API 요청이 거절됐습니다 (HTTP ${response.status}, ${data.error?.code || 'provider_error'}).`;
    throw Object.assign(new Error(detail),{status:502});
  }
  if(!data.data?.[0]?.b64_json) throw Object.assign(new Error('이미지 생성 결과가 비어 있습니다.'),{status:502});
  return {buffer:Buffer.from(data.data[0].b64_json,'base64'),requestId:response.headers.get('x-request-id')};
}
async function renderDraft(plan, storyboard, directory) {
  validatePlan(plan);
  // Validate all copy before writing files (and before a paid call in generateDraft).
  const overlays=plan.cards.map(overlay);
  const meta=await sharp(storyboard).metadata();
  if(!meta.width || Math.abs(meta.width/meta.height-1.5)>.02) throw Object.assign(new Error('6칸 이미지의 가로세로 비율이 맞지 않습니다. 다시 만들어주세요.'),{status:422});
  const normalized=await sharp(storyboard).resize(1536,1024).png().toBuffer();
  fs.writeFileSync(path.join(directory,'source-storyboard.png'),normalized);
  const panelHashes=[],imageHashes=[],files=[];
  for(let i=0;i<7;i++) {
    const layers=[];
    if(i<6) {
      const panel=await sharp(normalized).extract({left:(i%3)*512+8,top:Math.floor(i/3)*512+8,width:496,height:496}).png().toBuffer();
      panelHashes.push(hash(panel));
      const art=await sharp(panel).resize(900,650,{fit:'contain',background:'#f5eee4'}).png().toBuffer();
      layers.push({input:art,left:90,top:595});
    }
    layers.push({input:overlays[i],left:0,top:0});
    const image=await sharp({create:{width:1080,height:1350,channels:3,background:'#f5eee4'}}).composite(layers).jpeg({quality:94,chromaSubsampling:'4:4:4'}).toBuffer();
    imageHashes.push(hash(image));
    const file=`card-${String(i+1).padStart(2,'0')}.jpg`;
    fs.writeFileSync(path.join(directory,file),image); files.push(file);
  }
  if(new Set(panelHashes).size!==6 || new Set(imageHashes).size!==7) throw Object.assign(new Error('동일한 이미지가 반복되어 저장을 중단했습니다.'),{status:422});
  return {files,imageHashes,panelHashes};
}
async function generateDraft(plan,{outputDir=OUTPUT,provider=requestStoryboard}={}) {
  if(active) throw Object.assign(new Error('이미 시안을 만들고 있습니다. 완료 후 새로고침해주세요.'),{status:409});
  active=true;
  let temporary;
  try {
    validatePlan(plan);
    plan.cards.forEach(overlay);
    fs.mkdirSync(outputDir,{recursive:true});
    const id=`yeonliji-${plan.date}-${plan.topicId}-${crypto.randomUUID().slice(0,8)}`;
    temporary=fs.mkdtempSync(path.join(outputDir,'.yeonliji-tmp-'));
    const generated=await provider(plan);
    const result=await renderDraft(plan,generated.buffer,temporary);
    const manifest={...plan,id,files:result.files,createdAt:new Date().toISOString(),generation:{...plan.generation,model:generated.reusedFromDraftId?null:MODEL,requestId:generated.requestId,referenceLocked:true,source:generated.reusedFromDraftId?'existing-storyboard':'image-provider',reusedFromDraftId:generated.reusedFromDraftId||null},validation:{status:'passed',scope:'technical-only',requiresHumanReview:true,checks:{slideCount:true,imageUniqueness:true,dimensions:'1080x1350',textSeparation:true,noFooterSignature:true},imageHashes:result.imageHashes,panelHashes:result.panelHashes}};
    fs.writeFileSync(path.join(temporary,'manifest.json'),JSON.stringify(manifest,null,2));
    fs.renameSync(temporary,path.join(outputDir,id)); temporary=null;
    return {draftId:id,imageCount:7};
  } finally {
    if(temporary) fs.rmSync(temporary,{recursive:true,force:true});
    active=false;
  }
}
module.exports={generateDraft,renderDraft,buildPrompt,wrap,overlay,getStatus:()=>({configured:Boolean(process.env.OPENAI_API_KEY),inProgress:active,model:MODEL,editorialVersion:VERSION,recomposeAvailable:true})};
