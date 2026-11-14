// 만세력(간지) 계산 전용 모듈.
// 2026-11-14: 팔자명가 Instagram "오늘의 띠별 운세" 생성 기능은 인스타 운영 중단으로 전부 삭제했다.
// sajuFacts.js가 쓰는 calculateCalendar만 남긴다 - 이게 스레드 글 명리 검증의 입력이다.
const { Solar } = require("lunar-javascript");

const STEMS = [..."甲乙丙丁戊己庚辛壬癸"];
const BRANCHES = [..."子丑寅卯辰巳午未申酉戌亥"];
const STEMS_KO = ["갑", "을", "병", "정", "무", "기", "경", "신", "임", "계"];
const BRANCHES_KO = ["자", "축", "인", "묘", "진", "사", "오", "미", "신", "유", "술", "해"];
const ANIMALS = ["쥐", "소", "호랑이", "토끼", "용", "뱀", "말", "양", "원숭이", "닭", "개", "돼지"];

function parseDateKey(dateKey) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey || "")) throw Object.assign(new Error("날짜는 YYYY-MM-DD 형식이어야 합니다."), { status: 400 });
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.toISOString().slice(0, 10) !== dateKey) throw Object.assign(new Error("존재하지 않는 날짜입니다."), { status: 400 });
  return { year, month, day, date };
}

function ganzhiKo(value) {
  return `${STEMS_KO[STEMS.indexOf(value[0])]}${BRANCHES_KO[BRANCHES.indexOf(value[1])]}`;
}

function calculateCalendar(dateKey) {
  const { year, month, day } = parseDateKey(dateKey);
  // 절입 당일은 시간에 따라 월주가 바뀌므로 게시 약속 시각인 06:00 KST를 기준으로 계산한다.
  const lunar = Solar.fromYmdHms(year, month, day, 6, 0, 0).getLunar();
  const eightChar = lunar.getEightChar();
  const result = {
    year: eightChar.getYear(),
    month: eightChar.getMonth(),
    day: eightChar.getDay(),
  };
  result.dayStem = STEMS.indexOf(result.day[0]);
  result.dayBranch = BRANCHES.indexOf(result.day[1]);
  result.korean = `${ganzhiKo(result.year)}년 · ${ganzhiKo(result.month)}월 · ${ganzhiKo(result.day)}일`;
  if (result.dayStem < 0 || result.dayBranch < 0) throw new Error("만세력 계산 결과를 해석할 수 없습니다.");
  return result;
}


module.exports = { ANIMALS, BRANCHES, calculateCalendar, parseDateKey };
