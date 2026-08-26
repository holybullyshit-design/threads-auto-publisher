(() => {
  const $ = (id) => document.getElementById(id);
  let validatedRangeKey = null;
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
    try { const result = await request("/api/instagram/preflight"); $("ig-account-status").textContent = `✓ @${result.account.username || result.account.id} 연결`; $("ig-account-status").classList.add("ig-pass"); $("ig-schedule-status").textContent = `Instagram ${result.account.account_type || "전문"} 계정 · Graph API ${result.graphVersion} · 토큰 정상`; }
    catch (error) { $("ig-account-status").textContent = "연결 필요"; $("ig-schedule-error").textContent = error.message; }
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
    const status = $("ig-oauth-status");
    const popup = window.open(`/oauth/instagram/start?state=${encodeURIComponent(state)}`, "_blank");
    if (!popup) return void (status.textContent = "팝업이 차단되었습니다. 브라우저에서 팝업을 허용해주세요.");
    status.textContent = "Instagram 로그인 창에서 팔자명가 계정을 선택하고 권한을 승인해주세요…";
    $("ig-callback-help").classList.remove("hidden");
    const deadline = Date.now() + 5 * 60 * 1000;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      const result = await request(`/api/oauth/instagram/result?state=${encodeURIComponent(state)}`);
      if (result.status === "pending") continue;
      if (result.status === "error") throw new Error(result.error);
      try { popup.close(); } catch {}
      status.textContent = result.cloudSynced
        ? "✓ 팔자명가 Instagram 연결 및 클라우드 자동 게시 설정 완료"
        : `✓ 로컬 연결 완료 · 클라우드 동기화 확인 필요: ${result.cloudSyncError || "알 수 없는 오류"}`;
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

  $("ig-load-preview").addEventListener("click", loadPreview); $("ig-validate-range").addEventListener("click", validateRange); $("ig-save-oauth-config").addEventListener("click", () => saveOAuthConfig().catch((error) => { $("ig-config-status").textContent = `저장 실패: ${error.message}`; })); $("ig-oauth-connect").addEventListener("click", () => connectInstagram().catch((error) => { $("ig-oauth-status").textContent = `연결 실패: ${error.message}`; })); $("ig-complete-callback").addEventListener("click", () => completeCallback().catch((error) => { $("ig-callback-status").textContent = `처리 실패: ${error.message}`; })); $("ig-preflight").addEventListener("click", preflight); $("ig-schedule-range").addEventListener("click", scheduleRange);
  [$("ig-start-date"), $("ig-end-date")].forEach((input) => input.addEventListener("change", () => { validatedRangeKey = null; $("ig-confirm-reviewed").checked = false; }));
  window.loadInstagramDashboard = () => { if (!$("ig-card-grid").children.length) loadPreview(); };
})();
