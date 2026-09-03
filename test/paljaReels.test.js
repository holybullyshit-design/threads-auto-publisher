const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {PRESETS,ZODIAC,STYLE_POLICY,validatePreset}=require("../server/config/paljaReelPresets");

test("팔자명가 릴스는 고급 명조 8초·2화면·10개 생년 규칙을 지킨다",()=>{
  assert.equal(STYLE_POLICY.durationSeconds,8);
  assert.equal(STYLE_POLICY.screenCount,2);
  assert.equal(STYLE_POLICY.secondsPerScreen,4);
  assert.equal(PRESETS.length,30);
  PRESETS.forEach((raw)=>{
    const item=validatePreset(raw);
    assert.equal(item.items.length,10);
    assert.equal(new Set(item.items.map((x)=>x.year)).size,10);
    item.items.forEach((x)=>assert.ok(Object.values(ZODIAC).some((z)=>z.label===x.zodiac&&z.years.includes(x.year))));
  });
});

test("9월 3일부터 12일까지 매일 3회, 시간 중복 없이 배치한다",()=>{
  const counts=new Map(),slots=new Set();
  PRESETS.forEach((item)=>{
    counts.set(item.date,(counts.get(item.date)||0)+1);
    assert.equal(slots.has(item.date+" "+item.time),false);
    slots.add(item.date+" "+item.time);
  });
  for(let day=3;day<=12;day+=1) assert.equal(counts.get("2026-09-"+String(day).padStart(2,"0")),3);
  assert.deepEqual(PRESETS.filter((x)=>x.date==="2026-09-03").map((x)=>x.time),["12:45","17:30","21:30"]);
  for(let day=4;day<=12;day+=1)
    assert.deepEqual(PRESETS.filter((x)=>x.date==="2026-09-"+String(day).padStart(2,"0")).map((x)=>x.time),["07:30","15:30","21:30"]);
});

test("제목·주제·댓글 키워드는 중복되지 않고 내부 태그가 없다",()=>{
  const titles=new Set(),topics=new Set(),keywords=new Set();
  PRESETS.forEach((item)=>{
    validatePreset(item);
    const title=item.titleLines.join(" ");
    assert.equal(titles.has(title),false); titles.add(title);
    assert.equal(topics.has(item.topicId),false); topics.add(item.topicId);
    assert.equal(keywords.has(item.keyword),false); keywords.add(item.keyword);
    assert.doesNotMatch(item.caption,/자동게시|_[a-f0-9]{8}\b/i);
    assert.match(item.caption,/#팔자명가/);
    assert.match(item.caption,/명리 포인트/);
    assert.match(item.caption,/댓글/);
  });
});

test("여성 시청자의 실제 고민을 중심으로 주제군을 넓게 분산한다",()=>{
  assert.match(STYLE_POLICY.audienceFocus,/여성/);
  assert.ok(new Set(PRESETS.map((item)=>item.category)).size>=20);
  const corpus=PRESETS.map((item)=>[item.category,item.topicId,item.titleLines.join(" ")].join(" ")).join("\n");
  for(const family of [/재회|인연|궁합|부부/,/계약|재물|입금|정산|사업|매출|주문/,/직장|승진|이직|연봉|평가/,/가족|이사|건강|시험|자격증/])
    assert.match(corpus,family);
});

test("렌더러는 로고·고급 명조·2화면·하단 안전영역을 사용한다",()=>{
  const source=fs.readFileSync(path.join(__dirname,"../tools/palja/generate-reel.py"),"utf8");
  assert.match(source,/MaruBuri-Bold\.ttf/);
  assert.match(source,/palja-logo\.png/);
  assert.match(source,/xfade=transition=fade/);
  assert.match(source,/"-t","8"/);
  assert.match(source,/Audio|AUDIO/);
  const validator=fs.readFileSync(path.join(__dirname,"../server/lib/instagramReels.js"),"utf8");
  assert.match(validator,/duration!==8/);
  assert.match(validator,/frames!==240/);
  assert.match(validator,/audio\?\.present!==true/);
  assert.match(source,/1375/);
  assert.match(source,/1345,670,1415/);
});
