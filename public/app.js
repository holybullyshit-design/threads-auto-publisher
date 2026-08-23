const state = {
  maxTextLength: 500,
  accounts: [],
  personaPresets: {},
  selectedAccountId: null,
  selectedCategoryId: null,
  publishMode: "now", // now | schedule
  scheduleView: "calendar", // calendar | list
  calendarDate: new Date(), // 현재 보고 있는 달 (day는 무시하고 년/월만 사용)
  selectedDay: null, // "YYYY-MM-DD" 또는 null
  schedulePosts: [],
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
    schedule: document.getElementById("tab-schedule"),
    accounts: document.getElementById("tab-accounts"),
  },

  accountSelect: document.getElementById("account-select"),
  accountPersonaHint: document.getElementById("account-persona-hint"),
  noAccountHint: document.getElementById("no-account-hint"),
  categoryOptions: document.getElementById("category-options"),
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
  personaTemplateSelect: document.getElementById("persona-template-select"),
  personaSpeechLevel: document.getElementById("persona-speech-level"),
  personaCategories: document.getElementById("persona-categories"),
  personaStyleGuide: document.getElementById("persona-style-guide"),
  personaCta: document.getElementById("persona-cta"),
  personaClosing: document.getElementById("persona-closing"),
  personaReference: document.getElementById("persona-reference"),
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
  if (tabName === "accounts") renderAccountList();
}

el.tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

// ================= 계정 셀렉트 & 카테고리 (글쓰기 탭) =================
function currentAccount() {
  return state.accounts.find((a) => a.id === state.selectedAccountId) || null;
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

  state.accounts.forEach((acc) => {
    const opt = document.createElement("option");
    opt.value = acc.id;
    opt.textContent = acc.label;
    el.accountSelect.appendChild(opt);
  });

  if (!state.selectedAccountId || !state.accounts.some((a) => a.id === state.selectedAccountId)) {
    state.selectedAccountId = state.accounts[0].id;
    state.selectedCategoryId = null;
  }
  el.accountSelect.value = state.selectedAccountId;
  renderAccountPersonaHint();
  renderCategoryOptions();
}

function renderAccountPersonaHint() {
  const acc = currentAccount();
  if (!acc) {
    el.accountPersonaHint.textContent = "";
    return;
  }
  el.accountPersonaHint.textContent = `${acc.persona.speechLevel} · 카테고리 ${acc.persona.categories.length}개 · 클로징 "${acc.persona.closingLine || "(미설정)"}"`;
}

function renderCategoryOptions() {
  const acc = currentAccount();
  el.categoryOptions.innerHTML = "";
  const categories = acc ? acc.persona.categories : [];

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
  el.btnGenerate.disabled = !(state.selectedAccountId && state.selectedCategoryId);
  el.btnManual.disabled = !state.selectedAccountId;
}

el.accountSelect.addEventListener("change", () => {
  state.selectedAccountId = el.accountSelect.value;
  state.selectedCategoryId = null;
  renderAccountPersonaHint();
  renderCategoryOptions();
});

// ================= 초기 데이터 로드 =================
async function loadMeta() {
  const res = await fetch("/api/meta");
  const data = await res.json();
  state.maxTextLength = data.maxTextLength;
  state.threadsOAuthConfigured = data.threadsOAuthConfigured;
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
  if (!state.selectedAccountId || !state.selectedCategoryId) return;

  showLoading("초안을 생성하고 있어요 (이 채널의 목소리로)...");
  try {
    const res = await fetch("/api/draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: state.selectedAccountId, categoryId: state.selectedCategoryId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "초안 생성에 실패했습니다.");

    el.draftText.value = data.draft;
    const acc = currentAccount();
    el.previewMeta.textContent = `${acc?.label || ""} · ${data.category.label}`;
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
  const category = acc?.persona.categories.find((c) => c.id === state.selectedCategoryId);

  el.draftText.value = "";
  el.previewMeta.textContent = `${acc?.label || ""} · 직접 작성${category ? " · " + category.label : ""}`;
  updateCharCount();
  setPublishMode("now");
  switchToPreview();
  el.draftText.focus();
}

async function polishDraft() {
  el.previewError.textContent = "";
  el.previewSuccess.textContent = "";
  showLoading("이 채널 톤으로 다듬고 있어요...");
  try {
    const res = await fetch("/api/polish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: state.selectedAccountId, text: el.draftText.value }),
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
        body: JSON.stringify({ text, accountId: state.selectedAccountId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "게시에 실패했습니다.");
      el.previewSuccess.textContent = `게시 완료! (게시물 ID: ${data.publishedId})`;
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

function renderLegend() {
  const seen = new Map();
  state.accounts.forEach((acc) => seen.set(acc.id, acc.label));
  state.schedulePosts.forEach((p) => {
    if (!seen.has(p.accountId)) seen.set(p.accountId, p.accountLabel || "계정 미상");
  });

  el.calendarLegend.innerHTML = "";
  seen.forEach((label, accountId) => {
    const item = document.createElement("span");
    item.className = "legend-item";
    item.innerHTML = `<span class="legend-dot" style="background:${getAccountColor(accountId)}"></span>${escapeHtml(label)}`;
    el.calendarLegend.appendChild(item);
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
    renderPostCards(el.scheduleList, sortByCreatedDesc(state.schedulePosts), "등록된 예약/게시 이력이 없습니다.");
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
  state.schedulePosts.forEach((p) => {
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
  const dayPosts = state.schedulePosts
    .filter((p) => localDateKey(p.scheduledAt) === dayKey)
    .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));

  const [y, m, d] = dayKey.split("-");
  el.dayDetail.innerHTML = `<div class="day-detail-title">${y}년 ${Number(m)}월 ${Number(d)}일</div><div id="day-detail-list"></div>`;
  renderPostCards(document.getElementById("day-detail-list"), dayPosts, "이 날짜에는 예약/게시 이력이 없습니다.");
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

    item.innerHTML = `
      <div class="schedule-item-top">
        <span>${escapeHtml(post.accountLabel || "계정 미상")} · 예약: ${when}</span>
        <span class="status-badge ${statusClass}">${statusLabel}</span>
      </div>
      <div class="schedule-item-text">${escapeHtml(post.text)}</div>
      ${post.error ? `<div class="error-text" style="margin:0 0 8px;">${escapeHtml(post.error)}</div>` : ""}
    `;

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

    row.innerHTML = `
      <div class="account-meta">
        <span>${escapeHtml(acc.label)}</span>
        <span class="account-token">${escapeHtml(acc.persona.speechLevel)} · 카테고리 ${acc.persona.categories.length}개 · User ID: ${escapeHtml(acc.threadsUserId)} · Token: ${escapeHtml(acc.accessTokenPreview)}${expiryHtml}</span>
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
  const categories = parseCategoriesText(el.personaCategories.value);

  if (!label || !threadsUserId || !accessToken) {
    el.accountFormError.textContent = "별명, User ID, Access Token을 모두 입력해주세요.";
    return;
  }
  if (categories.length === 0) {
    el.accountFormError.textContent = "카테고리를 최소 1개 이상 입력해주세요.";
    return;
  }

  const persona = {
    speechLevel: el.personaSpeechLevel.value,
    categories,
    styleGuide: el.personaStyleGuide.value.trim(),
    ctaInstruction: el.personaCta.value.trim(),
    closingLine: el.personaClosing.value.trim(),
    referenceExample: el.personaReference.value.trim(),
  };

  showLoading("계정을 추가하고 있어요...");
  try {
    const res = await fetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label, threadsUserId, accessToken, persona }),
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

Promise.all([loadMeta(), loadAccounts(), loadPersonaPresets()]).catch((err) => {
  el.settingsError.textContent = "초기 데이터를 불러오지 못했습니다: " + err.message;
});
