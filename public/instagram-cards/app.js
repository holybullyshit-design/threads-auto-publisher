const stems=['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
const branches=['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
const stemsKo=['갑','을','병','정','무','기','경','신','임','계'];
const branchesKo=['자','축','인','묘','진','사','오','미','신','유','술','해'];
const animals=['쥐','소','호랑이','토끼','용','뱀','말','양','원숭이','닭','개','돼지'];
const hanjaAnimals=['鼠','牛','虎','兔','龍','蛇','馬','羊','猴','鷄','犬','豕'];
const colors={子:'#526c77',丑:'#8c7658',寅:'#9a4b35',卯:'#627558',辰:'#8a6d3f',巳:'#9f3f37',午:'#a44834',未:'#88754f',申:'#666c71',酉:'#91614d',戌:'#8b6544',亥:'#536777'};
let state={page:0,slides:[]};
const zodiacSprite=new Image();zodiacSprite.src='assets/korean-zodiac-sprite.png';zodiacSprite.onload=()=>render();
const paljaLogo=new Image();paljaLogo.src='assets/palja-logo.png';paljaLogo.onload=()=>render();
const darkBrandBg=new Image();darkBrandBg.src='assets/dark-brand-bg.png';darkBrandBg.onload=()=>render();
const lightBrandBg=new Image();lightBrandBg.src='assets/light-brand-bg.png';lightBrandBg.onload=()=>render();

function jdn(y,m,d){const a=Math.floor((14-m)/12),yy=y+4800-a,mm=m+12*a-3;return d+Math.floor((153*mm+2)/5)+365*yy+Math.floor(yy/4)-Math.floor(yy/100)+Math.floor(yy/400)-32045}
function sunLongitude(date){const utc=Date.UTC(date.getFullYear(),date.getMonth(),date.getDate(),3);const jd=utc/86400000+2440587.5,T=(jd-2451545)/36525;let L=280.46646+36000.76983*T+.0003032*T*T,M=357.52911+35999.05029*T-.0001537*T*T;const r=Math.PI/180;let lon=L+(1.914602-.004817*T-.000014*T*T)*Math.sin(M*r)+(.019993-.000101*T)*Math.sin(2*M*r)+.000289*Math.sin(3*M*r);return ((lon%360)+360)%360}
function calendarFor(date){let y=date.getFullYear(),lon=sunLongitude(date);if(date.getMonth()<2&&lon<315)y--;const yi=((y-4)%60+60)%60,ys=yi%10,yb=yi%12;const mi=Math.floor((((lon-315)%360+360)%360)/30),mb=(2+mi)%12,ms=(ys*2+2+mi)%10;const di=(jdn(date.getFullYear(),date.getMonth()+1,date.getDate())+49)%60;return{y,lon,year:stems[ys]+branches[yb],month:stems[ms]+branches[mb],day:stems[di%10]+branches[di%12],dayStem:di%10,dayBranch:di%12}}
function relation(a,b){const has=pairs=>pairs.some(x=>x.includes(a)&&x.includes(b));if(a===b)return['동기','같은 기운이 겹쳐 마음과 행동의 속도가 빨라집니다'];if(has([[0,1],[2,11],[3,10],[4,9],[5,8],[6,7]]))return['육합','사람과 기회가 자연스럽게 이어지는 흐름입니다'];const triads=[[0,4,8],[1,5,9],[2,6,10],[3,7,11]];if(triads.some(t=>t.includes(a)&&t.includes(b)))return['삼합','움직인 만큼 좋은 연결과 확장이 따라옵니다'];if((a-b+12)%12===6)return['충','변화 압력이 커져 서두른 결정은 재확인이 필요합니다'];if(has([[0,7],[1,6],[2,5],[3,4],[8,11],[9,10]]))return['해','겉으로 드러나지 않은 오해와 변수를 살펴야 합니다'];if(has([[0,9],[1,4],[2,11],[3,6],[5,8],[7,10]]))return['파','익숙한 흐름의 작은 균열을 일찍 손보는 날입니다'];if(has([[2,5],[5,8],[8,2],[1,10],[10,7],[7,1],[0,3]]))return['형','결과를 재촉하기보다 기준과 순서를 지키는 편이 낫습니다'];return['평','큰 파도보다 기본기와 생활 리듬이 운을 좌우합니다']}
const copy={overall:{육합:['기다리던 연락이 오거나 반가운 사람이 길을 열어줍니다','혼자 끌던 일을 나누면 생각보다 쉽게 풀립니다','가벼운 약속 하나가 좋은 기회로 이어질 수 있습니다'],삼합:['미뤄둔 일에 먼저 손을 대면 흐름이 빠르게 붙습니다','사람이 모이는 곳에서 뜻밖의 힌트를 얻습니다','새로운 제안은 열린 마음으로 들어볼 만합니다'],충:['오늘의 급한 결론은 내일 한 번 더 확인하세요','예상 밖의 변화가 와도 바로 맞서기보다 숨을 고르세요','시간과 동선을 넉넉히 잡으면 작은 손실을 피합니다'],해:['들은 말을 그대로 믿기보다 한 번 더 확인하세요','가까운 사이일수록 짐작보다 솔직한 질문이 필요합니다','사소한 서운함을 오래 품지 말고 그날 풀어두세요'],파:['고장 난 물건과 밀린 정리를 먼저 손보세요','계획의 작은 빈틈을 고치면 오후 흐름이 편해집니다','지출과 약속을 한 번 정리하면 마음도 가벼워집니다'],형:['무리해서 앞서가기보다 하던 일의 순서를 지키세요','말을 세게 하기 쉬운 날이니 한 박자 쉬어가세요','몸이 보내는 작은 신호를 무시하지 않는 게 좋습니다'],동기:['하고 싶은 일은 많아도 오늘의 한 가지부터 끝내세요','기세는 좋지만 주변과 속도를 맞추면 결과가 더 큽니다','내 방식만 고집하지 않으면 예상 밖의 도움을 얻습니다'],평:['평범한 하루 속 작은 약속이 좋은 운을 만듭니다','익숙한 일을 정확히 끝내는 것이 가장 빠른 길입니다','큰 결정보다 생활 리듬을 바로잡는 데 좋은 날입니다']},money:{},relation:{}};
copy.money=copy.overall;copy.relation=copy.overall;
const rowCopy={
육합:['반가운 연락엔 오늘 먼저 답장해보세요','마음에 둔 약속은 오후에 잡는 게 좋아요','작은 선물이 관계의 온도를 높여줍니다','혼자 끌던 일은 도움을 청하면 풀립니다'],
삼합:['새 모임과 약속에서 좋은 인연이 들어옵니다','미뤄둔 지원과 신청은 오늘 넣어보세요','평소보다 화사한 색이 기분을 끌어올려요','필요한 곳에 쓴 돈은 좋은 흐름을 만듭니다'],
충:['감정 섞인 답장은 잠시 저장해두세요','큰 결제와 계약은 조건을 다시 확인하세요','몸이 무거우면 약속 하나를 줄여도 좋아요','예상 밖 일정엔 여유 시간을 남겨두세요'],
해:['친한 사이일수록 짐작보다 질문이 필요해요','서운한 마음은 혼자 키우지 말고 풀어보세요','오늘 들은 소문은 바로 믿지 않는 게 좋아요','온라인 쇼핑은 결제 전 장바구니를 살펴보세요'],
파:['옷장이나 가방을 정리하면 기분이 맑아져요','밀린 송금과 예약은 오늘 바로 챙겨보세요','충동구매보다 오래 쓸 물건을 골라보세요','익숙한 루틴 하나를 바꾸면 활력이 생겨요'],
형:['완벽하게 하려는 마음을 조금 내려놓으세요','강한 말보다 부드러운 한마디가 더 통합니다','목과 어깨가 무거우면 가볍게 몸을 풀어주세요','무리한 약속보다 나만의 시간을 지켜보세요'],
동기:['오늘의 주인공은 나, 원하는 걸 말해보세요','할 일이 많아도 가장 중요한 하나부터 끝내세요','내 취향을 믿으면 선택이 훨씬 쉬워집니다','주도권은 잡되 가까운 사람의 말도 들어보세요'],
평:['좋아하는 음악으로 하루의 리듬을 만들어보세요','익숙한 일을 정확히 끝내면 마음이 편안해져요','작은 약속을 지키는 일이 좋은 운을 부릅니다','평범한 저녁 한 끼가 최고의 휴식이 됩니다']};
const flowLabel={육합:['인연운 상승','사람과 기회가 자연스럽게 이어져요'],삼합:['기회운 활짝','움직일수록 좋은 연결이 따라와요'],충:['변화 앞 신중','서두르지 않으면 오히려 길이 보여요'],해:['오해 조심','짐작보다 확인이 마음을 지켜줘요'],파:['정리하면 풀림','비우고 고칠수록 흐름이 가벼워져요'],형:['속도 조절','완벽보다 내 리듬을 지키는 날이에요'],동기:['내가 주도할 날','자신감은 살리고 고집은 조금 덜어내요'],평:['잔잔한 안정운','평범한 선택이 편안한 복을 만들어요']};
function yearsFor(branch,baseYear){const out=[];for(let y=baseYear;y>=baseYear-90;y--)if(((y-4)%12+12)%12===branch&&y<=baseYear-20)out.push(y);return out.slice(0,4)}
function hash(s){let h=2166136261;for(const c of s){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0}
function pick(arr,key){return arr[hash(key)%arr.length]}
function makeSlides(date,focus){const cal=calendarFor(date),db=cal.dayBranch;let readings=animals.map((animal,i)=>{const [tag,why]=relation(i,db),years=yearsFor(i,date.getFullYear()),offset=hash(date.toISOString()+i+focus)%4,lines=years.map((_,n)=>rowCopy[tag][(n+offset)%4]);return{animal,hanja:hanjaAnimals[i],branch:branches[i],tag,why,easyTitle:flowLabel[tag][0],easyWhy:flowLabel[tag][1],years,lines}});const title=`${date.getMonth()+1}월 ${date.getDate()}일`;return[{type:'cover',title,cal},{type:'list',title,cal,items:readings.slice(0,3)},{type:'list',title,cal,items:readings.slice(3,6)},{type:'list',title,cal,items:readings.slice(6,9)},{type:'list',title,cal,items:readings.slice(9,12)},{type:'message',title,cal},{type:'promo',title,cal}]}
function roundRect(c,x,y,w,h,r){c.beginPath();c.roundRect(x,y,w,h,r);c.fill();}
function grain(c){c.save();c.globalAlpha=.035;for(let i=0;i<2200;i++){c.fillStyle=i%2?'#d9c39b':'#000';c.fillRect(Math.random()*1080,Math.random()*1350,1,1)}c.restore()}
function backdrop(c){const g=c.createLinearGradient(0,0,0,1350);g.addColorStop(0,'#111413');g.addColorStop(.5,'#171816');g.addColorStop(1,'#0b0d0c');c.fillStyle=g;c.fillRect(0,0,1080,1350);c.strokeStyle='#806c43';c.lineWidth=2;c.strokeRect(28,28,1024,1294);c.strokeStyle='#3e483f';c.strokeRect(39,39,1002,1272)}
function dailyBackdrop(c,shade=.42){if(darkBrandBg.complete)c.drawImage(darkBrandBg,0,0,1080,1350);else backdrop(c);c.fillStyle=`rgba(3,8,12,${shade})`;c.fillRect(0,0,1080,1350);c.strokeStyle='#c99b48';c.lineWidth=3;c.strokeRect(24,24,1032,1302);c.strokeStyle='rgba(223,188,111,.42)';c.lineWidth=1;c.strokeRect(37,37,1006,1276)}
function ganzhiKo(v){return stemsKo[stems.indexOf(v[0])]+branchesKo[branches.indexOf(v[1])]}
function header(c,s){c.textAlign='center';c.fillStyle='#ffe5a1';c.shadowColor='#d29a39';c.shadowBlur=15;c.font='74px "PaljaBrush","AppleMyungjo",serif';c.fillText(`${s.title} 오늘의 띠별 운세`,540,92);c.shadowBlur=0;c.fillStyle='#d0b77e';c.font='700 22px "Apple SD Gothic Neo",sans-serif';c.fillText(`팔자명가  ·  ${ganzhiKo(s.cal.year)}년 ${ganzhiKo(s.cal.month)}월 ${ganzhiKo(s.cal.day)}일`,540,137);c.strokeStyle='#c79a49';c.lineWidth=2;c.beginPath();c.moveTo(110,162);c.lineTo(970,162);c.stroke();c.textAlign='left'}
function render(){const s=state.slides[state.page],cv=document.querySelector('#card'),c=cv.getContext('2d');c.clearRect(0,0,1080,1350);if(s.type==='cover'||s.type==='list')dailyBackdrop(c,s.type==='list'?.58:.30);else backdrop(c);if(s.type==='list')header(c,s);if(s.editorial){drawEditorial(c,s)}else{if(s.type==='cover')drawCover(c,s);if(s.type==='message')drawMessage(c,s);if(s.type==='promo')drawPromo(c,s)}if(s.type==='list')drawList(c,s);grain(c);document.querySelector('#pageLabel').textContent=`${state.page+1} / ${state.slides.length}`}
function drawZodiac(c,index,x,y,w,h){if(!zodiacSprite.complete||!zodiacSprite.naturalWidth)return;const sw=zodiacSprite.naturalWidth/4,sh=zodiacSprite.naturalHeight/3,sx=(index%4)*sw,sy=Math.floor(index/4)*sh;c.save();c.beginPath();c.roundRect(x,y,w,h,12);c.clip();c.drawImage(zodiacSprite,sx,sy,sw,sh,x,y,w,h);c.restore()}
function drawZodiacDisc(c,index,x,y,size,accent){if(!zodiacSprite.complete||!zodiacSprite.naturalWidth)return;const sw=zodiacSprite.naturalWidth/4,sh=zodiacSprite.naturalHeight/3,sx=(index%4)*sw,sy=Math.floor(index/4)*sh;c.save();c.shadowColor=accent;c.shadowBlur=22;c.fillStyle='#efe2c8';c.beginPath();c.arc(x+size/2,y+size/2,size/2,0,Math.PI*2);c.fill();c.shadowBlur=0;c.beginPath();c.arc(x+size/2,y+size/2,size/2-5,0,Math.PI*2);c.clip();c.drawImage(zodiacSprite,sx,sy,sw,sh,x,y,size,size);c.restore();c.strokeStyle=accent;c.lineWidth=6;c.beginPath();c.arc(x+size/2,y+size/2,size/2+2,0,Math.PI*2);c.stroke();c.strokeStyle='#e5c77d';c.lineWidth=2;c.beginPath();c.arc(x+size/2,y+size/2,size/2+12,0,Math.PI*2);c.stroke()}
function titleFont(size){return `700 ${size}px "AppleMyungjo","Apple SD Gothic Neo",serif`}
function drawCover(c,s){c.textAlign='center';c.fillStyle='#e3ba69';c.font='700 24px "Apple SD Gothic Neo",sans-serif';c.fillText('팔자명가 · 만세력으로 읽는 오늘의 흐름',540,100);c.fillStyle='#ffe7a6';c.shadowColor='#d79e3b';c.shadowBlur=22;c.font='108px "PaljaBrush","AppleMyungjo",serif';c.fillText(s.title,540,270);c.font='154px "PaljaBrush","AppleMyungjo",serif';c.fillText('오늘의 운세',540,430);c.shadowBlur=0;c.fillStyle='#efc56d';c.font='700 37px "Apple SD Gothic Neo",sans-serif';c.fillText(`${ganzhiKo(s.cal.year)}년 · ${ganzhiKo(s.cal.month)}월 · ${ganzhiKo(s.cal.day)}일`,540,505);const idx=s.cal.dayBranch;drawZodiacDisc(c,idx,335,575,410,'#b64c3d');c.fillStyle='rgba(5,9,10,.88)';roundRect(c,290,1010,500,92,32);c.strokeStyle='#c69b4c';c.lineWidth=3;c.strokeRect(297,1017,486,78);c.fillStyle='#fff0c5';c.font='700 38px "Apple SD Gothic Neo",sans-serif';c.fillText(`${animals[idx]}의 날 · ${branchesKo[idx]}의 기운`,540,1073);c.fillStyle='#ecd9a7';c.font='700 30px "Apple SD Gothic Neo",sans-serif';c.fillText('내 생년의 오늘 운세를 넘겨서 확인하세요',540,1175);c.fillStyle='#b8a77f';c.font='24px "Apple SD Gothic Neo",sans-serif';c.fillText('매일 오전 6시, 검수를 마친 새 운세가 열립니다',540,1230);c.textAlign='left'}
function drawList(c,s){const accents=['#42a99c','#b66fc1','#d85b4b'];s.items.forEach((it,k)=>{const y=178+k*370,idx=animals.indexOf(it.animal),accent=accents[k],g=c.createLinearGradient(30,y,1045,y+345);g.addColorStop(0,'rgba(5,13,14,.96)');g.addColorStop(1,'rgba(5,7,8,.88)');c.fillStyle=g;roundRect(c,28,y,1024,352,18);c.shadowColor=accent;c.shadowBlur=13;c.strokeStyle=accent;c.lineWidth=6;c.strokeRect(36,y+8,1008,336);c.shadowBlur=0;drawZodiacDisc(c,idx,58,y+66,210,accent);c.fillStyle=accent;roundRect(c,62,y+274,202,52,22);c.fillStyle='#fff2d7';c.font='700 31px "Apple SD Gothic Neo",sans-serif';c.textAlign='center';c.fillText(`${it.animal}띠`,163,y+310);c.textAlign='left';for(let n=0;n<4;n++){const ry=y+52+n*62;c.fillStyle=accent;roundRect(c,300,ry-32,120,46,12);c.fillStyle='#fff7e8';c.font='700 28px "Apple SD Gothic Neo",sans-serif';c.textAlign='center';c.fillText(String(it.years[n]),360,ry);c.textAlign='left';c.fillStyle='#fffaf0';fitRowFont(c,it.lines[n],590);c.fillText(it.lines[n],440,ry)}c.fillStyle=accent;roundRect(c,300,y+284,176,43,14);c.fillStyle='#fff7e8';c.font='700 22px "Apple SD Gothic Neo",sans-serif';c.textAlign='center';c.fillText(it.easyTitle,388,y+314);c.textAlign='left';c.fillStyle='#d8cdb8';c.font='700 21px "Apple SD Gothic Neo",sans-serif';c.fillText(it.easyWhy,495,y+313)});c.textAlign='center';c.fillStyle='#a99b7e';c.font='17px "Apple SD Gothic Neo",sans-serif';c.fillText('※ 1~2월생은 입춘 시각에 따라 전년도 띠일 수 있어요',540,1328);c.textAlign='left'}
function goldOrbits(c){c.save();c.globalCompositeOperation='screen';for(let j=0;j<4;j++){c.strokeStyle=`rgba(202,157,72,${.18+j*.07})`;c.lineWidth=2+j;c.beginPath();c.ellipse(540,760,480-j*32,330-j*15,-.13,0,Math.PI*2);c.stroke()}for(let i=0;i<150;i++){const a=i*2.399,r=300+(i%31)*7,x=540+Math.cos(a)*r,y=755+Math.sin(a)*r*.7;c.fillStyle=`rgba(229,181,79,${.2+(i%7)/10})`;c.beginPath();c.arc(x,y,1+(i%4)*.65,0,Math.PI*2);c.fill()}c.restore()}
function drawLogo(c,x,y,size){if(!paljaLogo.complete||!paljaLogo.naturalWidth)return;c.save();c.beginPath();c.arc(x+size/2,y+size/2,size/2,0,Math.PI*2);c.clip();c.drawImage(paljaLogo,x,y,size,size);c.restore();c.strokeStyle='#c69a46';c.lineWidth=4;c.beginPath();c.arc(x+size/2,y+size/2,size/2+3,0,Math.PI*2);c.stroke()}
function drawMessage(c,s){if(darkBrandBg.complete)c.drawImage(darkBrandBg,0,0,1080,1350);c.fillStyle='rgba(4,10,16,.17)';c.fillRect(0,0,1080,1350);c.textAlign='center';c.fillStyle='#e3b85c';c.font='700 27px "Apple SD Gothic Neo",sans-serif';c.fillText('오늘 마음에 새길 한마디',540,95);c.fillStyle='#ffe6a0';c.shadowColor='#e0a744';c.shadowBlur=28;c.font='700 78px "AppleMyungjo",serif';c.fillText('人間萬事塞翁之馬',540,245);c.shadowBlur=0;c.fillStyle='#f4dda0';c.font='100px "PaljaBrush","AppleMyungjo",serif';c.fillText('인간만사 새옹지마',540,365);c.strokeStyle='#c9983f';c.lineWidth=2;c.beginPath();c.moveTo(180,420);c.lineTo(900,420);c.stroke();c.fillStyle='#f1e2bd';c.font='31px "AppleMyungjo",serif';c.fillText('눈앞의 좋은 일과 나쁜 일이',540,505);c.fillText('마지막까지 그대로인 것은 아닙니다',540,555);c.font='29px "Apple SD Gothic Neo",sans-serif';c.fillText('오늘은 조급히 결론 내리지 말고',540,625);c.fillText('흐름이 바뀔 여지를 남겨두세요',540,674);drawLogo(c,440,735,200);c.fillStyle='#f0dfb7';c.font='27px "AppleMyungjo",serif';c.fillText('당신의 오늘이 결국 좋은 길로 이어지길 기원합니다',540,1015);c.fillStyle='rgba(5,10,13,.82)';roundRect(c,125,1070,830,112,24);c.strokeStyle='#d1a14d';c.lineWidth=3;c.strokeRect(132,1077,816,98);c.fillStyle='#ffd97f';c.font='700 29px "Apple SD Gothic Neo",sans-serif';c.fillText('댓글로 “인간만사 새옹지마”를 남겨주세요',540,1139);c.fillStyle='#c9ad6f';c.font='23px "Apple SD Gothic Neo",sans-serif';c.fillText('저장 · 좋아요 · 댓글로 오늘의 복을 나누세요',540,1240);c.textAlign='left'}
function drawPromo(c,s){if(lightBrandBg.complete)c.drawImage(lightBrandBg,0,0,1080,1350);c.textAlign='center';c.fillStyle='#745228';c.font='700 27px "Apple SD Gothic Neo",sans-serif';c.fillText('나의 때와 마음의 흐름을 읽는',540,85);drawLogo(c,425,115,230);c.fillStyle='#3d291b';c.font='108px "PaljaBrush","AppleMyungjo",serif';c.fillText('팔자명가',540,455);c.fillStyle='#75572f';c.font='28px "AppleMyungjo",serif';c.fillText('오늘의 운을 넘어, 나에게 맞는 때를 봅니다',540,510);const stats=[['12띠','생년별 운세'],['日辰','오늘의 흐름']];stats.forEach((v,i)=>{const x=133+i*414;c.fillStyle='rgba(255,252,242,.73)';roundRect(c,x,690,386,220,14);c.fillStyle='#3f2a1c';c.font='700 58px "Apple SD Gothic Neo",sans-serif';c.fillText(v[0],x+193,790);c.fillStyle='#8b642e';c.font='700 28px "Apple SD Gothic Neo",sans-serif';c.fillText(v[1],x+193,845)});c.fillStyle='#4e3823';c.font='700 32px "Apple SD Gothic Neo",sans-serif';c.fillText('연애운 · 재물운 · 직장운 · 가족운',540,1005);c.fillStyle='#665038';c.font='26px "AppleMyungjo",serif';c.fillText('관계와 선택, 인생의 방향이 궁금한 순간',540,1060);c.fillText('사주의 흐름을 깊이 있게 함께 읽어드립니다',540,1105);c.fillStyle='#9f3f31';c.font='700 31px "Apple SD Gothic Neo",sans-serif';c.fillText('상담 신청은 팔자명가 프로필 링크에서',540,1210);c.textAlign='left'}
function wrap(c,text,x,y,max,lh){let line='',yy=y;for(const ch of text){const t=line+ch;if(c.measureText(t).width>max){c.fillText(line,x,yy);line=ch;yy+=lh}else line=t}c.fillText(line,x,yy)}
function wrapCenter(c,text,x,y,lh){text.split('\n').forEach((line,i)=>c.fillText(line,x,y+i*lh))}
function fitRowFont(c,text,max,base=29,min=24){let size=base;while(size>min){c.font=`700 ${size}px "Apple SD Gothic Neo",sans-serif`;if(c.measureText(text).width<=max)break;size--}return size}
function update(){const d=new Date(document.querySelector('#date').value+'T12:00:00+09:00'),focus=document.querySelector('#focus').value;state.slides=makeSlides(d,focus);state.page=0;const cal=state.slides[0].cal;document.querySelector('#calendar').innerHTML=`<b>${ganzhiKo(cal.year)}년 ${ganzhiKo(cal.month)}월 ${ganzhiKo(cal.day)}일</b><br>태양 황경 ${cal.lon.toFixed(2)}°<br>오늘의 중심 띠: ${animals[cal.dayBranch]}띠`;render()}
async function downloadRange(start,end){for(let i=start;i<end;i++){state.page=i;render();await new Promise(r=>setTimeout(r,120));const a=document.createElement('a');a.download=`팔자명가_${document.querySelector('#date').value}_${i+1}.png`;a.href=document.querySelector('#card').toDataURL('image/png');a.click()}}
document.querySelector('#generate').onclick=update;document.querySelector('#prev').onclick=()=>{state.page=(state.page-1+state.slides.length)%state.slides.length;render()};document.querySelector('#next').onclick=()=>{state.page=(state.page+1)%state.slides.length;render()};document.querySelector('#downloadDaily').onclick=()=>downloadRange(0,5);document.querySelector('#download').onclick=()=>downloadRange(0,state.slides.length);
const now=new Date(),kst=new Date(now.toLocaleString('en-US',{timeZone:'Asia/Seoul'}));document.querySelector('#date').value=`${kst.getFullYear()}-${String(kst.getMonth()+1).padStart(2,'0')}-${String(kst.getDate()).padStart(2,'0')}`;update();if(document.fonts)document.fonts.ready.then(()=>render());

// Node/Puppeteer 자동화는 브라우저의 근사 계산을 쓰지 않고,
// 서버에서 lunar-javascript로 검증한 7장 패키지만 주입한다.
function editorialText(c,text,y,size=36,color='#f5e8c8',max=880){
  c.textAlign='center'; c.fillStyle=color;
  c.font=`700 ${size}px "Apple SD Gothic Neo", "Noto Sans CJK KR", sans-serif`;
  if(c.measureText(text).width>max) throw new Error('편집 원고 가로 넘침: '+text);
  c.fillText(text,540,y);
}
function drawEditorial(c,s){
  const e=s.editorial;
  if(s.type==='cover'){
    // 표지는 팔자명가 피드의 고정 자산이다. 주제별 편집 훅은 캡션과
    // 6~7장에만 사용하고, 1장은 언제나 날짜+오늘의 운세+당일 띠로 유지한다.
    drawCover(c,s);
  }else if(s.type==='message'){
    dailyBackdrop(c,.72);
    editorialText(c,`${s.title} · 오늘의 명리 한 가지`,135,31,'#e3ba69');
    editorialText(c,e.lessonTitle,278,47,'#ffe7a6',940);
    e.lesson.forEach((text,i)=>{
      c.fillStyle='rgba(9,15,20,.9)';roundRect(c,65,359+i*147,950,115,18);
      editorialText(c,text,429+i*147,30,'#f5e8c8',916);
    });
    e.takeaway.forEach((text,i)=>editorialText(c,text,1065+i*59,34,'#ffe0a0',940));
    editorialText(c,'띠와 일진의 관계는 개인 원국 전체의 풀이가 아닙니다',1260,23,'#c6b591',960);
  }else if(s.type==='promo'){
    c.drawImage(lightBrandBg,0,0,1080,1350);
    drawLogo(c,470,85,140);
    editorialText(c,'운세를 읽고, 내 선택으로',335,53,'#4b3325',940);
    editorialText(c,e.topic,420,31,'#805c36');
    const prompts=['내 띠의 문장 중 필요한 한 줄 고르기','오늘의 일정에 적용할 행동 하나 정하기','내일, 실제로 어땠는지 돌아보기'];
    prompts.forEach((text,i)=>{
      c.fillStyle='rgba(255,252,242,.86)';roundRect(c,90,501+i*108,900,84,16);
      editorialText(c,`${i+1}. ${text}`,555+i*108,32,'#4b3325',840);
    });
    editorialText(c,e.question,943,34,'#4b3325',960);
    c.fillStyle='rgba(255,252,242,.9)';roundRect(c,65,1010,950,112,24);
    editorialText(c,e.cta,1079,32,'#9f3f31',916);
    editorialText(c,'개인 사주 상담 안내는 프로필에서 확인하세요',1220,28,'#614b35');
    editorialText(c,'공개 댓글에 생년월일 등 개인정보는 남기지 마세요',1280,22,'#806a52');
  }
  c.textAlign='left';
}
window.PaljaCards={
  async renderPackage(pkg,page=0){
    state.slides=pkg.slides;
    state.page=page;
    document.querySelector('#date').value=pkg.date;
    await Promise.all([document.fonts?.ready,...[zodiacSprite,paljaLogo,darkBrandBg,lightBrandBg].map(img=>img.complete?Promise.resolve():new Promise(resolve=>{img.addEventListener('load',resolve,{once:true});img.addEventListener('error',resolve,{once:true})}))]);
    render();
    await new Promise(requestAnimationFrame);
    return {width:1080,height:1350,pageCount:state.slides.length};
  },
  dataUrl(){return document.querySelector('#card').toDataURL('image/png')},
  pageCount(){return state.slides.length}
};
const embedParams=new URLSearchParams(location.search);
if(embedParams.get('embed')==='1'){
  document.body.classList.add('embed');
  const embedDate=embedParams.get('date'),embedPage=Number(embedParams.get('page')||0);
  fetch(`/api/instagram/content?date=${encodeURIComponent(embedDate)}`).then(r=>r.json()).then(({content})=>window.PaljaCards.renderPackage(content,embedPage)).catch(err=>{document.body.textContent=`카드 생성 실패: ${err.message}`});
}
