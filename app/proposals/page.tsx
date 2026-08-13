"use client";

// app/proposals/page.tsx
// 帶看提案：提案列表 + 提案編輯（區塊一 客戶資料 / 區塊二 比價大表）

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  where,
  getDocs,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";

import { Floor, Room, ROOM_STATUS_LABEL } from "@/lib/types/room";
import {
  Proposal,
  ProposalRoomItem,
  ProposalStatus,
  PROPOSAL_STATUS_LABEL,
  PROPOSAL_STATUS_STYLE,
  SPACE_TYPE_OPTIONS,
  OFFICE_STATUS_OPTIONS,
  VALID_DAY_OPTIONS,
  FreeBenefits,
  PaidAddOns,
  PainPointState,
  PAIN_POINT_GROUPS,
  emptyFreeBenefits,
  emptyPaidAddOns,
  countPainPoints,
  ProposalLang,
  buildMailDraft,
  buildMailtoUrl,
  buildGmailUrl,
  MailDraft,
  currency,
  withTax,
  calcValidUntil,
  todayStr,
  emptyProposal,
} from "@/lib/types/proposal";

const MAX_ROOMS = 4;

/* ============================================================
   共用樣式：與看板、儀表板、房型維護使用同一套視覺語言
   ============================================================ */
const C = {
  ink: "#1A1A18",
  body: "#3A3833",
  muted: "#8A8780",
  faint: "#B0ADA6",
  hairline: "#E8E6E1",
  surface: "#FAFAF8",
  page: "#F5F4F1",
  accent: "#4E6A74",
  success: "#4F7A52",
  warn: "#A97B22",
  danger: "#B4483C",
};

// 欄位加淡底色讓邊界清楚，取代原本一整片浮動底線
const inputClass =
  "w-full bg-[#FAFAF8] border border-[#E8E6E1] rounded-lg px-3 py-2.5 text-[13px] text-[#1A1A18] outline-none transition-colors focus:bg-white focus:border-[#B0ADA6] placeholder:text-[#C4C1B9]";

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-[11px] font-medium text-[#8A8780] mb-1.5">
      {children}
      {required && <span className="text-[#B4483C] ml-0.5">*</span>}
    </label>
  );
}

/** 區塊標題：小字 eyebrow + 延伸細線，取代原本的彩色粗左邊框 */
function SectionHead({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 mb-5">
      <h3 className="text-[11px] font-semibold text-[#8A8780] tracking-[0.12em] uppercase shrink-0">
        {children}
      </h3>
      <div className="h-px bg-[#E8E6E1] flex-1" />
      {action}
    </div>
  );
}

/** 選項按鈕：空間型態、辦公現況、語言等共用 */
function ChoiceButton({
  active,
  onClick,
  children,
  tone = "ink",
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tone?: "ink" | "warn";
}) {
  const activeStyle =
    tone === "warn"
      ? { backgroundColor: C.warn, borderColor: C.warn, color: "#fff" }
      : { backgroundColor: C.ink, borderColor: C.ink, color: "#fff" };
  return (
    <button
      type="button"
      onClick={onClick}
      style={active ? activeStyle : undefined}
      className={`px-3.5 py-2 text-[12px] font-medium rounded-lg border transition-all ${
        active ? "" : "bg-white text-[#8A8780] border-[#E0DDD6] hover:border-[#B0ADA6]"
      }`}
    >
      {children}
    </button>
  );
}

/** 加值服務的單列：左邊勾選、右邊參數，未勾選時參數變淡但仍可預先填寫 */
function ServiceRow({
  checked,
  onToggle,
  label,
  badge,
  fullWidth,
  children,
}: {
  checked: boolean;
  onToggle: (v: boolean) => void;
  label: string;
  badge?: string;
  fullWidth?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`bg-white rounded-lg border px-4 py-3.5 transition-colors ${
        checked ? "border-[#D5D2CB]" : "border-[#F0EEE9]"
      } ${fullWidth ? "" : "flex items-center justify-between gap-6"}`}
    >
      <label className="flex items-center gap-3 cursor-pointer shrink-0">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onToggle(e.target.checked)}
          className="w-[18px] h-[18px] accent-[#1A1A18] cursor-pointer"
        />
        <span className={`text-[13px] ${checked ? "text-[#1A1A18]" : "text-[#A5A29B]"}`}>
          {label}
        </span>
        {badge && (
          <span
            className="text-[10px] font-medium px-2 py-0.5 rounded"
            style={{ backgroundColor: "#FAF3E5", color: C.warn }}
          >
            {badge}
          </span>
        )}
      </label>
      <div className={`${checked ? "" : "opacity-40"} ${fullWidth ? "mt-3" : ""}`}>{children}</div>
    </div>
  );
}

/** 抽屜外框：標題列 + 內容 + 底部操作 */
function DrawerShell({
  eyebrow,
  title,
  meta,
  onClose,
  children,
  footer,
  maxWidth = "max-w-2xl",
}: {
  eyebrow: string;
  title: string;
  meta?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
  maxWidth?: string;
}) {
  return (
    <div className="fixed inset-0 z-[300] flex justify-end font-sans">
      <div className="absolute inset-0 bg-[#1A1A18]/30 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className={`relative w-full ${maxWidth} bg-white h-full shadow-[0_0_40px_rgba(0,0,0,0.12)] flex flex-col overflow-hidden`}
      >
        <header className="px-8 pt-7 pb-5 shrink-0 bg-white border-b border-[#E8E6E1]">
          <div className="flex justify-between items-start">
            <div className="min-w-0 pr-4">
              <div className="text-[10px] font-semibold text-[#B0ADA6] tracking-[0.16em] uppercase mb-1.5">
                {eyebrow}
              </div>
              <h2 className="text-[19px] font-semibold text-[#1A1A18] tracking-tight truncate">
                {title}
              </h2>
              {meta && <div className="mt-1.5">{meta}</div>}
            </div>
            <button
              onClick={onClose}
              className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-[#A5A29B] hover:bg-[#F5F4F1] hover:text-[#1A1A18] transition-colors"
            >
              ✕
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-8 py-8 space-y-10 custom-scrollbar bg-white">
          {children}
        </div>

        <footer className="px-8 py-5 border-t border-[#E8E6E1] bg-white flex items-center gap-4 shrink-0">
          {footer}
        </footer>
      </div>
    </div>
  );
}

/* ============================================================
   房號挑選器
   ============================================================ */
function RoomPicker({
  rooms,
  floors,
  selectedIds,
  onToggle,
  onClose,
}: {
  rooms: Room[];
  floors: Floor[];
  selectedIds: string[];
  onToggle: (room: Room) => void;
  onClose: () => void;
}) {
  const [floorFilter, setFloorFilter] = useState("全部");
  const [onlyAvailable, setOnlyAvailable] = useState(true);
  const [keyword, setKeyword] = useState("");

  const visible = useMemo(() => {
    const k = keyword.trim().toLowerCase();
    return rooms.filter((r) => {
      if (!r.active) return false;
      if (onlyAvailable && r.status !== "AVAILABLE") return false;
      if (floorFilter !== "全部" && r.floorId !== floorFilter) return false;
      if (k && !r.roomNo.toLowerCase().includes(k)) return false;
      return true;
    });
  }, [rooms, floorFilter, onlyAvailable, keyword]);

  const floorMap = useMemo(() => new Map(floors.map((f) => [f.id, f])), [floors]);

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-8 font-sans">
      <div className="absolute inset-0 bg-[#1A1A18]/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.16)] w-full max-w-4xl max-h-[80vh] flex flex-col overflow-hidden">
        <header className="px-6 py-5 border-b border-[#E8E6E1] flex justify-between items-start shrink-0">
          <div>
            <h3 className="text-[16px] font-semibold text-[#1A1A18] tracking-tight">選擇帶看房型</h3>
            <p className="text-[11px] text-[#A5A29B] mt-1 tabular-nums">
              最多選 {MAX_ROOMS} 間，目前已選 {selectedIds.length} 間
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#A5A29B] hover:bg-[#F5F4F1] hover:text-[#1A1A18] transition-colors"
          >
            ✕
          </button>
        </header>

        <div className="px-6 py-3 border-b border-[#E8E6E1] flex items-center gap-3 bg-[#FAFAF8] shrink-0">
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜尋房號"
            className="px-3 py-1.5 bg-white border border-[#E8E6E1] rounded-md text-[12px] w-40 outline-none focus:border-[#B0ADA6] transition-colors text-[#1A1A18] placeholder:text-[#C4C1B9]"
          />
          <select
            value={floorFilter}
            onChange={(e) => setFloorFilter(e.target.value)}
            className="px-2.5 py-1.5 bg-white border border-[#E8E6E1] rounded-md text-[12px] font-medium text-[#3A3833] w-40 outline-none"
          >
            <option value="全部">全部樓層</option>
            {floors.map((f) => (
              <option key={f.id} value={f.id}>
                {f.floorName}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={onlyAvailable}
              onChange={(e) => setOnlyAvailable(e.target.checked)}
              className="w-4 h-4 accent-[#1A1A18] cursor-pointer"
            />
            <span className="text-[12px] text-[#3A3833]">只顯示可出租</span>
          </label>
          <span className="ml-auto text-[11px] text-[#B0ADA6] tabular-nums">{visible.length} 間</span>
        </div>

        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          <div className="grid grid-cols-3 gap-3">
            {visible.map((r) => {
              const picked = selectedIds.includes(r.id);
              const full = selectedIds.length >= MAX_ROOMS && !picked;
              const f = floorMap.get(r.floorId);
              return (
                <button
                  key={r.id}
                  type="button"
                  disabled={full}
                  onClick={() => onToggle(r)}
                  className={`text-left p-3 rounded-lg border transition-all ${
                    picked
                      ? "border-[#1A1A18] bg-[#FAFAF8] ring-1 ring-[#1A1A18]"
                      : full
                      ? "border-[#F0EEE9] bg-[#FAFAF8] opacity-40 cursor-not-allowed"
                      : "border-[#E8E6E1] bg-white hover:border-[#B0ADA6]"
                  }`}
                >
                  {r.photoUrls && r.photoUrls.length > 0 ? (
                    <img
                      src={r.photoUrls[0]}
                      alt={r.roomNo}
                      className="w-full h-24 object-cover rounded-md mb-3 bg-[#F0EEE9]"
                    />
                  ) : (
                    <div className="w-full h-24 rounded-md mb-3 bg-[#F0EEE9] flex items-center justify-center">
                      <span className="text-[11px] text-[#B0ADA6]">尚無照片</span>
                    </div>
                  )}
                  <div className="flex justify-between items-start mb-1.5">
                    <span className="text-[15px] font-semibold text-[#1A1A18]">{r.roomNo}</span>
                    {picked && <span className="text-[#1A1A18] text-[13px]">✓</span>}
                  </div>
                  <div className="text-[11px] text-[#B0ADA6] mb-1.5">{f?.floorName || "—"}</div>
                  <div className="text-[11px] text-[#8A8780] mb-2 tabular-nums">
                    {r.areaPing} 坪 · {r.capacityMax} 人
                  </div>
                  <div className="text-[13px] font-semibold tabular-nums" style={{ color: C.success }}>
                    {currency(r.priceBase)}
                  </div>
                  {r.status !== "AVAILABLE" && (
                    <div
                      className="mt-2 text-[10px] font-medium px-2 py-0.5 rounded w-fit"
                      style={{ backgroundColor: "#FAF3E5", color: C.warn }}
                    >
                      {ROOM_STATUS_LABEL[r.status]}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          {visible.length === 0 && (
            <div className="py-16 text-center text-[12px] text-[#A5A29B]">沒有符合條件的房型</div>
          )}
        </div>

        <footer className="px-6 py-4 border-t border-[#E8E6E1] bg-white shrink-0">
          <button
            onClick={onClose}
            className="w-full bg-[#1A1A18] text-white py-2.5 rounded-lg text-[13px] font-medium hover:bg-black transition-colors"
          >
            完成選擇
          </button>
        </footer>
      </div>
    </div>
  );
}

/* ============================================================
   寄送提案
   ============================================================ */
function SendDialog({
  proposal,
  onClose,
  onSent,
}: {
  proposal: Proposal;
  onClose: () => void;
  onSent: () => void;
}) {
  const [draft, setDraft] = useState<MailDraft>(buildMailDraft(proposal));
  const [copied, setCopied] = useState<"none" | "body" | "all">("none");

  const resetDraft = () => setDraft(buildMailDraft(proposal));

  const copyText = async (text: string, kind: "body" | "all") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied("none"), 2000);
    } catch {
      alert("複製失敗，請手動選取內容");
    }
  };

  const openMail = (url: string) => {
    window.open(url, "_blank");
    // 開啟郵件軟體後才標記，避免只是打開對話框看看就被計為已寄出
    onSent();
  };

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-8 font-sans">
      <div className="absolute inset-0 bg-[#1A1A18]/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.16)] w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
        <header className="px-6 py-5 border-b border-[#E8E6E1] flex justify-between items-start shrink-0">
          <div>
            <h3 className="text-[16px] font-semibold text-[#1A1A18] tracking-tight">寄送提案</h3>
            <p className="text-[11px] text-[#A5A29B] mt-1">
              信件內容可先調整，開啟郵件軟體後請自行附加 PDF 檔案
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#A5A29B] hover:bg-[#F5F4F1] hover:text-[#1A1A18] transition-colors"
          >
            ✕
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 custom-scrollbar">
          <div
            className="rounded-lg px-4 py-3"
            style={{ backgroundColor: "#FAF3E5", border: "1px solid #EFE3C8" }}
          >
            <p className="text-[12px] leading-relaxed" style={{ color: C.warn }}>
              請先在提案預覽頁存好 PDF，開啟郵件軟體後手動附加。
              瀏覽器無法代為附加檔案，這是郵件連結的規格限制。
            </p>
          </div>

          <div>
            <FieldLabel>收件人</FieldLabel>
            <input
              type="email"
              value={draft.to}
              onChange={(e) => setDraft({ ...draft, to: e.target.value })}
              placeholder="尚未填寫貴賓 Email"
              className={inputClass}
            />
          </div>

          <div>
            <FieldLabel>主旨</FieldLabel>
            <input
              value={draft.subject}
              onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
              className={inputClass}
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-[11px] font-medium text-[#8A8780]">信件內容</span>
              <button
                type="button"
                onClick={resetDraft}
                className="text-[11px] text-[#A5A29B] hover:text-[#1A1A18] transition-colors"
              >
                重設為預設內容
              </button>
            </div>
            <textarea
              rows={16}
              value={draft.body}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              className={`${inputClass} leading-relaxed font-sans`}
            />
          </div>
        </div>

        <footer className="px-6 py-4 border-t border-[#E8E6E1] bg-white shrink-0 space-y-2.5">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => copyText(draft.body, "body")}
              className="flex-1 py-2.5 rounded-lg text-[13px] font-medium border border-[#E0DDD6] text-[#3A3833] hover:border-[#B0ADA6] transition-colors"
            >
              {copied === "body" ? "已複製內容" : "複製信件內容"}
            </button>
            <button
              type="button"
              onClick={() => openMail(buildGmailUrl(draft))}
              className="flex-1 py-2.5 rounded-lg text-[13px] font-medium border border-[#E0DDD6] text-[#3A3833] hover:border-[#B0ADA6] transition-colors"
            >
              用 Gmail 開啟
            </button>
            <button
              type="button"
              onClick={() => openMail(buildMailtoUrl(draft))}
              className="flex-1 bg-[#1A1A18] text-white py-2.5 rounded-lg text-[13px] font-medium hover:bg-black transition-colors"
            >
              開啟郵件軟體
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              onSent();
              onClose();
            }}
            className="w-full text-[11px] text-[#A5A29B] hover:text-[#1A1A18] py-1 transition-colors"
          >
            我已用其他方式寄出，直接標記為已送出
          </button>
        </footer>
      </div>
    </div>
  );
}

/* ============================================================
   提案編輯
   ============================================================ */
function ProposalEditor({
  proposal,
  isCreate,
  rooms,
  floors,
  currentUser,
  onClose,
  onSend,
}: {
  proposal: Proposal | null;
  isCreate: boolean;
  rooms: Room[];
  floors: Floor[];
  currentUser: string;
  onClose: () => void;
  onSend: (p: Proposal) => void;
}) {
  const [form, setForm] = useState<Proposal>(emptyProposal(currentUser));
  const [picking, setPicking] = useState(false);
  const [lightbox, setLightbox] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isCreate) setForm(emptyProposal(currentUser));
    else if (proposal) {
      // 區塊三、四是後來才加的，舊提案沒有這些欄位，載入時補上預設值避免存取時出錯
      setForm({
        ...proposal,
        lang: proposal.lang || "en",
        guestEmail: proposal.guestEmail || "",
        freeBenefits: proposal.freeBenefits || emptyFreeBenefits(),
        paidAddOns: proposal.paidAddOns || emptyPaidAddOns(),
        painPoints: proposal.painPoints || {},
      });
    }
  }, [proposal?.id, isCreate, currentUser]);

  const floorMap = useMemo(() => new Map(floors.map((f) => [f.id, f])), [floors]);

  const toggleRoom = (room: Room) => {
    const exists = form.rooms.find((r) => r.roomId === room.id);
    if (exists) {
      setForm({ ...form, rooms: form.rooms.filter((r) => r.roomId !== room.id) });
      return;
    }
    if (form.rooms.length >= MAX_ROOMS) return;

    const f = floorMap.get(room.floorId);
    // 快照母表當下的規格與價格，之後母表調價不影響已建立的提案
    const item: ProposalRoomItem = {
      roomId: room.id,
      roomNo: room.roomNo,
      floorId: room.floorId,
      floorName: f?.floorName || "",
      floorNameEn: f?.floorNameEn || "",
      areaPing: room.areaPing,
      capacityMax: room.capacityMax,
      featureDesc: room.featureDesc,
      featureDescEn: room.featureDescEn || "",
      priceBase: room.priceBase,
      priceHalfYear: room.priceHalfYear,
      priceYearly: room.priceYearly,
      acTemplate: f?.acTemplate || "",
      acTemplateEn: f?.acTemplateEn || "",
      privateElectricRate: f?.privateElectricRate || 0,
      photoUrls: room.photoUrls || [],
      isRecommended: false,
      customNote: "",
    };
    setForm({ ...form, rooms: [...form.rooms, item] });
  };

  const updateRoomItem = (roomId: string, patch: Partial<ProposalRoomItem>) => {
    setForm({
      ...form,
      rooms: form.rooms.map((r) => (r.roomId === roomId ? { ...r, ...patch } : r)),
    });
  };

  const setRecommended = (roomId: string) => {
    setForm({
      ...form,
      rooms: form.rooms.map((r) => ({ ...r, isRecommended: r.roomId === roomId ? !r.isRecommended : false })),
    });
  };

  const toggleSpaceType = (t: string) => {
    const has = form.spaceTypes.includes(t);
    setForm({
      ...form,
      spaceTypes: has ? form.spaceTypes.filter((x) => x !== t) : [...form.spaceTypes, t],
    });
  };

  // --- 區塊三 ---
  // 泛型展開在部分 TS 設定下會報錯，這裡用明確的物件組合，行為相同但編譯更穩
  const updateFreeBenefit = (key: keyof FreeBenefits, patch: Record<string, any>) => {
    setForm((prev) => ({
      ...prev,
      freeBenefits: {
        ...prev.freeBenefits,
        [key]: { ...(prev.freeBenefits[key] as any), ...patch },
      },
    }));
  };

  const updatePaidAddOn = (key: keyof PaidAddOns, patch: Record<string, any>) => {
    setForm((prev) => ({
      ...prev,
      paidAddOns: {
        ...prev.paidAddOns,
        [key]: { ...(prev.paidAddOns[key] as any), ...patch },
      },
    }));
  };

  // --- 區塊四 ---
  const togglePainItem = (groupKey: string, option: string) => {
    setForm((prev) => {
      const current = prev.painPoints[groupKey] || { items: [], otherText: "" };
      const items = current.items.includes(option)
        ? current.items.filter((x) => x !== option)
        : [...current.items, option];
      const next: PainPointState = { ...prev.painPoints };
      // 群組全空就整個移除，PDF 渲染時才不會出現沒有內容的空標題
      if (items.length === 0 && !current.otherText.trim()) delete next[groupKey];
      else next[groupKey] = { ...current, items };
      return { ...prev, painPoints: next };
    });
  };

  const setPainOther = (groupKey: string, text: string) => {
    setForm((prev) => {
      const current = prev.painPoints[groupKey] || { items: [], otherText: "" };
      const next: PainPointState = { ...prev.painPoints };
      if (!text.trim() && current.items.length === 0) delete next[groupKey];
      else next[groupKey] = { ...current, otherText: text };
      return { ...prev, painPoints: next };
    });
  };

  const clearPainGroup = (groupKey: string) => {
    setForm((prev) => {
      const next: PainPointState = { ...prev.painPoints };
      delete next[groupKey];
      return { ...prev, painPoints: next };
    });
  };

  const applyValidDays = (d: number) => {
    setForm({ ...form, validDays: d, validUntil: calcValidUntil(d) });
  };

  const generateProposalNo = async () => {
    const prefix = `DT-${todayStr().replace(/-/g, "")}-`;
    const snap = await getDocs(
      query(
        collection(db, "proposals"),
        where("proposalNo", ">=", prefix),
        where("proposalNo", "<", prefix + "\uf8ff")
      )
    );
    return prefix + String(snap.size + 1).padStart(3, "0");
  };

  const handleSave = async () => {
    if (!form.companyName.trim() || !form.guestName.trim()) {
      alert("⚠️ 公司名稱與現場貴賓姓名為必填");
      return;
    }
    if (form.rooms.length === 0) {
      alert("⚠️ 請至少選擇一間帶看房型");
      return;
    }
    setSaving(true);
    try {
      const { id, ...rest } = form;
      if (isCreate) {
        const proposalNo = await generateProposalNo();
        await addDoc(collection(db, "proposals"), {
          ...rest,
          proposalNo,
          createdBy: currentUser,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        await updateDoc(doc(db, "proposals", id), { ...rest, updatedAt: serverTimestamp() });
      }
      onClose();
    } catch (e) {
      console.error(e);
      alert("儲存失敗");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`確定刪除提案「${form.proposalNo}」？`)) return;
    await deleteDoc(doc(db, "proposals", form.id));
    onClose();
  };

  const selectedIds = form.rooms.map((r) => r.roomId);

  return (
    <DrawerShell
      eyebrow={isCreate ? "New proposal" : "Proposal detail"}
      title={isCreate ? "新增帶看提案" : form.companyName || "未命名提案"}
      maxWidth="max-w-5xl"
      meta={
        !isCreate ? (
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-[#B0ADA6]">{form.proposalNo}</span>
            <span className="text-[10px] font-medium bg-[#1A1A18] text-white px-2 py-0.5 rounded">
              {form.version}
            </span>
          </div>
        ) : undefined
      }
      onClose={onClose}
      footer={
        <>
          {/* 刪除是不可逆操作，降級成文字連結，不與儲存爭奪視覺重量 */}
          {!isCreate && (
            <>
              <button
                type="button"
                onClick={handleDelete}
                className="text-[12px] text-[#A5A29B] hover:text-[#B4483C] transition-colors shrink-0"
              >
                刪除
              </button>
              <button
                type="button"
                onClick={() => window.open(`/proposals/${form.id}/print`, "_blank")}
                className="text-[12px] text-[#A5A29B] hover:text-[#1A1A18] transition-colors shrink-0"
              >
                預覽 / PDF
              </button>
              <button
                type="button"
                onClick={() => onSend(form)}
                className="text-[12px] text-[#A5A29B] hover:text-[#1A1A18] transition-colors shrink-0"
              >
                寄送
              </button>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as ProposalStatus })}
                className="px-3 py-2 rounded-lg text-[12px] font-medium border border-[#E0DDD6] bg-white text-[#3A3833] outline-none"
              >
                {(Object.keys(PROPOSAL_STATUS_LABEL) as ProposalStatus[]).map((st) => (
                  <option key={st} value={st}>
                    {PROPOSAL_STATUS_LABEL[st]}
                  </option>
                ))}
              </select>
            </>
          )}
          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="ml-auto bg-[#1A1A18] text-white px-8 py-3 rounded-lg text-[13px] font-medium hover:bg-black transition-colors disabled:opacity-50"
          >
            {saving ? "儲存中…" : "儲存"}
          </button>
        </>
      }
    >
          {/* ---------- 區塊一：客戶與帶看紀錄 ---------- */}
          <section>
            <SectionHead>帶看紀錄與客戶資料</SectionHead>
            <div className="grid grid-cols-3 gap-x-5 gap-y-5">
              <div className="col-span-2">
                <FieldLabel required>公司 / 籌備處名稱</FieldLabel>
                <input
                  value={form.companyName}
                  onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <FieldLabel>參觀日期</FieldLabel>
                <input
                  type="date"
                  value={form.visitDate}
                  onChange={(e) => setForm({ ...form, visitDate: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <FieldLabel required>現場貴賓姓名</FieldLabel>
                <input
                  value={form.guestName}
                  onChange={(e) => setForm({ ...form, guestName: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <FieldLabel>職稱</FieldLabel>
                <input
                  value={form.guestTitle}
                  onChange={(e) => setForm({ ...form, guestTitle: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <FieldLabel>LINE 顯示名稱</FieldLabel>
                <input
                  value={form.lineName}
                  onChange={(e) => setForm({ ...form, lineName: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div className="col-span-2">
                <FieldLabel>貴賓 Email</FieldLabel>
                <input
                  type="email"
                  value={form.guestEmail || ""}
                  onChange={(e) => setForm({ ...form, guestEmail: e.target.value })}
                  placeholder="寄送提案時會帶入收件人"
                  className={inputClass}
                />
              </div>
              <div>
                <FieldLabel>進駐人數</FieldLabel>
                <input
                  type="number"
                  value={form.headcount || ""}
                  onChange={(e) => setForm({ ...form, headcount: Number(e.target.value) })}
                  className={inputClass}
                />
              </div>
              <div>
                <FieldLabel>預計進駐日期</FieldLabel>
                <input
                  type="date"
                  value={form.moveInDate}
                  onChange={(e) => setForm({ ...form, moveInDate: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <FieldLabel>道騰承辦業務</FieldLabel>
                <input
                  value={form.salesName}
                  onChange={(e) => setForm({ ...form, salesName: e.target.value })}
                  className={inputClass}
                />
              </div>

              <div className="col-span-3">
                <FieldLabel>空間型態（可複選）</FieldLabel>
                <div className="flex flex-wrap gap-1.5">
                  {SPACE_TYPE_OPTIONS.map((t) => (
                    <ChoiceButton
                      key={t}
                      active={form.spaceTypes.includes(t)}
                      onClick={() => toggleSpaceType(t)}
                    >
                      {t}
                    </ChoiceButton>
                  ))}
                </div>
              </div>

              <div className="col-span-3">
                <FieldLabel>目前辦公現況</FieldLabel>
                <div className="flex flex-wrap gap-1.5">
                  {OFFICE_STATUS_OPTIONS.map((t) => (
                    <ChoiceButton
                      key={t}
                      active={form.officeStatus === t}
                      onClick={() =>
                        setForm({ ...form, officeStatus: form.officeStatus === t ? "" : t })
                      }
                    >
                      {t}
                    </ChoiceButton>
                  ))}
                </div>
              </div>

              <div className="col-span-3">
                <FieldLabel>報價有效期限</FieldLabel>
                <div className="flex items-center gap-2">
                  {VALID_DAY_OPTIONS.map((d) => (
                    <ChoiceButton
                      key={d}
                      active={form.validDays === d}
                      onClick={() => applyValidDays(d)}
                      tone="warn"
                    >
                      {d} 天
                    </ChoiceButton>
                  ))}
                  <span className="text-[11px] text-[#8A8780] ml-2">截止日</span>
                  <input
                    type="date"
                    value={form.validUntil}
                    onChange={(e) => setForm({ ...form, validUntil: e.target.value })}
                    className="bg-[#FAFAF8] border border-[#E8E6E1] rounded-lg px-3 py-2 text-[13px] text-[#1A1A18] outline-none focus:bg-white focus:border-[#B0ADA6] transition-colors"
                  />
                </div>
              </div>

              {/* 只影響列印出來的提案與寄送的信件，後台介面維持中文 */}
              <div className="col-span-3">
                <FieldLabel>提案文件語言</FieldLabel>
                <div className="flex items-center gap-2">
                  {([
                    { key: "zh" as ProposalLang, label: "中文" },
                    { key: "en" as ProposalLang, label: "English" },
                  ]).map((l) => (
                    <ChoiceButton
                      key={l.key}
                      active={(form.lang || "en") === l.key}
                      onClick={() => setForm({ ...form, lang: l.key })}
                    >
                      {l.label}
                    </ChoiceButton>
                  ))}
                  <span className="text-[11px] text-[#B0ADA6] ml-2">
                    預設英文，中文客戶可改為中文；後台介面不受影響
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* ---------- 區塊二：比價大表 ---------- */}
          <section>
            <SectionHead
              action={
                <div className="flex items-center gap-2 shrink-0">
                  <div className="flex items-center bg-[#F0EEE9] rounded-lg p-0.5">
                    {[
                      { v: false, label: "未稅" },
                      { v: true, label: "含稅" },
                    ].map((o) => (
                      <button
                        key={o.label}
                        type="button"
                        onClick={() => setForm({ ...form, taxIncluded: o.v })}
                        className={`px-3 py-1.5 text-[11px] font-medium rounded-md transition-all ${
                          form.taxIncluded === o.v
                            ? "bg-white text-[#1A1A18] shadow-sm"
                            : "text-[#A5A29B]"
                        }`}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setPicking(true)}
                    className="bg-[#1A1A18] text-white px-3.5 py-2 rounded-lg text-[12px] font-medium hover:bg-black transition-colors whitespace-nowrap"
                  >
                    選擇房型（{form.rooms.length}/{MAX_ROOMS}）
                  </button>
                </div>
              }
            >
              專屬空間比價表
            </SectionHead>

            {form.rooms.length === 0 ? (
              <div className="py-16 text-center border border-dashed border-[#E0DDD6] rounded-lg">
                <p className="text-[13px] font-medium text-[#3A3833]">還沒有選擇房型</p>
                <p className="text-[12px] text-[#A5A29B] mt-2">
                  選 1～4 間帶看過的房型，系統會自動排出比價表
                </p>
                <button
                  type="button"
                  onClick={() => setPicking(true)}
                  className="mt-5 bg-[#1A1A18] text-white px-5 py-2.5 rounded-lg text-[12px] font-medium"
                >
                  選擇房型
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto border border-[#E8E6E1] rounded-lg bg-white custom-scrollbar">
                <table className="w-full text-sm min-w-[720px]">
                  <thead>
                    <tr>
                      <th className="text-left px-5 py-3.5 bg-[#FAFAF8] text-xs font-medium text-[#8A8780] w-40 sticky left-0 z-10">
                        比較項目
                      </th>
                      {form.rooms.map((r) => (
                        <th
                          key={r.roomId}
                          className={`px-5 py-3.5 text-left border-l border-[#F0EEE9] ${
                            r.isRecommended ? "bg-[#FAF6EC]" : "bg-[#FAFAF8]"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <div className="text-[15px] font-semibold text-[#1A1A18]">{r.roomNo}</div>
                              <div className="text-[11px] text-[#B0ADA6] mt-0.5">{r.floorName}</div>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                setForm({
                                  ...form,
                                  rooms: form.rooms.filter((x) => x.roomId !== r.roomId),
                                })
                              }
                              className="text-[#C4C1B9] hover:text-[#B4483C] text-[13px] transition-colors"
                            >
                              ✕
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => setRecommended(r.roomId)}
                            className={`mt-3 w-full px-2 py-1.5 rounded-md text-[11px] font-medium transition-all ${
                              r.isRecommended
                                ? "text-white"
                                : "bg-white text-[#A5A29B] border border-[#E8E6E1] hover:border-[#B0ADA6]"
                            }`}
                            style={r.isRecommended ? { backgroundColor: C.warn } : undefined}
                          >
                            {r.isRecommended ? "主推方案" : "設為主推"}
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="text-xs">
                    <tr className="border-t border-[#F0EEE9]">
                      <td className="px-5 py-3 text-[#8A8780] bg-[#FAFAF8] sticky left-0 align-top">
                        空間照片
                      </td>
                      {form.rooms.map((r) => (
                        <td
                          key={r.roomId}
                          className={`px-5 py-3 border-l border-slate-100 align-top ${
                            r.isRecommended ? "bg-[#FAF6EC]/60" : ""
                          }`}
                        >
                          {r.photoUrls && r.photoUrls.length > 0 ? (
                            <div className="space-y-2">
                              <img
                                src={r.photoUrls[0]}
                                alt={`${r.roomNo} 封面`}
                                onClick={() => setLightbox(r.photoUrls)}
                                className="w-full h-28 object-cover rounded-md bg-[#F0EEE9] cursor-zoom-in hover:opacity-90 transition-opacity"
                              />
                              {r.photoUrls.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => setLightbox(r.photoUrls)}
                                  className="text-[11px] text-[#4E6A74] hover:underline"
                                >
                                  檢視全部 {r.photoUrls.length} 張
                                </button>
                              )}
                            </div>
                          ) : (
                            <div className="w-full h-28 rounded-md bg-[#F0EEE9] flex items-center justify-center">
                              <span className="text-[11px] text-[#B0ADA6]">尚無照片</span>
                            </div>
                          )}
                        </td>
                      ))}
                    </tr>
                    {[
                      { label: "坪數", render: (r: ProposalRoomItem) => `${r.areaPing} 坪` },
                      { label: "建議人數", render: (r: ProposalRoomItem) => `${r.capacityMax} 人` },
                      { label: "空間特色", render: (r: ProposalRoomItem) => r.featureDesc || "—" },
                    ].map((row) => (
                      <tr key={row.label} className="border-t border-[#F0EEE9]">
                        <td className="px-5 py-3 text-[#8A8780] bg-[#FAFAF8] sticky left-0">
                          {row.label}
                        </td>
                        {form.rooms.map((r) => (
                          <td
                            key={r.roomId}
                            className={`px-5 py-3 border-l border-[#F0EEE9] text-[#3A3833] ${
                              r.isRecommended ? "bg-[#FAF6EC]/60" : ""
                            }`}
                          >
                            {row.render(r)}
                          </td>
                        ))}
                      </tr>
                    ))}

                    {[
                      { label: "統一原價", key: "priceBase" as const, strong: false },
                      { label: "半年繳月租", key: "priceHalfYear" as const, strong: false },
                      { label: "年繳月租", key: "priceYearly" as const, strong: true },
                    ].map((row) => (
                      <tr key={row.label} className="border-t border-[#F0EEE9]">
                        <td className="px-5 py-3 text-[#8A8780] bg-[#FAFAF8] sticky left-0">
                          {row.label}
                        </td>
                        {form.rooms.map((r) => (
                          <td
                            key={r.roomId}
                            className={`px-5 py-3 border-l border-slate-100 ${
                              r.isRecommended ? "bg-[#FAF6EC]/60" : ""
                            } ${row.strong ? "text-[14px] font-semibold" : "text-[#3A3833]"}`}
                            style={row.strong ? { color: C.success } : undefined}
                          >
                            {currency(withTax(r[row.key], form.taxIncluded))}
                          </td>
                        ))}
                      </tr>
                    ))}

                    <tr className="border-t border-[#F0EEE9]">
                      <td className="px-5 py-3 text-[#8A8780] bg-[#FAFAF8] sticky left-0 align-top">
                        空調與用電
                      </td>
                      {form.rooms.map((r) => (
                        <td
                          key={r.roomId}
                          className={`px-5 py-3 border-l border-slate-100 align-top ${
                            r.isRecommended ? "bg-[#FAF6EC]/60" : ""
                          }`}
                        >
                          <pre className="text-[11px] text-[#8A8780] whitespace-pre-wrap leading-relaxed font-sans">
                            {r.acTemplate || "—"}
                          </pre>
                        </td>
                      ))}
                    </tr>

                    <tr className="border-t border-[#F0EEE9]">
                      <td className="px-5 py-3 text-[#8A8780] bg-[#FAFAF8] sticky left-0 align-top">
                        業務補充說明
                      </td>
                      {form.rooms.map((r) => (
                        <td
                          key={r.roomId}
                          className={`px-5 py-3 border-l border-slate-100 ${
                            r.isRecommended ? "bg-[#FAF6EC]/60" : ""
                          }`}
                        >
                          <textarea
                            rows={3}
                            value={r.customNote}
                            onChange={(e) => updateRoomItem(r.roomId, { customNote: e.target.value })}
                            placeholder="例如：可保留至月底"
                            className="w-full bg-[#FAFAF8] border border-[#E8E6E1] rounded-md p-2 text-[11px] outline-none focus:bg-white focus:border-[#B0ADA6] transition-colors text-[#3A3833] placeholder:text-[#C4C1B9]"
                          />
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {form.taxIncluded && (
              <p className="text-[11px] text-[#B0ADA6]">
                * 目前以含稅金額顯示（原價 × 1.05），切換回未稅不會影響已儲存的原始數字
              </p>
            )}
          </section>

          {/* ---------- 區塊三：加值服務與營運細則 ---------- */}
          <section>
            <SectionHead
              action={
                <span className="shrink-0 text-[11px] text-[#B0ADA6]">
                  只有勾選的項目會出現在提案上
                </span>
              }
            >
              加值服務與營運細則
            </SectionHead>

            {/* 免費贈送區 */}
            <div className="bg-[#FAFAF8] px-5 py-4 rounded-lg border border-[#E8E6E1] space-y-3">
              <div className="text-[11px] font-semibold text-[#8A8780] tracking-[0.12em] uppercase">
                免費贈送
              </div>

              <ServiceRow
                checked={form.freeBenefits.meetingRoom.enabled}
                onToggle={(v) => updateFreeBenefit("meetingRoom", { enabled: v })}
                label="會議室免費額度"
              >
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={form.freeBenefits.meetingRoom.hoursPerMonth || ""}
                    onChange={(e) =>
                      updateFreeBenefit("meetingRoom", {
                        hoursPerMonth: Number(e.target.value),
                      })
                    }
                    className="w-20 border-b border-purple-200 py-1 text-sm font-bold bg-transparent outline-none text-center"
                  />
                  <span className="text-xs text-slate-500 font-bold">小時／月</span>
                </div>
              </ServiceRow>

              <ServiceRow
                checked={form.freeBenefits.cleaning.enabled}
                onToggle={(v) => updateFreeBenefit("cleaning", { enabled: v })}
                label="辦公室清潔服務"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 font-bold">每月</span>
                  <input
                    type="number"
                    value={form.freeBenefits.cleaning.timesPerMonth || ""}
                    onChange={(e) =>
                      updateFreeBenefit("cleaning", {
                        timesPerMonth: Number(e.target.value),
                      })
                    }
                    className="w-16 border-b border-purple-200 py-1 text-sm font-bold bg-transparent outline-none text-center"
                  />
                  <span className="text-xs text-slate-500 font-bold">次</span>
                </div>
              </ServiceRow>

              <ServiceRow
                checked={form.freeBenefits.businessRegistration.enabled}
                onToggle={(v) => updateFreeBenefit("businessRegistration", { enabled: v })}
                label="免費工商登記"
                badge="原價 $2,500／月"
                fullWidth
              >
                <div className="space-y-2">
                  <textarea
                    rows={2}
                    value={form.freeBenefits.businessRegistration.note}
                    onChange={(e) =>
                      updateFreeBenefit("businessRegistration", { note: e.target.value })
                    }
                    placeholder="中文說明"
                    className="w-full border border-purple-200 rounded-lg p-3 text-[11px] leading-relaxed outline-none focus:border-purple-400 bg-white text-slate-700"
                  />
                  <textarea
                    rows={2}
                    value={form.freeBenefits.businessRegistration.noteEn || ""}
                    onChange={(e) =>
                      updateFreeBenefit("businessRegistration", { noteEn: e.target.value })
                    }
                    placeholder="English description"
                    className="w-full border border-purple-200 rounded-lg p-3 text-[11px] leading-relaxed outline-none focus:border-purple-400 bg-white text-slate-700"
                  />
                </div>
              </ServiceRow>

              <ServiceRow
                checked={form.freeBenefits.custom.enabled}
                onToggle={(v) => updateFreeBenefit("custom", { enabled: v })}
                label="自訂贈送項目"
                fullWidth
              >
                <div className="space-y-2">
                  <input
                    value={form.freeBenefits.custom.text}
                    onChange={(e) => updateFreeBenefit("custom", { text: e.target.value })}
                    placeholder="例如：贈送前三個月飲品吧無限暢飲"
                    className="w-full border-b border-purple-200 py-2 text-sm bg-transparent outline-none text-slate-800"
                  />
                  <input
                    value={form.freeBenefits.custom.textEn || ""}
                    onChange={(e) => updateFreeBenefit("custom", { textEn: e.target.value })}
                    placeholder="English, e.g. Complimentary beverage bar for the first three months"
                    className="w-full border-b border-purple-200 py-2 text-sm bg-transparent outline-none text-slate-800"
                  />
                </div>
              </ServiceRow>
            </div>

            {/* 加購區 */}
            <div className="bg-[#FAFAF8] px-5 py-4 rounded-lg border border-[#E8E6E1] space-y-3 mt-4">
              <div className="text-[11px] font-semibold text-[#8A8780] tracking-[0.12em] uppercase">
                加購與庶務
              </div>

              <ServiceRow
                checked={form.paidAddOns.printing.enabled}
                onToggle={(v) => updatePaidAddOn("printing", { enabled: v })}
                label="列印服務"
              >
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-slate-500 font-bold">黑白 $</span>
                    <input
                      type="number"
                      value={form.paidAddOns.printing.bwPrice || ""}
                      onChange={(e) =>
                        updatePaidAddOn("printing", { bwPrice: Number(e.target.value) })
                      }
                      className="w-14 border-b border-slate-300 py-1 text-sm font-bold bg-transparent outline-none text-center"
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-slate-500 font-bold">彩色 $</span>
                    <input
                      type="number"
                      value={form.paidAddOns.printing.colorPrice || ""}
                      onChange={(e) =>
                        updatePaidAddOn("printing", { colorPrice: Number(e.target.value) })
                      }
                      className="w-14 border-b border-slate-300 py-1 text-sm font-bold bg-transparent outline-none text-center"
                    />
                  </div>
                  <span className="text-[10px] text-slate-400">／張</span>
                </div>
              </ServiceRow>

              <ServiceRow
                checked={form.paidAddOns.parking.enabled}
                onToggle={(v) => updatePaidAddOn("parking", { enabled: v })}
                label="加購專屬車位"
              >
                <div className="flex items-center gap-3">
                  <div className="flex bg-white rounded-lg border border-slate-200 p-0.5">
                    {(["機械", "平面"] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => updatePaidAddOn("parking", { type: t })}
                        className={`px-3 py-1 text-[11px] font-black rounded-md transition-all ${
                          form.paidAddOns.parking.type === t
                            ? "bg-slate-800 text-white"
                            : "text-slate-400"
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-slate-500 font-bold">$</span>
                    <input
                      type="number"
                      value={form.paidAddOns.parking.monthlyFee || ""}
                      onChange={(e) =>
                        updatePaidAddOn("parking", { monthlyFee: Number(e.target.value) })
                      }
                      placeholder="特惠月租"
                      className="w-24 border-b border-slate-300 py-1 text-sm font-bold bg-transparent outline-none"
                    />
                    <span className="text-xs text-slate-500 font-bold">／月</span>
                  </div>
                </div>
              </ServiceRow>

              <ServiceRow
                checked={form.paidAddOns.phoneService.enabled}
                onToggle={(v) => updatePaidAddOn("phoneService", { enabled: v })}
                label="加購電話總機服務"
                fullWidth
              >
                <div className="space-y-2">
                  <textarea
                    rows={2}
                    value={form.paidAddOns.phoneService.note}
                    onChange={(e) => updatePaidAddOn("phoneService", { note: e.target.value })}
                    placeholder="中文說明"
                    className="w-full border border-slate-200 rounded-lg p-3 text-[11px] leading-relaxed outline-none focus:border-slate-400 bg-white text-slate-700"
                  />
                  <textarea
                    rows={2}
                    value={form.paidAddOns.phoneService.noteEn || ""}
                    onChange={(e) => updatePaidAddOn("phoneService", { noteEn: e.target.value })}
                    placeholder="English description"
                    className="w-full border border-slate-200 rounded-lg p-3 text-[11px] leading-relaxed outline-none focus:border-slate-400 bg-white text-slate-700"
                  />
                </div>
              </ServiceRow>
            </div>
          </section>

          {/* ---------- 區塊四：營運痛點對策卡 ---------- */}
          <section>
            <SectionHead
              action={
                <span className="shrink-0 text-[11px] text-[#B0ADA6] tabular-nums">
                  已勾選 {countPainPoints(form.painPoints)} 項
                </span>
              }
            >
              營運痛點對策卡
            </SectionHead>
            <p className="text-[11px] text-[#B0ADA6] mb-4 -mt-1">
              現場觀察到客戶提及的困擾就勾起來，提案會針對這些項目附上道騰的資源說明
            </p>

            <div className="space-y-2.5">
              {PAIN_POINT_GROUPS.map((g) => {
                const state = form.painPoints[g.key];
                const active = !!state && (state.items.length > 0 || !!state.otherText?.trim());
                return (
                  <div
                    key={g.key}
                    className={`rounded-lg border px-5 py-4 transition-colors ${
                      active ? "border-[#D5D2CB] bg-[#FAFAF8]" : "border-[#E8E6E1] bg-white"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span
                        className={`text-[13px] font-medium ${
                          active ? "text-[#1A1A18]" : "text-[#8A8780]"
                        }`}
                      >
                        {g.label}
                      </span>
                      {active && (
                        <button
                          type="button"
                          onClick={() => clearPainGroup(g.key)}
                          className="text-[11px] text-[#A5A29B] hover:text-[#B4483C] transition-colors"
                        >
                          清除
                        </button>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {g.options.map((opt) => {
                        const picked = state?.items?.includes(opt);
                        return (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => togglePainItem(g.key, opt)}
                            className={`px-3.5 py-2 text-[12px] font-medium rounded-lg border transition-all ${
                              picked
                                ? "bg-[#1A1A18] text-white border-[#1A1A18]"
                                : "bg-white text-[#8A8780] border-[#E0DDD6] hover:border-[#B0ADA6]"
                            }`}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>

                    {g.hasOther && (
                      <input
                        value={state?.otherText || ""}
                        onChange={(e) => setPainOther(g.key, e.target.value)}
                        placeholder="其他（自行輸入）"
                        className={`${inputClass} mt-3`}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </section>

      {picking && (
        <RoomPicker
          rooms={rooms}
          floors={floors}
          selectedIds={selectedIds}
          onToggle={toggleRoom}
          onClose={() => setPicking(false)}
        />
      )}

      {lightbox && (
        <div
          className="fixed inset-0 z-[500] flex items-center justify-center p-10 bg-[#1A1A18]/85 backdrop-blur-sm"
          onClick={() => setLightbox(null)}
        >
          <button
            onClick={() => setLightbox(null)}
            className="absolute top-8 right-8 text-white/70 hover:text-white text-3xl"
          >
            ✕
          </button>
          <div
            className="max-w-5xl w-full max-h-full overflow-y-auto custom-scrollbar grid grid-cols-2 gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            {lightbox.map((url, i) => (
              <img
                key={i}
                src={url}
                alt={`照片 ${i + 1}`}
                className="w-full rounded-lg bg-[#3A3833]"
              />
            ))}
          </div>
        </div>
      )}
    </DrawerShell>
  );
}

/* ============================================================
   主頁面：提案列表
   ============================================================ */
export default function ProposalsPage() {
  const router = useRouter();

  const [hasMounted, setHasMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState("");

  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [floors, setFloors] = useState<Floor[]>([]);

  const [editing, setEditing] = useState<Proposal | null>(null);
  const [creating, setCreating] = useState(false);
  const [sending, setSending] = useState<Proposal | null>(null);

  // 寄出後把狀態推進到「已送出」，草稿以外的狀態不覆寫，
  // 避免已成交的案子因為補寄一次資料就被退回上一階段
  const markAsSent = async (p: Proposal) => {
    try {
      const patch: Record<string, any> = {
        sentCount: (p.sentCount || 0) + 1,
        updatedAt: serverTimestamp(),
      };
      if (p.status === "DRAFT") patch.status = "SENT";
      if (!p.sentAt) patch.sentAt = serverTimestamp();
      await updateDoc(doc(db, "proposals", p.id), patch);
    } catch (e) {
      console.error("標記寄送狀態失敗:", e);
    }
  };

  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("全部");

  useEffect(() => {
    setHasMounted(true);
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (!user) router.push("/login");
      else setCurrentUser(user.displayName || user.email || "Unknown");
    });

    const unsubProposals = onSnapshot(
      query(collection(db, "proposals"), orderBy("createdAt", "desc")),
      (snap) => {
        setProposals(snap.docs.map((d) => ({ ...(d.data() as Proposal), id: d.id })));
        setLoading(false);
      }
    );
    const unsubRooms = onSnapshot(collection(db, "rooms"), (snap) =>
      setRooms(snap.docs.map((d) => ({ ...(d.data() as Room), id: d.id })))
    );
    const unsubFloors = onSnapshot(collection(db, "floors"), (snap) =>
      setFloors(snap.docs.map((d) => ({ ...(d.data() as Floor), id: d.id })))
    );

    return () => {
      unsubAuth();
      unsubProposals();
      unsubRooms();
      unsubFloors();
    };
  }, [router]);

  const filtered = useMemo(() => {
    const k = keyword.trim().toLowerCase();
    return proposals.filter((p) => {
      if (statusFilter !== "全部" && p.status !== statusFilter) return false;
      if (
        k &&
        !(
          p.companyName.toLowerCase().includes(k) ||
          p.guestName.toLowerCase().includes(k) ||
          (p.proposalNo || "").toLowerCase().includes(k)
        )
      )
        return false;
      return true;
    });
  }, [proposals, keyword, statusFilter]);

  const stats = useMemo(() => {
    const today = todayStr();
    return {
      total: proposals.length,
      draft: proposals.filter((p) => p.status === "DRAFT").length,
      sent: proposals.filter((p) => p.status === "SENT").length,
      expiring: proposals.filter(
        (p) => p.status === "SENT" && p.validUntil && p.validUntil >= today && p.validUntil <= calcValidUntil(3)
      ).length,
    };
  }, [proposals]);

  if (!hasMounted || loading) {
    return (
      <div
        className="h-screen flex items-center justify-center text-[13px] text-[#A5A29B]"
        style={{ backgroundColor: C.page }}
      >
        正在與雲端資料庫同步…
      </div>
    );
  }

  const noMasterData = rooms.length === 0 || floors.length === 0;

  return (
    <div
      style={{ backgroundColor: C.page }}
      className="flex-1 h-screen overflow-y-auto custom-scrollbar font-sans text-slate-800"
    >
      <header className="px-8 pt-8 pb-6 bg-white border-b border-[#E8E6E1]">
        <div className="flex justify-between items-start mb-5">
          <div>
            <h1 className="text-[22px] font-semibold text-[#1A1A18] tracking-tight">帶看提案</h1>
            <p className="text-[11px] text-[#A5A29B] mt-1">
              帶看結束後建立提案，勾選房型自動排出專屬比價表
            </p>
          </div>
          <button
            onClick={() => setCreating(true)}
            disabled={noMasterData}
            className="bg-[#1A1A18] text-white px-5 py-2.5 rounded-lg text-[13px] font-medium hover:bg-black transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
          >
            新增提案
          </button>
        </div>

        <div className="grid grid-cols-4 gap-3 mb-5">
          {[
            { label: "提案總數", value: stats.total, color: C.ink },
            { label: "草稿", value: stats.draft, color: C.faint },
            { label: "已送出", value: stats.sent, color: C.accent },
            { label: "3 天內到期", value: stats.expiring, color: C.danger },
          ].map((s) => (
            <div
              key={s.label}
              className="bg-[#FAFAF8] rounded-lg border border-[#E8E6E1] px-4 py-3"
            >
              <div className="text-[11px] text-[#8A8780] whitespace-nowrap">{s.label}</div>
              <div
                className="text-[22px] font-semibold tabular-nums leading-none mt-2 tracking-tight"
                style={{ color: s.color }}
              >
                {s.value}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 bg-[#FAFAF8] p-2 rounded-lg border border-[#E8E6E1]">
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜尋公司、貴賓或提案編號"
            className="px-3 py-1.5 bg-white border border-[#E8E6E1] rounded-md text-[12px] w-56 outline-none focus:border-[#B0ADA6] transition-colors text-[#1A1A18] placeholder:text-[#C4C1B9]"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2.5 py-1.5 bg-white border border-[#E8E6E1] rounded-md text-[12px] font-medium text-[#3A3833] w-32 outline-none"
          >
            <option value="全部">全部狀態</option>
            {(Object.keys(PROPOSAL_STATUS_LABEL) as ProposalStatus[]).map((s) => (
              <option key={s} value={s}>
                {PROPOSAL_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          {(keyword || statusFilter !== "全部") && (
            <button
              type="button"
              onClick={() => {
                setKeyword("");
                setStatusFilter("全部");
              }}
              className="text-[11px] text-[#A5A29B] hover:text-[#1A1A18] px-2 transition-colors"
            >
              清除篩選
            </button>
          )}
          <span className="ml-auto text-[11px] text-[#B0ADA6] tabular-nums">
            {filtered.length} / {proposals.length} 筆
          </span>
        </div>
      </header>

      <main className="px-8 py-6">
        {noMasterData ? (
          <div className="py-20 text-center border border-dashed border-[#E0DDD6] rounded-lg bg-white">
            <p className="text-[13px] font-medium text-[#3A3833]">房型母表還沒有資料</p>
            <p className="text-[12px] text-[#A5A29B] mt-2">
              請先到「房型資料維護」建立樓層與房型，提案的比價表才有資料可帶入
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-[#E8E6E1] overflow-hidden">
            <table className="w-full text-sm table-fixed">
              <thead>
                <tr className="border-b border-[#E8E6E1] text-xs font-medium text-[#8A8780] whitespace-nowrap">
                  <th className="text-left px-5 py-3 w-[17%]">提案編號</th>
                  <th className="text-left px-4 py-3 w-[24%]">客戶</th>
                  <th className="text-left px-4 py-3 w-[22%]">帶看房型</th>
                  <th className="text-left px-4 py-3 w-[14%]">有效至</th>
                  <th className="text-left px-4 py-3 w-[11%]">狀態</th>
                  <th className="px-4 py-3 w-[12%]" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const expired = p.validUntil && p.validUntil < todayStr();
                  return (
                    <tr
                      key={p.id}
                      onClick={() => setEditing(p)}
                      className="group border-t border-[#F0EEE9] hover:bg-[#FAFAF8] cursor-pointer transition-colors"
                    >
                      {/* 版本併進編號下方：兩者都是文件識別資訊，不需各佔一欄 */}
                      <td className="px-5 py-3.5 align-top">
                        <div className="font-mono text-xs text-[#8A8780] whitespace-nowrap">
                          {p.proposalNo}
                        </div>
                        <span className="inline-block mt-1 text-[10px] font-medium bg-[#1A1A18] text-white px-2 py-0.5 rounded">
                          {p.version}
                        </span>
                      </td>
                      {/* 公司、貴賓、業務合併：都是「這張提案關於誰」，分三欄會互相擠壓 */}
                      <td className="px-4 py-3.5 align-top min-w-0">
                        <div className="font-semibold text-[#1A1A18] truncate">{p.companyName}</div>
                        <div className="text-xs text-[#8A8780] truncate mt-0.5">
                          {p.guestName}
                          {p.guestTitle && ` · ${p.guestTitle}`}
                        </div>
                        <div className="text-[11px] text-[#B0ADA6] truncate mt-0.5">
                          {p.salesName}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 align-top">
                        <div className="flex gap-1 flex-wrap">
                          {(p.rooms || []).map((r) => (
                            <span
                              key={r.roomId}
                              className="text-[11px] font-medium px-2 py-0.5 rounded"
                              style={
                                r.isRecommended
                                  ? { backgroundColor: C.warn, color: "#fff" }
                                  : { backgroundColor: "#F0EEE9", color: C.muted }
                              }
                            >
                              {r.roomNo}
                            </span>
                          ))}
                        </div>
                      </td>
                      {/* 日期與過期標記分兩行，避免長字串把欄寬撐開後折行 */}
                      <td className="px-4 py-3.5 align-top">
                        <div
                          className="text-xs whitespace-nowrap tabular-nums"
                          style={{ color: expired ? C.danger : C.muted }}
                        >
                          {p.validUntil || "—"}
                        </div>
                        {expired && (
                          <div className="text-[11px] mt-0.5" style={{ color: C.danger }}>已過期</div>
                        )}
                      </td>
                      <td className="px-4 py-3.5 align-top">
                        <span
                          className={`inline-block text-[11px] font-medium px-2.5 py-1 rounded whitespace-nowrap ${
                            PROPOSAL_STATUS_STYLE[p.status]
                          }`}
                        >
                          {PROPOSAL_STATUS_LABEL[p.status]}
                        </span>
                      </td>
                      {/* 操作鈕平常隱藏，滑鼠移到該列才出現，讓資料欄位有更多寬度 */}
                      <td className="px-4 py-3.5 text-right align-top">
                        <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSending(p);
                            }}
                            className="text-[11px] text-[#A5A29B] hover:text-[#1A1A18] px-2 py-1 rounded hover:bg-[#F0EEE9] whitespace-nowrap transition-colors"
                          >
                            寄送
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/proposals/${p.id}/print`);
                            }}
                            className="text-[11px] text-[#A5A29B] hover:text-[#1A1A18] px-2 py-1 rounded hover:bg-[#F0EEE9] whitespace-nowrap transition-colors"
                          >
                            PDF
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="py-20 text-center">
                <p className="text-[12px] text-[#A5A29B]">還沒有提案紀錄</p>
              </div>
            )}
          </div>
        )}
      </main>

      {(editing || creating) && (
        <ProposalEditor
          proposal={editing}
          isCreate={creating}
          rooms={rooms}
          floors={floors}
          currentUser={currentUser}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
          onSend={(p) => setSending(p)}
        />
      )}

      {sending && (
        <SendDialog
          proposal={sending}
          onClose={() => setSending(null)}
          onSent={() => markAsSent(sending)}
        />
      )}

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          height: 12px;
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #D5D2CB;
          border-radius: 999px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #B0ADA6;
        }
      `}</style>
    </div>
  );
}
