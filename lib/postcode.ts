// 한국 주소 검색 (다음/카카오 우편번호 서비스, 무료). 클라이언트에서만 사용.
// 버튼 → 팝업에서 주소 선택 → 영문 도로명 + 우편번호로 채움(없으면 한글).

interface DaumData {
  roadAddress?: string;
  roadAddressEnglish?: string;
  jibunAddress?: string;
  jibunAddressEnglish?: string;
  zonecode?: string;
}

declare global {
  interface Window {
    daum?: {
      Postcode: new (opts: { oncomplete: (data: DaumData) => void }) => {
        open: () => void;
      };
    };
  }
}

const SRC = "https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";

function loadScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.daum?.Postcode) return resolve();
    const existing = document.getElementById("daum-postcode-script") as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("load fail")));
      return;
    }
    const s = document.createElement("script");
    s.id = "daum-postcode-script";
    s.src = SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("load fail"));
    document.head.appendChild(s);
  });
}

// 주소 검색 팝업을 열고, 선택된 주소 문자열을 콜백으로 전달.
export async function openAddressSearch(onPick: (address: string) => void): Promise<void> {
  await loadScript();
  if (!window.daum?.Postcode) return;
  new window.daum.Postcode({
    oncomplete: (d) => {
      const eng = d.roadAddressEnglish || d.jibunAddressEnglish || "";
      const kor = d.roadAddress || d.jibunAddress || "";
      const zip = d.zonecode ? `, ${d.zonecode}` : "";
      const address = eng ? `${eng}, Republic of Korea${zip}` : `${kor}${zip}`;
      onPick(address);
    },
  }).open();
}
