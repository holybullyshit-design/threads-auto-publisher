const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {PRESETS,STYLE_POLICY,validatePreset}=require("../server/config/paljaReelPresets");

test("v8 릴스는 8초·2화면·3개 포맷을 지킨다",()=>{
  assert.equal(STYLE_POLICY.durationSeconds,8);
  assert.equal(STYLE_POLICY.screenCount,2);
  assert.deepEqual(new Set(PRESETS.map((x)=>x.format)),new Set(["rank","spotlight","versus"]));
  assert.equal(PRESETS.length,45);
  PRESETS.forEach(validatePreset);
});

test("10월 1일부터 15일까지 매일 3건을 중복 없이 배치한다",()=>{
  const slots=new Set(),counts=new Map();
  PRESETS.forEach((item)=>{
    const slot=item.date+" "+item.time;
    assert.equal(slots.has(slot),false); slots.add(slot);
    counts.set(item.date,(counts.get(item.date)||0)+1);
  });
  for(let day=1;day<=15;day+=1) assert.equal(counts.get(`2026-10-${String(day).padStart(2,"0")}`),3);
  assert.equal(PRESETS.filter((x)=>["19:30","22:30"].includes(x.time)).length,30);
});

test("제목·주제·CTA가 중복되지 않고 모든 글에 실제 정보가 있다",()=>{
  const titles=new Set(),topics=new Set(),ctas=new Set();
  PRESETS.forEach((item)=>{
    const title=item.titleLines.join(" ");
    assert.equal(titles.has(title),false); titles.add(title);
    assert.equal(topics.has(item.topicId),false); topics.add(item.topicId);
    assert.equal(ctas.has(item.cta),false); ctas.add(item.cta);
    assert.equal(item.payoffLines.length,3);
    assert.match(item.caption,/명리 근거/);
    assert.doesNotMatch(item.caption,/자동게시|_[a-f0-9]{8}\b/i);
  });
});

test("렌더러는 세 가지 레이아웃·모바일 안전영역·음악을 사용한다",()=>{
  const source=fs.readFileSync(path.join(__dirname,"../tools/palja/generate-reel.py"),"utf8");
  for(const token of [/rank_one/,/spotlight_one/,/versus_one/,/payoff_two/,/MaruBuri-Bold/,/palja-logo/,/zoompan/,/xfade=transition=fade/,/AUDIO/]) assert.match(source,token);
  assert.match(source,/"-t","8"/);
  assert.doesNotMatch(source,/내 생년이 있다면 저장/);
});
