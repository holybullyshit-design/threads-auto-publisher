const path = require("path");
const fs = require("fs");
const os = require("os");
const puppeteer = require("puppeteer");
const sharp = require("sharp");

const TEMPLATE_PATH = path.join(__dirname, "..", "..", "public", "instagram-cards", "index.html");
let browserPromise = null;

function findChrome() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH && fs.existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)) return process.env.PUPPETEER_EXECUTABLE_PATH;
  const cacheRoot = path.join(os.homedir(), ".cache", "puppeteer", "chrome-headless-shell");
  if (fs.existsSync(cacheRoot)) {
    const versions = fs.readdirSync(cacheRoot).sort().reverse();
    for (const version of versions) {
      const binary = path.join(cacheRoot, version, "chrome-headless-shell-mac-x64", "chrome-headless-shell");
      if (fs.existsSync(binary)) return binary;
    }
  }
  const systemChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  return fs.existsSync(systemChrome) ? systemChrome : undefined;
}

function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({ headless: true, executablePath: findChrome(), args: ["--no-sandbox", "--disable-setuid-sandbox"] }).catch((error) => {
      browserPromise = null;
      throw error;
    });
  }
  return browserPromise;
}

async function renderFortunePackage(pkg, { pages = [0, 1, 2, 3, 4, 5, 6], format = "jpg" } = {}) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1400, deviceScaleFactor: 1 });
  try {
    await page.goto(`file://${TEMPLATE_PATH}`, { waitUntil: "networkidle0", timeout: 30000 });
    const output = [];
    for (const pageIndex of pages) {
      await page.evaluate(async (payload, index) => window.PaljaCards.renderPackage(payload, index), pkg, pageIndex);
      // Element screenshots work even when local image assets make the canvas
      // "tainted" under Chromium's file:// cross-origin rules on Linux CI.
      const canvas = await page.$("#card");
      if (!canvas) throw new Error("카드 캔버스를 찾지 못했습니다.");
      const png = await canvas.screenshot({ type: "png" });
      const buffer = format === "png" ? png : await sharp(png).jpeg({ quality: 94, chromaSubsampling: "4:4:4" }).toBuffer();
      const metadata = await sharp(buffer).metadata();
      if (metadata.width !== 1080 || metadata.height !== 1350) throw new Error(`카드 ${pageIndex + 1}장 크기가 1080x1350이 아닙니다.`);
      output.push({ page: pageIndex + 1, buffer, ext: format === "png" ? "png" : "jpg", width: metadata.width, height: metadata.height });
    }
    return output;
  } finally {
    await page.close();
  }
}

async function closeRenderer() {
  if (!browserPromise) return;
  const browser = await browserPromise;
  browserPromise = null;
  await browser.close();
}

module.exports = { renderFortunePackage, closeRenderer };
