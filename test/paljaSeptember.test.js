const test = require('node:test');
const assert = require('node:assert/strict');
const {generateFortunePackage,validateFortunePackage} = require('../server/lib/fortuneEngine');
const {editions} = require('../server/lib/paljaSeptember2026');
const {assertPublicCaption} = require('../server/lib/instagramCaption');

test('9월 1~3일의 일진·월주·7장·공개 원고가 검수된다',()=>{
  const all=[];
  for(const [date,e] of Object.entries(editions)){
    const p=generateFortunePackage(date);
    assert.equal(p.calendar.day,e.day);assert.equal(p.calendar.month,'丙申');
    // Independent Gregorian Julian-day calculation, not another call to the lunar library.
    const [y,m,d]=date.split('-').map(Number),a=Math.floor((14-m)/12),yy=y+4800-a,mm=m+12*a-3;
    const jdn=d+Math.floor((153*mm+2)/5)+365*yy+Math.floor(yy/4)-Math.floor(yy/100)+Math.floor(yy/400)-32045;
    const idx=(jdn+49)%60;
    assert.equal(p.calendar.day,'甲乙丙丁戊己庚辛壬癸'[idx%10]+'子丑寅卯辰巳午未申酉戌亥'[idx%12]);
    assert.equal(p.slides.length,7);assert.equal(p.slides[5].fixed,false);assert.equal(p.slides[6].fixed,false);
    assert.ok(p.caption.length<2200);assertPublicCaption(p.caption);
    assert.doesNotMatch(p.caption,/#팔자명가\d|복을 지어|7,000|2,100/);
    assert.equal(p.caption.match(/#[^\s]+/g).length,5);
    assert.ok(p.caption.includes(e.question));
    all.push(...p.readings.flatMap(r=>r.lines));
    for(let i=0;i<12;i++)assert.strictEqual(p.slides[1+Math.floor(i/3)].items[i%3],p.readings[i]);
  }
  assert.equal(all.length,144);assert.equal(new Set(all).size,144);
});
test('중복 생활 문구와 내부 게시 코드는 검수를 통과하지 못한다',()=>{
  let p=generateFortunePackage('2026-09-01');p.readings[1].lines[0]=p.readings[0].lines[0];
  assert.throws(()=>validateFortunePackage(p),/중복/);
  p=generateFortunePackage('2026-09-02');p.caption+=' #자동게시_palja_test';
  assert.throws(()=>validateFortunePackage(p),/내부/);
});
test('기존 8월 콘텐츠는 이번 편집에 영향을 받지 않는다',()=>{
  const p=generateFortunePackage('2026-08-31');assert.equal(p.editorial,undefined);
  assert.equal(p.slides[5].fixed,true);assert.match(p.caption,/#팔자명가20260831/);
});
