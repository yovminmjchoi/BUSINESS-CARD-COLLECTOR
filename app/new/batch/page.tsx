"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import CameraCapture from "@/components/CameraCapture";
import ImageCropper, { type SuggestedBox } from "@/components/ImageCropper";
import { pickUnusedColor, type Tag } from "@/components/TagSelector";
import { downscale, loadImage, cropBboxToBlob, detectCardRegions } from "@/lib/client-image";
import { digitsOnly, pickCompanyNormalized, trigramSimilarity } from "@/lib/normalize";
import type { CardExtraction } from "@/lib/gemini";

interface BackCard {
  extraction: CardExtraction;
  blob: Blob;
  url: string;
  bbox: [number, number, number, number];
  srcImg: HTMLImageElement;
}

// 앞면(F)과 뒷면(B)이 같은 명함일 가능성 점수. 전화·이메일 일치는 강한 신호.
function backMatchScore(F: CardExtraction, B: CardExtraction): number {
  let s = 0;
  const fe = (F.email ?? "").toLowerCase().trim();
  const be = (B.email ?? "").toLowerCase().trim();
  if (fe && be && fe === be) s += 100;
  const fp = [F.mobile, F.office_phone, F.fax].map(digitsOnly).filter((x) => x.length >= 7);
  const bp = [B.mobile, B.office_phone, B.fax].map(digitsOnly).filter((x) => x.length >= 7);
  if (fp.some((p) => bp.includes(p))) s += 100;
  const fc = pickCompanyNormalized(F.company_ko, F.company_en);
  const bc = pickCompanyNormalized(B.company_ko, B.company_en);
  if (fc && bc && fc === bc) s += 40;
  const fn = F.name_en || F.name_ko || "";
  const bn = B.name_en || B.name_ko || "";
  s += trigramSimilarity(fn, bn) * 30;
  return s;
}
const MATCH_THRESHOLD = 60; // 전화/이메일(100) 또는 회사+이름유사 조합
const WHOLE_IMAGE_EPSILON = 0.02;

interface Item {
  extraction: CardExtraction;
  blob: Blob;
  url: string;
  include: boolean;
  tagIds: string[];
  backBlob?: Blob; // 이 명함의 뒷면(선택) — 저장 시 함께 업로드
  backUrl?: string;
  backBusy?: boolean; // 뒷면 인식 중
  backFilled?: number; // 뒷면으로 채운 빈 칸 수
  dup?: { name: string; company: string; reasons: string[]; strong: boolean } | null; // 중복 후보
  personNote?: string;
  companyNote?: string;
  // 뒷면 재크롭 시 여백 포함해 다시 자를 수 있도록 원본 이미지·영역 보관
  backSrcImg?: HTMLImageElement;
  backBbox?: [number, number, number, number];
}

function isWholeImageBox(bbox: [number, number, number, number]): boolean {
  const [x0, y0, x1, y1] = bbox;
  return (
    x0 <= WHOLE_IMAGE_EPSILON &&
    y0 <= WHOLE_IMAGE_EPSILON &&
    x1 >= 1 - WHOLE_IMAGE_EPSILON &&
    y1 >= 1 - WHOLE_IMAGE_EPSILON
  );
}

function expandCardBox(
  bbox: [number, number, number, number],
): [number, number, number, number] | null {
  if (isWholeImageBox(bbox)) return null;
  const [x0, y0, x1, y1] = bbox;
  const cw = x1 - x0;
  const ch = y1 - y0;
  if (cw <= 0 || ch <= 0) return null;

  // Keep enough room for clipped edges without expanding one card into the whole sheet.
  const mx = Math.min(0.08, Math.max(0.025, cw * 0.18));
  const my = Math.min(0.08, Math.max(0.025, ch * 0.18));
  return [
    Math.max(0, x0 - mx),
    Math.max(0, y0 - my),
    Math.min(1, x1 + mx),
    Math.min(1, y1 + my),
  ];
}

// 확인/수정 폼 필드 (성/이름 분리, 전체이름은 자동 합성)
const FIELDS: { key: keyof CardExtraction; label: string }[] = [
  { key: "family_name_ko", label: "성 (한글)" },
  { key: "given_name_ko", label: "이름 (한글)" },
  { key: "family_name_en", label: "성 (영문)" },
  { key: "given_name_en", label: "이름 (영문)" },
  { key: "company_ko", label: "회사 (한글)" },
  { key: "company_en", label: "회사 (영문)" },
  { key: "department", label: "부서" },
  { key: "title_ko", label: "직함 (한글)" },
  { key: "title_en", label: "직함 (영문)" },
  { key: "mobile", label: "휴대폰" },
  { key: "office_phone", label: "유선전화" },
  { key: "fax", label: "팩스" },
  { key: "email", label: "이메일" },
  { key: "website", label: "웹사이트" },
  { key: "address_ko", label: "주소 (한글)" },
  { key: "address_en", label: "주소 (영문)" },
];

function displayName(e: CardExtraction): string {
  const ko = [e.family_name_ko, e.given_name_ko].filter(Boolean).join("");
  const en = [e.given_name_en, e.family_name_en].filter(Boolean).join(" ");
  return ko || en || e.name_ko || e.name_en || "(이름 없음)";
}

// 뒷면 추출 결과로 빈 칸만 채움 (앞면·사용자 값 보존)
const MERGE_FIELDS: (keyof CardExtraction)[] = [
  "name_ko", "name_en",
  "family_name_ko", "given_name_ko", "family_name_en", "given_name_en",
  "company_ko", "company_en", "department", "title_ko", "title_en",
  "mobile", "office_phone", "fax", "email", "website", "address_ko", "address_en",
];

function mergeEmpty(base: CardExtraction, extra: CardExtraction): { merged: CardExtraction; filled: number } {
  const merged = { ...base };
  let filled = 0;
  for (const f of MERGE_FIELDS) {
    const cur = merged[f];
    const add = extra[f];
    if ((cur === null || cur === "" || cur === undefined) && typeof add === "string" && add.trim() !== "") {
      // @ts-expect-error 문자열 필드에만 대입
      merged[f] = add.trim();
      filled += 1;
    }
  }
  return { merged, filled };
}

export default function BatchNewPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<"capture" | "processing" | "review">("capture");
  const [items, setItems] = useState<Item[]>([]);
  const [tagList, setTagList] = useState<Tag[]>([]);
  const [newTag, setNewTag] = useState("");
  const [panelNewTag, setPanelNewTag] = useState(""); // 카드별 패널에서 새 태그 입력
  const scanImgRef = useRef<HTMLImageElement | null>(null);
  const backScanImgRef = useRef<HTMLImageElement | null>(null);
  const backInputRef = useRef<HTMLInputElement | null>(null);
  const backTargetRef = useRef<number | null>(null);
  const itemsRef = useRef<Item[]>([]);
  const [crop, setCrop] = useState<{ idx: number; src: string; suggested: SuggestedBox | null } | null>(null);
  const [backCrop, setBackCrop] = useState<{ idx: number; src: string } | null>(null);
  const [backEditCrop, setBackEditCrop] = useState<{ idx: number; src: string; suggested: SuggestedBox | null } | null>(null); // 기존 뒷면 재크롭
  const [openIdx, setOpenIdx] = useState<number | null>(null); // 정보 확인/수정 펼친 카드
  const [unmatchedBacks, setUnmatchedBacks] = useState<BackCard[]>([]); // 짝 못 찾은 뒷장
  const [backSheetBusy, setBackSheetBusy] = useState(false);
  const [matchMsg, setMatchMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/tags").then((r) => r.json()).then((d) => setTagList(d.tags ?? [])).catch(() => {});
  }, []);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  async function handleScan(raw: File) {
    setPhase("processing");
    setError("");
    try {
      const small = await downscale(raw);
      const url = URL.createObjectURL(small);
      const img = await loadImage(url);
      scanImgRef.current = img;

      const form = new FormData();
      form.append("front", small);
      form.append("front_cropped", small.type === "image/jpeg" ? "1" : "0");
      const res = await fetch("/api/extract-multi", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "인식에 실패했습니다.");
        setPhase("capture");
        return;
      }
      const cards: CardExtraction[] = data.cards;
      const built: Item[] = await Promise.all(
        cards.map(async (e) => {
          const blob = e.card_bbox
            ? await cropBboxToBlob(img, e.card_bbox)
            : await cropBboxToBlob(img, [0, 0, 1, 1]);
          return { extraction: e, blob, url: URL.createObjectURL(blob), include: true, tagIds: [] };
        }),
      );
      setItems(built);
      setPhase("review");

      // 각 명함의 회사로 기존 태그 자동 제안 (명함별)
      built.forEach((it, i) => {
        const e = it.extraction;
        if (!(e.company_ko || e.company_en)) return;
        fetch("/api/company-tags", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ companyKo: e.company_ko, companyEn: e.company_en }),
        })
          .then((r) => r.json())
          .then((d) => {
            if (Array.isArray(d.tagIds) && d.tagIds.length > 0) {
              setItems((arr) => arr.map((x, idx) => (idx === i ? { ...x, tagIds: d.tagIds } : x)));
            }
          })
          .catch(() => {});
      });

      // 각 명함 중복 감지 (이메일/전화/이름·회사). 강한 일치(이메일·전화)면 기본 제외.
      built.forEach((it, i) => {
        const e = it.extraction;
        fetch("/api/duplicates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: e.email,
            mobile: e.mobile,
            name: e.name_ko || e.name_en,
            companyKo: e.company_ko,
            companyEn: e.company_en,
          }),
        })
          .then((r) => r.json())
          .then((d) => {
            const c = d.candidates?.[0];
            if (!c) return;
            const strong = (c.reasons ?? []).some(
              (r: string) => r.includes("이메일") || r.includes("전화"),
            );
            setItems((arr) =>
              arr.map((x, idx) =>
                idx === i
                  ? {
                      ...x,
                      dup: { name: c.name, company: c.company, reasons: c.reasons ?? [], strong },
                      include: strong ? false : x.include, // 확실한 중복은 기본 제외
                    }
                  : x,
              ),
            );
          })
          .catch(() => {});
      });
    } catch {
      setError("처리 중 오류가 발생했습니다. 다시 시도하세요.");
      setPhase("capture");
    }
  }

  // 새 태그 생성(공용). 이미 있으면 그 태그 반환. 실패 시 에러 표시.
  async function createOrGetTag(name: string): Promise<Tag | null> {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const existing = tagList.find((t) => t.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) return existing;
    const res = await fetch("/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed, color: pickUnusedColor(tagList.map((t) => t.color)) }),
    });
    const d = await res.json();
    if (res.ok && d.tag) {
      setTagList((t) => [...t, d.tag]);
      return d.tag as Tag;
    }
    if (res.status === 409) {
      // 서버엔 있는데 목록엔 아직 없음 → 새로고침
      const rr = await fetch("/api/tags").then((r) => r.json()).catch(() => null);
      if (rr?.tags) {
        setTagList(rr.tags);
        return (rr.tags as Tag[]).find((t) => t.name.toLowerCase() === trimmed.toLowerCase()) ?? null;
      }
    }
    setError(d.error ?? "태그 추가에 실패했어요.");
    return null;
  }

  async function createTag() {
    setError("");
    const tag = await createOrGetTag(newTag);
    if (tag) setNewTag("");
  }

  // 새 태그를 만들어 이 명함에 바로 적용
  async function createTagForCard(i: number) {
    setError("");
    const tag = await createOrGetTag(panelNewTag);
    if (!tag) return;
    setItems((arr) =>
      arr.map((x, idx) =>
        idx === i && !x.tagIds.includes(tag.id) ? { ...x, tagIds: [...x.tagIds, tag.id] } : x,
      ),
    );
    setPanelNewTag("");
  }

  function setField(i: number, key: keyof CardExtraction, value: string) {
    setItems((arr) =>
      arr.map((it, idx) =>
        idx === i ? { ...it, extraction: { ...it.extraction, [key]: value === "" ? null : value } } : it,
      ),
    );
  }

  function setNote(i: number, which: "personNote" | "companyNote", value: string) {
    setItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, [which]: value } : it)));
  }

  function toggleCardTag(i: number, tagId: string) {
    setItems((arr) =>
      arr.map((it, idx) =>
        idx === i
          ? { ...it, tagIds: it.tagIds.includes(tagId) ? it.tagIds.filter((x) => x !== tagId) : [...it.tagIds, tagId] }
          : it,
      ),
    );
  }

  // 포함된 명함 전체에 토글 (모두 갖고 있으면 해제, 아니면 추가)
  function applyAll(tagId: string) {
    setItems((arr) => {
      const included = arr.filter((x) => x.include);
      const allHave = included.length > 0 && included.every((x) => x.tagIds.includes(tagId));
      return arr.map((it) =>
        !it.include
          ? it
          : { ...it, tagIds: allHave ? it.tagIds.filter((x) => x !== tagId) : [...new Set([...it.tagIds, tagId])] },
      );
    });
  }

  // 이 명함의 뒷면 촬영/선택 → 추출 → 빈 칸 채우기
  function pickBack(i: number) {
    backTargetRef.current = i;
    backInputRef.current?.click();
  }

  // 뒷면 선택 → 축소 후 크롭 화면 먼저 (앞면과 동일하게 크롭·문서필터 거침)
  async function addBack(file: File) {
    const i = backTargetRef.current;
    backTargetRef.current = null;
    if (i === null) return;
    setError("");
    const small = await downscale(file);
    setBackCrop({ idx: i, src: URL.createObjectURL(small) });
  }

  function closeBackCrop() {
    if (backCrop) URL.revokeObjectURL(backCrop.src);
    setBackCrop(null);
  }

  // 크롭 적용된 뒷면 → 추출 → 빈 칸 채우기 + 저장용 blob 보관
  async function finishBack(blob: Blob) {
    if (!backCrop) return;
    const i = backCrop.idx;
    closeBackCrop();
    setItems((arr) => arr.map((x, idx) => (idx === i ? { ...x, backBusy: true } : x)));
    try {
      const bUrl = URL.createObjectURL(blob);
      // 뒷면 이미지 단독 추출 (보통 영문면)
      const form = new FormData();
      form.append("mode", "detect");
      form.append("front", new File([blob], "back.jpg", { type: "image/jpeg" }));
      form.append("front_cropped", "1");
      const res = await fetch("/api/extract", { method: "POST", body: form });
      const data = await res.json();
      const backEx = (data.extraction ?? null) as CardExtraction | null;
      setItems((arr) =>
        arr.map((x, idx) => {
          if (idx !== i) return x;
          if (x.backUrl) URL.revokeObjectURL(x.backUrl);
          const { merged, filled } = backEx
            ? mergeEmpty(x.extraction, backEx)
            : { merged: x.extraction, filled: 0 };
          // 개별 뒷면은 방금 사용자가 크롭한 그 카드 이미지 → 재크롭은 그 이미지로.
          return {
            ...x,
            extraction: merged,
            backBlob: blob,
            backUrl: bUrl,
            backBusy: false,
            backFilled: filled,
          };
        }),
      );
    } catch {
      setItems((arr) => arr.map((x, idx) => (idx === i ? { ...x, backBusy: false } : x)));
      setError("뒷면 인식에 실패했어요. 다시 시도하세요.");
    }
  }

  // 이미 붙은 뒷면 이미지를 다시 크롭/회전 (재추출 없이 이미지만 교체).
  // 원본 이미지가 있으면 여백 포함 영역을 열어(앞면처럼) 밖으로도 조절 가능.
  async function openBackCrop(i: number) {
    const it = itemsRef.current[i];
    if (!it || !it.backBlob) return;
    const expanded = it.backBbox ? expandCardBox(it.backBbox) : null;
    if (it.backSrcImg && expanded) {
      const regionBlob = await cropBboxToBlob(it.backSrcImg, expanded);
      const src = URL.createObjectURL(regionBlob);
      // suggested=null → 크로퍼가 이 영역 안에서 실제 카드 경계를 자동 감지해 스냅
      setBackEditCrop({ idx: i, src, suggested: null });
    } else {
      // 원본 bbox 가 전체 이미지에 가까우면 이미 잘린 이미지 기준으로만 재크롭한다.
      setBackEditCrop({ idx: i, src: URL.createObjectURL(it.backBlob), suggested: null });
    }
  }

  function closeBackEditCrop() {
    if (backEditCrop) URL.revokeObjectURL(backEditCrop.src);
    setBackEditCrop(null);
  }

  function applyBackRecrop(blob: Blob) {
    if (!backEditCrop) return;
    const i = backEditCrop.idx;
    URL.revokeObjectURL(backEditCrop.src);
    setBackEditCrop(null);
    setItems((arr) =>
      arr.map((x, idx) => {
        if (idx !== i) return x;
        if (x.backUrl) URL.revokeObjectURL(x.backUrl);
        // backSrcImg·backBbox 는 유지 → 다음 재크롭도 여백 포함해 열림
        return { ...x, backBlob: blob, backUrl: URL.createObjectURL(blob) };
      }),
    );
  }

  // 뒷장 시트(여러 뒷면이 한 장에) 스캔 → 인식 → 앞면과 내용으로 자동 매칭
  async function handleBackSheet(file: File) {
    setBackSheetBusy(true);
    setError("");
    setMatchMsg("");
    try {
      const small = await downscale(file);
      const url = URL.createObjectURL(small);
      const img = await loadImage(url);
      backScanImgRef.current = img;

      let backs: BackCard[] = [];
      let source = "";

      // 1) 앱이 직접 카드 영역을 나눔(글자 밀도) → 각 영역을 개별 추출 (앞면 개별 촬영과 동일)
      const regions = detectCardRegions(img);
      if (regions.length >= 2) {
        const built = await Promise.all(
          regions.map(async (bbox) => {
            const blob = await cropBboxToBlob(img, bbox);
            const f = new FormData();
            f.append("mode", "detect");
            f.append("front", new File([blob], "b.jpg", { type: "image/jpeg" }));
            f.append("front_cropped", "1");
            const r = await fetch("/api/extract", { method: "POST", body: f });
            const d = await r.json();
            const ex = (d.extraction ?? null) as CardExtraction | null;
            // 내용이 거의 없는 영역(로고·잡음)은 버림
            if (!ex || !(ex.name_ko || ex.name_en || ex.email || ex.mobile || ex.company_ko || ex.company_en)) {
              return null;
            }
            return { extraction: ex, blob, url: URL.createObjectURL(blob), bbox, srcImg: img } as BackCard;
          }),
        );
        backs = built.filter((x): x is BackCard => x !== null);
        if (backs.length >= 2) source = `앱 분할 ${regions.length}칸`;
      }

      // 2) 분할이 잘 안 되면 기존 AI 멀티 인식으로 폴백
      if (backs.length < 2) {
        source = `AI 인식(분할 ${regions.length}칸)`;
        const form = new FormData();
        form.append("front", small);
        form.append("front_cropped", small.type === "image/jpeg" ? "1" : "0");
        const res = await fetch("/api/extract-multi", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "뒷장 인식에 실패했습니다.");
          setBackSheetBusy(false);
          return;
        }
        const cards: CardExtraction[] = data.cards ?? [];
        backs = await Promise.all(
          cards.map(async (e) => {
            const bbox: [number, number, number, number] = e.card_bbox ?? [0, 0, 1, 1];
            const blob = await cropBboxToBlob(img, bbox);
            return { extraction: e, blob, url: URL.createObjectURL(blob), bbox, srcImg: img };
          }),
        );
      }
      matchBacks(backs, source);
    } catch {
      setError("뒷장 처리 중 오류가 발생했습니다. 다시 시도하세요.");
    } finally {
      setBackSheetBusy(false);
    }
  }

  // 뒷장 카드들을 앞면 명함에 내용(전화·이메일·회사·이름)으로 짝짓기
  function matchBacks(backs: BackCard[], source = "") {
    const cur = itemsRef.current;
    const pairs: { bi: number; fi: number; s: number }[] = [];
    backs.forEach((b, bi) => {
      cur.forEach((it, fi) => {
        if (it.backBlob) return; // 이미 뒷면 있는 명함은 건너뜀
        const s = backMatchScore(it.extraction, b.extraction);
        if (s >= MATCH_THRESHOLD) pairs.push({ bi, fi, s });
      });
    });
    pairs.sort((a, b) => b.s - a.s);
    const usedBack = new Set<number>();
    const usedFront = new Set<number>();
    const assign = new Map<number, number>(); // fi -> bi
    for (const p of pairs) {
      if (usedBack.has(p.bi) || usedFront.has(p.fi)) continue;
      usedBack.add(p.bi);
      usedFront.add(p.fi);
      assign.set(p.fi, p.bi);
    }
    const newItems = cur.map((it, fi) => {
      if (!assign.has(fi)) return it;
      const b = backs[assign.get(fi)!];
      if (it.backUrl) URL.revokeObjectURL(it.backUrl);
      const { merged, filled } = mergeEmpty(it.extraction, b.extraction);
      return {
        ...it,
        extraction: merged,
        backBlob: b.blob,
        backUrl: b.url,
        backFilled: filled,
        backSrcImg: b.srcImg,
        backBbox: b.bbox,
      };
    });
    setItems(newItems);
    const leftovers = backs.filter((_, bi) => !usedBack.has(bi));
    setUnmatchedBacks((prev) => [...prev, ...leftovers]);
    setMatchMsg(
      (source ? `[${source}] ` : "") +
        `뒷장 ${backs.length}장 중 ${assign.size}장 자동 매칭됨` +
        (leftovers.length > 0 ? ` · ${leftovers.length}장은 아래에서 직접 지정하세요.` : ""),
    );
  }

  // 짝 못 찾은 뒷장을 특정 명함에 수동 지정
  function assignBackToCard(leftIdx: number, fi: number) {
    const b = unmatchedBacks[leftIdx];
    if (!b) return;
    setItems((arr) =>
      arr.map((it, idx) => {
        if (idx !== fi) return it;
        if (it.backUrl) URL.revokeObjectURL(it.backUrl);
        const { merged, filled } = mergeEmpty(it.extraction, b.extraction);
        return {
          ...it,
          extraction: merged,
          backBlob: b.blob,
          backUrl: b.url,
          backFilled: filled,
          backSrcImg: b.srcImg,
          backBbox: b.bbox,
        };
      }),
    );
    setUnmatchedBacks((prev) => prev.filter((_, i) => i !== leftIdx));
  }

  function ignoreBack(leftIdx: number) {
    setUnmatchedBacks((prev) => {
      const b = prev[leftIdx];
      if (b) URL.revokeObjectURL(b.url);
      return prev.filter((_, i) => i !== leftIdx);
    });
  }

  async function openCrop(i: number) {
    const img = scanImgRef.current;
    if (!img) return;
    const bbox = items[i].extraction.card_bbox ?? [0, 0, 1, 1];
    const regionBlob = await cropBboxToBlob(img, expandCardBox(bbox) ?? [0, 0, 1, 1]);
    const src = URL.createObjectURL(regionBlob);
    // suggested=null → 크로퍼가 이 영역 안에서 실제 카드 경계를 자동 감지해 스냅
    setCrop({ idx: i, src, suggested: null });
  }

  function closeCrop() {
    if (crop) URL.revokeObjectURL(crop.src);
    setCrop(null);
  }

  function applyCrop(blob: Blob) {
    if (!crop) return;
    const i = crop.idx;
    setItems((arr) =>
      arr.map((it, idx) => {
        if (idx !== i) return it;
        URL.revokeObjectURL(it.url);
        return { ...it, blob, url: URL.createObjectURL(blob) };
      }),
    );
    closeCrop();
  }

  async function saveAll() {
    setSaving(true);
    setError("");
    let done = 0;
    try {
      for (const it of items) {
        if (!it.include) continue;
        const storeForm = new FormData();
        storeForm.append("mode", "store");
        storeForm.append("front", new File([it.blob], "card.jpg", { type: "image/jpeg" }));
        storeForm.append("front_cropped", "1");
        if (it.backBlob) {
          storeForm.append("back", new File([it.backBlob], "back.jpg", { type: "image/jpeg" }));
        }
        const sres = await fetch("/api/extract", { method: "POST", body: storeForm });
        const sdata = await sres.json();
        if (!sres.ok) throw new Error(sdata.error ?? "이미지 저장 실패");

        const cres = await fetch("/api/cards", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            values: it.extraction,
            extraction: it.extraction,
            imageFrontPath: sdata.imageFrontPath,
            imageBackPath: sdata.imageBackPath ?? null,
            tagIds: it.tagIds,
            personNote: it.personNote ?? null,
            companyNote: it.companyNote ?? null,
          }),
        });
        if (!cres.ok) {
          const d = await cres.json();
          throw new Error(d.error ?? "저장 실패");
        }
        done += 1;
        setProgress(done);
      }
      router.push(`/?done=batch&n=${done}`);
    } catch (e) {
      setError(`${done}개 저장 후 실패: ${e instanceof Error ? e.message : ""}`);
      setSaving(false);
    }
  }

  const selectedCount = items.filter((i) => i.include).length;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 p-6 pb-28">
      <header>
        <Link href="/new" className="text-sm text-gray-500">← 한 장씩 촬영</Link>
        <h1 className="mt-2 text-xl font-bold">여러 명함 한 번에</h1>
        <p className="mt-1 text-sm text-gray-500">
          여러 명함이 한 이미지에 있으면 한 번에 인식해요. 명함마다 태그·뒷면을 따로 달 수 있어요.
        </p>
      </header>

      {phase === "capture" && <CameraCapture label="스캔 촬영" onSelect={handleScan} />}

      {phase === "processing" && (
        <div className="flex flex-col items-center gap-3 p-10 text-gray-500">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700" />
          <p>명함들을 인식하는 중…</p>
        </div>
      )}

      {/* 뒷면 촬영/선택용 숨김 입력 (명함별 공용) */}
      <input
        ref={backInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) addBack(f);
          e.target.value = "";
        }}
      />

      {phase === "review" && (
        <>
          {/* 태그 만들기 + 전체 적용 */}
          <div className="flex flex-col gap-2 rounded-lg border border-gray-200 p-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createTag()}
                placeholder="새 태그 만들기"
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
              />
              <button type="button" onClick={createTag} disabled={!newTag.trim()} className="rounded-lg bg-gray-900 px-3 py-2 text-sm text-white disabled:opacity-40">
                추가
              </button>
            </div>
            {tagList.length > 0 && (
              <div>
                <span className="text-xs text-gray-400">전체 적용 (선택한 명함 모두):</span>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {tagList.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => applyAll(t.id)}
                      className="rounded-full border border-gray-300 px-2 py-0.5 text-xs text-gray-600"
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 뒷장 한 번에: 시트를 뒤집어 뒷면을 한 번에 찍으면 내용으로 자동 매칭 */}
          <div className="flex flex-col gap-2 rounded-lg border border-dashed border-gray-300 p-3">
            <span className="text-sm font-medium text-gray-700">뒷장 한 번에 (선택)</span>
            <p className="text-xs text-gray-400">
              같은 명함들을 뒤집어 뒷면을 한 장에 찍으면, 전화·이메일·회사로 앞면과 자동으로 짝지어 빈 칸을 채워요. 뒷면 없으면 건너뛰면 됩니다.
            </p>
            {backSheetBusy ? (
              <div className="flex items-center gap-2 py-2 text-sm text-gray-500">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700" />
                뒷장 인식·매칭 중…
              </div>
            ) : (
              <CameraCapture label="뒷장 촬영" onSelect={handleBackSheet} />
            )}
            {matchMsg && <p className="text-xs text-green-700">{matchMsg}</p>}
          </div>

          {/* 짝 못 찾은 뒷장 → 수동 지정 */}
          {unmatchedBacks.length > 0 && (
            <div className="flex flex-col gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
              <span className="text-sm font-medium text-amber-800">
                짝을 못 찾은 뒷장 {unmatchedBacks.length}장 — 어느 명함인지 골라주세요
              </span>
              {unmatchedBacks.map((b, li) => (
                <div key={li} className="flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={b.url} alt="뒷장" className="h-10 w-16 flex-shrink-0 rounded border border-gray-200 bg-white object-contain" />
                  <span className="min-w-0 flex-1 truncate text-xs text-gray-600">
                    {b.extraction.company_en || b.extraction.company_ko || b.extraction.name_en || b.extraction.email || "정보 적음"}
                  </span>
                  <select
                    defaultValue=""
                    onChange={(ev) => {
                      const fi = Number(ev.target.value);
                      if (!Number.isNaN(fi)) assignBackToCard(li, fi);
                    }}
                    className="flex-shrink-0 rounded border border-gray-300 px-1 py-1 text-xs"
                  >
                    <option value="" disabled>명함 선택</option>
                    {items.map((it, fi) => (
                      <option key={fi} value={fi}>
                        {fi + 1}. {displayName(it.extraction)}
                      </option>
                    ))}
                  </select>
                  <button type="button" onClick={() => ignoreBack(li)} className="flex-shrink-0 text-xs text-gray-400 underline">
                    무시
                  </button>
                </div>
              ))}
            </div>
          )}

          <p className="text-sm font-medium text-gray-700">인식된 명함 {items.length}장</p>
          <ul className="flex flex-col gap-2">
            {items.map((it, i) => {
              const e = it.extraction;
              const company = e.company_ko || e.company_en || "";
              const title = e.title_ko || e.title_en || "";
              const contact = e.mobile || e.email || "";
              return (
                <li
                  key={i}
                  className={
                    "flex gap-3 rounded-lg border p-2 " +
                    (it.include ? "border-blue-300 bg-blue-50/40" : "border-gray-200 opacity-50")
                  }
                >
                  <button
                    type="button"
                    onClick={() => setItems((a) => a.map((x, idx) => (idx === i ? { ...x, include: !x.include } : x)))}
                    className={
                      "mt-1 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border text-[11px] " +
                      (it.include ? "border-blue-600 bg-blue-600 text-white" : "border-gray-300 text-transparent")
                    }
                  >
                    ✓
                  </button>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={it.url} alt="" className="h-16 w-24 flex-shrink-0 rounded border border-gray-200 bg-gray-50 object-contain" />
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="font-medium text-gray-900">{displayName(e)}</div>
                    {(company || title) && (
                      <div className="truncate text-gray-500">{[company, title].filter(Boolean).join(" · ")}</div>
                    )}
                    {contact && <div className="truncate text-xs text-gray-400">{contact}</div>}
                    {it.dup && (
                      <div className="mt-1 rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
                        ⚠ 이미 있는 명함일 수 있어요: <span className="font-medium">{it.dup.name}</span>
                        {it.dup.company ? ` (${it.dup.company})` : ""} · {it.dup.reasons.join(", ")}
                        {it.dup.strong ? " — 기본 제외됨" : ""}
                      </div>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-3">
                      <button type="button" onClick={() => openCrop(i)} className="text-xs text-blue-600 underline">
                        사진 크롭
                      </button>
                      <button
                        type="button"
                        onClick={() => pickBack(i)}
                        disabled={it.backBusy}
                        className="text-xs text-blue-600 underline disabled:opacity-50"
                      >
                        {it.backBusy ? "뒷면 인식 중…" : it.backUrl ? "뒷면 다시" : "뒷면 추가"}
                      </button>
                      {it.backUrl && !it.backBusy && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={it.backUrl} alt="뒷면" className="h-8 w-12 rounded border border-gray-200 bg-gray-50 object-contain" />
                      )}
                      {it.backUrl && !it.backBusy && (
                        <button type="button" onClick={() => openBackCrop(i)} className="text-xs text-blue-600 underline">
                          뒷면 크롭·회전
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setOpenIdx((cur) => (cur === i ? null : i))}
                        className="text-xs font-medium text-blue-600 underline"
                      >
                        {openIdx === i ? "정보 접기 ▲" : "정보 확인·수정 ▾"}
                      </button>
                    </div>
                    {typeof it.backFilled === "number" && !it.backBusy && (
                      <div className={"mt-0.5 text-[11px] " + (it.backFilled > 0 ? "text-green-600" : "text-gray-400")}>
                        {it.backFilled > 0 ? `뒷면에서 ${it.backFilled}칸 채움` : "뒷면에서 새로 채운 칸 없음"}
                      </div>
                    )}
                    {/* 이 명함의 태그 */}
                    {tagList.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {tagList.map((t) => {
                          const on = it.tagIds.includes(t.id);
                          return (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => toggleCardTag(i, t.id)}
                              className={"rounded-full border px-2 py-0.5 text-[11px] " + (on ? "text-white" : "text-gray-500")}
                              style={on ? { backgroundColor: t.color ?? "#374151", borderColor: t.color ?? "#374151" } : { borderColor: "#d1d5db" }}
                            >
                              {t.name}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* 정보 확인/수정 + 메모 */}
                    {openIdx === i && (
                      <div className="mt-2 flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-2">
                        {/* 이 명함에 새 태그 만들어 적용 */}
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[11px] font-medium text-gray-400">새 태그 (만들어서 이 명함에 적용)</span>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={panelNewTag}
                              onChange={(ev) => setPanelNewTag(ev.target.value)}
                              onKeyDown={(ev) => ev.key === "Enter" && createTagForCard(i)}
                              placeholder="예: VIP, 후속연락"
                              className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-900 focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => createTagForCard(i)}
                              disabled={!panelNewTag.trim()}
                              className="rounded bg-gray-900 px-3 py-1.5 text-sm text-white disabled:opacity-40"
                            >
                              추가
                            </button>
                          </div>
                        </div>
                        {FIELDS.map(({ key, label }) => (
                          <label key={key} className="flex flex-col gap-0.5">
                            <span className="text-[11px] font-medium text-gray-400">{label}</span>
                            <input
                              type="text"
                              value={(e[key] as string | null) ?? ""}
                              onChange={(ev) => setField(i, key, ev.target.value)}
                              className="rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-900 focus:outline-none"
                            />
                          </label>
                        ))}
                        <label className="flex flex-col gap-0.5">
                          <span className="text-[11px] font-medium text-gray-400">인물 메모</span>
                          <textarea
                            rows={2}
                            value={it.personNote ?? ""}
                            onChange={(ev) => setNote(i, "personNote", ev.target.value)}
                            placeholder="예: 소개로 만남, 후속 미팅 필요"
                            className="rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-900 focus:outline-none"
                          />
                        </label>
                        <label className="flex flex-col gap-0.5">
                          <span className="text-[11px] font-medium text-gray-400">회사 메모</span>
                          <textarea
                            rows={2}
                            value={it.companyNote ?? ""}
                            onChange={(ev) => setNote(i, "companyNote", ev.target.value)}
                            className="rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-900 focus:outline-none"
                          />
                        </label>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {phase === "review" && (
        <div className="fixed inset-x-0 bottom-0 mx-auto max-w-md border-t border-gray-200 bg-white p-4">
          <button
            type="button"
            onClick={saveAll}
            disabled={saving || selectedCount === 0}
            className="w-full rounded-lg bg-blue-600 px-4 py-3 text-base font-medium text-white disabled:opacity-40"
          >
            {saving ? `저장 중… (${progress}/${selectedCount})` : `${selectedCount}개 저장`}
          </button>
        </div>
      )}

      {crop && (
        <ImageCropper
          src={crop.src}
          suggested={crop.suggested}
          onApply={applyCrop}
          onCancel={closeCrop}
          cancelLabel="취소"
        />
      )}

      {backCrop && (
        <ImageCropper
          src={backCrop.src}
          onApply={finishBack}
          onCancel={closeBackCrop}
          cancelLabel="취소"
        />
      )}

      {backEditCrop && (
        <ImageCropper
          src={backEditCrop.src}
          suggested={backEditCrop.suggested}
          onApply={applyBackRecrop}
          onCancel={closeBackEditCrop}
          cancelLabel="취소"
        />
      )}
    </main>
  );
}
