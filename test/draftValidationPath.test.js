// 2026-10-06: 명리 사실 검증기를 엔진에 "연결했다"고 보고했는데, 실제로는 require 한 줄이
// 안 들어가서 런타임에 `checkSajuClaims is not defined`로 모든 생성이 실패했다. 그런데
// npm test는 전부 통과했다 — 기존 테스트가 사실 블록(build())만 보고, 완성된 글을 만드는
// 경로(writeThreadDraft)를 한 번도 타지 않았기 때문이다.
//
// 그래서 이 테스트는 **생성 경로 자체**를 탄다. runSkill(= claude CLI 호출)만 가짜로 바꿔서
// API 없이 돌리고, 검증 층이 실제로 작동하는지 확인한다. 이제 require가 빠지거나 검증 호출이
// 사라지면 여기서 바로 깨진다.

const test = require("node:test");
const assert = require("node:assert");
const Module = require("node:module");

// runSkill을 가로채서, 엔진이 요청한 파트 수에 맞는 가짜 "AI 응답"을 돌려준다.
// 파트 수(partCount)는 엔진이 3~6 중 무작위로 정하고 system 프롬프트에 적어 보내므로,
// 거기서 읽어와 개수를 맞춘다 - 안 맞추면 파트 수 검사에서 먼저 걸려서, 정작 확인하려는
// 명리 사실 검증 층에 도달하지 못한다(이 테스트를 처음 썼을 때 실제로 그래서 "잘못된 이유로
// 통과"했다).
let partBodies = [];
const origLoad = Module._load;
Module._load = function (request) {
  if (request.endsWith("claudeCliEngine")) {
    return {
      runSkill: async ({ system }) => {
        // 프롬프트의 "전체 파트 수는 N개." 문장에서 정확히 읽는다(다른 숫자에 걸리면
        // 파트 수 불일치로 먼저 실패해서 명리 검증까지 도달하지 못한다).
        const m = system.match(/전체 파트 수는\s*(\d+)\s*개/);
        assert.ok(m, "프롬프트에서 파트 수를 못 읽었다 - 프롬프트 문구가 바뀌었는지 확인");
        const n = Number(m[1]);
        const out = [];
        for (let i = 0; i < n; i++) out.push(partBodies[i % partBodies.length]);
        return out.join("\n===PART===\n");
      },
    };
  }
  return origLoad.apply(this, arguments);
};
delete require.cache[require.resolve("../server/skills/taebaekSajuDraftWriter")];
const { writeThreadDraft } = require("../server/skills/taebaekSajuDraftWriter");
Module._load = origLoad;

test("생성 경로가 끝까지 돌고, 틀린 명리 주장은 거부된다", async () => {
  // 일부러 틀린 주장(띠-연도 불일치 + 오행 상극 오류 + 지지 충 오류)을 넣는다.
  partBodies = [
    "<이 세 띠 주목>\n\n호랑이띠(1999·1986·1974)\n말띠(2002·1990·1978)\n개띠(2006·1994·1982)\n\n이 셋 아니면 해당 없습니다. 생활 장면으로 이어집니다.",
    "목극금이라 부딪힙니다.\n\n자축충이라 더 그렇습니다.\n\n태어난 날과 시간을 봐야 어느 쪽인지 나옵니다. 프로필에서 상담 신청하세요.",
  ];
  let err = null;
  try {
    await writeThreadDraft({ dateKey: "2026-10-20", accountLabel: "팔자장인", topicId: "dohwa", hookFormatId: "topRank" });
  } catch (e) {
    err = e;
  }
  assert.ok(err, "틀린 주장이 들어간 글이 그대로 통과했다 - 검증 층이 호출되지 않는다");
  // 파트 수/길이 같은 다른 검사에 먼저 걸려서 "잘못된 이유로 통과"하는 걸 막는다.
  assert.match(err.message, /명리 사실 검증 실패/, `명리 검증이 아닌 다른 이유로 실패했다: ${err.message}`);
  assert.doesNotMatch(err.message, /is not defined|is not a function|Cannot read/, `코드가 깨졌다: ${err.message}`);
});

test("사실에 맞는 글은 생성 경로를 통과한다", async () => {
  partBodies = [
    "<이 세 띠 주목>\n\n호랑이띠(1998·1986·1974)\n말띠(2002·1990·1978)\n개띠(2006·1994·1982)\n\n이 셋 아니면 해당 없습니다. 단톡방에서 반응이 먼저 오는 쪽입니다.",
    "원국(사주 여덟 글자를 펼친 표) 어딘가에 묘(토끼띠) 글자가 있어야 성립해요.\n\n태어난 날과 시간을 봐야 어느 자리인지 나옵니다. 프로필에서 상담 신청하세요.",
  ];
  const draft = await writeThreadDraft({ dateKey: "2026-10-20", accountLabel: "팔자장인", topicId: "dohwa", hookFormatId: "topRank" });
  assert.ok(draft.text && draft.text.length > 10);
  assert.ok(Array.isArray(draft.replyChain) && draft.replyChain.length >= 1);
});

test("엔진 모듈이 검증기를 실제로 들고 있다(require 누락 방지)", () => {
  const src = require("node:fs").readFileSync(require.resolve("../server/skills/taebaekSajuDraftWriter"), "utf8");
  assert.match(src, /require\(["']\.\.\/lib\/sajuClaimChecker["']\)/, "taebaekSajuDraftWriter가 검증기를 require하지 않는다");
  assert.match(src, /checkSajuClaims\(/, "taebaekSajuDraftWriter가 checkSajuClaims를 호출하지 않는다");

  const src2 = require("node:fs").readFileSync(require.resolve("../server/skills/sajuDraftWriter"), "utf8");
  assert.match(src2, /require\(["']\.\.\/lib\/sajuClaimChecker["']\)/, "sajuDraftWriter가 검증기를 require하지 않는다");
  assert.match(src2, /checkSajuClaims\(/, "sajuDraftWriter가 checkSajuClaims를 호출하지 않는다");
});
