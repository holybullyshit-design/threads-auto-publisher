const test = require("node:test");
const assert = require("node:assert/strict");
const { assertCarousel } = require("../server/lib/instagramClient");

test("7장 HTTPS 캐러셀을 통과시킨다", () => {
  assert.doesNotThrow(() => assertCarousel({ imageUrls: Array.from({ length: 7 }, (_, index) => `https://example.com/${index}.jpg`), caption: "오늘의 운세" }));
});
test("1장·11장·HTTP·2,200자 초과를 차단한다", () => {
  assert.throws(() => assertCarousel({ imageUrls: ["https://example.com/1.jpg"], caption: "" }), /2~10장/);
  assert.throws(() => assertCarousel({ imageUrls: Array(11).fill("https://example.com/x.jpg"), caption: "" }), /2~10장/);
  assert.throws(() => assertCarousel({ imageUrls: ["http://example.com/1.jpg", "https://example.com/2.jpg"], caption: "" }), /HTTPS/);
  assert.throws(() => assertCarousel({ imageUrls: ["https://example.com/1.jpg", "https://example.com/2.jpg"], caption: "x".repeat(2201) }), /2,200/);
});
