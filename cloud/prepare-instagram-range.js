const fs = require("fs");
const path = require("path");
const { generateDateRange } = require("../server/lib/fortuneEngine");
const { renderFortunePackage, closeRenderer } = require("../server/lib/instagramCardRenderer");

const [start, end] = process.argv.slice(2);
if (!start || !end) throw new Error("start와 end 날짜가 필요합니다.");
const root = path.join(__dirname, "..");
const outputRoot = path.join(root, "public", "generated", "instagram");

(async () => {
  const manifest = [];
  try {
    for (const pkg of generateDateRange(start, end)) {
      const rendered = await renderFortunePackage(pkg);
      const dir = path.join(outputRoot, pkg.date);
      fs.mkdirSync(dir, { recursive: true });
      const images = rendered.map(({ page, buffer }) => {
        const relative = `public/generated/instagram/${pkg.date}/${page}.jpg`;
        fs.writeFileSync(path.join(root, relative), buffer);
        return relative;
      });
      manifest.push({ date: pkg.date, caption: pkg.caption, contentHash: pkg.contentHash, validation: pkg.validation, images });
      console.log(`${pkg.date}: 7장 렌더링 완료`);
    }
    fs.writeFileSync(path.join(root, ".instagram-prepare-manifest.json"), JSON.stringify(manifest, null, 2));
  } finally {
    await closeRenderer();
  }
})().catch((error) => { console.error(error); process.exit(1); });
