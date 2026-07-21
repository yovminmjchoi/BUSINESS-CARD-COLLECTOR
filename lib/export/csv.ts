// CSV 생성 (UTF-8 BOM 포함 — 엑셀 한글 깨짐 방지)

export interface ExportCard {
  name_ko: string | null;
  name_en: string | null;
  family_name_ko: string | null;
  given_name_ko: string | null;
  family_name_en: string | null;
  given_name_en: string | null;
  company_ko: string | null;
  company_en: string | null;
  department: string | null;
  title_ko: string | null;
  title_en: string | null;
  mobile: string | null;
  office_phone: string | null;
  fax: string | null;
  email: string | null;
  website: string | null;
  address_ko: string | null;
  address_en: string | null;
  person_note: string | null;
  company_note: string | null;
  status: string | null;
  is_primary: boolean;
  created_at: string | null;
  tags: string[];
}

const HEADERS = [
  "이름(한글)", "이름(영문)", "성(한글)", "이름(한글)", "성(영문)", "이름(영문)",
  "회사(한글)", "회사(영문)", "부서",
  "직함(한글)", "직함(영문)", "휴대폰", "유선전화", "팩스",
  "이메일", "웹사이트", "주소(한글)", "주소(영문)", "태그",
  "인물메모", "회사메모", "상태", "현재명함", "등록일",
];

function esc(v: string | null | undefined): string {
  const s = v == null ? "" : String(v);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

// 전화·팩스: 엑셀/구글시트가 +, - 를 수식으로 계산하지 않도록 텍스트("=...")로 강제
function phone(v: string | null | undefined): string {
  return v ? `="${String(v).replace(/"/g, "")}"` : "";
}

function statusLabel(s: string | null): string {
  if (s === "confirmed") return "확인됨";
  if (s === "review_needed") return "검토 필요";
  if (s === "failed") return "실패";
  return s ?? "";
}

export function buildCsv(cards: ExportCard[]): string {
  const lines = [HEADERS.join(",")];
  for (const c of cards) {
    lines.push(
      [
        esc(c.name_ko), esc(c.name_en),
        esc(c.family_name_ko), esc(c.given_name_ko),
        esc(c.family_name_en), esc(c.given_name_en),
        esc(c.company_ko), esc(c.company_en),
        esc(c.department), esc(c.title_ko), esc(c.title_en),
        esc(phone(c.mobile)), esc(phone(c.office_phone)), esc(phone(c.fax)),
        esc(c.email),
        esc(c.website), esc(c.address_ko), esc(c.address_en),
        esc(c.tags.join("; ")), esc(c.person_note), esc(c.company_note),
        esc(statusLabel(c.status)), esc(c.is_primary ? "현재" : ""),
        esc(c.created_at ? c.created_at.slice(0, 10) : ""),
      ].join(","),
    );
  }
  // UTF-8 BOM + CRLF (엑셀 한글 인식)
  return "\uFEFF" + lines.join("\r\n");
}
