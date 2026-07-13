import { GoogleGenAI } from "@google/genai";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// 명함 추출 모델 (무료 티어). 필요 시 최신 모델로 교체.
const MODEL = "gemini-2.0-flash";

// 추출 결과 스키마 (lib/prompts/card-extract.md 와 일치)
export interface CardExtraction {
  name_ko: string | null;
  name_en: string | null;
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
  language: "ko" | "en" | "mixed" | null;
  confidence: "high" | "medium" | "low" | null;
  notes: string | null;
}

export interface CardImage {
  data: string; // base64 (프리픽스 없음)
  mimeType: string; // 예: image/jpeg
}

// 프롬프트는 파일에서 1회 로드 후 캐시
let cachedPrompt: string | null = null;
function loadPrompt(): string {
  if (cachedPrompt === null) {
    cachedPrompt = readFileSync(
      join(process.cwd(), "lib", "prompts", "card-extract.md"),
      "utf8",
    );
  }
  return cachedPrompt;
}

let cachedClient: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  if (cachedClient === null) {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      throw new Error("GOOGLE_AI_API_KEY 환경변수가 설정되지 않았습니다.");
    }
    cachedClient = new GoogleGenAI({ apiKey });
  }
  return cachedClient;
}

// 명함 이미지(앞면 + 선택적 뒷면) → 구조화 JSON
export async function extractBusinessCard(
  images: CardImage[],
): Promise<CardExtraction> {
  const ai = getClient();

  const parts = [
    { text: loadPrompt() },
    ...images.map((img) => ({
      inlineData: { mimeType: img.mimeType, data: img.data },
    })),
  ];

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts }],
    config: {
      // JSON 강제 출력 → 코드펜스/설명 섞임 방지
      responseMimeType: "application/json",
      temperature: 0,
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error("Gemini 응답이 비어 있습니다.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Gemini 응답을 JSON으로 파싱하지 못했습니다.");
  }

  return normalizeExtraction(parsed as Record<string, unknown>);
}

// 누락 필드를 null 로 보정하고 타입을 안정화
function normalizeExtraction(raw: Record<string, unknown>): CardExtraction {
  const str = (v: unknown): string | null =>
    typeof v === "string" && v.trim() !== "" ? v.trim() : null;

  const email = str(raw.email);

  return {
    name_ko: str(raw.name_ko),
    name_en: str(raw.name_en),
    company_ko: str(raw.company_ko),
    company_en: str(raw.company_en),
    department: str(raw.department),
    title_ko: str(raw.title_ko),
    title_en: str(raw.title_en),
    mobile: str(raw.mobile),
    office_phone: str(raw.office_phone),
    fax: str(raw.fax),
    email: email ? email.toLowerCase() : null,
    website: str(raw.website),
    address_ko: str(raw.address_ko),
    address_en: str(raw.address_en),
    language: coerceEnum(raw.language, ["ko", "en", "mixed"] as const),
    confidence: coerceEnum(raw.confidence, ["high", "medium", "low"] as const),
    notes: str(raw.notes),
  };
}

function coerceEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}
