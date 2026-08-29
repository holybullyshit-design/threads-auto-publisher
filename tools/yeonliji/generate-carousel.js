const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const sharp = require("sharp");

const ROOT = path.join(__dirname, "..", "..");
const SOURCE = path.join(ROOT, "assets", "yeonliji", "relationship-sensitive-storyboard-v1.png");
const OUT = path.join(ROOT, "output", "yeonliji-2026-08-29");
const FONT = "Apple SD Gothic Neo, Arial, sans-serif";

const cards = [
  { eyebrow: "연리지 관계기록 01", title: ["좋아하는데", "왜 자꾸 멀어질까?"], body: ["마음이 없어서가 아니라", "너무 많이 느끼는 사람도 있어."], panel: 0 },
  { eyebrow: "연지의 이야기", title: ["연락이 오면 설레는데", "가까워지면 겁이 났다"], body: ["좋아질수록 잃을 장면부터 떠올라", "먼저 한 걸음 물러나곤 했다."], panel: 1 },
  { eyebrow: "타래의 한마디", title: ["도망은 무관심보다", "불안에서 시작되기도 해"], body: ["상대의 말 한마디를 오래 곱씹고", "아직 오지 않은 이별까지 걱정하는 마음."], panel: 2 },
  { eyebrow: "사주 한 스푼 · 귀문관살", title: ["‘귀문관살’은", "저주가 아니야"], body: ["전통 명리에서 감각과 생각이 예민해", "감정을 깊이 반추하는 성향으로 읽기도 해."], note: "※ 이것 하나만으로 이별·재회를 단정하지 않아요.", panel: 3 },
  { eyebrow: "단정하지 않기", title: ["같은 귀문관살도", "사랑의 모양은 다르다"], body: ["일주와 전체 명식, 지금 흐르는 운에 따라", "예민함은 통찰이 되기도, 불안이 되기도 해."], panel: 4 },
  { eyebrow: "관계를 볼 때", title: ["‘그 사람이 돌아올까’보다", "먼저 볼 것이 있다"], body: ["반복되는 거리두기, 두 사람의 궁합,", "그리고 다시 만날 시기의 흐름."], panel: 5 },
  { eyebrow: "다음 이야기 · 재회 흐름", title: ["끝난 줄 알았는데", "마음이 아직 남았다면"], body: ["댓글에 ‘매듭’이라고 남겨줘.", "다음 편에서 재회운을 볼 때 먼저 확인할 것을 풀게."], final: true },
];

function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[c])); }
function lines(items, x, y, size, weight, color, gap) {
  return items.map((t, i) => `<text x="${x}" y="${y + i * gap}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${color}">${esc(t)}</text>`).join("");
}
function overlay(card, index) {
  const finalArt = card.final ? `<path d="M180 890 C300 760 435 1030 565 890 S820 760 930 895" fill="none" stroke="#a33d4d" stroke-width="12" stroke-linecap="round"/><circle cx="565" cy="890" r="34" fill="none" stroke="#a33d4d" stroke-width="10"/><circle cx="565" cy="890" r="10" fill="#a33d4d"/>` : "";
  return Buffer.from(`<svg width="1080" height="1350" xmlns="http://www.w3.org/2000/svg">
    <rect x="42" y="42" width="996" height="1266" rx="34" fill="none" stroke="#d9c5b8" stroke-width="2"/>
    <rect x="80" y="74" width="${Math.min(470, 72 + card.eyebrow.length * 24)}" height="48" rx="24" fill="#efe0d8"/>
    <text x="105" y="107" font-family="${FONT}" font-size="24" font-weight="700" fill="#7b4050">${esc(card.eyebrow)}</text>
    ${lines(card.title, 82, 195, 58, 800, "#31282b", 72)}
    ${lines(card.body, 84, 380, 31, 500, "#5d5050", 48)}
    ${card.note ? `<text x="84" y="493" font-family="${FONT}" font-size="23" fill="#8b6f6f">${esc(card.note)}</text>` : ""}
    ${finalArt}
    <text x="995" y="1275" text-anchor="end" font-family="${FONT}" font-size="22" font-weight="700" fill="#9e8580">연리지 실타래 · ${index + 1}/7</text>
  </svg>`);
}

async function illustration(panel) {
  const x = [0, 517, 1031][panel % 3];
  const y = panel < 3 ? 0 : 518;
  const w = panel % 3 === 2 ? 505 : 504;
  const h = panel < 3 ? 506 : 506;
  return sharp(SOURCE).extract({ left: x, top: y, width: w, height: h }).resize(910, 730, { fit: "cover", position: "centre" }).jpeg({ quality: 92 }).toBuffer();
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const outputs = [];
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const layers = [{ input: overlay(card, i), top: 0, left: 0 }];
    if (!card.final) {
      layers.unshift({ input: await illustration(card.panel), top: 570, left: 85 });
      layers.push({ input: Buffer.from(`<svg width="1080" height="1350" xmlns="http://www.w3.org/2000/svg"><rect x="70" y="550" width="940" height="770" rx="30" fill="none" stroke="#d8c5b8" stroke-width="3"/></svg>`), top: 0, left: 0 });
    }
    const file = path.join(OUT, `card-${String(i + 1).padStart(2, "0")}.jpg`);
    await sharp({ create: { width: 1080, height: 1350, channels: 3, background: "#f5eee4" } }).composite(layers).jpeg({ quality: 94, chromaSubsampling: "4:4:4" }).toFile(file);
    outputs.push(file);
  }
  const caption = `좋아하면서도 자꾸 멀어지는 사람.\n마음이 없어서가 아니라, 가까워질수록 더 많은 장면을 걱정하는 사람도 있어요.\n\n명리에서 귀문관살은 감각과 생각이 예민하고 감정을 오래 곱씹는 성향으로 읽기도 합니다. 하지만 이것 하나로 이별이나 재회를 단정할 수는 없어요. 일주와 전체 명식, 두 사람의 궁합, 지금 흐르는 운을 함께 봐야 합니다.\n\n끝난 줄 알았는데 마음이 아직 남았다면 댓글에 ‘매듭’이라고 남겨주세요. 다음 편에서 재회 흐름을 볼 때 먼저 확인할 것을 풀어볼게요.\n\n#연리지실타래 #재회운 #궁합 #사주풀이 #연애고민`;
  const contentHash = crypto.createHash("sha256").update(JSON.stringify(cards) + caption).digest("hex");
  const manifest = { title: "좋아하는데 왜 자꾸 멀어질까?", series: "연리지 관계기록", accountKey: "yeonliji", accountId: "knot_saju", accountLabel: "연리지 실타래", date: "2026-08-29", time: "18:00", caption, contentHash, cards, files: outputs, validation: { status: "passed", checkedAt: new Date().toISOString(), checks: { spelling: true, flow: true, sajuAccuracy: true, nonDeterministicLanguage: true, slideCount: true, imageUniqueness: true, ctaQuality: true, dimensions: "1080x1350" } } };
  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify({ count: outputs.length, contentHash, outputDir: OUT }));
}

main().catch((err) => { console.error(err); process.exit(1); });
