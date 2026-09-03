require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { execFileSync } = require('node:child_process');
const { generateFortunePackage } = require('../server/lib/fortuneEngine');
const { assertPublicCaption } = require('../server/lib/instagramCaption');
const { readSchedule, atomicUpdateSchedule } = require('../server/lib/githubStore');
const { getCredentials } = require('../server/lib/instagramAuthStore');
const { graphRequest, getConfig } = require('../server/lib/instagramClient');
const { publishImages } = require('../server/lib/mediaHost');

const root = path.resolve(__dirname, '..');
const start = process.argv[3], end = process.argv[4], mode = process.argv[2];
assert.ok(['upload','schedule'].includes(mode), 'upload 또는 schedule 모드가 필요합니다.');
assert.match(start || '', /^\d{4}-\d{2}-\d{2}$/); assert.match(end || '', /^\d{4}-\d{2}-\d{2}$/); assert.ok(start <= end);
const out = path.join(root, 'output', `palja-${start}_${end}`);
const uploadFile = path.join(out, 'uploaded.json');
const digest = (b) => crypto.createHash('sha256').update(b).digest('hex');
const sameAccount = (p) => p.platform === 'instagram' && (p.accountKey === 'palja' || (!p.accountKey && p.accountId === 'saju_orbit'));

async function verify() {
  const manifest = JSON.parse(fs.readFileSync(path.join(out, 'manifest.json'), 'utf8'));
  assert.equal(manifest[0].date, start); assert.equal(manifest.at(-1).date, end);
  for (const item of manifest) {
    const pkg = generateFortunePackage(item.date);
    assert.equal(item.contentHash, pkg.contentHash); assert.equal(item.caption, pkg.caption); assertPublicCaption(item.caption);
    assert.equal(item.validation.status, 'passed'); assert.equal(item.images.length, 7);
    assert.equal(pkg.slides[0].title, `${Number(item.date.slice(5,7))}월 ${Number(item.date.slice(8))}일`);
    for (const [i, image] of item.images.entries()) {
      assert.equal(image.page, i + 1); const bytes = fs.readFileSync(image.file); assert.equal(digest(bytes), image.sha256);
      const meta = await sharp(bytes).metadata(); assert.equal(meta.width,1080); assert.equal(meta.height,1350); assert.equal(meta.format,'jpeg');
    }
  }
  assert.equal(new Set(manifest.flatMap(x => x.images.map(im => im.sha256))).size, manifest.length * 7, '중복 이미지가 있습니다.');
  return manifest;
}

(async () => {
  const manifest = await verify();
  if (mode === 'upload') {
    if (fs.existsSync(uploadFile)) { console.log('기존 공개 업로드 기록을 재사용합니다.'); return; }
    assert.equal(execFileSync('git',['status','--porcelain'],{ cwd:path.join(root,'media-host'), encoding:'utf8' }).trim(), '', '미디어 저장소에 다른 변경이 있습니다.');
    const { posts } = await readSchedule();
    assert.ok(!posts.some(p => sameAccount(p) && p.status !== 'canceled' && manifest.some(x => x.date === p.expectedLocalDate) && p.mediaType !== 'REELS'), '같은 날짜의 카드 예약이 이미 있습니다.');
    const buffers = manifest.flatMap(item => item.images.map(im => ({ buffer:fs.readFileSync(im.file), ext:'jpg' })));
    const urls = await publishImages(buffers);
    const uploaded = manifest.map((item, i) => ({ ...item, images:urls.slice(i*7,i*7+7), imageHashes:item.images.map(im => im.sha256) }));
    fs.writeFileSync(uploadFile, JSON.stringify(uploaded, null, 2));
    console.log(`${buffers.length}개 이미지 공개 업로드 완료. 아직 예약 전입니다.`); return;
  }
  const uploaded = JSON.parse(fs.readFileSync(uploadFile, 'utf8'));
  const account = getCredentials('palja'); assert.ok(account);
  const profile = await graphRequest(getConfig(account), 'me', { params:{ fields:'id,username' } });
  assert.equal(profile.username, 'saju_orbit', '팔자명가 계정이 아닙니다.');
  for (const [i,item] of uploaded.entries()) {
    assert.equal(item.contentHash, manifest[i].contentHash); assert.equal(item.images.length,7);
    for (const [n,url] of item.images.entries()) {
      assert.ok(url.startsWith('https://cdn.jsdelivr.net/gh/holybullyshit-design/threads-media-host@'));
      const response = await fetch(url, { signal:AbortSignal.timeout(45000) }); assert.ok(response.ok, `이미지 접근 실패 ${response.status}`);
      assert.equal(digest(Buffer.from(await response.arrayBuffer())), item.imageHashes[n], '공개 이미지 해시 불일치');
    }
  }
  const receipt = await atomicUpdateSchedule(posts => uploaded.map(item => {
    const dedupeKey = `instagram:palja-daily:${item.date}`;
    const existing = posts.filter(p => p.status !== 'canceled' && p.mediaType !== 'REELS' && (p.dedupeKey === dedupeKey || (sameAccount(p) && p.expectedLocalDate === item.date)));
    if (existing.length) {
      assert.equal(existing.length,1); const p=existing[0]; assert.equal(p.contentHash,item.contentHash); assert.deepEqual(p.images,item.images);
      return { id:p.id, date:item.date, status:p.status, scheduledAt:p.scheduledAt };
    }
    const scheduledAt = new Date(`${item.date}T06:00:00+09:00`).toISOString(); assert.ok(Date.parse(scheduledAt) > Date.now(), '지난 예약 시각입니다.');
    const post = { id:crypto.randomUUID(), platform:'instagram', accountKey:'palja', accountId:'saju_orbit', accountLabel:'팔자명가',
      title:`${Number(item.date.slice(5,7))}월 ${Number(item.date.slice(8))}일 오늘의 운세`, text:item.caption, images:item.images,
      status:'scheduled', scheduledAt, expectedLocalDate:item.date, exactTimeKst:'06:00', dedupeKey, contentHash:item.contentHash,
      validation:{...item.validation,imageReview:'passed',publicImageHashMatch:true}, createdAt:new Date().toISOString(), publishedAt:null,publishedId:null,error:null,retryCount:0 };
    posts.push(post); return { id:post.id,date:item.date,status:post.status,scheduledAt:post.scheduledAt };
  }), `chore: schedule reviewed Palja fortunes ${start} to ${end}`);
  const { posts } = await readSchedule();
  for (const item of uploaded) {
    const matches=posts.filter(p=>sameAccount(p)&&p.status!=='canceled'&&p.mediaType!=='REELS'&&p.expectedLocalDate===item.date);
    assert.equal(matches.length,1); assert.equal(matches[0].contentHash,item.contentHash); assert.deepEqual(matches[0].images,item.images);
    assert.equal(matches[0].scheduledAt,new Date(`${item.date}T06:00:00+09:00`).toISOString());
  }
  fs.writeFileSync(path.join(out,'schedule-receipt.json'),JSON.stringify({checkedAt:new Date().toISOString(),account:profile.username,posts:receipt},null,2));
  console.log(JSON.stringify(receipt,null,2));
})().catch(error => { console.error(error.stack || error); process.exitCode=1; });
