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

  async function scheduleRange() {
    const start = $("ig-start-date").value, end = $("ig-end-date").value; $("ig-schedule-error").textContent = "";
    if (validatedRangeKey !== `${start}:${end}`) return void ($("ig-schedule-error").textContent = "현재 기간을 먼저 전체 검수해주세요.");
    if (!$("ig-confirm-reviewed").checked) return void ($("ig-schedule-error").textContent = "검수 결과 확인에 체크해주세요.");
    $("ig-schedule-status").textContent = "카드 렌더링 → 공개 이미지 호스팅 → 예약 등록 중… 일괄 생성은 몇 분 걸릴 수 있습니다."; $("ig-schedule-range").disabled = true;
    try { const result = await request("/api/instagram/schedule-range", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ start, end, confirm: true }) }); $("ig-schedule-status").textContent = `✓ ${result.posts.length}일·${result.posts.length * 7}장 Instagram 예약 등록 완료`; }
    catch (error) { $("ig-schedule-error").textContent = error.message; } finally { $("ig-schedule-range").disabled = false; }
  }

  $("ig-load-preview").addEventListener("click", loadPreview); $("ig-validate-range").addEventListener("click", validateRange); $("ig-preflight").addEventListener("click", preflight); $("ig-schedule-range").addEventListener("click", scheduleRange);
  [$("ig-start-date"), $("ig-end-date")].forEach((input) => input.addEventListener("change", () => { validatedRangeKey = null; $("ig-confirm-reviewed").checked = false; }));
  window.loadInstagramDashboard = () => { if (!$("ig-card-grid").children.length) loadPreview(); };
})();
