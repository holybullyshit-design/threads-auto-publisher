// Rule data, not scientific evidence for predicting relationship outcomes.
// No credentials, network, personal birth data, or Palja fortune engine involved.
const {Solar,LunarUtil}=require('lunar-javascript');
const VERSION='yeonliji-evidence-v1';
const SOURCE={title:'lunar-javascript 1.7.7 · 간지·오행·십신·합충 규칙',url:'https://github.com/6tail/lunar-javascript/blob/master/lunar.js',version:require('lunar-javascript/package.json').version};
const STEMS=[...'甲乙丙丁戊己庚辛壬癸'];
const BRANCHES=[...'子丑寅卯辰巳午未申酉戌亥'];
const KO=['자','축','인','묘','진','사','오','미','신','유','술','해'];
const ANIMALS=['쥐','소','호랑이','토끼','용','뱀','말','양','원숭이','닭','개','돼지'];
const stemKo=['갑','을','병','정','무','기','경','신','임','계'];
const name=b=>`${KO[BRANCHES.indexOf(b)]}(${b})`;
const animal=b=>ANIMALS[BRANCHES.indexOf(b)];
const particle=(text,withBatchim,without)=>{
  const plain=String(text).replace(/\([^)]*\)$/,'');
  const code=plain.charCodeAt(plain.length-1)-0xAC00;
  return text+(code>=0&&code<=11171&&code%28!==0?withBatchim:without);
};
function pair(a,b){
  if(!BRANCHES.includes(a)||!BRANCHES.includes(b)) throw new Error('확인되지 않은 지지입니다.');
  const i=BRANCHES.indexOf(a);
  return {a,b,he:LunarUtil.HE_ZHI_6[i]===b,chong:LunarUtil.CHONG[i]===b};
}
function day(date){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date||'')) throw new Error('일진 계산 날짜가 필요합니다.');
  const [y,m,d]=date.split('-').map(Number);
  if(y<1900||y>2100||new Date(Date.UTC(y,m-1,d)).toISOString().slice(0,10)!==date) throw new Error('일진 계산 범위 또는 날짜를 확인해주세요.');
  // Civil date at noon: no midnight/late-Zi-hour or solar-term birth boundary claim.
  const gz=Solar.fromYmdHms(y,m,d,12,0,0).getLunar().getDayInGanZhi();
  return {date,ganZhi:gz,korean:stemKo[STEMS.indexOf(gz[0])]+KO[BRANCHES.indexOf(gz[1])],basis:'선택한 한국 민간력 날짜의 정오 일진 · 개인 출생 명식 아님',he:LunarUtil.HE_ZHI_6[BRANCHES.indexOf(gz[1])],chong:LunarUtil.CHONG[BRANCHES.indexOf(gz[1])]};
}
function pack(key,date){
  const facts=[];
  const add=(label,title,body,rule)=>facts.push({id:`${key}.${facts.length+1}`,label,title:title.split('|'),body:body.split('|'),rule,source:SOURCE.url});
  const examples={};
  switch(key){
    case 'pillars':
      add('사주원국(四柱原局)','사주는 띠 하나가 아니라|네 기둥을 펼치는 것.','태어난 연·월·일·시를 각각|천간과 지지 두 글자로 나타내.|네 기둥, 여덟 글자가 원국이야.','EightChar.getYear/Month/Day/Time');
      add('일간(日干)','같은 해에 태어났어도|기준점은 다를 수 있어.','원국을 읽는 기준은 태어난 날의 천간.|같은 연주라도 월·일·시가 다르면|오행과 십성의 구성도 달라져.','EightChar.getDayGan / get*ShiShenGan');break;
    case 'stem':
      examples.stems=['甲','乙'].map(s=>({stem:s,element:LunarUtil.WU_XING_GAN[s]}));
      add('일간(日干)','나를 읽는 첫 글자는|태어난 날의 천간.','일간은 일주의 위쪽 글자야.|갑·을·병·정 등 열 천간 중 하나로,|다른 글자와의 관계를 읽는 기준이 돼.','EightChar.getDayGan');
      add('음양(陰陽) · 오행(五行)','같은 목 기운이어도|갑과 을은 다른 글자.','갑(甲)과 을(乙)은 모두 목(木)이야.|하지만 갑은 양, 을은 음으로 구분해.|오행이 같아도 십성 관계는 달라져.','WU_XING_GAN / GAN indices / SHI_SHEN');break;
    case 'elements':
      examples.elements=STEMS.map(s=>[s,LunarUtil.WU_XING_GAN[s]]);
      add('오행(五行)','없는 색을 채우듯|궁합을 더하면 될까?','천간 갑·을은 목, 병·정은 화,|무·기는 토, 경·신은 금, 임·계는 수.|명식의 글자를 이 다섯 기운으로 읽어.','WU_XING_GAN');
      add('생극(生剋)','목과 화의 관계와|목과 금의 관계는 달라.','목은 화를 생하고 금은 목을 극해.|생은 기운을 이어 주는 관계,|극은 제어하는 관계로 구분해.','SHI_SHEN: 甲丙=食神 / 甲庚=七杀');break;
    case 'tens':
      examples.shiShen=['甲','丙','戊','庚','壬'].map(s=>[s,LunarUtil.SHI_SHEN['甲'+s]]);
      add('십성(十星)','사주 속 역할은|나를 기준으로 정해져.','일간과 다른 글자의 생극 관계를|음양까지 나눠 열 가지로 부르는 게 십성.|같은 글자도 일간이 바뀌면 역할이 달라.','SHI_SHEN');
      add('십성 비교','갑을 기준으로 보면|병과 임의 역할이 달라.','갑(甲)에게 병(丙)은 식신,|임(壬)은 편인이야.|내가 생하는 것과 나를 생하는 것의 차이야.','SHI_SHEN: 甲丙=食神 / 甲壬=偏印');break;
    case 'expression':
      examples.shiShen=['丙','丁'].map(s=>[s,LunarUtil.SHI_SHEN['甲'+s]]);
      add('식상(食傷)','내 기운이 밖으로|이어지는 관계를 봐.','일간이 생하는 오행은 식상으로 묶어.|음양에 따라 식신과 상관으로 나뉘어.|말투가 아니라 명식의 글자로 구분해.','SHI_SHEN');
      add('식신(食神) · 상관(傷官)','갑목에게 같은 화도|두 역할로 나뉘어.','갑(甲)에게 병(丙)은 식신,|정(丁)은 상관이야.|같은 화(火)지만 음양이 달라 구분돼.','SHI_SHEN: 甲丙=食神 / 甲丁=伤官');break;
    case 'wealth':
      examples.shiShen=['戊','己'].map(s=>[s,LunarUtil.SHI_SHEN['甲'+s]]);
      add('재성(財星)','돈 이야기에 나오는|재성은 무엇일까?','일간이 극하는 오행을 재성으로 묶어.|음양에 따라 편재와 정재로 나뉘어.|통장 잔고를 그대로 뜻하는 건 아니야.','SHI_SHEN');
      add('정재(正財) · 편재(偏財)','갑목이 토를 만날 때|정재와 편재가 갈려.','갑(甲)에게 무(戊)는 편재,|기(己)는 정재야.|같은 토라도 음양에 따라 관계가 달라.','SHI_SHEN: 甲戊=偏财 / 甲己=正财');break;
    case 'resource':
      examples.shiShen=['壬','癸'].map(s=>[s,LunarUtil.SHI_SHEN['甲'+s]]);
      add('인성(印星)','나에게 들어오는 기운을|인성으로 구분해.','일간을 생하는 오행이 인성이야.|음양에 따라 편인과 정인으로 나뉘어.|일간이 무엇인지 먼저 확인해야 해.','SHI_SHEN');
      add('정인(正印) · 편인(偏印)','갑목에게 물 기운도|한 가지 역할은 아니야.','갑(甲)에게 임(壬)은 편인,|계(癸)는 정인이야.|둘 다 수(水)지만 음양 관계가 달라.','SHI_SHEN: 甲壬=偏印 / 甲癸=正印');break;
    case 'combine':
      examples.pair=pair('子','丑'); examples.stemPair=['甲',LunarUtil.HE_GAN_5[0]];
      add('합(合)','끌린다는 말과|명식에 합이 있다는 말.','합은 정해진 간지 조합을 가리켜.|천간합과 지지합은 구분해서 확인해.|사람이 좋다는 느낌만으로 정하지 않아.','HE_GAN_5 / HE_ZHI_6');
      add('천간합 · 지지육합','갑과 기, 자와 축은|서로 다른 합의 예시야.','갑(甲)·기(己)는 천간합,|자(子)·축(丑)은 지지의 육합이야.|어느 기둥의 글자인지도 함께 적어야 해.','HE_GAN_5[0]=己 / HE_ZHI_6[0]=丑');break;
    case 'clash':
      examples.pairs=[pair('子','午'),pair('卯','酉')];
      add('충(沖)','충이 있다는 말은|어떤 글자를 봤다는 뜻일까?','지지충은 열두 지지에서|서로 마주 놓인 글자의 관계야.|갈등이 생겼다는 이유로 충이라 하진 않아.','CHONG');
      add('자오충(子午沖)','자와 오, 묘와 유처럼|대응하는 짝이 있어.','자(子)·오(午), 묘(卯)·유(酉)는 충.|연지끼리인지 일지끼리인지 구분해야 해.|자리 없이 충 하나만 세면 설명이 빠져.','CHONG[0]=午 / CHONG[3]=酉');break;
    case 'daybranch':
      examples.dayPillars=['甲子','甲午'];examples.pair=pair('子','午');
      add('일지(日支)','태어난 날의 아래 글자,|일지를 먼저 찾아봐.','갑자일주의 일지는 자(子),|갑오일주의 일지는 오(午)야.|띠를 뜻하는 연지와는 다른 자리야.','EightChar.getDayZhi / getYearZhi');
      add('일지의 합·충','같은 갑목이어도|아래 글자의 관계는 달라.','자와 오는 충으로 분류되고,|자와 축은 육합으로 분류돼.|일간만 같다고 일지 관계까지 같진 않아.','CHONG[0]=午 / HE_ZHI_6[0]=丑');break;
    case 'gyeongjin': case 'musul': {
      const gz=key==='gyeongjin'?'庚辰':'戊戌';
      examples.pillar={ganZhi:gz,stemElement:LunarUtil.WU_XING_GAN[gz[0]],branchElement:LunarUtil.WU_XING_ZHI[gz[1]]};
      const gj=key==='gyeongjin';
      add(gj?'경진일주(庚辰日柱)':'무술일주(戊戌日柱)',gj?'경금과 진토가 만난|태어난 날의 두 글자.':'무토와 술토가 만난|태어난 날의 두 글자.',gj?'경진은 천간 경(庚), 지지 진(辰)이야.|경은 금(金), 진은 토(土)로 분류해.|이 두 글자가 일주를 이루는 거야.':'무술은 천간 무(戊), 지지 술(戌)이야.|무와 술은 모두 토(土)로 분류해.|그래도 원국 전체가 토라는 뜻은 아니야.','WU_XING_GAN / WU_XING_ZHI');
      add('일주(日柱) · 원국(原局)','두 글자가 같아도|나머지 여섯 글자는 달라.','일주는 원국 네 기둥 중 한 기둥이야.|같은 일주여도 태어난 월·연·시가 달라.|일주 소개와 개인 풀이를 나눠야 해.','EightChar.getYear/Month/Day/Time');break; }
    case 'time':
      add('원국(原局) · 세운(歲運)','태어난 글자와|지금 들어오는 글자를 나눠.','원국은 태어난 때의 네 기둥이고,|세운은 한 해의 간지 흐름을 뜻해.|개인 운세는 둘의 관계를 대조해 읽어.','EightChar / Yun.getDaYun / DaYun.getLiuNian');
      add('대운(大運)','10년 주기와 한 해를|같은 말로 쓰지 않아.','대운은 10년 단위로 이어지는 흐름.|그 안의 각 해를 세운으로 살펴.|개인 대운은 출생 정보와 계산 기준이 필요해.','DaYun.getLiuNian (10 entries)');break;
    case 'zodiac-he': case 'zodiac-chong': {
      const he=key==='zodiac-he',a='丑',b=he?'子':'未';examples.pair=pair(a,b);
      add(he?'육합(六合)':'충(沖)',he?'소띠와 쥐띠를|육합이라 부르는 이유.':'소띠와 양띠가|충이라는 말의 근거.',he?'소띠는 축(丑), 쥐띠는 자(子)에 대응해.|자와 축은 육합표의 한 쌍이야.|띠 궁합은 이 연지 관계를 보는 방식이야.':'소띠는 축(丑), 양띠는 미(未)에 대응해.|축과 미는 충표에서 마주 보는 한 쌍.|싫어하는 동물이어서 정한 관계가 아니야.','HE_ZHI_6 / CHONG / SHENG_XIAO');
      add('띠와 일주는 다른 정보','연지 한 쌍으로는|빠지는 자리가 있어.','띠는 출생 연도의 지지를 말해.|태어난 월·일·시의 글자는 담지 못하지.|같은 띠 조합도 원국 전체는 서로 달라.','EightChar.getYearZhi / getMonthZhi / getDayZhi / getTimeZhi');break; }
    case 'daily': {
      const c=day(date);examples.calendar=c;
      add('일진(日辰)',`${date.slice(5).replace('-','월 ')}일의 간지는|${c.korean}(${c.ganZhi})야.`,`선택한 날짜를 만세력으로 계산한 결과야.|이날의 지지는 ${name(c.ganZhi[1])}.|개인의 태어난 날을 계산한 것은 아니야.`,'Solar.fromYmdHms(date,12,0,0).getLunar().getDayInGanZhi');
      add('일진과 띠의 관계','같은 날에도|비교하는 지지가 달라.',`이날 지지와 ${particle(name(c.he),'은','는')} 육합,|${particle(name(c.chong),'은','는')} 충으로 분류돼.|띠로는 ${animal(c.he)}띠·${animal(c.chong)}띠에 각각 대응해.`,'HE_ZHI_6 / CHONG');break; }
    default:throw Object.assign(new Error('명리 근거가 없는 주제는 생성할 수 없습니다.'),{status:422});
  }
  return {version:VERSION,key,kind:key==='daily'?'calendar-calculation':'traditional-rule-example',sources:[SOURCE],examples,facts,limits:['계산과 규칙은 검증 대상이며 관계 결과를 과학적으로 예측한다는 뜻은 아닙니다.','창작 사례이며 개인 출생 정보를 분석하지 않았습니다.'],personalBirthDataUsed:false};
}
module.exports={VERSION,SOURCE,pack,day,pair};
