const crypto=require('crypto');
const evidence=require('./yeonlijiEvidence');
const {LESSONS}=require('./yeonlijiLessonCatalog');
const VERSION='yeonliji-editorial-v4';
const HANJA=Object.freeze({'재회운':'再會運','궁합':'宮合','인연':'因緣','연애운':'戀愛運','부부운':'夫婦運','사주':'四柱','원국':'原局','명식':'命式','일주':'日柱','일간':'日干','일지':'日支','오행':'五行','십성':'十星','합':'合','충':'沖','세운':'歲運','대운':'大運','경진일주':'庚辰日柱','무술일주':'戊戌日柱','일진':'日辰','육합':'六合','식상':'食傷','재성':'財星','인성':'印星'});
const LABELS={'재회':'재회운','궁합':'궁합','연애':'연애운','일주 이야기':'일주','운명·인연':'인연','이혼·관계 정리':'부부운','부부·결혼':'궁합','띠 궁합':'궁합','날짜별 운세':'일진'};
const KEY_LABELS={pillars:'사주원국',stem:'일간',elements:'오행',tens:'십성',expression:'식상',wealth:'재성',resource:'인성',combine:'합',clash:'충',daybranch:'일지',gyeongjin:'경진일주',musul:'무술일주',time:'대운·세운','zodiac-he':'육합','zodiac-chong':'충',daily:'일진'};
const fail=message=>{throw Object.assign(new Error(message),{status:422});};
function withHanja(term){return HANJA[term]?`${term}(${HANJA[term]})`:term;}
function termLabel(term){return term==='사주원국'||term==='사주 원국'?'사주원국(四柱原局)':term.split('·').map(withHanja).join(' · ');}
const EDITORIAL_PROMPT=`연리지 실타래 사주 웹툰 제작 기준 v4
20~40대 여성의 관계 고민을 다루되 심리 조언으로 명리 설명을 대체하지 않는다.
입력은 주제별 LESSON과 계산 가능한 factPack이다. 미등록 주제·근거가 없으면 생성 중단. 기존 원고로 대체하지 않는다.
7장: 명리 관점의 질문 → 창작 상황 → 근거 개념 → 계산/규칙 예시 → 질문에 적용 → 개인 풀이 확인 사항 → 주제 관련 댓글.
3~5장은 근거ID를 연결한다. 단어 정의 하나로 끝내거나 모든 주제를 같은 설명으로 돌리지 않는다.
원국·일간·일지·십성·합충·띠·일진 중 해당 주제에 필요한 것만 사용한다. 개인 출생 정보 없이 개인 명식·대운·확률을 꾸며내지 않는다.
날짜형 콘텐츠는 선택 날짜에서 일진을 계산한다. 띠 관계는 검증된 지지 표에서 가져온다. 날짜 변경 시 날짜형 시안 재제작·재승인.
계산 규칙과 전통 해석은 구분하며 전통 해석을 과학적 예측이라고 하지 않는다. 미검증 신살로 바람·이혼·성격을 단정하지 않는다.
고정 여성 캐릭터·타래·크림/자두색·기존 그림체 유지. 새 그림에 글자를 그리지 않고 검수한 글을 별도 합성.
핵심어 첫 소개에 선택적으로 한자를 병기. 한 장에 강조 한 곳. 제목 2~3줄, 본문 2~4줄. 공개 하단 이름·페이지번호·내부ID 금지.
캡션과 해시태그는 실제 카드의 주제와 명리 근거에서 구성. 미구현 DM·복을 미끼로 댓글 강요·번호만 남기기 금지.
제목뿐 아니라 중심 질문·풀이·결론·대사를 비교하고 유사성 경고를 검수자에게 보여준다.
원고·근거·그림의 버전을 기록한다. 생성은 승인이나 예약이 아니다. 최종 이미지 7장 육안 검수 전 품질 완료라고 표시하지 않는다.`;
function getLesson(id){return LESSONS[id]||fail('이 주제의 명리 근거와 원고가 준비되지 않아 생성을 중단했습니다.');}
function describe(story){const l=getLesson(story.id);return {displayTitle:l.hook.join(' '),hook:l.promise,sajuKeyword:KEY_LABELS[l.key],evidenceKey:l.key};}
function buildEditorialPrompt(story){return `${EDITORIAL_PROMPT}\n선택 주제: ${describe(story).displayTitle}\n근거: ${getLesson(story.id).key}`;}
function reviseCards(story,originalCards,{date}={}){
  const l=getLesson(story.id),factPack=evidence.pack(l.key,date),refs=factPack.facts.map(f=>f.id);
  const cards=[
    {role:'hook',eyebrow:withHanja(LABELS[story.category]||'사주'),title:l.hook,body:[l.promise],accentTitleLine:0,note:'명리 규칙으로 풀어보는 관계 이야기'},
    {role:'situation',eyebrow:'연지의 이야기 · 창작 장면',title:story.story,body:story.situation},
    ...factPack.facts.map((f,i)=>({role:i===0?'concept':'condition',eyebrow:f.label,title:f.title,body:f.body,accentTitleLine:0,evidenceRefs:[f.id]})),
    {role:'comparison',eyebrow:'이 질문에 적용하면',title:l.applicationTitle,body:l.application,accentTitleLine:0,evidenceRefs:refs},
    {role:'application',eyebrow:'개인 풀이에서 확인할 것',title:l.checkTitle,body:l.checks,evidenceRefs:refs},
    {role:'participation',eyebrow:'당신의 인연 이야기',title:l.question,body:[`댓글에 ‘${l.keyword}’ 키워드와 함께`,'궁금한 점을 한 줄 남겨주세요.'],note:'생년월일 등 개인정보는 남기지 마세요',final:true},
  ];
  return {cards,copyRevision:VERSION,factPack};
}
function revisedCaption(story,cards){
  const l=getLesson(story.id),label=KEY_LABELS[l.key];
  const tags={'재회':['재회운','재회고민'],'궁합':['궁합','연애궁합'],'연애':['연애운','사주성향'],'일주 이야기':['일주이야기','사주성향'],'운명·인연':['인연운','인연'],'이혼·관계 정리':['관계정리','부부궁합'],'부부·결혼':['부부궁합','결혼고민'],'띠 궁합':['띠궁합','궁합'],'날짜별 운세':['오늘의운세','일진']};
  return `${l.hook.join(' ')}\n\n${story.situation.join(' ')}\n\n${cards.slice(2,5).map(c=>`${c.eyebrow}\n${c.body.join(' ')}`).join('\n\n')}\n\n개인 풀이에서는\n${l.checks.join(' ')}\n\n${l.question.join(' ')}\n댓글에 ‘${l.keyword}’ 키워드와 함께 궁금한 점을 남겨주세요.\n\n창작 상황과 전통 명리 규칙을 설명한 콘텐츠이며 개인 출생 정보를 분석한 결과가 아닙니다. 사주는 관계의 결과를 보장하지 않습니다. 연락 거절과 안전을 존중하고 개인정보는 공개 댓글에 남기지 마세요.\n\n${[...new Set(['연리지실타래',...(tags[story.category]||[]),label.replace(/·/g,''),'사주풀이'])].map(t=>'#'+t).join(' ')}`;
}
function validateEditorialCards(cards){
  if(!Array.isArray(cards)||cards.length!==7) fail('7장 원고가 필요합니다.');
  for(const card of cards){
    if(typeof card.eyebrow!=='string'||!Array.isArray(card.title)||!card.title.length||!Array.isArray(card.body)||!card.body.length||[...card.title,...card.body].some(t=>typeof t!=='string'||!t.trim())) fail('비어 있는 카드 원고입니다.');
    if(card.note&&(typeof card.note!=='string'||card.note.length>36)) fail('강조 문구는 36자 이내여야 합니다.');
    if(card.accentTitleLine!=null&&(!Number.isInteger(card.accentTitleLine)||card.accentTitleLine<0||card.accentTitleLine>=card.title.length)) fail('강조할 제목 줄을 확인해주세요.');
    if(card.bodyEmphasis&&!card.body.join(' ').includes(card.bodyEmphasis)) fail('강조할 문구가 본문에 없습니다.');
    if(/#자동게시|연리지 실타래\s*[·ㆍ]\s*\d+\s*\/\s*7/.test([card.eyebrow,...card.title,...card.body,card.note||''].join(' '))) fail('공개 카드에 내부 표기를 넣을 수 없습니다.');
  }
}
function binding(plan){return crypto.createHash('sha256').update(JSON.stringify({topicId:plan.topicId,date:plan.date,cards:plan.cards,caption:plan.caption,factPack:plan.factPack})).digest('hex');}
function validatePlan(plan){
  validateEditorialCards(plan.cards);
  if(plan.editorial?.copyRevision!==VERSION) fail('구버전 원고입니다. 무료 원고 업데이트로 새 검수를 진행해주세요.');
  const l=getLesson(plan.topicId),expected=evidence.pack(l.key,plan.date);
  if(JSON.stringify(plan.factPack)!==JSON.stringify(expected)) fail('명리 근거 또는 계산 결과가 원고와 맞지 않습니다.');
  if(plan.editorial.contentBinding!==binding(plan)) fail('검수 후 원고가 변경되었습니다. 다시 검수해주세요.');
  const contentHash=crypto.createHash('sha256').update(JSON.stringify(plan.cards)+plan.caption).digest('hex');
  if(plan.contentHash!==contentHash) fail('원고와 중복 검사 해시가 일치하지 않습니다.');
  expected.facts.forEach((f,i)=>{
    const c=plan.cards[i+2];
    if(JSON.stringify(c.title)!==JSON.stringify(f.title)||JSON.stringify(c.body)!==JSON.stringify(f.body)) fail('명리 설명이 검증된 근거 원고와 다릅니다.');
  });
  if(!/[\u4e00-\u9fff]/.test(plan.cards[0].eyebrow)) fail('핵심어 한자 병기가 없습니다.');
  for(const c of plan.cards.slice(2,5)){
    if(c.body.length<2||c.body.join('').length<40||!c.evidenceRefs?.length||c.evidenceRefs.some(id=>!expected.facts.some(f=>f.id===id))) fail('명리 설명 또는 근거 연결이 부족합니다.');
  }
  if(/#자동게시|yeonliji_[a-f0-9]{6,}/i.test(plan.caption)) fail('캡션에 내부 식별자가 있습니다.');
  return true;
}
module.exports={VERSION,HANJA,withHanja,termLabel,EDITORIAL_PROMPT,buildEditorialPrompt,reviseCards,revisedCaption,validateEditorialCards,validatePlan,binding,describe,getLesson};
