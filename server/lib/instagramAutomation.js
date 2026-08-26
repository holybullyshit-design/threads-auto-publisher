const fs = require("fs");
const path = require("path");
const { generateFortunePackage, generateDateRange } = require("./fortuneEngine");
const { renderFortunePackage } = require("./instagramCardRenderer");
const mediaHost = require("./mediaHost");
const scheduleStore = require("./scheduleStore");

const CACHE_DIR = path.join(__dirname, "..", "..", "data", "instagram-cache");

async function renderCard(date, pageNumber) {
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > 7) throw Object.assign(new Error("카드 번호는 1~7이어야 합니다."), { status: 400 });
  const pkg = generateFortunePackage(date);
  const dir = path.join(CACHE_DIR, date);
  const file = path.join(dir, `${pageNumber}.jpg`);
  if (fs.existsSync(file)) return { buffer: fs.readFileSync(file), pkg };
  const [rendered] = await renderFortunePackage(pkg, { pages: [pageNumber - 1] });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, rendered.buffer);
  return { buffer: rendered.buffer, pkg };
}

function rangeSummary(startDate, endDate) {
  return generateDateRange(startDate, endDate).map((pkg) => ({
    date: pkg.date,
    calendar: pkg.calendar,
    cards: pkg.slides.length,
    captionLength: pkg.caption.length,
    validation: pkg.validation,
    contentHash: pkg.contentHash,
    scheduledAt: `${pkg.date} 06:00 KST`,
  }));
}

async function prepareAndScheduleRange(startDate, endDate) {
  const packages = generateDateRange(startDate, endDate);
  if (packages.length > 75) throw Object.assign(new Error("한 번에 최대 75일까지 예약할 수 있습니다."), { status: 400 });
  // 먼저 전체 날짜의 만세력·문구·중복 검사를 모두 끝낸 후에만 외부 저장소를 건드린다.
  const prepared = [];
  let fixedUrls = null;
  for (const [index, pkg] of packages.entries()) {
    const pages = index === 0 ? [0, 1, 2, 3, 4, 5, 6] : [0, 1, 2, 3, 4];
    const rendered = await renderFortunePackage(pkg, { pages });
    const urls = await mediaHost.publishImages(rendered.map(({ buffer, ext }) => ({ buffer, ext })));
    if (index === 0) fixedUrls = urls.slice(5, 7);
    prepared.push({
      date: pkg.date,
      caption: pkg.caption,
      contentHash: pkg.contentHash,
      validation: pkg.validation,
      images: [...urls.slice(0, 5), ...fixedUrls],
    });
  }
  const posts = await scheduleStore.addInstagramBatch(prepared);
  return { posts, prepared: prepared.map(({ date, contentHash, images }) => ({ date, contentHash, imageCount: images.length })) };
}

module.exports = { renderCard, rangeSummary, prepareAndScheduleRange, generateFortunePackage };
