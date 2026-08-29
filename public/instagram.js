(() => {
  const $ = (id) => document.getElementById(id);
  let validatedRangeKey = null;
  let instagramAccounts = [];
  let yeonlijiDrafts = [];
  async function request(url, options) { const response = await fetch(url, options); const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error || `요청 실패 (${response.status})`); return body; }

  async function loadPreview() {
    const date = $("ig-preview-date").value;
    $("ig-preview-error").textContent = ""; $("ig-validation").textContent = "생성 중…";
    try {
      const { content } = await request(`/api/instagram/content?date=${encodeURIComponent(date)}`);
      $("ig-calendar-summary").innerHTML = `<b>${content.calendar.korean}</b><span>${content.calendar.day[1]} 일진 · ${content.readings.length}띠 · 48개 생년 문구</span>`;
      $("ig-caption").textContent = content.caption; $("ig-validation").textContent = `✓ ${content.validation.checks}개 검사 통과`; $("ig-validation").classList.add("ig-pass");
      $("ig-card-grid").innerHTML = Array.from({ length: 7 }, (_, i) => `<figure><iframe src="/instagram-cards/index.html?embed=1&date=${date}&page=${i}" title="${date} 카드 ${i + 1}장" loading="${i < 2 ? "eager" : "lazy"}"></iframe><figcaption>${i + 1}장 ${i < 5 ? "매일 자동 변경" : "고정 브랜드"}</figcaption></figure>`).join("");
    } catch (error) { $("ig-validation").textContent = "검수 실패"; $("ig-preview-error").textContent = error.message; }
  }

  async function validateRange() {
    const start = $("ig-start-date").value, end = $("ig-end-date").value;
    $("ig-range-error").textContent = ""; $("ig-range-result").textContent = "전체 날짜를 계산하고 있습니다…"; validatedRangeKey = null;
    try {
      const result = await request(`/api/instagram/range?start=${start}&end=${end}`); validatedRangeKey = `${start}:${end}`;
      $("ig-range-result").innerHTML = `<strong>✓ ${result.count}일 모두 검수 통과</strong><span>${result.count * 7}장 카드 · ${result.count * 48}개 생년 문구 · 날짜별 중복 방지 코드 생성</span><div class="ig-day-chips">${result.days.map((day) => `<i title="${day.calendar.korean}">${day.date.slice(5)} ✓</i>`).join("")}</div>`;
    } catch (error) { $("ig-range-result").textContent = ""; $("ig-range-error").textContent = error.message; }
  }

  async function preflight() {
    $("ig-schedule-error").textContent = ""; $("ig-account-status").textContent = "점검 중…";
    const accountKey = $("ig-account-select").value;
    try { const result = await request(`/api/instagram/preflight?accountKey=${encodeURIComponent(accountKey)}`); $("ig-account-status").textContent = `✓ @${result.account.username || result.account.id} 연결`; $("ig-account-status").classList.add("ig-pass"); $("ig-schedule-status").textContent = `Instagram ${result.account.account_type || "전문"} 계정 · Graph API ${result.graphVersion} · 토큰 정상`; }
    catch (error) { $("ig-account-status").textContent = "연결 필요"; $("ig-schedule-error").textContent = error.message; }
  }

  async function loadInstagramAccounts() {
    const result = await request("/api/instagram/accounts");
    instagramAccounts = result.accounts || [];
    $("ig-account-select").innerHTML = instagramAccounts.map((account) => `<option value="${account.key}">${account.label} · ${account.connected ? `@${account.username || account.userId} 연결됨` : "연결 필요"}</option>`).join("");
    $("ig-account-select").value = result.activeAccountKey || "palja";
    selectInstagramStudio($("ig-account-select").value);
  }

  function checkLabel(key) {
    const labels = { spelling: "오타·맞춤법", flow: "7장 흐름", sajuAccuracy: "사주 표현", nonDeterministicLanguage: "단정·불안 조장 방지", slideCount: "7장 구성", imageUniqueness: "이미지 중복 방지", ctaQuality: "마지막 참여 유도", dimensions: "1080×1350 규격" };
    return labels[key] || key;
  }

  async function loadYeonlijiStudio() {
    $("ig-y-error").textContent = "";
    const studio = await request("/api/instagram/yeonliji/studio");
    yeonlijiDrafts = studio.drafts || [];
    const bible = studio.characterBible;
    $("ig-character-bible").innerHTML = `<div><b>주인공</b><span>${bible.heroine}</span></div><div><b>관계 요정</b><span>${bible.companion}</span></div><div><b>그림체</b><span>${bible.art}</span></div><div><b>고정 팔레트</b><span>${bible.palette}</span></div><div class="wide"><b>변경 금지</b><span>${bible.rules.join(" · ")}</span></div>`;
    $("ig-y-draft-select").innerHTML = yeonlijiDrafts.length ? yeonlijiDrafts.map((draft) => `<option value="${draft.id}">${draft.date} · ${draft.title}${draft.scheduled ? " · 예약됨" : " · 승인 대기"}</option>`).join("") : '<option value="">아직 제작된 시안이 없습니다</option>';
    renderYeonlijiDraft();
  }

  function renderYeonlijiDraft() {
    const draft = yeonlijiDrafts.find((item) => item.id === $("ig-y-draft-select").value) || yeonlijiDrafts[0];
    if (!draft) { $("ig-y-draft-status").textContent = "시안 없음"; $("ig-y-card-grid").innerHTML = ""; return; }
    $("ig-y-draft-select").value = draft.id;
    $("ig-y-schedule-display").value = `${draft.date} ${draft.time} KST`;
    $("ig-y-summary").innerHTML = `<b>${draft.series} · ${draft.title}</b><span>7장 · 캐릭터 잠금 · ${draft.validation?.status === "passed" ? "자동 검수 통과" : "검수 필요"}</span>`;
    $("ig-y-card-grid").innerHTML = Array.from({ length: draft.imageCount }, (_, index) => `<figure><img src="/api/instagram/yeonliji/card/${encodeURIComponent(draft.id)}/${index + 1}.jpg" alt="${draft.title} ${index + 1}장"><figcaption>${index + 1}장 · ${index === 0 ? "후킹" : index === 6 ? "참여 유도" : "이야기 전개"}</figcaption></figure>`).join("");
    $("ig-y-copy-review").innerHTML = draft.cards.map((card, index) => `<article><b>${index + 1}장 · ${card.eyebrow || ""}</b><strong>${(card.title || []).join(" / ")}</strong><span>${(card.body || []).join(" ")}</span>${card.note ? `<small>${card.note}</small>` : ""}</article>`).join("");
    $("ig-y-caption").textContent = draft.caption;
    $("ig-y-checks").innerHTML = Object.entries(draft.validation?.checks || {}).map(([key, value]) => `<span class="${value ? "passed" : "failed"}">${value ? "✓" : "!"} ${checkLabel(key)}${typeof value === "string" ? ` · ${value}` : ""}</span>`).join("");
    $("ig-y-confirm").checked = false;
    $("ig-y-confirm").disabled = draft.scheduled;
    $("ig-y-schedule").disabled = true;
    $("ig-y-draft-status").textContent = draft.scheduled ? (draft.schedule?.status === "published" ? "✓ 게시 완료" : "✓ 예약 완료") : "승인 대기";
    $("ig-y-draft-status").classList.toggle("ig-pass", draft.scheduled || draft.validation?.status === "passed");
    $("ig-y-result").textContent = draft.scheduled ? `중복 방지 적용 · ${new Date(draft.schedule.scheduledAt).toLocaleString("ko-KR")} 예약 · 같은 시안은 다시 예약되지 않습니다.` : "이미지를 클릭해 확대 확인하고, 아래 승인 체크 후에만 예약할 수 있습니다.";
  }

  async function scheduleYeonlijiDraft() {
    const draftId = $("ig-y-draft-select").value;
    $("ig-y-error").textContent = ""; $("ig-y-result").textContent = "7장 원본 재검수 → 공개 이미지 등록 → 예약 중…"; $("ig-y-schedule").disabled = true;
    try {
      const result = await request("/api/instagram/yeonliji/schedule", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draftId, confirm: true }) });
      $("ig-y-result").textContent = result.duplicatePrevented ? "✓ 이미 등록된 동일 시안을 확인했습니다. 중복 예약은 만들지 않았습니다." : "✓ 연리지 실타래 예약 등록 완료";
      await loadYeonlijiStudio();
    } catch (error) { $("ig-y-error").textContent = error.message; }
  }

  function selectInstagramStudio(key) {
    const isPalja = key === "palja";
    document.querySelectorAll("[data-ig-studio]").forEach((button) => button.classList.toggle("selected", button.dataset.igStudio === key));
    $("ig-palja-workspace").classList.toggle("hidden", !isPalja);
    $("ig-yeonliji-workspace").classList.toggle("hidden", isPalja);
    $("ig-account-select").value = key;
    updateInstagramAccountSafety();
    if (!isPalja) loadYeonlijiStudio().catch((error) => { $("ig-y-error").textContent = error.message; });
  }

  function updateInstagramAccountSafety() {
    const account = instagramAccounts.find((item) => item.key === $("ig-account-select").value);
    const isPalja = account?.key === "palja";
    $("ig-account-safety").textContent = isPalja
      ? "팔자명가 기존 자동 게시 계정입니다. 현재 예약과 클라우드 설정을 그대로 유지합니다."
      : "연리지 실타래 전용 토큰입니다. 팔자명가 토큰과 기존 예약은 변경하지 않습니다.";
    $("ig-account-publish-rule").textContent = isPalja
      ? "팔자명가는 매일 오전 6시 자동 게시 규칙을 그대로 유지합니다."
      : "연리지 실타래는 위 작업실에서 시안을 직접 확인하고 승인한 콘텐츠만 지정 시각에 게시합니다.";
    $("ig-palja-growth").classList.toggle("hidden", !isPalja);
    $("ig-palja-confirm-row").classList.toggle("hidden", !isPalja);
    $("ig-schedule-range").classList.toggle("hidden", !isPalja);
    $("ig-confirm-reviewed").disabled = !isPalja;
    $("ig-schedule-range").disabled = !isPalja;
    $("ig-studio-live-status").textContent = account?.connected ? `✓ ${account.label} @${account.username || account.userId} 연결` : `${account?.label || "선택 계정"} 연결 필요`;
    $("ig-studio-live-status").classList.toggle("ig-pass", Boolean(account?.connected));
  }

  function randomState() {
    const values = new Uint32Array(4); crypto.getRandomValues(values);
    return Array.from(values, (value) => value.toString(16).padStart(8, "0")).join("");
  }

  async function connectInstagram() {
    const meta = await request("/api/meta");
    if (!meta.instagramOAuthConfigured) {
      $("ig-meta-setup").open = true;
      throw new Error("먼저 위의 Meta Instagram 앱 ID와 시크릿을 저장해주세요.");
    }
    const state = randomState();
    const accountKey = $("ig-account-select").value;
    const target = instagramAccounts.find((account) => account.key === accountKey);
    const status = $("ig-oauth-status");
    const popup = window.open(`/oauth/instagram/start?state=${encodeURIComponent(state)}&accountKey=${encodeURIComponent(accountKey)}`, "_blank");
    if (!popup) return void (status.textContent = "팝업이 차단되었습니다. 브라우저에서 팝업을 허용해주세요.");
    status.textContent = `Instagram 로그인 창에서 ${target?.label || "선택 계정"} 계정을 선택하고 권한을 승인해주세요…`;
    $("ig-callback-help").classList.remove("hidden");
    const deadline = Date.now() + 5 * 60 * 1000;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      const result = await request(`/api/oauth/instagram/result?state=${encodeURIComponent(state)}`);
      if (result.status === "pending") continue;
      if (result.status === "error") throw new Error(result.error);
      try { popup.close(); } catch {}
      status.textContent = result.accountKey === "palja"
        ? (result.cloudSynced ? "✓ 팔자명가 Instagram 연결 및 클라우드 자동 게시 설정 완료" : `✓ 팔자명가 로컬 연결 완료 · 클라우드 동기화 확인 필요: ${result.cloudSyncError || "알 수 없는 오류"}`)
        : `✓ ${result.label} 연결 완료 · 팔자명가 클라우드 설정은 변경하지 않았습니다.`;
      await loadInstagramAccounts();
      $("ig-account-select").value = result.accountKey;
      updateInstagramAccountSafety();
      await preflight();
      return;
    }
    status.textContent = "연결 시간이 초과되었습니다. 다시 눌러주세요.";
  }

  async function completeCallback() {
    const raw = $("ig-callback-url").value.trim();
    const callback = new URL(raw);
    if (callback.hostname !== "threads-publish-pinger.threadsautopub.workers.dev" || callback.pathname !== "/oauth/instagram/callback") throw new Error("Cloudflare 승인 완료 주소 전체를 정확히 붙여넣어주세요.");
    if (!callback.searchParams.get("code") || !callback.searchParams.get("state")) throw new Error("주소에 Instagram 승인 코드가 없습니다. 계정 자동 연결부터 다시 진행해주세요.");
    $("ig-callback-status").textContent = "승인 코드를 안전하게 처리 중…";
    const response = await fetch(`/oauth/instagram/callback?${callback.searchParams.toString()}`);
    if (!response.ok) throw new Error((await response.text()).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || "승인 코드 처리 실패");
    $("ig-callback-status").textContent = "✓ 승인 코드 전달 완료 · 계정 연결 결과 확인 중";
  }

  async function saveOAuthConfig() {
    const appId = $("ig-app-id").value.trim();
    const appSecret = $("ig-app-secret").value.trim();
    $("ig-config-status").textContent = "안전하게 저장 중…";
    const result = await request("/api/instagram/oauth-config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ appId, appSecret }) });
    $("ig-app-secret").value = "";
    $("ig-config-status").textContent = `✓ 앱 설정 저장 완료 · OAuth URI: ${result.redirectUri}`;
  }

  async function scheduleRange() {
    const start = $("ig-start-date").value, end = $("ig-end-date").value; $("ig-schedule-error").textContent = "";
    if (validatedRangeKey !== `${start}:${end}`) return void ($("ig-schedule-error").textContent = "현재 기간을 먼저 전체 검수해주세요.");
    if (!$("ig-confirm-reviewed").checked) return void ($("ig-schedule-error").textContent = "검수 결과 확인에 체크해주세요.");
    $("ig-schedule-status").textContent = "카드 렌더링 → 공개 이미지 호스팅 → 예약 등록 중… 일괄 생성은 몇 분 걸릴 수 있습니다."; $("ig-schedule-range").disabled = true;
    try { const result = await request("/api/instagram/schedule-range", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ start, end, confirm: true }) }); $("ig-schedule-status").textContent = `✓ ${result.posts.length}일·${result.posts.length * 7}장 Instagram 예약 등록 완료`; }
    catch (error) { $("ig-schedule-error").textContent = error.message; } finally { $("ig-schedule-range").disabled = false; }
  }

  $("ig-load-preview").addEventListener("click", loadPreview); $("ig-validate-range").addEventListener("click", validateRange); $("ig-save-oauth-config").addEventListener("click", () => saveOAuthConfig().catch((error) => { $("ig-config-status").textContent = `저장 실패: ${error.message}`; })); $("ig-oauth-connect").addEventListener("click", () => connectInstagram().catch((error) => { $("ig-oauth-status").textContent = `연결 실패: ${error.message}`; })); $("ig-complete-callback").addEventListener("click", () => completeCallback().catch((error) => { $("ig-callback-status").textContent = `처리 실패: ${error.message}`; })); $("ig-preflight").addEventListener("click", preflight); $("ig-schedule-range").addEventListener("click", scheduleRange); $("ig-account-select").addEventListener("change", () => selectInstagramStudio($("ig-account-select").value));
  document.querySelectorAll("[data-ig-studio]").forEach((button) => button.addEventListener("click", () => selectInstagramStudio(button.dataset.igStudio)));
  $("ig-y-draft-select").addEventListener("change", renderYeonlijiDraft);
  $("ig-y-confirm").addEventListener("change", () => { const draft = yeonlijiDrafts.find((item) => item.id === $("ig-y-draft-select").value); $("ig-y-schedule").disabled = !$("ig-y-confirm").checked || !draft || draft.scheduled || draft.validation?.status !== "passed"; });
  $("ig-y-schedule").addEventListener("click", scheduleYeonlijiDraft);
  [$("ig-start-date"), $("ig-end-date")].forEach((input) => input.addEventListener("change", () => { validatedRangeKey = null; $("ig-confirm-reviewed").checked = false; }));
  window.loadInstagramDashboard = () => { loadInstagramAccounts().catch((error) => { $("ig-schedule-error").textContent = error.message; }); if (!$("ig-card-grid").children.length) loadPreview(); };
})();
