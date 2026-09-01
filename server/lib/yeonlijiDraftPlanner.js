const crypto = require('crypto');
const editorial = require('./yeonlijiEditorial');

// Original, curated relationship stories. Never interpret a single term as a diagnosis.
const STORIES = [
  { id:'distance', category:'재회', title:'좋아하는데 왜 자꾸 멀어질까?', hook:'가까워질수록 잃을 장면부터 떠올랐다면', sajuKeyword:'귀문관살',
    story:['연락이 오면 설레는데','약속이 잡히면 겁이 났다'], situation:['상처받기 싫어서 답장을 늦췄다.','그는 내 침묵을 거절이라고 생각했다.'],
    turn:['말하지 않은 마음은','전달되지 않았다'], feeling:['나는 조금 천천히 가고 싶었을 뿐인데','상대는 마음이 없는 줄 알았다.'],
    term:['귀문관살은 명리에서 쓰는 신살 용어야.','이름 하나로 성격이나 재회를 단정하진 않아.'],
    nuance:['전체 명식도 함께 살피지만','실제 대화와 행동을 빼놓을 수 없어.'], action:['침묵 대신 꺼내볼 한 문장.','“좋아하지만 조금 천천히 가고 싶어.”'],
    question:'다시 만나면 다르게 하고 싶은 말은?', keyword:'매듭', scenes:'looking at a phone; hesitating at a cafe door; two adults sitting apart; untangling red thread; reflecting quietly; talking honestly across a table' },
  { id:'pace', category:'궁합', title:'잘 맞는데 왜 함께 있으면 지칠까?', hook:'같은 마음이어도 사랑의 속도는 다르니까', sajuKeyword:'오행',
    story:['나는 매일 보고 싶고','그는 혼자 쉬고 싶었다'], situation:['쉬고 싶다는 말이 들릴 때마다','내가 덜 소중해진 것 같았다.'],
    turn:['둘 중 하나가','틀린 건 아니었다'], feeling:['함께 있고 싶은 마음과 쉬고 싶은 마음.','우리는 서로의 속도를 몰랐다.'],
    term:['목·화·토·금·수, 다섯 요소의 관계로','명식의 균형을 읽는 전통적인 틀이야.'], nuance:['오행 하나가 같다고 궁합도 같진 않아.','편한 연락 간격은 직접 물어봐야 해.'],
    action:['“편하게 통화할 시간은 언제야?”','서운함 대신 구체적인 약속을 꺼냈다.'], question:'사랑할 때 연락 간격이 중요한가요?', keyword:'리듬', scenes:'waiting at a window; resting at home; two different walking paces; five colored thread spools; arranging blank calendar; relaxed conversation' },
  { id:'silent', category:'연애', title:'괜찮다던 내가 먼저 지쳐버렸다', hook:'맞춰주는 연애가 익숙한 사람의 속마음', sajuKeyword:'일간',
    story:['메뉴도 약속 시간도','늘 “아무거나”라고 했다'], situation:['좋아하니까 맞춰주면 될 줄 알았다.','그런데 집에 오면 이상하게 피곤했다.'],
    turn:['작은 서운함이','한꺼번에 쏟아진 날'], feeling:['그는 왜 갑자기 그러냐고 물었다.','내게는 갑자기가 아니었는데.'],
    term:['태어난 날의 천간을 뜻하는 말이야.','명식에서 나를 읽는 기준점 중 하나지.'], nuance:['어떤 일간이든 참기만 해야 하는 건 아니야.','사주가 내 요구를 지울 이유는 없어.'],
    action:['“오늘은 조용한 데서 만나고 싶어.”','작은 선택부터 둘의 것이 되었다.'], question:'괜찮다고 했지만 사실 서운했다면?', keyword:'내마음', scenes:'choosing a cafe; exhausted walk home; honest tearful conversation; looking in a mirror; picking a favorite flower; sharing choices at a table' },
  { id:'alone', category:'연애', title:'혼자 있고 싶다는 말, 이별 신호일까?', hook:'거리 두기와 관계 정리는 같은 말이 아니야', sajuKeyword:'화개살',
    story:['이번 주말은','혼자 보내고 싶다고 했다'], situation:['이별을 준비하는 걸까 싶어서','휴대폰만 계속 들여다봤다.'],
    turn:['나는 확인을 원했고','그는 조용한 시간을 원했다'], feeling:['계속 묻는 나도, 답을 미루는 그도','서로를 더 불안하게 만들었다.'],
    term:['화개살은 명리에서 쓰는 신살 이름이야.','혼자 있는 사람 모두를 뜻하진 않아.'], nuance:['한 가지 신살로 상대의 속마음은 몰라.','관계를 이어갈 의사는 직접 물어봐야 해.'],
    action:['“쉬고 나서 언제 이야기하면 좋을까?”','끝없는 추측 대신 시간을 정했다.'], question:'혼자만의 시간이 필요한 연애라면?', keyword:'여백', scenes:'receiving a message; watching empty chair; quiet separate rooms; closed notebook and thread; gently asking a question; meeting again for tea' },
  { id:'return', category:'재회', title:'그리운 건 그 사람일까, 그때의 나일까?', hook:'재회를 생각할 때 먼저 구분해볼 마음', sajuKeyword:'세운',
    story:['사진을 지우려다가','끝까지 넘겨봤다'], situation:['웃고 있는 내 얼굴을 보니','그 사람에게 다시 연락하고 싶었다.'],
    turn:['그리운 장면만 남고','아팠던 날은 흐려졌다'], feeling:['다시 만나면 행복할 것 같지만','헤어진 이유는 아직 그대로였다.'],
    term:['세운은 한 해의 운을 살피는 개념이야.','태어난 명식과 그해의 간지를 함께 읽어.'], nuance:['좋은 시기라는 말이 재회를 보장하진 않아.','상대의 의사와 이별 원인도 살펴야 해.'],
    action:['다시 만나고 싶은 이유 하나.','반복하고 싶지 않은 일도 하나 적어보자.'], question:'그리움과 재회하고 싶은 마음의 차이는?', keyword:'다시', scenes:'looking at old photos without text; happy memory at window; difficult memory at doorway; changing seasons; writing two blank notes; calmly putting down phone' },
  { id:'gyeongjin', category:'일주 이야기', title:'단단해 보이는 사람도 확인받고 싶다', hook:'괜찮아 보인다는 이유로 놓쳤던 마음', sajuKeyword:'경진일주',
    story:['힘든 일이 생기면','늘 내가 먼저 정리했다'], situation:['사람들은 나를 믿음직하다고 했다.','나도 기대고 싶은 날이 있는데.'],
    turn:['“넌 잘하잖아”가','위로가 되지 않던 밤'], feeling:['해결책보다 듣고 싶은 건','“오늘 많이 힘들었지?” 한마디였다.'],
    term:['천간 경과 지지 진으로 이루어진 일주야.','태어난 날의 간지 조합을 말하지.'], nuance:['일주만으로 성격 전체를 정하진 않아.','강해 보이는 모습과 필요한 사랑은 달라.'],
    action:['“오늘은 답보다 위로가 필요해.”','말하고 나니 혼자 버티지 않아도 됐다.'], question:'강해 보여서 위로받지 못한 적 있나요?', keyword:'기댐', scenes:'organizing a desk; helping another adult; tired alone at night; metal and earth colored spools; asking for support; comfort with warm tea' },
  { id:'musul', category:'일주 이야기', title:'끝까지 지킨 약속이 나를 힘들게 할 때', hook:'좋은 사람이 되느라 관계의 끝을 미루고 있다면', sajuKeyword:'무술일주',
    story:['한번 한 약속은','끝까지 지켜야 한다고'], situation:['내가 조금 더 노력하면','우리도 괜찮아질 줄 알았다.'],
    turn:['관계를 지키는 일이','혼자 버티는 일이 됐다'], feeling:['둘이 한 약속인데','어느새 나만 기억하고 있었다.'],
    term:['태어난 날의 천간 무와 지지 술 조합이야.','같은 일주라도 전체 명식은 다를 수 있어.'], nuance:['어떤 일주든 부당한 관계를 견딜 의무는 없어.','책임감이라는 이름에 나를 가두지 말자.'],
    action:['“이 관계를 위해 함께 할 수 있는 건 뭘까?”','나의 노력만 더하는 대신 물었다.'], question:'지키는 것과 혼자 버티는 것의 차이는?', keyword:'약속', scenes:'holding tied ribbon; waiting with two cups; an untouched cup; stone path with thread; discussing a promise; loosening a tight knot' },
  { id:'different', category:'궁합', title:'너무 다른 우리는 정말 상극일까?', hook:'다툼이 있다는 사실보다 중요한 건 그다음', sajuKeyword:'충',
    story:['나는 바로 풀고 싶고','그는 시간을 달라고 했다'], situation:['한쪽은 더 다가가고','한쪽은 더 멀어지는 밤이었다.'],
    turn:['다른 방식이','사랑이 없다는 뜻일까?'], feeling:['우리는 싸움보다','싸운 뒤의 방법을 몰랐다.'],
    term:['충은 지지 등의 대립 관계를 읽는 개념이야.','충이 있다고 반드시 헤어지는 건 아니야.'], nuance:['궁합은 합격이나 불합격 점수가 아니야.','차이를 살피되 관계를 대신 결정하진 말자.'],
    action:['“한 시간 쉬고 돌아와서 이야기하자.”','떠나는 것과 쉬는 것을 구분했다.'], question:'다툰 뒤 바로 대화하나요, 잠시 쉬나요?', keyword:'차이', scenes:'quiet disagreement; different walking paces; opposite sides of a bench; threads crossing without tearing; agreeing a pause; returning to table' },
  { id:'attraction', category:'연애', title:'설레는 사람과 편안한 사람 사이', hook:'강한 끌림이 좋은 관계의 전부는 아니니까', sajuKeyword:'도화살',
    story:['답장 하나에 하루가','달라지는 사람이 있었다'], situation:['즐거운 날만큼','불안한 날도 많았다.'],
    turn:['설렘이 줄어들면','사랑도 끝나는 걸까?'], feeling:['편안한 사람 앞에서는','내가 재미없는 사람이 된 것 같았다.'],
    term:['매력과 주목을 이야기할 때 거론하는','전통 명리의 신살 중 하나야.'], nuance:['끌림이 강하다고 궁합까지 단정할 순 없어.','존중과 신뢰, 함께 있을 때의 나도 보자.'],
    action:['마음이 뛰는 순간도, 놓이는 순간도 소중해.','불안만을 사랑의 증거로 삼지는 말자.'], question:'설렘과 편안함 중 지금 더 필요한 것은?', keyword:'온도', scenes:'excited by phone; nervous waiting; comfortable walk; soft flower and thread motif; relaxed mirror reflection; peaceful evening' },
  { id:'timing', category:'재회', title:'재회운이 좋다는데 연락해도 될까?', hook:'운의 흐름과 상대의 대답은 같은 것이 아니야', sajuKeyword:'대운·세운',
    story:['좋은 때라는 말을','듣고 휴대폰을 들었다'], situation:['보내지 못한 문장이','다시 화면 위에 떠올랐다.'],
    turn:['기회가 온다는 말에','답까지 기대하고 있었다'], feeling:['내가 준비됐다는 것과','상대도 원한다는 것은 달랐다.'],
    term:['대운은 긴 주기, 세운은 한 해를 살펴.','전통 명리에서 명식과 함께 해석해.'], nuance:['연락을 원하지 않는다는 뜻을 들었다면','운의 해석과 무관하게 그 의사를 존중해.'],
    action:['연락할 수 있는 관계라면 짧은 안부로.','대답이 없어도 멈출 준비가 필요해.'], question:'다시 연락하기 전 무엇부터 확인할까요?', keyword:'시기', scenes:'looking at phone in morning; unsent blank message; imagining a meeting; seasons changing; setting phone aside respectfully; walking forward with loose thread' },
];
STORIES.push(...require('./yeonlijiExtraStories'));
STORIES.push(
  {id:'zodiac-ox-rat',category:'띠 궁합',title:'소띠와 쥐띠는 왜 잘 맞는다고 할까?',story:['우리는 띠 궁합이 좋대.','그 말에 마음이 놓였다.'],situation:['좋은 궁합의 근거도 알고 싶었어.','띠 두 개에 어떤 관계가 있다는 걸까?'],scenes:'woman holding two simple animal charms; couple having tea; ox and rat charms on desk; pointing at two blank cards; comparing two thread spools; couple talking at window'},
  {id:'zodiac-ox-sheep',category:'띠 궁합',title:'소띠와 양띠는 정말 만나면 안 될까?',story:['상극인 띠라는 말에','좋았던 마음이 흔들렸다.'],situation:['우리는 잘 만나고 있었는데,','띠만으로 끝을 정해야 하는 걸까?'],scenes:'woman looking at two animal charms; couple walking; ox and sheep charms on desk; opposite thread spools; comparing blank pages; woman calmly talking'},
  {id:'daily-relations',category:'날짜별 운세',title:'오늘의 관계 운, 일진과 띠로 무엇을 볼까?',story:['오늘 연락해도 될까?','운세부터 열어봤다.'],situation:['모두에게 같은 한 줄이라면','무엇을 계산한 건지 알고 싶었어.'],scenes:'woman checking blank calendar; woman preparing tea; sunlight on blank daily planner; distinct thread colors; writing a question; hopeful walk in daylight'}
);
function getTopicCatalog() { return STORIES.map(s => ({id:s.id,category:s.category,title:s.title,...editorial.describe(s)})); }
function topicHashtags(s) {
  const categories = {
    '재회':['재회고민','재회운'],
    '궁합':['궁합','연애궁합'],
    '연애':['연애고민','연애운'],
    '일주 이야기':['일주이야기','사주성향'],
    '운명·인연':['인연','인연운'],
    '이혼·관계 정리':['관계고민','관계정리'],
    '부부·결혼':['부부관계','결혼고민'],
  };
  return [...new Set(['연리지실타래',...(categories[s.category] || ['사주이야기']),s.sajuKeyword.replace(/[^가-힣a-zA-Z0-9]/g,'')])].map(tag=>'#'+tag).join(' ');
}
function validateDateTime(date, time, {future=false, now=Date.now()}={}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time || '')) throw Object.assign(new Error('날짜와 시간을 정확히 선택해주세요.'), {status:400});
  const utc = new Date(`${date}T${time}:00+09:00`);
  if (!Number.isFinite(utc.getTime()) || new Date(utc.getTime()+32400000).toISOString().slice(0,10)!==date) throw Object.assign(new Error('존재하지 않는 날짜입니다.'), {status:400});
  if (future && utc.getTime()<=now) throw Object.assign(new Error('현재보다 미래의 예약 날짜와 시간을 선택해주세요.'), {status:400});
  return utc;
}
function createDraftPlan(topicId, {date,time}) {
  validateDateTime(date,time);
  const s=STORIES.find(item=>item.id===topicId);
  if (!s) throw Object.assign(new Error('주제 목록에서 하나를 선택해주세요.'), {status:400});
  const {cards,copyRevision,factPack}=editorial.reviseCards(s,[],{date});
  editorial.validateEditorialCards(cards);
  const caption=editorial.revisedCaption(s,cards);
  const plan={title:s.title,displayTitle:cards[0].title.join(' '),series:'연리지 사주 관계기록',topicId:s.id,topic:getTopicCatalog().find(x=>x.id===s.id),accountKey:'yeonliji',accountId:'knot_saju',accountLabel:'연리지 실타래',date,time,cards,caption,factPack,contentHash:crypto.createHash('sha256').update(JSON.stringify(cards)+caption).digest('hex'),editorial:{presentationVersion:editorial.VERSION,copyRevision,requiresHumanReview:true,prompt:editorial.buildEditorialPrompt(s)},generation:{scenes:s.scenes.split('; ')}};
  plan.editorial.contentBinding=editorial.binding(plan);
  editorial.validatePlan(plan);
  return plan;
}
module.exports={getTopicCatalog,createDraftPlan,validateDateTime};
