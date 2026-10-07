// 댓글로 받은 생년월일시에 달아줄 **답글 초안**을 쓴다.
//
// 왜 필요한가(2026-10-07): 조회수는 주간 26만인데 유료 전환이 거의 없었다. 원인 중 하나가
// "답글로 받는 무료 풀이가 충분하게 느껴지면 거기서 끝난다"는 것이다. 그래서 이 답글은
// **일부러 끊는다** — 계산된 사실 하나를 정확히 짚어주되, 그 다음(대운·전체 원국)은 상담에서
// 본다고 명시한다. 신뢰는 주고 결론은 안 주는 구조다.
//
// 안전장치: 사실은 전부 사주 엔진이 계산한 것만 넘긴다. AI는 그걸 문장으로 풀 뿐이고,
// 생성물은 sajuClaimChecker를 통과해야 저장된다(명리 주장이 틀리면 재시도).
// "무료"라는 말은 절대 쓰지 않는다(사용자 지시).

const { runSkill } = require("../lib/claudeCliEngine");
const { checkSajuClaims } = require("../lib/sajuClaimChecker");
const S = require("../lib/saju");

const RETRY_ATTEMPTS = 3;
const MAX_LEN = 480; // Threads 500자 제한 안쪽

// 계정별 말투. 콘텐츠 엔진의 페르소나와 결을 맞춘다.
const TONES = {
  "연리지 실타래": { speech: "반말", domain: "연애·궁합", closing: "꼬인 실타래를 풀어볼게🧶" },
  "아해사주": { speech: "존댓말", domain: "아이 기질·성장", closing: "아이의 기질(氣質), 함께 짚어드릴게요." },
  "팔자장인": { speech: "존댓말", domain: "종합(연애·직장·재물)", closing: null },
  "팔자궤도": { speech: "반말", domain: "직장·이직·시기", closing: null },
  "팔자명가": { speech: "반말", domain: "직장·사업", closing: null },
};

// 엔진이 계산한 것 중, 답글에서 "하나만" 짚어줄 거리를 고른다.
// 고르는 기준은 고정이다(랜덤 아님) — 같은 사주면 같은 포인트가 나와야 한다.
function pickHighlight(a) {
  const { chart, strength, sinsal, relations } = a;
  // 1순위: 일지(배우자/자신 자리)에 걸린 신살
  const atDay = sinsal.found.find((x) => x.at.some((p) => p.pillar === "day"));
  if (atDay) return { kind: "신살", name: atDay.name, where: "일주(나 자신·배우자 자리)", detail: atDay.basis };
  // 2순위: 원국 안의 합·충
  const chung = relations.충[0] || relations.천간충[0];
  if (chung) return { kind: "관계", name: chung.desc, where: (chung.between || []).join("-"), detail: `${chung.name}` };
  const hap = relations.육합[0] || relations.천간합[0];
  if (hap) return { kind: "관계", name: hap.desc, where: (hap.between || []).join("-"), detail: `${hap.name}` };
  // 3순위: 없는 오행
  if (strength.missingElements.length) {
    return { kind: "오행", name: `${strength.missingElements.join("·")}가 없음`, where: "원국 전체", detail: `${chart.dayStem} 일간` };
  }
  // 4순위: 가장 센 오행
  return { kind: "오행", name: `${strength.strongestElement}이 ${strength.elementPercent[strength.strongestElement]}%`, where: "원국 전체", detail: `${chart.dayStem} 일간` };
}

function buildFacts(a) {
  const { chart, strength, sinsal } = a;
  const h = pickHighlight(a);
  const foundNames = sinsal.found.filter((x) => x.name !== "공망").map((x) => `${x.name}(${x.at.map((p) => p.label).join("·")})`);
  return `[엔진이 계산한 사실 - 이것만 쓸 것, 새로 지어내지 말 것]
원국: ${chart.summary}${chart.timeUnknown ? " (태어난 시간을 몰라 시주 없음)" : ""}
일간: ${chart.dayStem}(${chart.dayStemElement}·${chart.dayStemYinYang})
오행 분포: ${Object.entries(strength.elementPercent).map(([e, p]) => `${e} ${p}%`).join(" / ")}
없는 오행: ${strength.missingElements.join("·") || "없음"}
신강약: ${strength.verdict} (${strength.basis})
성립하는 신살: ${foundNames.join(", ") || "없음"}
원국 안의 관계: ${a.relations.summary}
${a.currentDaeun ? `현재 대운: ${a.currentDaeun.ganji} (${a.currentDaeun.startAge}~${a.currentDaeun.endAge}세, 천간 ${a.currentDaeun.tenGodOfStem})` : ""}

[이 답글에서 짚어줄 포인트 - 딱 이것 하나만]
${h.kind}: ${h.name} / 자리: ${h.where}
근거: ${h.detail}`;
}

function buildSystem(accountLabel, tone, facts) {
  return `당신은 사주 상담 계정 "${accountLabel}"의 전속 작가입니다. 댓글로 생년월일시를 남긴 사람에게
달아줄 **짧은 답글**을 씁니다.

${facts}

[이 답글의 목적 - 아주 중요]
무료로 전체 풀이를 해주는 자리가 아닙니다. **신뢰는 주고, 결론은 주지 않습니다.**
위에서 지정한 포인트 **하나만** 정확히 짚어서 "어, 맞네" 소리가 나오게 하고,
그 다음은 전체 원국과 대운을 같이 봐야 나온다고 명확히 끊습니다.

[작성 규칙]
- 어체: ${tone.speech}. ${tone.speech === "반말" ? "반말이되 무례하지 않고 담백하게." : "정중하고 다정하게."}
- 전체 ${MAX_LEN}자 이내. 짧을수록 좋습니다(200~350자 권장).
- 구조: ① 지정된 포인트 하나를 짚고 그게 생활에서 어떻게 나타나는지 1~2줄
        ② 그런데 이것만으로는 "언제", "어느 쪽으로" 가 안 나온다고 명시
        ③ 전체 원국과 대운을 같이 봐야 한다고 한 줄
        ④ 프로필에서 상담 신청하라고 안내${tone.closing ? `\n        ⑤ 마지막 줄에 정확히 이 문구: "${tone.closing}"` : ""}
- 위 [사실]에 없는 명리 내용을 **절대 새로 만들지 마세요**. 신살 이름, 지지, 오행, 십성은
  전부 사실 블록에 적힌 것만 씁니다. 사실에 없는 띠·연도·신살을 지어내면 틀린 답글이 됩니다.
- 명리 용어를 쓰면 괄호나 다음 줄에 짧게 풀어줍니다(독자가 모를 수 있음).
- **"무료"라는 단어와 그 뉘앙스를 절대 쓰지 않습니다.** 공짜로 더 봐주겠다는 말도 금지입니다.
- 단정적 확언(반드시 ~된다), 의료·법률·재정 확언, 공포 조장은 하지 않습니다.
- 결과물은 답글 본문 텍스트만 출력합니다. 설명·따옴표·마크다운 기호를 붙이지 마세요.`;
}

/**
 * 답글 초안을 쓴다.
 * @param {object} birth { year, month, day, hour?, minute?, gender, calendar? }
 * @param {object} opts  { accountLabel, refDate }
 */
async function writeSajuReply(birth, opts = {}) {
  const accountLabel = opts.accountLabel || "팔자장인";
  const tone = TONES[accountLabel];
  if (!tone) throw new Error(`말투를 모르는 계정입니다: ${accountLabel} (${Object.keys(TONES).join(", ")} 중 하나)`);

  const analysis = S.analyze(birth, { refDate: opts.refDate });
  const facts = buildFacts(analysis);
  const system = buildSystem(accountLabel, tone, facts);

  let lastErr;
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      const raw = await runSkill({ system, userMessage: "위 사실을 바탕으로 답글을 써주세요." });
      const text = String(raw || "").trim();
      if (!text) throw new Error("빈 응답");
      if (text.length > MAX_LEN) throw new Error(`${text.length}자 - ${MAX_LEN}자 제한 초과`);
      if (/무료|공짜/.test(text)) throw new Error('"무료" 표현이 들어갔습니다');
      // 명리 주장이 틀리면 저장하지 않는다.
      const issues = checkSajuClaims(text, { dateKey: opts.refDate });
      if (issues.length) throw new Error(`명리 사실 검증 실패: ${issues.join(" / ")}`);
      if (tone.closing && !text.includes(tone.closing)) throw new Error("계정 고유 클로징 문구가 빠졌습니다");
      return { text, analysis, highlight: pickHighlight(analysis), facts };
    } catch (err) {
      lastErr = err;
      if (opts.verbose) console.log(`  (시도 ${attempt}/${RETRY_ATTEMPTS} 실패: ${err.message})`);
    }
  }
  throw lastErr;
}

module.exports = { writeSajuReply, pickHighlight, TONES };
