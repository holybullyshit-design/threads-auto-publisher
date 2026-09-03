const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
const { generateFortunePackage } = require('../server/lib/fortuneEngine');
const { renderFortunePackage, closeRenderer } = require('../server/lib/instagramCardRenderer');

const root = path.resolve(__dirname, '..');
const start = process.argv[2];
const end = process.argv[3];
if (!/^\d{4}-\d{2}-\d{2}$/.test(start || '') || !/^\d{4}-\d{2}-\d{2}$/.test(end || '') || start > end) {
  console.error('사용법: node tools/prepare-palja-daily-range.js YYYY-MM-DD YYYY-MM-DD');
  process.exit(1);
}
const dates = [];
for (let d = new Date(`${start}T12:00:00+09:00`); d <= new Date(`${end}T12:00:00+09:00`); d.setUTCDate(d.getUTCDate() + 1)) {
  dates.push(new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Seoul', year:'numeric', month:'2-digit', day:'2-digit' }).format(d));
}
const out = path.join(root, 'output', `palja-${start}_${end}`);
const digest = (b) => crypto.createHash('sha256').update(b).digest('hex');

(async () => {
  fs.mkdirSync(out, { recursive:true });
  const manifest = [];
  try {
    for (const date of dates) {
      const pkg = generateFortunePackage(date);
      if (pkg.slides[0].type !== 'cover' || pkg.slides[0].title !== `${Number(date.slice(5,7))}월 ${Number(date.slice(8))}일`) throw new Error(`${date} 표지 형식 오류`);
      const dir = path.join(out, date); fs.mkdirSync(dir, { recursive:true });
      const cards = await renderFortunePackage(pkg);
      const images = [];
      for (const card of cards) {
        const file = path.join(dir, `${card.page}.jpg`); fs.writeFileSync(file, card.buffer);
        images.push({ file, page:card.page, sha256:digest(card.buffer) });
      }
      const tiles = await Promise.all(images.map(async (im, i) => ({ input:await sharp(im.file).resize(432,540).toBuffer(), left:(i%4)*432, top:Math.floor(i/4)*540 })));
      await sharp({ create:{ width:1728, height:1080, channels:3, background:'#ddd5c5' } }).composite(tiles).jpeg({ quality:94 }).toFile(path.join(out, `${date}-review.jpg`));
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2));
      fs.writeFileSync(path.join(dir, 'caption.txt'), pkg.caption);
      manifest.push({ date, caption:pkg.caption, contentHash:pkg.contentHash, validation:pkg.validation, calendar:pkg.calendar, images });
      console.log(`${date}: 7장 생성 · ${pkg.calendar.korean}`);
    }
    fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
    console.log(`PREPARED_ONLY ${dates.length}일 / ${dates.length * 7}장: ${out}`);
  } finally { await closeRenderer(); }
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
