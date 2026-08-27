const fs = require("fs");
const path = require("path");
const scheduleStore = require("../server/lib/scheduleStore");

const sha = process.argv[2];
const repo = process.env.GITHUB_REPOSITORY || process.env.GITHUB_REPO;
if (!sha || !repo) throw new Error("commit SHA와 GitHub 저장소 정보가 필요합니다.");
process.env.GITHUB_REPO = repo;
const root = path.join(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, ".instagram-prepare-manifest.json"), "utf8"));
const items = manifest.map((item) => ({
  ...item,
  images: item.images.map((file) => `https://cdn.jsdelivr.net/gh/${repo}@${sha}/${file}`),
}));

scheduleStore.addInstagramBatch(items)
  .then((posts) => console.log(JSON.stringify({ scheduled: posts.map((post) => ({ date: post.expectedLocalDate, scheduledAt: post.scheduledAt })) }, null, 2)))
  .catch((error) => { console.error(error); process.exit(1); });
