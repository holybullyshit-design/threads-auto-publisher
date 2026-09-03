(() => {
  const status = document.getElementById("status");
  const connect = document.getElementById("connect");
  const callbackStep = document.getElementById("callback-step");
  const callbackUrl = document.getElementById("callback-url");
  const complete = document.getElementById("complete");
  const message = document.getElementById("message");
  let state = "";

  async function request(url, options) {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  }

  async function refresh() {
    const data = await request("/api/youtube/status");
    if (!data.oauthConfigured) {
      status.textContent = "OAuth 보안 파일을 찾지 못했습니다.";
      connect.disabled = true;
      return;
    }
    if (data.connected) {
      status.textContent = `✓ ${data.channelTitle} 채널 연결됨`;
      connect.textContent = "YouTube 계정 다시 연결";
      message.textContent = data.channelId === data.expectedChannelId ? "팔자명가 채널 ID까지 일치합니다." : "채널 ID가 팔자명가와 다릅니다. 다시 연결해주세요.";
    } else status.textContent = "아직 YouTube 계정이 연결되지 않았습니다.";
  }

  connect.addEventListener("click", async () => {
    try {
      connect.disabled = true; message.textContent = "Google 승인 화면을 여는 중…";
      const data = await request("/api/youtube/oauth/start", { method: "POST" });
      state = data.state;
      window.open(data.authorizeUrl, "_blank", "noopener");
      callbackStep.hidden = false;
      message.textContent = "Google에서 팔자명가 계정을 선택하고 승인한 뒤, 마지막 주소를 아래에 붙여넣으세요.";
    } catch (error) { message.textContent = `연결 시작 실패: ${error.message}`; }
    finally { connect.disabled = false; }
  });

  complete.addEventListener("click", async () => {
    try {
      complete.disabled = true; message.textContent = "승인 코드와 실제 YouTube 채널을 확인 중…";
      const url = new URL(callbackUrl.value.trim());
      if (url.hostname !== "threads-publish-pinger.threadsautopub.workers.dev" || url.pathname !== "/oauth/youtube/callback") throw new Error("Google 승인 후 열린 Cloudflare 주소 전체를 붙여넣어주세요.");
      if (!url.searchParams.get("code") || !url.searchParams.get("state")) throw new Error("주소에 Google 승인 코드가 없습니다.");
      if (state && url.searchParams.get("state") !== state) throw new Error("현재 연결 요청과 다른 승인 주소입니다. 처음부터 다시 연결해주세요.");
      const result = await request(`/oauth/youtube/callback?${url.searchParams.toString()}`);
      if (result.status !== "done") throw new Error(result.error || "연결 결과를 확인하지 못했습니다.");
      callbackStep.hidden = true;
      message.textContent = `✓ ${result.channelTitle} 채널 연결 완료`;
      await refresh();
    } catch (error) { message.textContent = `처리 실패: ${error.message}`; }
    finally { complete.disabled = false; }
  });

  refresh().catch((error) => { status.textContent = `상태 확인 실패: ${error.message}`; });
})();
