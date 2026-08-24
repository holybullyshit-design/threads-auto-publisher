// 원본 이미지를 Threads 게시용 1:1 정사각형으로 가공한다.
// 원칙: "자르기(crop)"보다 "맞추기(fit)"를 우선한다 — 상품 사진 속 글씨/구도가 잘리는 걸 막기 위함.
//   - 이미 정사각형에 가까우면(비율 차이가 작으면) 가운데 기준으로 살짝만 크롭
//   - 가로/세로가 뚜렷하게 다르면, 같은 이미지를 확대·흐리게 만든 배경 위에
//     원본 전체가 보이도록 "contain"으로 얹는다 (여백을 흐린 배경으로 채움)

const sharp = require("sharp");

const NEAR_SQUARE_TOLERANCE = 0.08; // 가로세로 비율 차이 8% 이내면 "이미 정사각형"으로 간주
const BLUR_SIGMA = 40;

async function squareToJpeg(inputBuffer, size = 1080) {
  const image = sharp(inputBuffer, { failOn: "none" });
  const meta = await image.metadata();
  const width = meta.width || size;
  const height = meta.height || size;
  const ratio = width / height;
  const nearSquare = Math.abs(ratio - 1) <= NEAR_SQUARE_TOLERANCE;

  if (nearSquare) {
    const out = await sharp(inputBuffer, { failOn: "none" })
      .resize(size, size, { fit: "cover", position: "attention" })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 90 })
      .toBuffer();
    return { buffer: out, mode: "crop" };
  }

  // 1) 배경: 원본을 정사각형 캔버스에 꽉 차게(cover) 확대한 뒤 흐리게 처리
  const background = await sharp(inputBuffer, { failOn: "none" })
    .resize(size, size, { fit: "cover" })
    .blur(BLUR_SIGMA)
    .modulate({ brightness: 0.85 }) // 배경이 너무 튀지 않게 살짝 어둡게
    .toBuffer();

  // 2) 전경: 원본 전체가 잘리지 않게(contain) 축소
  const foreground = await sharp(inputBuffer, { failOn: "none" })
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  const out = await sharp(background)
    .composite([{ input: foreground, gravity: "center" }])
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 90 })
    .toBuffer();

  return { buffer: out, mode: "pad-blur" };
}

module.exports = { squareToJpeg };
