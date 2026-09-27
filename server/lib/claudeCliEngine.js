// 초안 생성 엔진: Anthropic API(별도 결제 키)가 아니라, 이미 로그인되어 있는
// Claude Code CLI를 헤드리스 모드(`claude -p`)로 호출해서 텍스트를 받아온다.
//
// - 별도의 ANTHROPIC_API_KEY가 필요 없다 (Claude Code에 로그인된 계정 인증을 그대로 사용).
// - --permission-mode dontAsk + 허용 도구 없음 => Claude가 파일을 읽거나 명령을 실행할 수 없고,
//   오직 텍스트 응답만 돌아온다 (안전하고, 응답이 지연/중단될 위험도 없음).
// - 참고: 호출마다 Claude Code 자체의 기본 컨텍스트가 함께 로드되기 때문에,
//   순수 Anthropic API 호출보다 호출당 비용/사용량이 더 크다. (README 참고)

const { execFile } = require("child_process");

// 2026-09-27 실측 사고: 전역 설정(~/.claude/settings.json)이 model=opus, effortLevel=high로
// 바뀌면서 이 CLI 호출까지 그 설정을 물려받아, 글 한 편에 생각 토큰 12,000개·2분 47초·$0.81이
// 들었다(엔진 타임아웃 2분을 넘겨 50건 중 49건이 실패). 초안 작성은 무거운 추론이 필요한
// 작업이 아니므로 모델과 추론 수준을 여기서 못박는다. 바꾸고 싶으면 환경변수로 덮어쓴다.
const SKILL_MODEL = process.env.CLAUDE_SKILL_MODEL || "sonnet";
const SKILL_EFFORT = process.env.CLAUDE_SKILL_EFFORT || "medium";
const TIMEOUT_MS = Number(process.env.CLAUDE_SKILL_TIMEOUT_MS || 300000); // 5분

function runSkill({ system, userMessage }) {
  return new Promise((resolve, reject) => {
    const child = execFile(
      "claude",
      [
        "-p",
        userMessage,
        "--system-prompt",
        system,
        "--output-format",
        "json",
        "--permission-mode",
        "dontAsk",
        "--model",
        SKILL_MODEL,
        "--effort",
        SKILL_EFFORT,
      ],
      { timeout: TIMEOUT_MS, maxBuffer: 20 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          if (err.code === "ENOENT") {
            return reject(
              new Error(
                "claude CLI를 찾을 수 없습니다. Claude Code가 설치되어 있고 PATH에 등록되어 있는지 확인해주세요."
              )
            );
          }
          if (err.killed) {
            return reject(new Error(`claude CLI 응답이 시간 초과되었습니다 (${Math.round(TIMEOUT_MS / 60000)}분). 다시 시도해주세요.`));
          }
          return reject(new Error(`claude CLI 실행 실패: ${stderr || err.message}`));
        }

        let data;
        try {
          data = JSON.parse(stdout);
        } catch {
          return reject(new Error("claude CLI 응답을 해석하지 못했습니다: " + stdout.slice(0, 300)));
        }

        if (data.is_error || data.subtype !== "success") {
          return reject(new Error("claude CLI 실행 중 오류: " + (data.result || JSON.stringify(data))));
        }

        resolve(String(data.result || "").trim());
      }
    );
    // stdin을 아무것도 안 주고 열어두면, claude CLI가 "입력을 기다려야 하나?" 하고 몇 초
    // 대기하다가 경고를 찍는 경우가 있다(짧은 호출을 여러 번 연달아 부를 때 특히 잘 걸림).
    // 어차피 이 호출은 인자로 프롬프트를 다 넘기고 stdin은 안 쓰므로, 즉시 EOF를 줘서
    // "입력 없음"을 바로 알려준다.
    child.stdin.end();
  });
}

module.exports = { runSkill };
