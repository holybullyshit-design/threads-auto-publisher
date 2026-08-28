const state = {
  maxTextLength: 500,
  accounts: [],
  personaPresets: {},
  partnersPresets: {},
  selectedAccountId: null,
  selectedCategoryId: null,
  publishMode: "now", // now | schedule
  scheduleView: "calendar", // calendar | list
  scheduleGroupFilter: "all", // all | saju | partners | instagram — 예약 달력/목록 구분 필터
  calendarDate: new Date(), // 현재 보고 있는 달 (day는 무시하고 년/월만 사용)
  selectedDay: null, // "YYYY-MM-DD" 또는 null
  schedulePosts: [],
  editingPostId: null, // 예약 목록에서 지금 수정 폼을 펼쳐둔 게시물 id (한 번에 하나만)
  newAccountType: "saju", // saju | partners (계정 추가 폼에서 선택 중인 카테고리)

  // 파트너스: 쿠팡 상품 검색/선택 + 준비된 이미지/답글(제휴 링크)
  productSearchResults: [],
  selectedProduct: null, // { productName, productImage, productUrl, productPrice, ... }
  currentImages: [], // 미리보기에 걸려 있는, 이미 공개 호스팅된 1:1 이미지 URL들
  currentReplyText: "", // 본문 게시 직후 답글로 자동 게시할 텍스트(제휴 링크)
  extraImages: [], // [{ id, previewUrl, url, status: 'uploading'|'done'|'error' }] — 캡처해서 끌어다 놓은 추가 이미지
  externalImageSearchConfigured: false, // 이미지 검색 API 키 설정 여부 — false면 "다른 사이트에서 사진 찾기" 버튼 숨김

  // 파트너스: 콘텐츠 종류 ("product" 제품 홍보 | "lifestyle" 일상글)
  contentMode: "product",
  lifestyleCategories: [],
  selectedLifestyleCategoryId: null,
};

const ACCOUNT_COLOR_PALETTE = ["#e07a5f", "#6ea8fe", "#81b29a", "#d88fd8", "#f2b56f", "#7fd1ae"];
const accountColorCache = new Map();

function getAccountColor(accountId) {
  if (accountColorCache.has(accountId)) return accountColorCache.get(accountId);
  const idx = accountColorCache.size % ACCOUNT_COLOR_PALETTE.length;
  const color = ACCOUNT_COLOR_PALETTE[idx];
  accountColorCache.set(accountId, color);
  return color;
}

const el = {
  tabButtons: Array.from(document.querySelectorAll(".tab-btn")),
  tabPanels: {
    compose: document.getElementById("tab-compose"),
    instagram: document.getElementById("tab-instagram"),
    schedule: document.getElementById("tab-schedule"),
    accounts: document.getElementById("tab-accounts"),
    ops: document.getElementById("tab-ops"),
  },

  accountSelect: document.getElementById("account-select"),
  accountPersonaHint: document.getElementById("account-persona-hint"),
  noAccountHint: document.getElementById("no-account-hint"),
  categorySectionLabel: document.getElementById("category-section-label"),
  categoryOptions: document.getElementById("category-options"),
  productCategoryCard: document.getElementById("product-category-card"),
  partnersModeToggle: document.getElementById("partners-mode-toggle"),
  modeProductBtn: document.getElementById("mode-product"),
  modeLifestyleBtn: document.getElementById("mode-lifestyle"),
  partnersLifestyleFields: document.getElementById("partners-lifestyle-fields"),
  lifestyleCategoryOptions: document.getElementById("lifestyle-category-options"),
  lifestyleTopicNote: document.getElementById("lifestyle-topic-note"),
  partnersProductFields: document.getElementById("partners-product-fields"),
  productSearchKeyword: document.getElementById("product-search-keyword"),
  btnProductSearch: document.getElementById("btn-product-search"),
  productSearchError: document.getElementById("product-search-error"),
  productSearchResults: document.getElementById("product-search-results"),
  keywordSuggestions: document.getElementById("keyword-suggestions"),
  selectedProductBox: document.getElementById("selected-product-box"),
  selectedProductThumb: document.getElementById("selected-product-thumb"),
  selectedProductName: document.getElementById("selected-product-name"),
  selectedProductPrice: document.getElementById("selected-product-price"),
  selectedProductLink: document.getElementById("selected-product-link"),
  btnClearProduct: document.getElementById("btn-clear-product"),
  productNote: document.getElementById("product-note"),
  imageDropzone: document.getElementById("image-dropzone"),
  imageFileInput: document.getElementById("image-file-input"),
  imageUploadError: document.getElementById("image-upload-error"),
  extraImagesPreview: document.getElementById("extra-images-preview"),
  btnSearchExternalImages: document.getElementById("btn-search-external-images"),
  externalImagesError: document.getElementById("external-images-error"),
  externalImagesHint: document.getElementById("external-images-hint"),
  externalImagesResults: document.getElementById("external-images-results"),
  previewImages: document.getElementById("preview-images"),
  previewReplyHint: document.getElementById("preview-reply-hint"),
  btnGenerate: document.getElementById("btn-generate"),
  btnManual: document.getElementById("btn-manual"),
  settingsError: document.getElementById("settings-error"),

  screenSettings: document.getElementById("screen-settings"),
  screenPreview: document.getElementById("screen-preview"),

  draftText: document.getElementById("draft-text"),
  previewMeta: document.getElementById("preview-meta"),
  charCount: document.getElementById("char-count"),
  btnPolish: document.getElementById("btn-polish"),
  modeNow: document.getElementById("mode-now"),
  modeSchedule: document.getElementById("mode-schedule"),
  scheduleDatetimeRow: document.getElementById("schedule-datetime-row"),
  scheduleDatetime: document.getElementById("schedule-datetime"),
  btnBack: document.getElementById("btn-back"),
  btnRegenerate: document.getElementById("btn-regenerate"),
  btnSubmit: document.getElementById("btn-submit"),
  previewError: document.getElementById("preview-error"),
  previewSuccess: document.getElementById("preview-success"),

  btnRefreshSchedule: document.getElementById("btn-refresh-schedule"),
  scheduleList: document.getElementById("schedule-list"),
  scheduleError: document.getElementById("schedule-error"),
  rebalanceAccount: document.getElementById("rebalance-account"),
  rebalanceKind: document.getElementById("rebalance-kind"),
  rebalanceTimes: document.getElementById("rebalance-times"),
  btnRebalanceApply: document.getElementById("btn-rebalance-apply"),
  rebalanceResult: document.getElementById("rebalance-result"),
  rebalanceError: document.getElementById("rebalance-error"),
  groupFilter: document.getElementById("group-filter"),
  calendarLegend: document.getElementById("calendar-legend"),
  calendarView: document.getElementById("calendar-view"),
  calendarGrid: document.getElementById("calendar-grid"),
  calMonthLabel: document.getElementById("cal-month-label"),
  calPrev: document.getElementById("cal-prev"),
  calNext: document.getElementById("cal-next"),
  calToday: document.getElementById("cal-today"),
  viewCalendarBtn: document.getElementById("view-calendar-btn"),
  viewListBtn: document.getElementById("view-list-btn"),
  dayDetail: document.getElementById("day-detail"),

  newAccountLabel: document.getElementById("new-account-label"),
  newAccountUserId: document.getElementById("new-account-userid"),
  newAccountToken: document.getElementById("new-account-token"),
  btnOauthConnect: document.getElementById("btn-oauth-connect"),
  oauthStatus: document.getElementById("oauth-status"),
  btnLookupUserId: document.getElementById("btn-lookup-userid"),
  typeSajuBtn: document.getElementById("type-saju-btn"),
  typePartnersBtn: document.getElementById("type-partners-btn"),
  sajuFields: document.getElementById("saju-fields"),
  partnersFields: document.getElementById("partners-fields"),
  personaTemplateSelect: document.getElementById("persona-template-select"),
  personaSpeechLevel: document.getElementById("persona-speech-level"),
  personaCategories: document.getElementById("persona-categories"),
  personaStyleGuide: document.getElementById("persona-style-guide"),
  personaCta: document.getElementById("persona-cta"),
  personaClosing: document.getElementById("persona-closing"),
  personaReference: document.getElementById("persona-reference"),
  partnersTemplateSelect: document.getElementById("partners-template-select"),
  partnersCategories: document.getElementById("partners-categories"),
  partnersStyleGuide: document.getElementById("partners-style-guide"),
  partnersDisclosure: document.getElementById("partners-disclosure"),
  btnAddAccount: document.getElementById("btn-add-account"),
  accountFormError: document.getElementById("account-form-error"),
  accountList: document.getElementById("account-list"),
  btnRefreshTokens: document.getElementById("btn-refresh-tokens"),
  refreshTokensStatus: document.getElementById("refresh-tokens-status"),

  loadingOverlay: document.getElementById("loading-overlay"),
  loadingText: document.getElementById("loading-text"),
};

function showLoading(text) {
  el.loadingText.textContent = text;
  el.loadingOverlay.classList.remove("hidden");
}
function hideLoading() {
  el.loadingOverlay.classList.add("hidden");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

// ================= 탭 전환 =================
function switchTab(tabName) {
  el.tabButtons.forEach((btn) => btn.classList.toggle("selected", btn.dataset.tab === tabName));
  Object.entries(el.tabPanels).forEach(([name, panel]) => {
    panel.classList.toggle("hidden", name !== tabName);
  });
  if (tabName === "schedule") loadSchedule();
  if (tabName === "instagram" && window.loadInstagramDashboard) window.loadInstagramDashboard();
  if (tabName === "accounts") renderAccountList();
  if (tabName === "ops") loadOps();
}

// ================= 관제탑 =================
const OPS_GRADIENTS = ["ops-grad-accent", "ops-grad-success", "ops-grad-saju", "ops-grad-partners"];

async function loadOps() {
  const genAt = document.getElementById("ops-generated-at");
  genAt.textContent = "불러오는 중...";
  try {
    const res = await fetch("/api/ops/summary");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "관제탑 데이터를 불러오지 못했습니다.");
    renderOps(data);
  } catch (err) {
    genAt.textContent = "불러오기 실패: " + err.message;
  }
}

function renderOps(data) {
  const gen = new Date(data.generatedAt);
  document.getElementById("ops-generated-at").textContent =
    `${gen.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" })} ${gen.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })} 기준 · 전체 ${data.totalPosts}건`;

  const stats = [
    { label: "예약 대기", value: data.totalScheduled, grad: "ops-grad-accent" },
    { label: "이번 주 발행 예정", value: data.dueThisWeek, grad: "ops-grad-success" },
    { label: "발행 완료", value: data.totalPublished, grad: "ops-grad-saju" },
    { label: "실패", value: data.totalFailed, grad: data.totalFailed > 0 ? "ops-grad-danger" : "ops-grad-partners" },
  ];
  document.getElementById("ops-stat-grid").innerHTML = stats
    .map(
      (s) => `<div class="ops-stat-card ${s.grad}">
        <div class="ops-stat-label">${escapeHtml(s.label)}</div>
        <div class="ops-stat-value">${s.value}<span class="ops-stat-unit">건</span></div>
      </div>`
    )
    .join("");

  document.getElementById("ops-insight-text").textContent = data.insight;

  const quicks = [
    { icon: "✍️", label: "글쓰기", grad: "ops-grad-accent", action: () => switchTab("compose") },
    { icon: "🗓️", label: "예약 목록", grad: "ops-grad-success", action: () => switchTab("schedule") },
    { icon: "🖼️", label: "Instagram 운세", grad: "ops-grad-instagram", action: () => switchTab("instagram") },
    { icon: "👥", label: "계정 관리", grad: "ops-grad-saju", action: () => switchTab("accounts") },
    { icon: "🔭", label: "벤치마크 채널", grad: "ops-grad-partners", action: () => window.open("https://www.threads.com/@taebaek_saju", "_blank") },
    { icon: "🐙", label: "GitHub 저장소", grad: "ops-grad-danger", action: () => window.open("https://github.com/holybullyshit-design/threads-auto-publisher", "_blank") },
  ];
  const quickGrid = document.getElementById("ops-quick-grid");
  quickGrid.innerHTML = "";
  quicks.forEach((q) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `ops-quick-tile ${q.grad}`;
    btn.innerHTML = `<span class="ops-quick-icon">${q.icon}</span><span class="ops-quick-label">${escapeHtml(q.label)}</span>`;
    btn.addEventListener("click", q.action);
    quickGrid.appendChild(btn);
  });

  document.getElementById("ops-account-list").innerHTML = data.accounts
    .map((a, i) => {
      const grad = OPS_GRADIENTS[i % OPS_GRADIENTS.length];
      const failedBit = a.failed > 0 ? `<span class="status-badge status-failed">실패 ${a.failed}</span>` : "";
      return `<div class="ops-account-row">
        <span class="ops-account-dot ${grad}"></span>
        <span class="ops-account-name">${escapeHtml(a.label)}</span>
        <span class="ops-account-platforms">${a.platforms.map((p) => `<span class="meta-badge">${escapeHtml(p)}</span>`).join("")}</span>
        <span class="ops-account-nums">발행 ${a.published} · 예약 ${a.scheduled}</span>
        ${failedBit}
      </div>`;
    })
    .join("") || `<p class="hint-text">계정이 없습니다.</p>`;

  document.getElementById("ops-queue-list").innerHTML = data.queue
    .map(
      (q) => `<div class="ops-queue-row">
        <span class="ops-queue-time">${q.time}<span class="ops-queue-day">${q.day}</span></span>
        <span class="ops-queue-acct">${escapeHtml(q.account)}</span>
        <span class="ops-queue-text">${escapeHtml(q.text)}</span>
      </div>`
    )
    .join("") || `<p class="hint-text">예약된 게시물이 없습니다.</p>`;

  document.getElementById("ops-benchmark-log").innerHTML =
    data.benchmarkLog.length > 0
      ? data.benchmarkLog
          .map(
            (e) => `<div class="ops-log-entry">
              <div class="ops-log-date">${escapeHtml(e.date || "")}</div>
              <ul>${(e.findings || []).map((f) => `<li>${escapeHtml(f)}</li>`).join("")}</ul>
            </div>`
          )
          .join("")
      : `<p class="hint-text">아직 기록이 없습니다 — 다음 월요일 벤치마크 점검 후 첫 기록이 남습니다. 다음 실행: ${escapeHtml(data.nextMonday)}</p>`;

  document.getElementById("ops-growth-log").innerHTML =
    data.growthLog.length > 0
      ? data.growthLog
          .map(
            (e) => `<div class="ops-log-entry">
              <div class="ops-log-date">${escapeHtml(e.date || "")}</div>
              <ul>${(e.findings || []).map((f) => `<li>${escapeHtml(f)}</li>`).join("")}</ul>
            </div>`
          )
          .join("")
      : `<p class="hint-text">아직 기록이 없습니다 — 매주 성장 리서치 작업이 실행되면 여기 쌓입니다.</p>`;
}

el.tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

// ================= 계정 셀렉트 & 카테고리 (글쓰기 탭) =================
function currentAccount() {
  return state.accounts.find((a) => a.id === state.selectedAccountId) || null;
}

// 사주 계정은 persona.categories, 파트너스 계정은 partnersProfile.categories 를 쓴다.
function getAccountCategories(acc) {
  if (!acc) return [];
  return acc.type === "partners" ? acc.partnersProfile.categories : acc.persona.categories;
}

function renderAccountSelect() {
  el.accountSelect.innerHTML = "";
  if (state.accounts.length === 0) {
    el.noAccountHint.classList.remove("hidden");
    el.accountPersonaHint.textContent = "";
    el.accountSelect.disabled = true;
    state.selectedAccountId = null;
    renderCategoryOptions();
    return;
  }
  el.noAccountHint.classList.add("hidden");
  el.accountSelect.disabled = false;

  const groups = {
    saju: { label: "🔮 사주", el: document.createElement("optgroup") },
    partners: { label: "🛒 파트너스", el: document.createElement("optgroup") },
  };
  groups.saju.el.label = groups.saju.label;
  groups.partners.el.label = groups.partners.label;

  state.accounts.forEach((acc) => {
    const opt = document.createElement("option");
    opt.value = acc.id;
    opt.textContent = acc.label;
    groups[acc.type === "partners" ? "partners" : "saju"].el.appendChild(opt);
  });

  [groups.saju, groups.partners].forEach((g) => {
    if (g.el.children.length > 0) el.accountSelect.appendChild(g.el);
  });

  if (!state.selectedAccountId || !state.accounts.some((a) => a.id === state.selectedAccountId)) {
    state.selectedAccountId = state.accounts[0].id;
    state.selectedCategoryId = null;
  }
  el.accountSelect.value = state.selectedAccountId;
  renderAccountPersonaHint();
  renderCategoryOptions();
  renderRebalanceAccountOptions();
}

function renderRebalanceAccountOptions() {
  const prev = el.rebalanceAccount.value;
  el.rebalanceAccount.innerHTML = "";
  state.accounts.forEach((acc) => {
    const opt = document.createElement("option");
    opt.value = acc.id;
    opt.textContent = `${acc.type === "partners" ? "🛒" : "🔮"} ${acc.label}`;
    el.rebalanceAccount.appendChild(opt);
  });
  if (prev && state.accounts.some((a) => a.id === prev)) {
    el.rebalanceAccount.value = prev;
  } else if (state.selectedAccountId) {
    el.rebalanceAccount.value = state.selectedAccountId;
  }
}

function renderAccountPersonaHint() {
  const acc = currentAccount();
  if (!acc) {
    el.accountPersonaHint.textContent = "";
    return;
  }
  if (acc.type === "partners") {
    const p = acc.partnersProfile;
    el.accountPersonaHint.textContent = `파트너스 · 니치 ${p.categories.length}개`;
    el.categorySectionLabel.textContent = "니치 카테고리";
    el.partnersModeToggle.classList.remove("hidden");
    setContentMode("product");
  } else {
    const p = acc.persona;
    el.accountPersonaHint.textContent = `${p.speechLevel} · 카테고리 ${p.categories.length}개 · 클로징 "${p.closingLine || "(미설정)"}"`;
    el.categorySectionLabel.textContent = "글감 카테고리";
    el.partnersModeToggle.classList.add("hidden");
    el.partnersProductFields.classList.add("hidden");
    el.partnersLifestyleFields.classList.add("hidden");
    el.productCategoryCard.classList.remove("hidden");
  }
}

// ================= 파트너스: 콘텐츠 종류(제품 홍보 / 일상글) 전환 =================
function setContentMode(mode) {
  state.contentMode = mode;
  el.modeProductBtn.classList.toggle("selected", mode === "product");
  el.modeLifestyleBtn.classList.toggle("selected", mode === "lifestyle");

  const isLifestyle = mode === "lifestyle";
  el.productCategoryCard.classList.toggle("hidden", isLifestyle);
  el.partnersProductFields.classList.toggle("hidden", isLifestyle);
  el.partnersLifestyleFields.classList.toggle("hidden", !isLifestyle);

  if (isLifestyle) {
    renderLifestyleCategoryOptions();
  } else {
    renderCategoryOptions();
  }
  updateGenerateButtonState();
}

function renderLifestyleCategoryOptions() {
  el.lifestyleCategoryOptions.innerHTML = "";
  if (!state.selectedLifestyleCategoryId && state.lifestyleCategories.length) {
    state.selectedLifestyleCategoryId = state.lifestyleCategories[0].id;
  }
  state.lifestyleCategories.forEach((item) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "option-btn" + (item.id === state.selectedLifestyleCategoryId ? " selected" : "");
    btn.innerHTML = `<span class="opt-label">${escapeHtml(item.label)}</span><span class="opt-desc">${escapeHtml(item.description || "")}</span>`;
    btn.addEventListener("click", () => {
      state.selectedLifestyleCategoryId = item.id;
      renderLifestyleCategoryOptions();
    });
    el.lifestyleCategoryOptions.appendChild(btn);
  });
  updateGenerateButtonState();
}

el.modeProductBtn.addEventListener("click", () => setContentMode("product"));
el.modeLifestyleBtn.addEventListener("click", () => setContentMode("lifestyle"));

async function loadLifestylePresets() {
  const res = await fetch("/api/lifestyle-presets");
  const data = await res.json();
  state.lifestyleCategories = data.categories || [];
}

function renderCategoryOptions() {
  const acc = currentAccount();
  el.categoryOptions.innerHTML = "";
  const categories = getAccountCategories(acc);

  if (!state.selectedCategoryId || !categories.some((c) => c.id === state.selectedCategoryId)) {
    state.selectedCategoryId = categories[0]?.id || null;
  }

  categories.forEach((item) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "option-btn" + (item.id === state.selectedCategoryId ? " selected" : "");
    btn.innerHTML = `<span class="opt-label">${escapeHtml(item.label)}</span><span class="opt-desc">${escapeHtml(item.description || "")}</span>`;
    btn.addEventListener("click", () => {
      state.selectedCategoryId = item.id;
      renderCategoryOptions();
    });
    el.categoryOptions.appendChild(btn);
  });

  updateGenerateButtonState();
}

function updateGenerateButtonState() {
  const acc = currentAccount();
  const isPartners = acc && acc.type === "partners";
  const isLifestyle = isPartners && state.contentMode === "lifestyle";

  let ready;
  if (isLifestyle) {
    ready = Boolean(state.selectedAccountId && state.selectedLifestyleCategoryId);
  } else if (isPartners) {
    const imageUploadPending = state.extraImages.some((img) => img.status === "uploading");
    ready = Boolean(state.selectedAccountId && state.selectedCategoryId && state.selectedProduct && !imageUploadPending);
  } else {
    ready = Boolean(state.selectedAccountId && state.selectedCategoryId);
  }
  el.btnGenerate.disabled = !ready;
  el.btnManual.disabled = !state.selectedAccountId;
}

el.accountSelect.addEventListener("change", () => {
  state.selectedAccountId = el.accountSelect.value;
  state.selectedCategoryId = null;
  state.selectedLifestyleCategoryId = null;
  clearSelectedProduct();
  renderAccountPersonaHint(); // partners 계정이면 이 안에서 setContentMode("product")까지 처리됨
  renderCategoryOptions();
});

// ================= 파트너스: 상품 검색 / 선택 =================

function clearSelectedProduct() {
  state.selectedProduct = null;
  state.productSearchResults = [];
  el.productSearchResults.innerHTML = "";
  el.keywordSuggestions.classList.add("hidden");
  el.selectedProductBox.classList.add("hidden");
  clearExtraImages();
  clearExternalImageResults();
  updateGenerateButtonState();
}

async function searchProducts(keywordOverride) {
  const keyword = (keywordOverride ?? el.productSearchKeyword.value).trim();
  el.productSearchError.textContent = "";
  if (!keyword) {
    el.productSearchError.textContent = "검색할 상품명(키워드)을 입력해주세요.";
    return;
  }
  el.productSearchKeyword.value = keyword;

  const acc = currentAccount();
  const categories = getAccountCategories(acc);
  const categoryLabel = categories.find((c) => c.id === state.selectedCategoryId)?.label || "";

  el.btnProductSearch.disabled = true;
  el.btnProductSearch.textContent = "검색 중...";
  el.keywordSuggestions.classList.add("hidden"); // 이전 검색의 추천어가 남아있지 않게
  try {
    const res = await fetch("/api/partners/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword, limit: 10 }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "검색에 실패했습니다.");
    state.productSearchResults = data.products || [];
    renderProductResults();
    fetchKeywordSuggestions(keyword, categoryLabel); // 결과 기다리게 하지 않고 따로, 늦게 채워짐
  } catch (err) {
    el.productSearchError.textContent = err.message;
  } finally {
    el.btnProductSearch.disabled = false;
    el.btnProductSearch.textContent = "🔍 검색";
  }
}

// 연관 검색어는 AI 호출이라 몇 초 걸린다 — 상품 검색 결과를 기다리게 하지 않고,
// 검색창에 그 키워드가 여전히 남아있을 때만(사용자가 다른 검색으로 넘어가지 않았을 때만) 채운다.
let keywordSuggestionsRequestId = 0;
async function fetchKeywordSuggestions(keyword, categoryLabel) {
  const requestId = ++keywordSuggestionsRequestId;
  try {
    const res = await fetch("/api/partners/keyword-suggestions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword, categoryLabel }),
    });
    const data = await res.json();
    if (!res.ok || requestId !== keywordSuggestionsRequestId) return; // 그새 다른 검색으로 넘어갔으면 버림
    renderKeywordSuggestions(data.suggestedKeywords || []);
  } catch {
    // 추천어는 부가 기능이라 실패해도 조용히 넘어간다 (검색 결과 자체엔 지장 없음)
  }
}

function renderKeywordSuggestions(suggestions) {
  el.keywordSuggestions.innerHTML = "";
  if (!suggestions.length) {
    el.keywordSuggestions.classList.add("hidden");
    return;
  }
  const label = document.createElement("div");
  label.className = "suggestion-label";
  label.textContent = "결과가 10개뿐인가요? 이런 검색어도 있어요 — 눌러서 다시 검색";
  el.keywordSuggestions.appendChild(label);

  suggestions.forEach((word) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "keyword-chip";
    chip.textContent = word;
    chip.addEventListener("click", () => searchProducts(word));
    el.keywordSuggestions.appendChild(chip);
  });
  el.keywordSuggestions.classList.remove("hidden");
}

function renderProductResults() {
  el.productSearchResults.innerHTML = "";
  state.productSearchResults.forEach((product) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "product-result-card";
    card.innerHTML = `
      <img src="${escapeHtml(product.productImage)}" alt="" loading="lazy" />
      <div class="product-result-name">${escapeHtml(product.productName)}</div>
      <div class="product-result-price">${product.productPrice.toLocaleString("ko-KR")}원</div>
    `;
    card.addEventListener("click", () => selectProduct(product));
    el.productSearchResults.appendChild(card);
  });
}

function selectProduct(product) {
  state.selectedProduct = product;
  el.selectedProductThumb.src = product.productImage;
  el.selectedProductName.textContent = product.productName;
  el.selectedProductPrice.textContent = `${product.productPrice.toLocaleString("ko-KR")}원`;
  el.selectedProductLink.href = product.productUrl;
  el.selectedProductBox.classList.remove("hidden");
  el.productSearchResults.innerHTML = "";
  clearExternalImageResults(); // 상품이 바뀌었으니 이전 상품의 검색 후보는 지운다
  el.keywordSuggestions.classList.add("hidden");
  updateGenerateButtonState();
}

// ================= 파트너스: 캡처 이미지 끌어다 놓기 / 붙여넣기 =================
const MAX_EXTRA_IMAGES = 3; // AI 이미지 생성을 끄고 직접 업로드만 쓰기로 함(2026-08-24) — 2~3장

function clearExtraImages() {
  state.extraImages.forEach((img) => img.previewUrl && URL.revokeObjectURL(img.previewUrl));
  state.extraImages = [];
  renderExtraImages();
}

function renderExtraImages() {
  el.extraImagesPreview.innerHTML = "";
  state.extraImages.forEach((img) => {
    const chip = document.createElement("div");
    chip.className = "extra-image-chip" + (img.status === "uploading" ? " uploading" : "");
    chip.innerHTML = `<img src="${img.url || img.previewUrl}" alt="" />`;
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "remove-chip";
    removeBtn.textContent = "×";
    removeBtn.addEventListener("click", () => removeExtraImage(img.id));
    chip.appendChild(removeBtn);
    el.extraImagesPreview.appendChild(chip);
  });
  updateGenerateButtonState();
}

function removeExtraImage(id) {
  const img = state.extraImages.find((i) => i.id === id);
  if (img?.previewUrl) URL.revokeObjectURL(img.previewUrl);
  state.extraImages = state.extraImages.filter((i) => i.id !== id);
  renderExtraImages();
}

async function uploadExtraImageFile(file) {
  el.imageUploadError.textContent = "";
  if (!file.type.startsWith("image/")) return;
  const remaining = MAX_EXTRA_IMAGES - state.extraImages.length;
  if (remaining <= 0) {
    el.imageUploadError.textContent = `이미지는 최대 ${MAX_EXTRA_IMAGES}장까지 추가할 수 있어요.`;
    return;
  }

  const id = crypto.randomUUID();
  const previewUrl = URL.createObjectURL(file);
  state.extraImages.push({ id, previewUrl, url: null, status: "uploading" });
  renderExtraImages();
  updateGenerateButtonState();

  try {
    const imageBase64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const res = await fetch("/api/partners/upload-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64 }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "이미지 업로드에 실패했습니다.");

    const entry = state.extraImages.find((i) => i.id === id);
    if (entry) {
      entry.url = data.url;
      entry.status = "done";
      renderExtraImages();
      updateGenerateButtonState();
    }
  } catch (err) {
    el.imageUploadError.textContent = err.message;
    removeExtraImage(id);
    updateGenerateButtonState();
  }
}

function handleFiles(fileList) {
  const remaining = MAX_EXTRA_IMAGES - state.extraImages.length;
  Array.from(fileList)
    .slice(0, remaining)
    .forEach(uploadExtraImageFile);
}

el.imageDropzone.addEventListener("click", () => el.imageFileInput.click());
el.imageFileInput.addEventListener("change", (e) => {
  handleFiles(e.target.files);
  e.target.value = ""; // 같은 파일 다시 선택해도 change가 다시 뜨도록
});
el.imageDropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  el.imageDropzone.classList.add("dragover");
});
el.imageDropzone.addEventListener("dragleave", () => {
  el.imageDropzone.classList.remove("dragover");
});
el.imageDropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  el.imageDropzone.classList.remove("dragover");
  handleFiles(e.dataTransfer.files);
});
el.imageDropzone.addEventListener("paste", (e) => {
  const items = Array.from(e.clipboardData?.items || []);
  const files = items.filter((it) => it.kind === "file" && it.type.startsWith("image/")).map((it) => it.getAsFile());
  if (files.length > 0) {
    e.preventDefault();
    handleFiles(files);
  }
});

// ================= 파트너스: 다른 사이트에서 같은 상품 사진 후보 찾기 (구글 이미지 검색) =================
// 자동으로 아무거나 골라서 쓰지 않는다 — 후보만 보여주고, 클릭해서 고르는 건 항상 사람이 한다.
function clearExternalImageResults() {
  el.externalImagesResults.innerHTML = "";
  el.externalImagesHint.classList.add("hidden");
  el.externalImagesError.textContent = "";
}

async function searchExternalImages() {
  const keyword = state.selectedProduct?.productName;
  el.externalImagesError.textContent = "";
  if (!keyword) {
    el.externalImagesError.textContent = "먼저 상품을 검색해서 선택해주세요.";
    return;
  }

  el.btnSearchExternalImages.disabled = true;
  el.btnSearchExternalImages.textContent = "찾는 중...";
  try {
    const res = await fetch(`/api/partners/search-external-images?keyword=${encodeURIComponent(keyword)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "검색에 실패했습니다.");
    renderExternalImageResults(data.results || []);
  } catch (err) {
    el.externalImagesError.textContent = err.message;
  } finally {
    el.btnSearchExternalImages.disabled = false;
    el.btnSearchExternalImages.textContent = "🔎 다른 사이트에서 같은 상품 사진 찾기";
  }
}

function renderExternalImageResults(results) {
  el.externalImagesResults.innerHTML = "";
  if (results.length === 0) {
    el.externalImagesError.textContent = "검색 결과가 없어요.";
    el.externalImagesHint.classList.add("hidden");
    return;
  }
  el.externalImagesHint.classList.remove("hidden");
  results.forEach((item) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "external-image-candidate";
    btn.innerHTML = `<img src="${escapeHtml(item.image)}" alt="" loading="lazy" /><span class="mall-name">${escapeHtml(item.mallName || "")}</span>`;
    btn.addEventListener("click", () => importExternalImage(item.image, btn));
    el.externalImagesResults.appendChild(btn);
  });
}

async function importExternalImage(imageUrl, buttonEl) {
  el.externalImagesError.textContent = "";
  const remaining = MAX_EXTRA_IMAGES - state.extraImages.length;
  if (remaining <= 0) {
    el.externalImagesError.textContent = `이미지는 최대 ${MAX_EXTRA_IMAGES}장까지 추가할 수 있어요.`;
    return;
  }
  if (buttonEl.classList.contains("imported")) return; // 같은 후보 중복 클릭 방지

  const id = crypto.randomUUID();
  state.extraImages.push({ id, previewUrl: imageUrl, url: null, status: "uploading" });
  renderExtraImages();
  buttonEl.classList.add("imported");

  try {
    const res = await fetch("/api/partners/import-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageUrl }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "이미지를 가져오지 못했습니다.");
    const entry = state.extraImages.find((i) => i.id === id);
    if (entry) {
      entry.url = data.url;
      entry.status = "done";
      renderExtraImages();
    }
  } catch (err) {
    el.externalImagesError.textContent = err.message;
    removeExtraImage(id);
    buttonEl.classList.remove("imported");
  }
}

el.btnSearchExternalImages.addEventListener("click", searchExternalImages);

el.btnProductSearch.addEventListener("click", () => searchProducts());
el.productSearchKeyword.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    searchProducts();
  }
});
el.btnClearProduct.addEventListener("click", clearSelectedProduct);

// ================= 초기 데이터 로드 =================
async function loadMeta() {
  const res = await fetch("/api/meta");
  const data = await res.json();
  state.maxTextLength = data.maxTextLength;
  state.threadsOAuthConfigured = data.threadsOAuthConfigured;
  state.externalImageSearchConfigured = data.externalImageSearchConfigured;
  el.btnSearchExternalImages.classList.toggle("hidden", !state.externalImageSearchConfigured);
}

async function loadAccounts() {
  const res = await fetch("/api/accounts");
  const data = await res.json();
  state.accounts = data.accounts;
  renderAccountSelect();
}

async function loadPersonaPresets() {
  const res = await fetch("/api/persona-presets");
  const data = await res.json();
  state.personaPresets = data.presets;
  el.personaTemplateSelect.innerHTML = "";
  Object.entries(state.personaPresets).forEach(([key, preset]) => {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = preset.name;
    el.personaTemplateSelect.appendChild(opt);
  });
  applyPersonaTemplate(el.personaTemplateSelect.value);
}

function categoriesToText(categories) {
  return categories.map((c) => `${c.label}|${c.description || ""}`).join("\n");
}

function applyPersonaTemplate(key) {
  const preset = state.personaPresets[key];
  if (!preset) return;
  el.personaSpeechLevel.value = preset.speechLevel;
  el.personaCategories.value = categoriesToText(preset.categories);
  el.personaStyleGuide.value = preset.styleGuide;
  el.personaCta.value = preset.ctaInstruction;
  el.personaClosing.value = preset.closingLine;
  el.personaReference.value = preset.referenceExample;
}

el.personaTemplateSelect.addEventListener("change", () => {
  applyPersonaTemplate(el.personaTemplateSelect.value);
});

async function loadPartnersPresets() {
  const res = await fetch("/api/partners-presets");
  const data = await res.json();
  state.partnersPresets = data.presets;
  el.partnersTemplateSelect.innerHTML = "";
  Object.entries(state.partnersPresets).forEach(([key, preset]) => {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = preset.name;
    el.partnersTemplateSelect.appendChild(opt);
  });
  applyPartnersTemplate(el.partnersTemplateSelect.value);
}

function applyPartnersTemplate(key) {
  const preset = state.partnersPresets[key];
  if (!preset) return;
  el.partnersCategories.value = categoriesToText(preset.categories);
  el.partnersStyleGuide.value = preset.styleGuide;
  el.partnersDisclosure.value =
    "이 게시물은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.";
}

el.partnersTemplateSelect.addEventListener("change", () => {
  applyPartnersTemplate(el.partnersTemplateSelect.value);
});

// ================= 계정 추가 폼: 카테고리(사주/파트너스) 토글 =================
function setNewAccountType(type) {
  state.newAccountType = type;
  el.typeSajuBtn.classList.toggle("selected", type === "saju");
  el.typePartnersBtn.classList.toggle("selected", type === "partners");
  el.sajuFields.classList.toggle("hidden", type !== "saju");
  el.partnersFields.classList.toggle("hidden", type !== "partners");
}

el.typeSajuBtn.addEventListener("click", () => setNewAccountType("saju"));
el.typePartnersBtn.addEventListener("click", () => setNewAccountType("partners"));

// ================= 초안 생성 =================
function slugify(label, index) {
  const base = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || `category-${index}`;
}

function parseCategoriesText(text) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, i) => {
      const [label, description = ""] = line.split("|").map((s) => s.trim());
      return { id: slugify(label, i), label, description };
    });
}

async function generateDraft() {
  el.settingsError.textContent = "";
  const acc = currentAccount();
  const isPartners = acc?.type === "partners";
  const isLifestyle = isPartners && state.contentMode === "lifestyle";

  state.currentImages = [];
  state.currentReplyText = "";

  if (isLifestyle) {
    if (!state.selectedAccountId || !state.selectedLifestyleCategoryId) return;
    showLoading("일상글 초안을 쓰고 있어요...");
    try {
      const res = await fetch("/api/partners/lifestyle-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: state.selectedAccountId,
          categoryId: state.selectedLifestyleCategoryId,
          topicNote: el.lifestyleTopicNote.value.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "초안 생성에 실패했습니다.");

      el.draftText.value = data.draft;
      el.previewMeta.textContent = `${acc?.label || ""} · 일상글 · ${data.category.label}`;
      renderPreviewImages();
      updateCharCount();
      setPublishMode("now");
      switchToPreview();
    } catch (err) {
      el.settingsError.textContent = err.message;
    } finally {
      hideLoading();
    }
    return;
  }

  if (!state.selectedAccountId || !state.selectedCategoryId) return;
  if (isPartners && !state.selectedProduct) return;

  if (isPartners) {
    // 파트너스: 검색으로 고른 상품 + (선택)끌어다 놓은 추가 이미지 → 초안을 한 번에 준비
    const extraImageUrls = state.extraImages
      .filter((img) => img.status === "done" && img.url)
      .map((img) => img.url);

    showLoading("상품 이미지를 1:1로 가공하고, 초안을 쓰고 있어요...");
    try {
      const res = await fetch("/api/partners/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: state.selectedAccountId,
          categoryId: state.selectedCategoryId,
          product: state.selectedProduct,
          extraImageUrls,
          productNote: el.productNote.value.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "준비에 실패했습니다.");

      el.draftText.value = data.draftText;
      el.previewMeta.textContent = `${acc?.label || ""} · ${data.category.label}`;
      state.currentImages = data.images || [];
      state.currentReplyText = data.replyText || data.affiliateLink || "";
      renderPreviewImages();
      updateCharCount();
      setPublishMode("now");
      switchToPreview();
    } catch (err) {
      el.settingsError.textContent = err.message;
    } finally {
      hideLoading();
    }
    return;
  }

  showLoading("초안을 생성하고 있어요 (이 채널의 목소리로)...");
  try {
    const body = { accountId: state.selectedAccountId, categoryId: state.selectedCategoryId };
    const res = await fetch("/api/draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "초안 생성에 실패했습니다.");

    el.draftText.value = data.draft;
    el.previewMeta.textContent = `${acc?.label || ""} · ${data.category.label}`;
    renderPreviewImages();
    updateCharCount();
    setPublishMode("now");
    switchToPreview();
  } catch (err) {
    el.settingsError.textContent = err.message;
  } finally {
    hideLoading();
  }
}

function startManualEntry() {
  el.settingsError.textContent = "";
  if (!state.selectedAccountId) return;

  const acc = currentAccount();
  const categories = getAccountCategories(acc);
  const category = categories.find((c) => c.id === state.selectedCategoryId);

  el.draftText.value = "";
  el.previewMeta.textContent = `${acc?.label || ""} · 직접 작성${category ? " · " + category.label : ""}`;
  // 직접 작성 모드에서는 (검색으로 골랐던 상품이 있어도) 이미지는 비워서 시작 — 텍스트만 순수하게 작성
  state.currentImages = [];
  state.currentReplyText = "";
  renderPreviewImages();
  updateCharCount();
  setPublishMode("now");
  switchToPreview();
  el.draftText.focus();
}

// 미리보기 화면에 준비된 이미지들(이미 공개 호스팅된 1:1 URL)을 썸네일로 보여준다.
function renderPreviewImages() {
  el.previewImages.innerHTML = "";
  if (state.currentImages.length > 0) {
    state.currentImages.forEach((url) => {
      const img = document.createElement("img");
      img.src = url;
      img.alt = "게시될 이미지";
      el.previewImages.appendChild(img);
    });
    el.previewImages.classList.remove("hidden");
  } else {
    el.previewImages.classList.add("hidden");
  }

  if (state.currentReplyText) {
    el.previewReplyHint.innerHTML =
      `💬 게시 직후 아래 내용이 <b>답글</b>로 자동 게시됩니다:<br>` +
      `<span class="reply-preview-box">${escapeHtml(state.currentReplyText)}</span>`;
    el.previewReplyHint.classList.remove("hidden");
  } else {
    el.previewReplyHint.classList.add("hidden");
  }
}

async function polishDraft() {
  el.previewError.textContent = "";
  el.previewSuccess.textContent = "";
  showLoading("이 채널 톤으로 다듬고 있어요...");
  try {
    const res = await fetch("/api/polish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accountId: state.selectedAccountId,
        text: el.draftText.value,
        categoryId: state.selectedCategoryId,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "다듬기에 실패했습니다.");
    el.draftText.value = data.rewritten;
    updateCharCount();
  } catch (err) {
    el.previewError.textContent = err.message;
  } finally {
    hideLoading();
  }
}

function updateCharCount() {
  const len = el.draftText.value.length;
  el.charCount.textContent = `${len} / ${state.maxTextLength}자`;
  el.charCount.classList.toggle("over-limit", len > state.maxTextLength);
}

function switchToPreview() {
  el.screenSettings.classList.add("hidden");
  el.screenPreview.classList.remove("hidden");
  el.previewError.textContent = "";
  el.previewSuccess.textContent = "";
}

function switchToSettings() {
  el.screenPreview.classList.add("hidden");
  el.screenSettings.classList.remove("hidden");
}

// ================= 발행 방식 (지금 / 예약) =================
function setPublishMode(mode) {
  state.publishMode = mode;
  el.modeNow.classList.toggle("selected", mode === "now");
  el.modeSchedule.classList.toggle("selected", mode === "schedule");
  el.scheduleDatetimeRow.classList.toggle("hidden", mode !== "schedule");
  el.btnSubmit.textContent = mode === "now" ? "스레드에 게시" : "예약 등록";

  if (mode === "schedule" && !el.scheduleDatetime.value) {
    const d = new Date(Date.now() + 60 * 60 * 1000); // 기본값: 1시간 뒤
    d.setSeconds(0, 0);
    const tzOffset = d.getTimezoneOffset() * 60000;
    el.scheduleDatetime.value = new Date(d - tzOffset).toISOString().slice(0, 16);
  }
}

el.modeNow.addEventListener("click", () => setPublishMode("now"));
el.modeSchedule.addEventListener("click", () => setPublishMode("schedule"));

async function submitPost() {
  el.previewError.textContent = "";
  el.previewSuccess.textContent = "";

  const text = el.draftText.value.trim();
  if (!text) {
    el.previewError.textContent = "게시할 내용이 비어 있습니다.";
    return;
  }
  if (text.length > state.maxTextLength) {
    el.previewError.textContent = `글자 수 제한(${state.maxTextLength}자)을 초과했습니다.`;
    return;
  }

  if (state.publishMode === "now") {
    const confirmed = window.confirm("이 내용을 실제로 Threads에 지금 게시할까요?\n게시 후에는 앱에서 취소할 수 없습니다.");
    if (!confirmed) return;

    showLoading("Threads에 게시하고 있어요...");
    try {
      const res = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          accountId: state.selectedAccountId,
          images: state.currentImages,
          replyText: state.currentReplyText,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "게시에 실패했습니다.");
      el.previewSuccess.textContent = data.reply
        ? `게시 완료! (게시물 ID: ${data.publishedId}) · 링크 답글도 자동으로 달았어요.`
        : `게시 완료! (게시물 ID: ${data.publishedId})`;
    } catch (err) {
      el.previewError.textContent = err.message;
    } finally {
      hideLoading();
    }
    return;
  }

  // 예약 발행
  const scheduledAtLocal = el.scheduleDatetime.value;
  if (!scheduledAtLocal) {
    el.previewError.textContent = "예약할 날짜/시간을 선택해주세요.";
    return;
  }
  const scheduledAt = new Date(scheduledAtLocal);
  if (scheduledAt.getTime() <= Date.now()) {
    el.previewError.textContent = "예약 시간은 현재보다 미래여야 합니다.";
    return;
  }

  showLoading("예약을 등록하고 있어요 (GitHub에 저장 중)...");
  try {
    const res = await fetch("/api/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accountId: state.selectedAccountId,
        text,
        scheduledAt: scheduledAt.toISOString(),
        images: state.currentImages,
        replyText: state.currentReplyText,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "예약 등록에 실패했습니다.");
    el.previewSuccess.textContent = `예약 완료! ${scheduledAt.toLocaleString("ko-KR")}에 자동 게시됩니다. ("예약 목록" 탭에서 확인 가능)`;
  } catch (err) {
    el.previewError.textContent = err.message;
  } finally {
    hideLoading();
  }
}

// ================= 예약 목록 탭 =================
const STATUS_LABEL = {
  scheduled: "예약됨",
  published: "게시완료",
  failed: "실패",
  canceled: "취소됨",
};

async function loadSchedule() {
  el.scheduleError.textContent = "";
  try {
    const res = await fetch("/api/schedule");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "예약 목록을 불러오지 못했습니다.");
    state.schedulePosts = data.posts;
    seedAccountColors();
    renderLegend();
    renderScheduleView();
  } catch (err) {
    el.scheduleError.textContent = err.message;
  }
}

function seedAccountColors() {
  // 계정 목록 순서대로 색을 먼저 배정해서, 범례/달력/목록에서 항상 같은 색이 나오게 한다.
  state.accounts.forEach((acc) => getAccountColor(acc.id));
  state.schedulePosts.forEach((p) => getAccountColor(p.accountId));
}

// 이 탭(예약 목록)은 스레드 전용이다 — Instagram 게시물은 별도 "Instagram 운세" 탭에서
// 관리하므로 여기서는 항상 제외한다. 스레드 안에서는 사주(3계정)/파트너스(1계정)가 섞여
// 헷갈릴 수 있어서, 그 둘만 전체/사주/파트너스로 걸러볼 수 있게 한다.
function getPostGroup(post) {
  const acc = state.accounts.find((a) => a.id === post.accountId);
  return acc && acc.type === "partners" ? "partners" : "saju";
}

const GROUP_LABEL = { saju: "🔮 사주", partners: "🛒 파트너스" };

function getThreadsSchedulePosts() {
  const threadsOnly = state.schedulePosts.filter((p) => p.platform !== "instagram");
  if (state.scheduleGroupFilter === "all") return threadsOnly;
  return threadsOnly.filter((p) => getPostGroup(p) === state.scheduleGroupFilter);
}

function renderLegend() {
  const seen = new Map();
  state.accounts.forEach((acc) => {
    if (acc.type === "partners" || acc.type === "saju" || !acc.type) {
      seen.set(acc.id, { label: acc.label, group: acc.type === "partners" ? "partners" : "saju" });
    }
  });
  state.schedulePosts
    .filter((p) => p.platform !== "instagram")
    .forEach((p) => {
      if (!seen.has(p.accountId)) seen.set(p.accountId, { label: p.accountLabel || "계정 미상", group: getPostGroup(p) });
    });

  const byGroup = { saju: [], partners: [] };
  seen.forEach((entry, accountId) => byGroup[entry.group].push({ accountId, ...entry }));

  el.calendarLegend.innerHTML = "";
  ["saju", "partners"].forEach((group) => {
    if (!byGroup[group].length) return;
    const row = document.createElement("div");
    row.className = "legend-group";
    row.innerHTML =
      `<span class="legend-group-title">${GROUP_LABEL[group]}</span>` +
      byGroup[group]
        .map(
          ({ accountId, label }) =>
            `<span class="legend-item"><span class="legend-dot" style="background:${getAccountColor(accountId)}"></span>${escapeHtml(label)}</span>`
        )
        .join("");
    el.calendarLegend.appendChild(row);
  });
}

function renderScheduleView() {
  const isCalendar = state.scheduleView === "calendar";
  el.calendarView.classList.toggle("hidden", !isCalendar);
  document.querySelector(".calendar-nav").classList.toggle("hidden", !isCalendar);
  el.scheduleList.classList.toggle("hidden", isCalendar);
  el.dayDetail.classList.toggle("hidden", !isCalendar || !state.selectedDay);

  if (isCalendar) {
    renderCalendar();
    if (state.selectedDay) renderDayDetail(state.selectedDay);
  } else {
    renderPostCards(el.scheduleList, sortByCreatedDesc(getThreadsSchedulePosts()), "이 구분에 해당하는 예약/게시 이력이 없습니다.");
  }
}

function sortByCreatedDesc(posts) {
  return posts.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function localDateKey(isoString) {
  const d = new Date(isoString);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function renderCalendar() {
  const year = state.calendarDate.getFullYear();
  const month = state.calendarDate.getMonth(); // 0-based
  el.calMonthLabel.textContent = `${year}년 ${month + 1}월`;

  const postsByDay = new Map();
  getThreadsSchedulePosts().forEach((p) => {
    const key = localDateKey(p.scheduledAt);
    if (!postsByDay.has(key)) postsByDay.set(key, []);
    postsByDay.get(key).push(p);
  });

  const firstOfMonth = new Date(year, month, 1);
  const startOffset = firstOfMonth.getDay(); // 0=일요일
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayKey = localDateKey(new Date().toISOString());

  el.calendarGrid.innerHTML = "";

  for (let i = 0; i < startOffset; i++) {
    const empty = document.createElement("div");
    empty.className = "calendar-day empty";
    el.calendarGrid.appendChild(empty);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const dayPosts = postsByDay.get(key) || [];

    const cell = document.createElement("div");
    cell.className = "calendar-day";
    if (key === todayKey) cell.classList.add("today");
    if (key === state.selectedDay) cell.classList.add("selected");

    const maxDots = 6;
    const dots = dayPosts
      .slice(0, maxDots)
      .map(
        (p) =>
          `<span class="calendar-dot status-${p.status}" style="background:${getAccountColor(p.accountId)}" title="${escapeHtml(p.accountLabel)} · ${STATUS_LABEL[p.status] || p.status}"></span>`
      )
      .join("");
    const more = dayPosts.length > maxDots ? `<span class="calendar-more">+${dayPosts.length - maxDots}</span>` : "";

    cell.innerHTML = `<span class="calendar-day-num">${day}</span><div class="calendar-dots">${dots}${more}</div>`;
    cell.addEventListener("click", () => {
      state.selectedDay = state.selectedDay === key ? null : key;
      renderCalendar();
      renderDayDetail(state.selectedDay);
    });

    el.calendarGrid.appendChild(cell);
  }
}

function renderDayDetail(dayKey) {
  if (!dayKey) {
    el.dayDetail.classList.add("hidden");
    el.dayDetail.innerHTML = "";
    return;
  }
  el.dayDetail.classList.remove("hidden");
  const dayPosts = getThreadsSchedulePosts()
    .filter((p) => localDateKey(p.scheduledAt) === dayKey)
    .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));

  const [y, m, d] = dayKey.split("-");
  el.dayDetail.innerHTML = `<div class="day-detail-title">${y}년 ${Number(m)}월 ${Number(d)}일</div><div id="day-detail-list"></div>`;
  renderPostCards(document.getElementById("day-detail-list"), dayPosts, "이 날짜에는 예약/게시 이력이 없습니다.");
}

function toDatetimeLocalValue(isoString) {
  const d = new Date(isoString);
  const tzOffset = d.getTimezoneOffset() * 60000;
  return new Date(d - tzOffset).toISOString().slice(0, 16);
}

function renderPostCards(container, posts, emptyText) {
  if (!posts || posts.length === 0) {
    container.innerHTML = `<p class="empty-text">${emptyText}</p>`;
    return;
  }

  container.innerHTML = "";
  posts.forEach((post) => {
    const item = document.createElement("div");
    item.className = "schedule-item";
    item.style.borderLeft = `3px solid ${getAccountColor(post.accountId)}`;

    const when = new Date(post.scheduledAt).toLocaleString("ko-KR");
    const statusClass = `status-${post.status}`;
    const statusLabel = STATUS_LABEL[post.status] || post.status;
    const platformLabel = post.platform === "instagram" ? "Instagram" : "Threads";

    const imagesHtml =
      Array.isArray(post.images) && post.images.length > 0
        ? `<div class="schedule-item-images">${post.images
            .map((url) => `<img src="${escapeHtml(url)}" alt="첨부 이미지" />`)
            .join("")}</div>`
        : "";
    const replyHtml = post.replyText
      ? `<div class="schedule-item-reply">💬 답글: ${escapeHtml(post.replyText)}</div>`
      : "";
    // 팔자장인 스타일: 본문 뒤에 이어지는 답글 여러 개(클리프행어 스레드). 총 파트 수 대비
    // 몇 번째인지 보여줘서, 예약 목록에서도 이어지는 스레드라는 게 한눈에 보이게 한다.
    const totalParts = 1 + (Array.isArray(post.replyChain) ? post.replyChain.length : 0);
    const chainHtml = Array.isArray(post.replyChain) && post.replyChain.length
      ? post.replyChain
          .map(
            (part, i) =>
              `<div class="schedule-item-chain-part"><span class="schedule-item-chain-label">${i + 2}/${totalParts}</span>${escapeHtml(part)}</div>`
          )
          .join("")
      : "";

    if ((post.status === "scheduled" || post.status === "failed") && state.editingPostId === post.id) {
      // 수정 폼 — 본문/예약 시각뿐 아니라 예약에 연결된 사진도 추가·삭제할 수 있다.
      let editImages = Array.isArray(post.images) ? [...post.images] : [];
      item.innerHTML = `
        <div class="schedule-item-top">
          <span>${platformLabel} · ${escapeHtml(post.accountLabel || "계정 미상")} · 예약: ${when}</span>
          <span class="status-badge ${statusClass}">${statusLabel}</span>
        </div>
        <textarea class="text-input textarea schedule-edit-text" rows="4">${escapeHtml(post.text)}</textarea>
        <input type="datetime-local" class="select-input schedule-edit-datetime" value="${toDatetimeLocalValue(post.scheduledAt)}" />
        <div class="schedule-edit-images"></div>
        <label class="schedule-edit-image-add">
          <span>＋ 사진 추가</span>
          <input class="schedule-edit-image-input" type="file" accept="image/*" multiple />
        </label>
        <p class="hint-text schedule-edit-image-count"></p>
        ${replyHtml}
        <p class="error-text schedule-edit-error"></p>
      `;
      const editImagesEl = item.querySelector(".schedule-edit-images");
      const imageCountEl = item.querySelector(".schedule-edit-image-count");
      const imageInputEl = item.querySelector(".schedule-edit-image-input");
      const errorEl = item.querySelector(".schedule-edit-error");

      const renderEditImages = () => {
        editImagesEl.innerHTML = "";
        editImages.forEach((url, index) => {
          const chip = document.createElement("div");
          chip.className = "schedule-edit-image-chip";
          chip.innerHTML = `<img src="${escapeHtml(url)}" alt="예약 첨부 이미지 ${index + 1}" />`;
          const removeBtn = document.createElement("button");
          removeBtn.type = "button";
          removeBtn.className = "remove-chip";
          removeBtn.setAttribute("aria-label", `사진 ${index + 1} 삭제`);
          removeBtn.textContent = "×";
          removeBtn.addEventListener("click", () => {
            editImages.splice(index, 1);
            renderEditImages();
          });
          chip.appendChild(removeBtn);
          editImagesEl.appendChild(chip);
        });
        imageCountEl.textContent = `현재 게시될 사진 ${editImages.length}장`;
      };

      imageInputEl.addEventListener("change", async () => {
        errorEl.textContent = "";
        const files = Array.from(imageInputEl.files || []);
        if (!files.length) return;
        if (editImages.length + files.length > 10) {
          errorEl.textContent = "Threads 사진은 최대 10장까지 추가할 수 있습니다.";
          imageInputEl.value = "";
          return;
        }
        imageInputEl.disabled = true;
        imageCountEl.textContent = `${files.length}장 업로드 중… 저장 버튼은 잠시 기다려주세요.`;
        try {
          for (const file of files) {
            const url = await uploadScheduleEditImage(file);
            editImages.push(url);
            renderEditImages();
          }
        } catch (err) {
          errorEl.textContent = err.message;
        } finally {
          imageInputEl.disabled = false;
          imageInputEl.value = "";
          renderEditImages();
        }
      });
      renderEditImages();

      const saveBtn = document.createElement("button");
      saveBtn.className = "btn-primary-link";
      saveBtn.textContent = "저장";
      saveBtn.addEventListener("click", () =>
        saveEditPost(
          post.id,
          item.querySelector(".schedule-edit-text"),
          item.querySelector(".schedule-edit-datetime"),
          errorEl,
          editImages,
          imageInputEl
        )
      );
      const cancelEditBtn = document.createElement("button");
      cancelEditBtn.className = "btn-link";
      cancelEditBtn.textContent = "취소";
      cancelEditBtn.addEventListener("click", () => {
        state.editingPostId = null;
        renderScheduleView();
      });
      item.appendChild(saveBtn);
      item.appendChild(cancelEditBtn);
      container.appendChild(item);
      return;
    }

    item.innerHTML = `
      <div class="schedule-item-top">
        <span>${platformLabel} · ${escapeHtml(post.accountLabel || "계정 미상")} · 예약: ${when}</span>
        <span class="status-badge ${statusClass}">${statusLabel}</span>
      </div>
      <div class="schedule-item-text">${totalParts > 1 ? `<span class="schedule-item-chain-label">1/${totalParts}</span>` : ""}${escapeHtml(post.text)}</div>
      ${chainHtml}
      ${imagesHtml}
      ${replyHtml}
      ${
        post.error
          ? `<div class="error-text" style="margin:0 0 8px;">${escapeHtml(post.error)}${
              post.status === "scheduled" && post.retryCount
                ? ` (자동 재시도 ${post.retryCount}회째 — 다음 발행 시각에 다시 시도됩니다)`
                : ""
            }</div>`
          : ""
      }
    `;

    if ((post.status === "scheduled" || post.status === "failed") && post.platform !== "instagram") {
      const editBtn = document.createElement("button");
      editBtn.className = "btn-link";
      editBtn.textContent = post.status === "failed" ? "수정해서 다시 시도" : "수정";
      editBtn.addEventListener("click", () => {
        state.editingPostId = post.id;
        renderScheduleView();
      });
      item.appendChild(editBtn);
    }

    if (post.status === "scheduled") {
      const cancelBtn = document.createElement("button");
      cancelBtn.className = "btn-danger-link";
      cancelBtn.textContent = "예약 취소";
      cancelBtn.addEventListener("click", () => cancelPost(post.id));
      item.appendChild(cancelBtn);
    }

    container.appendChild(item);
  });
}

async function uploadScheduleEditImage(file) {
  if (!file?.type?.startsWith("image/")) throw new Error("이미지 파일만 추가할 수 있습니다.");
  const imageBase64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("사진을 읽지 못했습니다."));
    reader.readAsDataURL(file);
  });
  const res = await fetch("/api/partners/upload-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageBase64 }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "사진 업로드에 실패했습니다.");
  return data.url;
}

function changeCalendarMonth(delta) {
  state.calendarDate = new Date(state.calendarDate.getFullYear(), state.calendarDate.getMonth() + delta, 1);
  renderCalendar();
}

el.calPrev.addEventListener("click", () => changeCalendarMonth(-1));
el.calNext.addEventListener("click", () => changeCalendarMonth(1));
el.calToday.addEventListener("click", () => {
  state.calendarDate = new Date();
  state.selectedDay = null;
  renderCalendar();
  renderDayDetail(null);
});

[el.viewCalendarBtn, el.viewListBtn].forEach((btn) => {
  btn.addEventListener("click", () => {
    state.scheduleView = btn.dataset.view;
    el.viewCalendarBtn.classList.toggle("selected", state.scheduleView === "calendar");
    el.viewListBtn.classList.toggle("selected", state.scheduleView === "list");
    renderScheduleView();
  });
});

Array.from(el.groupFilter.querySelectorAll(".mode-btn")).forEach((btn) => {
  btn.addEventListener("click", () => {
    state.scheduleGroupFilter = btn.dataset.group;
    el.groupFilter.querySelectorAll(".mode-btn").forEach((b) => b.classList.toggle("selected", b === btn));
    state.selectedDay = null;
    renderScheduleView();
  });
});

async function saveEditPost(id, textEl, datetimeEl, errorEl, images, imageInputEl) {
  errorEl.textContent = "";
  const text = textEl.value.trim();
  if (!text) {
    errorEl.textContent = "본문을 입력해주세요.";
    return;
  }
  if (!datetimeEl.value) {
    errorEl.textContent = "예약 시각을 선택해주세요.";
    return;
  }
  const scheduledAt = new Date(datetimeEl.value);
  if (scheduledAt.getTime() <= Date.now()) {
    errorEl.textContent = "예약 시각은 현재보다 미래여야 합니다.";
    return;
  }
  if (imageInputEl?.disabled) {
    errorEl.textContent = "사진 업로드가 끝난 뒤 저장해주세요.";
    return;
  }

  showLoading("수정하고 있어요...");
  try {
    const res = await fetch(`/api/schedule/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, scheduledAt: scheduledAt.toISOString(), images }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "수정에 실패했습니다.");
    state.editingPostId = null;
    await loadSchedule();
  } catch (err) {
    errorEl.textContent = err.message;
  } finally {
    hideLoading();
  }
}

async function cancelPost(id) {
  const confirmed = window.confirm("이 예약을 취소할까요?");
  if (!confirmed) return;
  showLoading("취소하고 있어요...");
  try {
    const res = await fetch(`/api/schedule/${id}/cancel`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "취소에 실패했습니다.");
    await loadSchedule();
  } catch (err) {
    el.scheduleError.textContent = err.message;
  } finally {
    hideLoading();
  }
}

// ================= Threads 계정 자동 연결 (OAuth) =================
function randomState() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function startOAuthConnect() {
  el.oauthStatus.textContent = "";

  if (!state.threadsOAuthConfigured) {
    el.oauthStatus.textContent =
      "아직 Threads 앱 연동이 설정되지 않았습니다 (.env의 THREADS_APP_ID/SECRET). README를 참고해 먼저 Meta 개발자 앱을 등록해주세요.";
    return;
  }

  const oauthState = randomState();
  const popup = window.open(`/oauth/threads/start?state=${oauthState}`, "threads-oauth", "width=480,height=680");
  if (!popup) {
    el.oauthStatus.textContent = "팝업이 차단되었습니다. 브라우저의 팝업 차단을 해제해주세요.";
    return;
  }

  el.oauthStatus.textContent = "브라우저 창에서 Threads 로그인/승인을 완료해주세요...";

  const started = Date.now();
  const poll = setInterval(async () => {
    if (Date.now() - started > 3 * 60 * 1000) {
      clearInterval(poll);
      el.oauthStatus.textContent = "연결 시간이 초과되었습니다. 다시 시도해주세요.";
      return;
    }
    try {
      const res = await fetch(`/api/oauth/threads/result?state=${oauthState}`);
      const data = await res.json();
      if (data.status === "pending") return;

      clearInterval(poll);
      if (!popup.closed) popup.close();

      if (data.status === "error") {
        el.oauthStatus.textContent = "연결 실패: " + data.error;
        return;
      }

      el.newAccountUserId.value = data.threadsUserId;
      el.newAccountToken.value = data.accessToken;
      el.oauthStatus.textContent = "✅ 연결 완료! User ID와 Access Token이 자동으로 채워졌습니다.";
    } catch {
      // 네트워크 오류 등은 다음 폴링에서 재시도
    }
  }, 2000);
}

el.btnOauthConnect.addEventListener("click", startOAuthConnect);

async function lookupUserId() {
  el.oauthStatus.textContent = "";
  const accessToken = el.newAccountToken.value.trim();
  if (!accessToken) {
    el.oauthStatus.textContent = "먼저 Access Token을 붙여넣어주세요.";
    return;
  }
  el.oauthStatus.textContent = "조회 중...";
  try {
    const res = await fetch("/api/threads/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "조회에 실패했습니다.");
    el.newAccountUserId.value = data.userId;
    el.oauthStatus.textContent = `✅ 확인됨: @${data.username} (User ID: ${data.userId})`;
  } catch (err) {
    el.oauthStatus.textContent = "조회 실패: " + err.message;
  }
}

el.btnLookupUserId.addEventListener("click", lookupUserId);

// ================= 계정 관리 탭 =================
function renderAccountList() {
  if (state.accounts.length === 0) {
    el.accountList.innerHTML = `<p class="empty-text">등록된 계정이 없습니다.</p>`;
    return;
  }
  el.accountList.innerHTML = "";
  state.accounts.forEach((acc) => {
    const row = document.createElement("div");
    row.className = "account-row";

    const expiry = tokenExpiryInfo(acc.tokenUpdatedAt);
    const expiryHtml = expiry
      ? ` · <span class="${expiry.warn ? "token-expiry-warn" : "token-expiry-ok"}">${expiry.label}</span>`
      : "";

    const isPartners = acc.type === "partners";
    const typeBadgeHtml = isPartners
      ? `<span class="type-badge partners">파트너스</span>`
      : `<span class="type-badge saju">사주</span>`;
    const detailHtml = isPartners
      ? `니치 ${acc.partnersProfile.categories.length}개`
      : `${escapeHtml(acc.persona.speechLevel)} · 카테고리 ${acc.persona.categories.length}개`;

    row.innerHTML = `
      <div class="account-meta">
        <span class="account-name-row">${typeBadgeHtml}${escapeHtml(acc.label)}</span>
        <span class="account-token">${detailHtml} · User ID: ${escapeHtml(acc.threadsUserId)} · Token: ${escapeHtml(acc.accessTokenPreview)}${expiryHtml}</span>
      </div>
    `;
    const delBtn = document.createElement("button");
    delBtn.className = "btn-danger-link";
    delBtn.textContent = "삭제";
    delBtn.addEventListener("click", () => deleteAccount(acc.id));
    row.appendChild(delBtn);
    el.accountList.appendChild(row);
  });
}

// Threads 장기 토큰은 60일마다 만료된다. 마지막 갱신 시각 기준으로 남은 일수를 계산.
function tokenExpiryInfo(tokenUpdatedAt) {
  if (!tokenUpdatedAt) return null;
  const updated = new Date(tokenUpdatedAt);
  const daysLeft = 60 - Math.floor((Date.now() - updated.getTime()) / (1000 * 60 * 60 * 24));
  if (daysLeft <= 10) return { warn: true, label: `⚠️ 토큰 만료 D-${daysLeft}` };
  return { warn: false, label: `토큰 만료 D-${daysLeft}` };
}

async function refreshAllTokens() {
  el.refreshTokensStatus.textContent = "";
  showLoading("모든 계정 토큰을 갱신하고 있어요...");
  try {
    const res = await fetch("/api/accounts/refresh-tokens", { method: "POST" });
    const data = await res.json();
    const okCount = data.results.filter((r) => r.ok).length;
    const failCount = data.results.length - okCount;
    const failDetail = data.results
      .filter((r) => !r.ok)
      .map((r) => `${r.label}: ${r.error}`)
      .join(" / ");

    let msg = `✅ ${okCount}개 갱신 완료`;
    if (failCount > 0) msg += `, ❌ ${failCount}개 실패 (${failDetail})`;
    msg += data.syncedToCloud ? " · ☁️ 클라우드 동기화 완료" : ` · ⚠️ 클라우드 동기화 실패: ${data.syncError}`;
    el.refreshTokensStatus.textContent = msg;

    await loadAccounts();
    renderAccountList();
  } catch (err) {
    el.refreshTokensStatus.textContent = "갱신 요청에 실패했습니다: " + err.message;
  } finally {
    hideLoading();
  }
}

el.btnRefreshTokens.addEventListener("click", refreshAllTokens);

async function addAccount() {
  el.accountFormError.textContent = "";
  const label = el.newAccountLabel.value.trim();
  const threadsUserId = el.newAccountUserId.value.trim();
  const accessToken = el.newAccountToken.value.trim();
  const type = state.newAccountType;

  if (!label || !threadsUserId || !accessToken) {
    el.accountFormError.textContent = "별명, User ID, Access Token을 모두 입력해주세요.";
    return;
  }

  const body = { label, threadsUserId, accessToken, type };

  if (type === "partners") {
    const categories = parseCategoriesText(el.partnersCategories.value);
    if (categories.length === 0) {
      el.accountFormError.textContent = "니치(카테고리)를 최소 1개 이상 입력해주세요.";
      return;
    }
    body.partnersProfile = {
      categories,
      styleGuide: el.partnersStyleGuide.value.trim(),
      disclosureText: el.partnersDisclosure.value.trim(),
      closingLine: "",
    };
  } else {
    const categories = parseCategoriesText(el.personaCategories.value);
    if (categories.length === 0) {
      el.accountFormError.textContent = "카테고리를 최소 1개 이상 입력해주세요.";
      return;
    }
    body.persona = {
      speechLevel: el.personaSpeechLevel.value,
      categories,
      styleGuide: el.personaStyleGuide.value.trim(),
      ctaInstruction: el.personaCta.value.trim(),
      closingLine: el.personaClosing.value.trim(),
      referenceExample: el.personaReference.value.trim(),
    };
  }

  showLoading("계정을 추가하고 있어요...");
  try {
    const res = await fetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "계정 추가에 실패했습니다.");

    el.newAccountLabel.value = "";
    el.newAccountUserId.value = "";
    el.newAccountToken.value = "";
    await loadAccounts();
    renderAccountList();
  } catch (err) {
    el.accountFormError.textContent = err.message;
  } finally {
    hideLoading();
  }
}

async function deleteAccount(id) {
  const confirmed = window.confirm("이 계정을 삭제할까요? (등록된 예약 글에는 영향을 주지 않습니다)");
  if (!confirmed) return;
  showLoading("삭제하고 있어요...");
  try {
    const res = await fetch(`/api/accounts/${id}`, { method: "DELETE" });
    if (!res.ok && res.status !== 204) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "삭제에 실패했습니다.");
    }
    await loadAccounts();
    renderAccountList();
  } catch (err) {
    el.accountFormError.textContent = err.message;
  } finally {
    hideLoading();
  }
}

// ================= 이벤트 바인딩 & 초기화 =================
el.btnGenerate.addEventListener("click", generateDraft);
el.btnManual.addEventListener("click", startManualEntry);
el.btnRegenerate.addEventListener("click", generateDraft);
el.btnPolish.addEventListener("click", polishDraft);
el.btnBack.addEventListener("click", switchToSettings);
el.btnSubmit.addEventListener("click", submitPost);
el.draftText.addEventListener("input", updateCharCount);
el.btnRefreshSchedule.addEventListener("click", loadSchedule);
el.btnAddAccount.addEventListener("click", addAccount);

setNewAccountType("saju");

// ================= 이미지 확대 보기(라이트박스) =================
// 미리보기/추가이미지/검색결과/선택상품 썸네일 어디든 클릭하면 원본 크기로 볼 수 있게.
// 나중에 추가되는 이미지 썸네일도 자동으로 동작하도록 이벤트 위임 방식으로 처리한다.
const el2 = {
  lightbox: document.getElementById("image-lightbox"),
  lightboxImg: document.getElementById("lightbox-img"),
  lightboxClose: document.getElementById("lightbox-close"),
};

// product-result-card 안의 이미지는 일부러 뺐다 — 그 카드는 클릭하면 상품을 "선택"하는 버튼이라,
// 확대 보기를 넣으면 그 클릭 동작과 충돌한다 (검색 결과는 선택이 먼저다).
const LIGHTBOX_TARGET_SELECTOR =
  "#preview-images img, .extra-image-chip img, #selected-product-thumb, .schedule-item-images img";

document.addEventListener("click", (e) => {
  const target = e.target.closest(LIGHTBOX_TARGET_SELECTOR);
  if (!target || !target.src) return;
  e.preventDefault();
  e.stopPropagation();
  el2.lightboxImg.src = target.src;
  el2.lightbox.classList.remove("hidden");
});

function closeLightbox() {
  el2.lightbox.classList.add("hidden");
  el2.lightboxImg.src = "";
}

el2.lightbox.addEventListener("click", closeLightbox);
el2.lightboxClose.addEventListener("click", closeLightbox);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeLightbox();
});

Promise.all([loadMeta(), loadAccounts(), loadPersonaPresets(), loadPartnersPresets(), loadLifestylePresets()]).catch((err) => {
  el.settingsError.textContent = "초기 데이터를 불러오지 못했습니다: " + err.message;
});
