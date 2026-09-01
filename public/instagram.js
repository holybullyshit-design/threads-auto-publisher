(() => {
  const $ = (id) => document.getElementById(id);
  let validatedRangeKey = null;
  let instagramAccounts = [];
  let yeonlijiDrafts = [];
  let yeonlijiTopics = [];
  let selectedYeonlijiTopicId = null;
  let yeonlijiVariant = 0;
  let generationTimer = null;
  let yeonlijiGenerating = false;
  let yeonlijiConfigured = true;
  let yeonlijiDeliveryReady = false;
  let yeonlijiDelivering = false;
  const deliveryStatusLabel = status => ({published:"게시 완료",scheduled:"예약됨",publishing:"게시 처리 중",failed:"게시 확인 필요"}[status] || "승인 대기");
  async function request(url, options) {
    const response = await fetch(url, options);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(body.error || `요청 실패 (${response.status})`);
      error.status = response.status;
      throw error;
    }
    return body;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
  }

  function friendlyYeonlijiError(error) {
    if (error?.status === 404 || /\(404\)/.test(error?.message || "")) {
      return "앱 서버가 이전 버전으로 실행 중입니다. 이 창을 닫고 바탕화면의 ‘스레드 자동 게시’ 앱을 다시 실행한 뒤 새로고침해주세요.";
    }
    return error?.message || "요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.";
  }

  async function loadPreview() {
    const date = $("ig-preview-date").value;
    $("ig-preview-error").textContent = ""; $("ig-validation").textContent = "생성 중…";
    try {
      // Prefer the exact reviewed/scheduled package, even if a running server predates it.
      let content;
      const snapshot = await fetch(`/generated/instagram/${encodeURIComponent(date)}/package.json`, {cache:'no-store'});
      if(snapshot.ok) content = await snapshot.json();
      else ({ content } = await request(`/api/instagram/content?date=${encodeURIComponent(date)}`));
      $("ig-calendar-summary").innerHTML = `<b>${content.calendar.korean}</b><span>${content.calendar.day[1]} 일진 · ${content.readings.length}띠 · 48개 생년 문구</span>`;
      $("ig-caption").textContent = content.caption; $("ig-validation").textContent = `✓ ${content.validation.checks}개 검사 통과`; $("ig-validation").classList.add("ig-pass");
      $("ig-card-grid").innerHTML = Array.from({ length: 7 }, (_, i) => `<figure>${content.snapshotImageBase ? `<a href="${escapeHtml(content.snapshotImageBase)}/${i+1}.jpg" target="_blank" rel="noopener"><img src="${escapeHtml(content.snapshotImageBase)}/${i+1}.jpg" alt="${date} 검수된 카드 ${i+1}장" style="display:block;width:100%;height:auto" loading="${i<2?'eager':'lazy'}"></a>` : `<iframe src="/instagram-cards/index.html?embed=1&date=${date}&page=${i}" title="${date} 카드 ${i + 1}장" loading="${i < 2 ? "eager" : "lazy"}"></iframe>`}<figcaption>${i + 1}장 ${content.snapshotImageBase ? "예약 원본 · 클릭하면 확대" : content.slides[i].fixed ? "고정 브랜드" : "날짜별 콘텐츠"}</figcaption></figure>`).join("");
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
    return key==='textSeparation' ? '한글 코드 합성' : labels[key] || key;
  }

  function setYeonlijiDefaults(result = {}) {
    if (!$("ig-y-create-date").value) {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
      $("ig-y-create-date").value = result.defaultDate || result.defaults?.date || tomorrow;
    }
    if (!$("ig-y-create-time").value) $("ig-y-create-time").value = result.defaultTime || new Date(Date.now()+32400000+30*60000).toISOString().slice(11,16);
  }

  function topicIdentity(topic, index = 0) {
    return String(topic.id || topic.key || topic.topicId || `topic-${index + 1}`);
  }

  function topicTitle(topic) {
    return topic.displayTitle || topic.title || topic.topic || topic.name || "관계 사주 이야기";
  }

  function shuffleTopics(topics) {
    const next = [...topics];
    for (let index = next.length - 1; index > 0; index -= 1) {
      const random = new Uint32Array(1);
      crypto.getRandomValues(random);
      const target = random[0] % (index + 1);
      [next[index], next[target]] = [next[target], next[index]];
    }
    return next;
  }

  function renderYeonlijiTopics() {
    const topics = yeonlijiTopics.slice(0, 10);
    if (!topics.length) {
      $("ig-y-topic-grid").innerHTML = '<div class="ig-topic-loading">준비된 미사용 주제를 모두 확인했습니다. 이미 만든 주제는 반복 추천하지 않습니다. 기존 시안은 아래에서 볼 수 있습니다.</div>';
      return;
    }
    $("ig-y-topic-grid").innerHTML = topics.map((topic, index) => {
      const id = topicIdentity(topic, index);
      const category = topic.category || topic.series || topic.pillar || "연애 사주";
      const hook = topic.hook || topic.subtitle || topic.description || "내 관계의 흐름을 사주로 가볍게 풀어봐요";
      const saju = topic.sajuKeyword || topic.sajuTerm || topic.keyword || (Array.isArray(topic.sajuTerms) ? topic.sajuTerms.join(" · ") : "관계 흐름");
      const selected = id === selectedYeonlijiTopicId;
      return `<button class="ig-topic-card${selected ? " selected" : ""}" type="button" role="option" aria-selected="${selected}" data-topic-id="${escapeHtml(id)}"><span class="ig-topic-number">${String(index + 1).padStart(2, "0")}</span><span class="ig-topic-category">${escapeHtml(category)}</span><b>${escapeHtml(topicTitle(topic))}</b><small>${escapeHtml(hook)}</small><i>사주 포인트 · ${escapeHtml(saju)}</i></button>`;
    }).join("");
    $("ig-y-topic-grid").querySelectorAll("[data-topic-id]").forEach((button) => button.addEventListener("click", () => selectYeonlijiTopic(button.dataset.topicId)));
  }

  function selectYeonlijiTopic(topicId) {
    if(yeonlijiGenerating) return;
    selectedYeonlijiTopicId = topicId;
    const topic = yeonlijiTopics.find((item, index) => topicIdentity(item, index) === topicId);
    renderYeonlijiTopics();
    if (!topic) return;
    $("ig-y-selected-topic").classList.remove("hidden");
    $("ig-y-selected-topic").innerHTML = `<span>✓ 선택한 주제</span><b>${escapeHtml(topicTitle(topic))}</b><small>${escapeHtml(topic.hook || topic.subtitle || topic.description || "7장 이야기로 만들 준비가 됐습니다.")}</small>`;
    $("ig-y-generate").disabled = !yeonlijiConfigured;
    $("ig-y-generate").textContent = "새 그림으로 7장 만들기 (API 유료)";
    $("ig-y-preview-plan").disabled=false;
    $("ig-y-plan-preview").innerHTML="";
    $("ig-y-generate-error").textContent = "";
  }

  async function loadYeonlijiTopics(refresh = false) {
    if(yeonlijiGenerating) return;
    $("ig-y-generate-error").textContent = "";
    $("ig-y-refresh-topics").disabled = true;
    $("ig-y-topic-grid").innerHTML = '<div class="ig-topic-loading"><span class="ig-mini-spinner" aria-hidden="true"></span>주제 10개를 준비하고 있습니다…</div>';
    try {
      const avoid=refresh?yeonlijiTopics.map(t=>t.id).join(','):'';
      const result = await request(`/api/instagram/yeonliji/topics?avoid=${encodeURIComponent(avoid)}`);
      yeonlijiTopics = result.topics || [];
      yeonlijiConfigured=Boolean(result.generation?.configured) && result.generation?.editorialVersion==='yeonliji-editorial-v4';
      $("ig-y-engine-version").textContent=result.generation?.editorialVersion==='yeonliji-editorial-v4'?'사주 근거 원고 v4 · 일진 계산 · 추가 API 비용 없는 원고 업데이트':'구버전 서버입니다. 새 원고 엔진 적용이 필요합니다.';
      $("ig-y-topic-count").textContent=`전체 ${result.total}개 기획 · 사용 ${result.used}개 제외 · 미사용 ${result.remaining}개 중 ${yeonlijiTopics.length}개 추천. 궁합·재회·운명·이혼·부부 관계를 골고루 준비했습니다.`;
      if(!yeonlijiConfigured) $("ig-y-generate-error").textContent='OpenAI API 키가 설정되지 않아 이미지 생성이 잠겨 있습니다.';
      if(result.historyWarning) $("ig-y-generate-error").textContent=result.historyWarning;
      selectedYeonlijiTopicId = null;
      $("ig-y-selected-topic").classList.add("hidden");
      $("ig-y-generate").disabled = true;
      $("ig-y-generate").textContent = "주제를 먼저 선택해주세요";
      $("ig-y-preview-plan").disabled=true;
      setYeonlijiDefaults(result);
      renderYeonlijiTopics();
    } catch (error) {
      const message = friendlyYeonlijiError(error);
      $("ig-y-topic-grid").innerHTML = `<div class="ig-topic-restart"><b>주제 목록을 열 수 없습니다.</b><span>${escapeHtml(message)}</span></div>`;
      $("ig-y-generate-error").textContent = message;
    } finally {
      $("ig-y-refresh-topics").disabled = false;
    }
  }

  async function loadYeonlijiStudio(preferredDraftId = "") {
    $("ig-y-error").textContent = "";
    const previousDraftId = preferredDraftId || $("ig-y-draft-select").value;
    const studio = await request("/api/instagram/yeonliji/studio");
    yeonlijiDrafts = studio.drafts || [];
    yeonlijiDeliveryReady=studio.deliveryVersion==="yeonliji-delivery-v1" && !studio.historyWarning;
    if(!studio.deliveryVersion) $("ig-y-error").textContent="시간 변경·즉시 게시 기능을 적용하려면 자동화 앱을 다시 실행해주세요. 기존 시안은 그대로 보존됩니다.";
    if(studio.historyWarning) $("ig-y-error").textContent=studio.historyWarning;
    const bible = studio.characterBible || {};
    $("ig-character-bible").innerHTML = `<div><b>주인공</b><span>${escapeHtml(bible.heroine || "연지")}</span></div><div><b>관계 요정</b><span>${escapeHtml(bible.companion || "타래")}</span></div><div><b>그림체</b><span>${escapeHtml(bible.art || "고정 스타일")}</span></div><div><b>고정 팔레트</b><span>${escapeHtml(bible.palette || "크림·먹색·실타래 적색")}</span></div><div class="wide"><b>변경 금지</b><span>${escapeHtml((bible.rules || ["캐릭터 외형과 분위기를 일관되게 유지"]).join(" · "))}</span></div>`;
    $("ig-y-draft-select").innerHTML = yeonlijiDrafts.length ? yeonlijiDrafts.map((draft) => `<option value="${escapeHtml(draft.id)}">${escapeHtml(draft.date)} · ${escapeHtml(draft.displayTitle || draft.title)}${draft.contentReady ? ' · 사주 근거 v4' : ' · 구버전/검수 필요'} · ${deliveryStatusLabel(draft.schedule?.status)}</option>`).join("") : '<option value="">아직 제작된 시안이 없습니다</option>';
    if (previousDraftId && yeonlijiDrafts.some((draft) => draft.id === previousDraftId)) $("ig-y-draft-select").value = previousDraftId;
    renderYeonlijiDraft();
  }

  function currentDraftTopicId(draft) {
    return draft?.topicId || draft?.topic?.id || draft?.generation?.topicId || "";
  }

  function renderYeonlijiDraft() {
    const draft = yeonlijiDrafts.find((item) => item.id === $("ig-y-draft-select").value) || yeonlijiDrafts[0];
    if (!draft) {
      $("ig-y-draft-status").textContent = "시안 없음";
      $("ig-y-draft-status").classList.remove("ig-pass");
      $("ig-y-schedule-display").value = "";
      $("ig-y-card-grid").innerHTML = "";
      $("ig-y-preview-body").classList.add("hidden");
      $("ig-y-empty").classList.remove("hidden");
      $("ig-y-result").textContent = "위에서 주제를 선택하면 새 시안을 만들 수 있습니다.";
      return;
    }
    $("ig-y-preview-body").classList.remove("hidden");
    $("ig-y-empty").classList.add("hidden");
    $("ig-y-draft-select").value = draft.id;
    $("ig-y-schedule-display").value = `${draft.date} ${draft.time} KST`;
    const scheduled= draft.schedule?.scheduledAt ? new Date(new Date(draft.schedule.scheduledAt).getTime()+32400000).toISOString() : '';
    $("ig-y-schedule-date").value=scheduled?scheduled.slice(0,10):draft.date;
    $("ig-y-schedule-time").value=scheduled?scheduled.slice(11,16):draft.time;
    $("ig-y-schedule-date").disabled=draft.scheduled && draft.schedule?.status!=="scheduled";
    $("ig-y-schedule-time").disabled=draft.scheduled && draft.schedule?.status!=="scheduled";
    if(!draft.scheduled && draft.factPack?.kind!=='calendar-calculation' && new Date(draft.date+'T'+draft.time+':00+09:00').getTime()<=Date.now()){
      const next=new Date(Date.now()+32400000+30*60000).toISOString();
      $("ig-y-schedule-date").value=next.slice(0,10);$("ig-y-schedule-time").value=next.slice(11,16);
    }
    if(scheduled) $("ig-y-schedule-display").value=`${scheduled.slice(0,10)} ${scheduled.slice(11,16)} KST`;
    if(draft.schedule?.status==="published" && draft.schedule.publishedAt) $("ig-y-schedule-display").value=new Date(draft.schedule.publishedAt).toLocaleString("ko-KR",{timeZone:"Asia/Seoul"})+" 게시 완료 (한국 시간)";
    const copyStatus = draft.contentReady ? '사주 근거 v4 · 규칙 연결 확인' : '구버전/검수 필요 · 새 예약 차단';
    $("ig-y-summary").innerHTML = `<b>${escapeHtml(draft.series)} · ${escapeHtml(draft.displayTitle || draft.title)}</b><span>${copyStatus} · 7장 · 고정 캐릭터 참조 · ${draft.validation?.status === "passed" ? "파일 검사 완료 · 최종 검수 필요" : "검수 필요"}</span>`;
    const imageCount = draft.imageCount || draft.cards?.length || 7;
    $("ig-y-card-grid").innerHTML = Array.from({ length: imageCount }, (_, index) => {
      const source = `/api/instagram/yeonliji/card/${encodeURIComponent(draft.id)}/${index + 1}.jpg`;
      return `<figure><a href="${source}" target="_blank" rel="noopener" title="${index + 1}장 원본 크게 보기"><img src="${source}" alt="${escapeHtml(draft.displayTitle || draft.title)} ${index + 1}장" loading="${index < 2 ? "eager" : "lazy"}"></a><figcaption>${index + 1}장 · ${index === 0 ? "후킹" : index === 6 ? "참여 유도" : "이야기 전개"} · 클릭해서 확대</figcaption></figure>`;
    }).join("");
    $("ig-y-copy-review").innerHTML = (draft.cards || []).map((card, index) => `<article><b>${index + 1}장 · ${escapeHtml(card.eyebrow || "")}</b><strong>${escapeHtml((card.title || []).join(" / "))}</strong><span>${escapeHtml((card.body || []).join(" "))}</span>${card.note ? `<small>${escapeHtml(card.note)}</small>` : ""}</article>`).join("");
    $("ig-y-caption").textContent = draft.caption || "";
    const facts=draft.factPack;
    $("ig-y-evidence").innerHTML=facts ? '<h3>이 시안의 명리 근거</h3>' +
      facts.facts.map(f=>'<article><b>'+escapeHtml(f.label)+'</b><span>'+escapeHtml(f.body.join(' '))+'</span></article>').join('')+
      '<p>'+escapeHtml(facts.examples?.calendar ? facts.examples.calendar.date+' · '+facts.examples.calendar.ganZhi+' · 날짜 계산 결과' : '전통 명리 규칙의 일반 예시 · 개인 출생 명식 미사용')+'</p>'+
      facts.sources.map(s=>'<p><a target="_blank" rel="noopener" href="'+escapeHtml(s.url)+'">'+escapeHtml(s.title)+'</a></p>').join('')+
      '<p>'+escapeHtml((draft.similarityWarnings || []).join(' / '))+'</p>' :
      '<p>이 시안에는 새 근거 자료가 없습니다. 위 무료 업데이트를 누르면 새 원고와 한자를 적용한 별도 시안이 만들어집니다.</p>';
    $("ig-y-checks").innerHTML = Object.entries(draft.validation?.checks || {}).map(([key, value]) => `<span class="${value ? "passed" : "failed"}">${value ? "✓" : "!"} ${escapeHtml(checkLabel(key))}${typeof value === "string" ? ` · ${escapeHtml(value)}` : ""}</span>`).join("");
    $("ig-y-confirm").checked = false;
    $("ig-y-confirm").disabled = !draft.contentReady || (draft.scheduled && draft.schedule?.status!=='scheduled');
    $("ig-y-publish-now").disabled=true;
    $("ig-y-schedule").textContent=draft.schedule?.status==='scheduled'?'선택한 시간으로 예약 변경':'선택한 날짜·시간에 예약';
    $("ig-y-schedule").disabled = true;
    const topicId = currentDraftTopicId(draft);
    $("ig-y-regenerate").dataset.topicId = topicId;
    $("ig-y-regenerate").disabled = !topicId || yeonlijiGenerating || !draft.recomposeAvailable;
    const status=draft.schedule?.status;
    $("ig-y-draft-status").textContent = draft.scheduled ? deliveryStatusLabel(status) : (draft.contentReady ? "육안 검수·승인 대기" : "원고 업데이트 필요");
    $("ig-y-draft-status").classList.toggle("ig-pass", ["published","scheduled"].includes(status));
    const actualTime=draft.schedule?.publishedAt || draft.schedule?.scheduledAt;
    $("ig-y-result").textContent = status==="published" ? "✓ "+new Date(actualTime).toLocaleString("ko-KR",{timeZone:"Asia/Seoul"})+" (한국 시간) 게시 완료 · 중복 게시 차단" :
      status==="scheduled" ? "예약 날짜·시간을 수정한 뒤 다시 승인하면 예약 시간을 변경할 수 있습니다." :
      draft.scheduled ? "처리 결과 확인이 필요합니다. 중복 방지를 위해 재게시를 차단했습니다." :
      "각 이미지를 크게 확인하고 승인하면, 선택한 시간에 예약하거나 지금 바로 게시할 수 있습니다.";
  }

  function startGenerationProgress() {
    const startedAt = Date.now();
    $("ig-y-generate-elapsed").textContent='00:00';
    $("ig-y-generate-message").textContent='OpenAI 이미지 생성 응답을 기다립니다. 응답 후 한글 합성과 파일 검사를 진행합니다. 최대 4분 정도 걸릴 수 있어요.';
    $("ig-y-generate-progress").classList.remove("hidden");
    generationTimer = window.setInterval(() => {
      const seconds = Math.floor((Date.now() - startedAt) / 1000);
      $("ig-y-generate-elapsed").textContent = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
    }, 1000);
  }

  function stopGenerationProgress() {
    if (generationTimer) window.clearInterval(generationTimer);
    generationTimer = null;
    $("ig-y-generate-progress").classList.add("hidden");
  }

  async function generateYeonlijiDraft(topicId = selectedYeonlijiTopicId, sourceDraftId = '') {
    if(yeonlijiGenerating) return;
    const date = $(sourceDraftId ? "ig-y-schedule-date" : "ig-y-create-date").value;
    const time = $(sourceDraftId ? "ig-y-schedule-time" : "ig-y-create-time").value;
    if (!topicId) return void ($("ig-y-generate-error").textContent = "먼저 위의 주제 10개 중 하나를 선택해주세요.");
    if (!date || !time) return void ($("ig-y-generate-error").textContent = "게시 날짜와 시간을 확인해주세요.");
    if(!sourceDraftId && !window.confirm("새 그림 생성은 OpenAI API 비용이 발생합니다. 생성 비용에 동의하고 진행할까요?")) return;
    yeonlijiGenerating=true;
    $("ig-y-refresh-topics").disabled=true;
    $("ig-y-generate-error").textContent = "";
    $("ig-y-generate").disabled = true;
    $("ig-y-regenerate").disabled = true;
    $("ig-y-generate").textContent = "7장 시안 만드는 중…";
    startGenerationProgress();
    if(sourceDraftId) $("ig-y-generate-message").textContent="추가 API 호출 없이 기존 그림에 새 원고·한자를 합성하고 검사합니다.";
    let createdDraft = false;
    try {
      yeonlijiVariant += 1;
      const result = await request("/api/instagram/yeonliji/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topicId, date, time, sourceDraftId, mode:sourceDraftId?"recompose":"paid", allowPaid:!sourceDraftId }) });
      const draftId = result.draftId || result.draft?.id || result.id || "";
      await loadYeonlijiStudio(draftId);
      selectedYeonlijiTopicId = '';
      createdDraft = true;
      $("ig-y-result").textContent = "✓ 새 7장 시안이 완성됐습니다. 이미지를 눌러 크게 확인해주세요.";
      document.querySelector("#ig-y-draft-select")?.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch (error) {
      $("ig-y-generate-error").textContent = friendlyYeonlijiError(error);
      if(sourceDraftId) $("ig-y-error").textContent=friendlyYeonlijiError(error);
    } finally {
      stopGenerationProgress();
      yeonlijiGenerating=false;
      if(createdDraft) await loadYeonlijiTopics(true);
      $("ig-y-refresh-topics").disabled=false;
      $("ig-y-generate").disabled = !selectedYeonlijiTopicId || !yeonlijiConfigured;
      $("ig-y-generate").textContent = selectedYeonlijiTopicId ? "선택한 주제로 7장 이미지 시안 만들기" : "주제를 먼저 선택해주세요";
      const draft = yeonlijiDrafts.find((item) => item.id === $("ig-y-draft-select").value);
      $("ig-y-regenerate").disabled = !currentDraftTopicId(draft) || !draft?.recomposeAvailable;
    }
  }

  async function scheduleYeonlijiDraft() {
    if(yeonlijiDelivering || !yeonlijiDeliveryReady) return;
    const draftId = $("ig-y-draft-select").value;
    const draft=yeonlijiDrafts.find(d=>d.id===draftId);
    const date=$("ig-y-schedule-date").value, time=$("ig-y-schedule-time").value;
    if(!$("ig-y-confirm").checked) return;
    if(draft?.schedule?.status==="scheduled" && !yeonlijiDeliveryReady) return;
    if(!date || !time || new Date(`${date}T${time}:00+09:00`).getTime()<=Date.now()) { $("ig-y-error").textContent='현재보다 미래의 예약 날짜와 시간을 선택해주세요.'; return; }
    yeonlijiDelivering=true;
    $("ig-y-confirm").disabled=true;$("ig-y-publish-now").disabled=true;
    $("ig-y-error").textContent = ""; $("ig-y-result").textContent = "7장 원본 재검수 → 공개 이미지 등록 → 예약 중…"; $("ig-y-schedule").disabled = true;
    try {
      const result = await request(draft?.schedule?.status==="scheduled"?"/api/instagram/yeonliji/reschedule":"/api/instagram/yeonliji/schedule", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draftId, date, time, confirm: true }) });
      $("ig-y-result").textContent = result.duplicatePrevented ? "✓ 이미 등록된 동일 시안을 확인했습니다. 중복 예약은 만들지 않았습니다." : "✓ 연리지 실타래 예약 등록 완료";
      await loadYeonlijiStudio();
    } catch (error) { $("ig-y-error").textContent = friendlyYeonlijiError(error); $("ig-y-confirm").disabled=false; $("ig-y-confirm").checked=false; }
    finally { yeonlijiDelivering=false; }
  }

  async function publishYeonlijiNow() {
    if(yeonlijiDelivering || !yeonlijiDeliveryReady) return;
    const draft=yeonlijiDrafts.find(d=>d.id===$("ig-y-draft-select").value);
    if(!draft || draft.scheduled || !draft.contentReady || !$("ig-y-confirm").checked) return;
    if(!window.confirm("@knot_saju에 ‘"+(draft.displayTitle||draft.title)+"’ 7장을 지금 공개 게시할까요?")) return;
    yeonlijiDelivering=true;
    $("ig-y-publish-now").disabled=true;$("ig-y-schedule").disabled=true;$("ig-y-confirm").disabled=true;
    $("ig-y-result").textContent="계정·중복 확인 → 이미지 등록 → Instagram 게시 중입니다. 다시 누르지 마세요.";
    $("ig-y-error").textContent="";
    try{
      const result=await request("/api/instagram/yeonliji/publish-now",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({draftId:draft.id,confirm:true})});
      await loadYeonlijiStudio(draft.id);
      $("ig-y-result").textContent=result.duplicatePrevented?"이미 게시된 동일 콘텐츠입니다. 중복 게시하지 않았습니다.":"✓ 지금 게시 완료 · Instagram ID "+result.post.publishedId;
      if(result.historyWarning) $("ig-y-error").textContent=result.historyWarning;
    }catch(error){
      $("ig-y-error").textContent=error.message+" 결과가 불확실하면 재게시하지 말고 상태를 확인해주세요.";
      $("ig-y-result").textContent="게시 완료를 확인하지 못했습니다.";
      try{await loadYeonlijiStudio(draft.id);}catch{}
    } finally { yeonlijiDelivering=false; }
  }

  function selectInstagramStudio(key) {
    const isPalja = key === "palja";
    document.querySelectorAll("[data-ig-studio]").forEach((button) => button.classList.toggle("selected", button.dataset.igStudio === key));
    $("ig-palja-workspace").classList.toggle("hidden", !isPalja);
    $("ig-yeonliji-workspace").classList.toggle("hidden", isPalja);
    $("ig-account-select").value = key;
    updateInstagramAccountSafety();
    if (!isPalja) {
      if (!yeonlijiTopics.length) loadYeonlijiTopics().catch(() => {});
      loadYeonlijiStudio().catch((error) => {
        const message = friendlyYeonlijiError(error);
        $("ig-y-error").textContent = message;
        $("ig-character-bible").innerHTML = `<div class="wide"><b>앱을 다시 실행해주세요</b><span>${escapeHtml(message)}</span></div>`;
      });
    }
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

  async function connectInstagram({insights=false, accountKey: requestedAccountKey}={}) {
    const meta = await request("/api/meta");
    if (!meta.instagramOAuthConfigured) {
      $("ig-meta-setup").open = true;
      throw new Error("먼저 위의 Meta Instagram 앱 ID와 시크릿을 저장해주세요.");
    }
    const state = randomState();
    const accountKey = requestedAccountKey || $("ig-account-select").value;
    const target = instagramAccounts.find((account) => account.key === accountKey);
    const status = $("ig-oauth-status");
    const authorizePath = `/oauth/instagram/start?state=${encodeURIComponent(state)}&accountKey=${encodeURIComponent(accountKey)}&insights=${insights?"1":"0"}`;
    const popup = window.open(authorizePath, "_blank");
    status.textContent = `${target?.label || "선택 계정"} @${target?.username || ""}: ${insights ? "통계 읽기 권한을 포함해 " : ""}승인해주세요. 승인 후 Cloudflare 주소를 아래에 붙여넣고 ‘승인 주소 처리’까지 눌러야 연결됩니다. `;
    const retryLink = document.createElement("a");
    retryLink.href = authorizePath;
    retryLink.target = "_blank";
    retryLink.rel = "noopener";
    retryLink.textContent = "승인창이 안 보이면 여기를 눌러 열기";
    status.appendChild(retryLink);
    $("ig-callback-help").classList.remove("hidden");
    const deadline = Date.now() + 5 * 60 * 1000;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      const result = await request(`/api/oauth/instagram/result?state=${encodeURIComponent(state)}`);
      if (result.status === "pending") continue;
      if (result.status === "error") throw new Error(result.error);
      try { popup?.close(); } catch {}
      status.textContent = result.accountKey === "palja"
        ? (result.cloudSynced ? "✓ 팔자명가 Instagram 연결 및 클라우드 자동 게시 설정 완료" : `✓ 팔자명가 로컬 연결 완료 · 클라우드 동기화 확인 필요: ${result.cloudSyncError || "알 수 없는 오류"}`)
        : `✓ ${result.label} 연결 완료 · 팔자명가 클라우드 설정은 변경하지 않았습니다.`;
      await loadInstagramAccounts();
      $("ig-account-select").value = result.accountKey;
      updateInstagramAccountSafety();
      await preflight();
      return;
    }
    status.textContent = "아직 연결 완료를 확인하지 못했습니다. 승인한 Cloudflare 주소를 아래에 붙여넣고 ‘승인 주소 처리’를 눌러주세요. 10분이 지났다면 통계 권한 연결을 다시 시작해주세요.";
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
  $("ig-y-refresh-topics").addEventListener("click", () => loadYeonlijiTopics(true));
  $("ig-y-generate").addEventListener("click", () => generateYeonlijiDraft());
  $("ig-y-preview-plan").addEventListener("click", async () => {
    const topicId=selectedYeonlijiTopicId, date=$("ig-y-create-date").value, time=$("ig-y-create-time").value;
    $("ig-y-preview-plan").disabled=true;
    try {
      const plan=await request("/api/instagram/yeonliji/plan?"+new URLSearchParams({topicId,date,time}));
      if(topicId!==selectedYeonlijiTopicId) return;
      $("ig-y-plan-preview").innerHTML=plan.cards.map((c,i)=>'<article><b>'+escapeHtml((i+1)+'장 · '+c.eyebrow)+'</b><strong>'+escapeHtml(c.title.join(' '))+'</strong><span>'+escapeHtml(c.body.join(' '))+'</span></article>').join('');
    } catch(error) { $("ig-y-generate-error").textContent=error.message; }
    finally { $("ig-y-preview-plan").disabled=!selectedYeonlijiTopicId; }
  });
  [$("ig-y-create-date"),$("ig-y-create-time")].forEach(input=>input.addEventListener('change',()=>{ $("ig-y-plan-preview").innerHTML="날짜가 바뀌었습니다. 원고 미리보기를 다시 눌러주세요."; }));
  $("ig-y-refresh-drafts").addEventListener("click", async () => {
    const button = $("ig-y-refresh-drafts");
    button.disabled = true;
    $("ig-y-error").textContent = "";
    try { await loadYeonlijiStudio(); }
    catch (error) { $("ig-y-error").textContent = friendlyYeonlijiError(error); }
    finally { button.disabled = false; }
  });
  $("ig-y-regenerate").addEventListener("click", () => {
    const topicId = $("ig-y-regenerate").dataset.topicId;
    if (topicId) {
      selectedYeonlijiTopicId = topicId;
      generateYeonlijiDraft(topicId, $("ig-y-draft-select").value);
    }
  });
  $("ig-y-confirm").addEventListener("change", () => { const draft = yeonlijiDrafts.find((item) => item.id === $("ig-y-draft-select").value); $("ig-y-schedule").disabled = yeonlijiDelivering || !yeonlijiDeliveryReady || !$("ig-y-confirm").checked || !draft || (draft.scheduled && draft.schedule?.status!=="scheduled") || !draft.contentReady || draft.validation?.status !== "passed";
    $("ig-y-publish-now").disabled=yeonlijiDelivering || !yeonlijiDeliveryReady || !$("ig-y-confirm").checked || !draft || draft.scheduled || !draft.contentReady || draft.validation?.status!=="passed"; });
  $("ig-y-schedule").addEventListener("click", scheduleYeonlijiDraft);
  $("ig-y-publish-now").addEventListener("click",publishYeonlijiNow);
  [$("ig-y-schedule-date"),$("ig-y-schedule-time")].forEach(input=>input.addEventListener('change',()=>{ $("ig-y-confirm").checked=false; $("ig-y-schedule").disabled=true; $("ig-y-publish-now").disabled=true; }));
  [$("ig-start-date"), $("ig-end-date")].forEach((input) => input.addEventListener("change", () => { validatedRangeKey = null; $("ig-confirm-reviewed").checked = false; }));
  window.loadInstagramDashboard = () => { loadInstagramAccounts().catch((error) => { $("ig-schedule-error").textContent = error.message; }); if (!$("ig-card-grid").children.length) loadPreview(); };
  window.connectInstagramInsights=async accountKey=>{
    if(!["palja","yeonliji"].includes(accountKey)) return;
    if(typeof switchTab==="function") switchTab("instagram");
    await loadInstagramAccounts();
    selectInstagramStudio(accountKey);
    $("ig-oauth-connect").scrollIntoView({behavior:"smooth",block:"center"});
    try { return await connectInstagram({insights:true,accountKey}); }
    catch(error) { $("ig-oauth-status").textContent=error.message; }
  };
})();
