const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const mediaHost = require("./mediaHost");
const scheduleStore = require("./scheduleStore");
const instagramAuthStore = require("./instagramAuthStore");
const planner = require('./yeonlijiDraftPlanner');
const imageGenerator = require('./yeonlijiImageGenerator');
const editorial = require('./yeonlijiEditorial');

const OUTPUT_DIR = path.join(__dirname, "..", "..", "output");
function applyGrowthPlan(plan) {
  const modulePath=path.join(__dirname,'instagramGrowth.js');
  return fs.existsSync(modulePath)?require(modulePath).applyToPlan(plan):plan;
}
const CHARACTER_BIBLE = Object.freeze({
  status: "locked",
  heroine: "연지 · 20대 후반 한국 여성, 어깨 길이의 짙은 머리, 크림 블라우스와 차분한 자두색 카디건",
  companion: "타래 · 느슨한 붉은 실 매듭으로 이루어진 작은 관계 요정",
  art: "정제된 한국 감성 웹툰 · 과슈와 색연필 질감 · 성숙하고 따뜻한 표정",
  palette: "크림 · 코랄 · 버건디 · 자두색",
  audience: "재회·연애·궁합에 관심 있는 20~40대 여성",
  rules: ["주인공 얼굴·머리·의상 고정", "이미지 생성 시 글자 제외", "한글은 검수 가능한 코드 렌더링", "유아풍·3D·과한 점술 공포 표현 금지"],
});

function safeDraftId(value) {
  const id = String(value || "");
  if (!/^yeonliji-\d{4}-\d{2}-\d{2}(?:-[a-z0-9_-]+)?$/.test(id)) throw Object.assign(new Error("올바르지 않은 연리지 시안입니다."), { status: 400 });
  return id;
}

function draftDirectory(id) { return path.join(OUTPUT_DIR, safeDraftId(id)); }
function readManifest(id) {
  const dir = draftDirectory(id);
  const manifestPath = path.join(dir, "manifest.json");
  if (!fs.existsSync(manifestPath)) throw Object.assign(new Error("연리지 시안을 찾을 수 없습니다."), { status: 404 });
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  return { id, dir, manifest };
}

async function inspectDraft(id, posts) {
  const { manifest } = readManifest(id);
  let contentReady=true,contentError='';
  try { editorial.validatePlan(manifest); } catch(error) { contentReady=false;contentError=error.message; }
  const imageFiles = Array.from({ length: 7 }, (_, index) => path.join(draftDirectory(id), `card-${String(index + 1).padStart(2, "0")}.jpg`));
  const existing = posts.find((post) => post.platform === "instagram" && (post.accountKey === "yeonliji" || post.accountId === 'knot_saju') && (post.contentHash === manifest.contentHash || post.title === manifest.title) && post.status !== "canceled");
  return {
    id, title: manifest.title, displayTitle:manifest.displayTitle || manifest.title, series: manifest.series, date: manifest.date, time: manifest.time,
    contentReady,contentError,factPack:manifest.factPack || null,
    recomposeAvailable:fs.existsSync(path.join(draftDirectory(id),'source-storyboard.png')),
    topicId: manifest.topicId || (manifest.title === '좋아하는데 왜 자꾸 멀어질까?' ? 'distance' : ''),
    createdAt: manifest.createdAt || '',
    caption: manifest.caption, contentHash: manifest.contentHash, cards: manifest.cards || [],
    editorial: manifest.editorial ? {copyRevision:manifest.editorial.copyRevision,presentationVersion:manifest.editorial.presentationVersion} : null,
    validation: manifest.validation, imageCount: imageFiles.filter(fs.existsSync).length,
    scheduled: Boolean(existing), schedule: existing ? { id: existing.id, status: existing.status, scheduledAt: existing.scheduledAt, publishedAt: existing.publishedAt, publishedId:existing.publishedId, permalink:existing.permalink } : null,
  };
}

async function getStudio() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  let posts = [], historyWarning = '';
  try { posts = await scheduleStore.listSchedule(); }
  catch { historyWarning = '클라우드 예약 이력을 읽지 못했습니다. 시안은 볼 수 있지만 예약 여부는 새로고침으로 다시 확인해주세요.'; }
  const ids = fs.readdirSync(OUTPUT_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^yeonliji-\d{4}-\d{2}-\d{2}/.test(entry.name) && fs.existsSync(path.join(OUTPUT_DIR, entry.name, "manifest.json")))
    .map((entry) => entry.name).sort().reverse();
  const drafts = await Promise.all(ids.map((id) => inspectDraft(id, posts)));
  const credentials = instagramAuthStore.getCredentials("yeonliji");
  drafts.sort((a,b)=>(b.createdAt || b.date).localeCompare(a.createdAt || a.date));
  for(const draft of drafts) {
    const peers=drafts.filter(d=>d.id!==draft.id && d.topicId!==draft.topicId && draft.factPack?.key && d.factPack?.key===draft.factPack.key);
    draft.similarityWarnings=peers.length ? ['다른 주제와 같은 명리 개념을 사용합니다. 적용 사례·결론의 반복을 검수해주세요: '+peers.slice(0,3).map(d=>d.displayTitle).join(' / ')] : [];
  }
  return { deliveryVersion:"yeonliji-delivery-v1", account: { key: "yeonliji", label: "연리지 실타래", username: credentials?.username || "knot_saju", connected: Boolean(credentials) }, characterBible: CHARACTER_BIBLE, drafts, historyWarning, historyTitles: posts.filter(p=>p.platform==='instagram' && (p.accountKey==='yeonliji' || p.accountId==='knot_saju')).map(p=>p.title), generation: imageGenerator.getStatus() };
}

async function getTopics(avoid = []) {
  const studio = await getStudio();
  const catalog = planner.getTopicCatalog();
  const used = new Set(studio.drafts.map(d => d.topicId));
  const titles = new Set([...studio.drafts.map(d=>d.title),...studio.historyTitles]);
  const unused = catalog.filter(t=>!used.has(t.id) && !titles.has(t.title));
  const shuffled = [...unused].sort(()=>Math.random()-.5);
  const fresh = shuffled.filter(t=>!avoid.includes(t.id));
  const fallback = shuffled.filter(t=>avoid.includes(t.id));
  // Rotate categories before repeating one, so recommendations are not all reunion.
  const diversify = items => {
    const groups = new Map();
    for(const item of items) { if(!groups.has(item.category)) groups.set(item.category,[]); groups.get(item.category).push(item); }
    const result=[];
    while(result.length<items.length) for(const group of groups.values()) if(group.length) result.push(group.shift());
    return result;
  };
  const topics = [...diversify(fresh),...diversify(fallback)].slice(0,10);
  const defaultDate = new Date(Date.now()+32400000+30*60000).toISOString().slice(0,10);
  const defaultTime=new Date(Date.now()+32400000+30*60000).toISOString().slice(11,16);
  return {topics,total:catalog.length,remaining:unused.length,used:catalog.length-unused.length,defaultDate,defaultTime,historyWarning:studio.historyWarning,generation:studio.generation};
}

async function generateDraft({topicId,date,time,sourceDraftId,mode='paid',allowPaid=false}={}) {
  if(!['paid','recompose'].includes(mode)) throw Object.assign(new Error('지원하지 않는 제작 방식입니다.'),{status:400});
  if(mode==='paid' && allowPaid!==true) throw Object.assign(new Error('새 그림 생성에는 API 비용 동의가 필요합니다. 기존 그림 원고 업데이트는 무료입니다.'),{status:400});
  if(mode==='recompose' && !sourceDraftId) throw Object.assign(new Error('무료 원고 업데이트에 사용할 기존 시안을 선택해주세요.'),{status:400});
  const plan=applyGrowthPlan(planner.createDraftPlan(String(topicId || ''),{date,time}));
  if(sourceDraftId) {
    const {manifest,dir}=readManifest(sourceDraftId);
    const originalTopic=manifest.topicId || (manifest.title==='좋아하는데 왜 자꾸 멀어질까?'?'distance':'');
    if(originalTopic!==topicId) throw Object.assign(new Error('다시 만들기 대상과 주제가 다릅니다.'),{status:400});
    if(mode==='recompose') {
      const source=path.join(dir,'source-storyboard.png');
      if(!fs.existsSync(source)) throw Object.assign(new Error('원본 그림이 없어 무료 조판을 할 수 없습니다. 유료 생성으로 자동 전환하지 않았습니다.'),{status:409});
      return imageGenerator.generateDraft(plan,{provider:async()=>({buffer:fs.readFileSync(source),reusedFromDraftId:sourceDraftId})});
    }
  } else {
    const studio=await getStudio();
    if(studio.drafts.some(d=>d.topicId===topicId || d.title===plan.title)) throw Object.assign(new Error('이미 만든 주제입니다. 아래 시안을 선택하거나 ‘같은 주제로 다시 만들기’를 사용해주세요.'),{status:409});
    if(studio.historyWarning) throw Object.assign(new Error('중복 검사를 위해 클라우드 이력을 먼저 불러와야 합니다. 잠시 뒤 새로고침해주세요.'),{status:503});
    if(studio.historyTitles.includes(plan.title)) throw Object.assign(new Error('이미 사용한 주제입니다. 다른 주제를 골라주세요.'),{status:409});
  }
  return imageGenerator.generateDraft(plan);
}

function readCard(id, page) {
  const number = Number(page);
  if (!Number.isInteger(number) || number < 1 || number > 7) throw Object.assign(new Error("카드 번호는 1~7이어야 합니다."), { status: 400 });
  const file = path.join(draftDirectory(id), `card-${String(number).padStart(2, "0")}.jpg`);
  if (!fs.existsSync(file)) throw Object.assign(new Error("카드 이미지를 찾을 수 없습니다."), { status: 404 });
  return file;
}

async function verifyFiles(id, manifest) {
  editorial.validatePlan(manifest);
  if(manifest.validation?.imageHashes?.length!==7) throw Object.assign(new Error('이미지 검수 해시가 없어 예약을 중단합니다.'),{status:422});
  const buffers = [];
  const hashes = new Set();
  for (let page = 1; page <= 7; page += 1) {
    const file = readCard(id, page);
    const buffer = fs.readFileSync(file);
    const meta = await sharp(buffer).metadata();
    if (meta.width !== 1080 || meta.height !== 1350) throw Object.assign(new Error(`${page}장 크기가 1080×1350이 아닙니다.`), { status: 422 });
    const imageHash=crypto.createHash("sha256").update(buffer).digest("hex");
    if(manifest.validation?.imageHashes && manifest.validation.imageHashes[page-1]!==imageHash) throw Object.assign(new Error(`${page}장 파일이 생성 후 변경되었습니다. 새 시안을 만들어 다시 검수해주세요.`),{status:422});
    hashes.add(imageHash);
    buffers.push({ buffer, ext: "jpg" });
  }
  if (hashes.size !== 7) throw Object.assign(new Error("동일한 이미지가 반복되어 예약을 중단했습니다."), { status: 422 });
  if (manifest.validation?.status !== "passed") throw Object.assign(new Error("최종 검수를 통과하지 않은 시안입니다."), { status: 422 });
  if (!manifest.caption || !manifest.contentHash) throw Object.assign(new Error("캡션 또는 검수 해시가 없습니다."), { status: 422 });
  return buffers;
}

async function scheduleApprovedDraft(id, {date,time}={}) {
  const lockDirectory=path.join(__dirname,'../../data');
  fs.mkdirSync(lockDirectory,{recursive:true});
  const lockPath=path.join(lockDirectory,'yeonliji-approval.lock');
  let lock;
  try { lock=fs.openSync(lockPath,'wx'); }
  catch(error) { if(error.code==='EEXIST') throw Object.assign(new Error('다른 승인 예약을 처리 중입니다. 잠시 뒤 시안을 새로고침해주세요.'),{status:409}); throw error; }
  try {
  const { manifest } = readManifest(id);
  const posts = await scheduleStore.listSchedule();
  const existing = posts.find((post) => post.platform === "instagram" && (post.accountKey === "yeonliji" || post.accountId === 'knot_saju') && (post.contentHash === manifest.contentHash || post.title === manifest.title) && post.status !== "canceled");
  if (existing) return { duplicatePrevented: true, post: existing };
  editorial.validatePlan(manifest);
  if(manifest.factPack?.kind==='calendar-calculation' && date!==manifest.date) throw Object.assign(new Error('일진 시안과 예약 날짜가 다릅니다. 기존 그림 무료 업데이트로 날짜를 맞추고 다시 승인해주세요.'),{status:422});
  planner.validateDateTime(date,time,{future:true});
  const credentials = instagramAuthStore.getCredentials("yeonliji");
  if (!credentials) throw Object.assign(new Error("연리지 실타래 Instagram 계정을 먼저 연결해주세요."), { status: 409 });
  const buffers = await verifyFiles(id, manifest);
  const images = await mediaHost.publishImages(buffers);
  planner.validateDateTime(date,time,{future:true});
  const post = await scheduleStore.addInstagramPost({
    accountKey: "yeonliji", accountId: credentials.username || "knot_saju", accountLabel: "연리지 실타래",
    caption: manifest.caption, title: manifest.title, contentSeries: manifest.series,
    date, time, contentHash: manifest.contentHash,
    dedupeKey: `instagram:yeonliji:${manifest.contentHash}`, images, validation: {...manifest.validation,humanApprovedAt:new Date().toISOString()},
  });
  return { duplicatePrevented: false, post };
  } finally { fs.closeSync(lock); fs.unlinkSync(lockPath); }
}

async function publishApprovedDraftNow(id){
  const {manifest}=readManifest(id);
  const buffers=await verifyFiles(id,manifest);
  const today=new Date(Date.now()+32400000).toISOString().slice(0,10);
  if(manifest.factPack.kind==='calendar-calculation'&&manifest.date!==today) throw Object.assign(new Error('오늘 날짜의 일진 시안이 아닙니다. 무료 업데이트 후 다시 승인해주세요.'),{status:422});
  return require('./yeonlijiDelivery').publishNow(manifest,buffers,instagramAuthStore.getCredentials('yeonliji'));
}
async function rescheduleApprovedDraft(id,{date,time}={}){
  const {manifest}=readManifest(id);editorial.validatePlan(manifest);
  return require('./yeonlijiDelivery').reschedule(manifest,date,time);
}
module.exports = { CHARACTER_BIBLE, getStudio, getTopics, generateDraft, readCard, scheduleApprovedDraft, publishApprovedDraftNow, rescheduleApprovedDraft, previewPlan:(id,options)=>applyGrowthPlan(planner.createDraftPlan(id,options)) };
