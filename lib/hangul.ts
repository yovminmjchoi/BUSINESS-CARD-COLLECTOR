// 문자열 첫 글자의 색인 라벨: 한글 초성(ㄱ~ㅎ) / 영문 A~Z / 그 외 #

const CHO = [
  "ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ",
  "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
];
// 쌍자음은 기본 자음 섹션으로 묶음
const BASE: Record<string, string> = {
  "ㄲ": "ㄱ", "ㄸ": "ㄷ", "ㅃ": "ㅂ", "ㅆ": "ㅅ", "ㅉ": "ㅈ",
};

export function initialOf(s: string | null | undefined): string {
  const t = (s ?? "").trim();
  if (!t) return "#";
  const ch = t[0];
  const code = ch.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) {
    const cho = CHO[Math.floor((code - 0xac00) / 588)];
    return BASE[cho] ?? cho;
  }
  if (/[a-zA-Z]/.test(ch)) return ch.toUpperCase();
  return "#";
}
