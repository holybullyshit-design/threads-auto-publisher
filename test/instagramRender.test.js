const test = require("node:test");
const assert = require("node:assert/strict");
const sharp = require("sharp");
const { generateFortunePackage } = require("../server/lib/fortuneEngine");
const { renderFortunePackage, closeRenderer } = require("../server/lib/instagramCardRenderer");

test("2026-08-26 카드 7장을 1080x1350 JPEG로 렌더링한다", async (t) => {
  t.after(closeRenderer);
  const cards = await renderFortunePackage(generateFortunePackage("2026-08-26"));
  assert.equal(cards.length, 7);
  for (const card of cards) { const meta = await sharp(card.buffer).metadata(); assert.equal(meta.width, 1080); assert.equal(meta.height, 1350); assert.equal(meta.format, "jpeg"); assert.ok(card.buffer.length > 50000); }
}, { timeout: 120000 });
