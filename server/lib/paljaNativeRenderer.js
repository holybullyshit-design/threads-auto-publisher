// Runs the existing Canvas drawing functions without starting a browser.
// No AI generation, image edits, or independent layout is introduced here.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const sharp=require('sharp');
async function renderNative(pkg,{pages=[0,1,2,3,4,5,6],format='jpg'}={}){
  const {createCanvas,loadImage,GlobalFonts}=require(process.env.PALJA_CANVAS_MODULE || '@napi-rs/canvas');
  const dir=path.resolve(__dirname,'../../public/instagram-cards');
  if(!GlobalFonts.registerFromPath(path.join(dir,'assets/NanumBrushScript.ttf'),'PaljaBrush'))throw new Error('팔자명가 글꼴 로드 실패');
  const src=fs.readFileSync(path.join(dir,'app.js'),'utf8');
  const end=src.indexOf("document.querySelector('#generate').onclick"),startEditorial=src.indexOf('function editorialText('),endEditorial=src.indexOf('window.PaljaCards={');
  if(end<0||startEditorial<end||endEditorial<startEditorial)throw new Error('Canvas 템플릿 구조 변경: 검수 후 다시 렌더링해주세요.');
  const source=src.slice(0,end).replace(/^const (zodiacSprite|paljaLogo|darkBrandBg|lightBrandBg)=new Image\(\);.*$/gm,'')+'\n'+src.slice(startEditorial,endEditorial);
  const assets={};
  for(const [key,file] of Object.entries({zodiacSprite:'korean-zodiac-sprite.png',paljaLogo:'palja-logo.png',darkBrandBg:'dark-brand-bg.png',lightBrandBg:'light-brand-bg.png'}))assets[key]=await loadImage(path.join(dir,'assets',file));
  const canvas=createCanvas(1080,1350),ctx=canvas.getContext('2d'),textLog=[];
  const fill=ctx.fillText.bind(ctx);
  ctx.fillText=function(text,x,y,maxWidth){
    const m=ctx.measureText(String(text));
    const width=maxWidth?Math.min(m.width,maxWidth):m.width;
    const left=ctx.textAlign==='center'?x-width/2:ctx.textAlign==='right'?x-width:x;
    if(left<0||left+width>1080||y>1350||y<0)throw new Error('카드 경계 밖 글자: '+text);
    textLog.push(String(text));return maxWidth?fill(text,x,y,maxWidth):fill(text,x,y);
  };
  const math=Object.create(Math);let seed=12345;math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  const context=vm.createContext({...assets,Math:math,document:{querySelector:selector=>selector==='#card'?canvas:{textContent:''}},pkg});
  vm.runInContext(source,context,{timeout:10000});
  vm.runInContext('state.slides=pkg.slides',context);
  const output=[];
  for(const page of pages){
    textLog.length=0;context.renderIndex=page;
    vm.runInContext(`state.page=renderIndex;
      if(state.slides[renderIndex].type==='list'){
        const c=document.querySelector('#card').getContext('2d');
        for(const it of state.slides[renderIndex].items)for(const line of it.lines){
          fitRowFont(c,line,590);if(c.measureText(line).width>590)throw new Error('생년 문구 넘침: '+line);
        }
      }
      render();`,context,{timeout:10000});
    if(pkg.editorial && /#자동게시_|7,000|2,100/.test(textLog.join('\n')))throw new Error('공개 이미지 금지 문구');
    const png=canvas.toBuffer('image/png');
    const buffer=format==='png'?png:await sharp(png).jpeg({quality:94,chromaSubsampling:'4:4:4'}).toBuffer();
    output.push({page:page+1,buffer,ext:format==='png'?'png':'jpg',width:1080,height:1350,renderedText:[...textLog]});
  }
  return output;
}
module.exports={renderNative};
