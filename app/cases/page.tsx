"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { createPortal } from "react-dom";

// --- 引入 Firebase 實時功能 ---
import { useRouter } from "next/navigation";
import { db, auth} from "@/lib/firebase";
import { uploadCaseAttachment, deleteByUrl, deleteManyByUrl } from "@/lib/storage-upload";
import { Room, Floor, ROOM_STATUS_LABEL } from "@/lib/types/room";
import { onAuthStateChanged } from "firebase/auth";
import { useSidebar } from "@/lib/sidebar-context";
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc,
  doc, 
  query, 
  orderBy, 
  serverTimestamp,
  where,
  getDocs,
  getDoc
} from "firebase/firestore";

// --- 類型定義 ---
type StageId = "S1" | "S2" | "S3" | "S4" | "S5" | "S6" | "S7" | "S8";
type BuildingId = "四維館" | "民權20樓" | "民權21樓" | "民權27樓" | "民權28樓";
type TaxType = "應稅(5%)" | "免稅/未稅";

const BUILDINGS: BuildingId[] = ["四維館", "民權20樓", "民權21樓", "民權27樓", "民權28樓"];

interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
  completedBy?: string;
  completedAt?: any;
}

interface Attachment {
  name: string;
  url: string;
  uploadedAt: string;
}

interface HistoryLog {
  id: string;
  action: string;
  user: string;
  timestamp: any;
}

interface LeaseCard {
  id: string;
  companyName: string;      
  customer: string;         
  contactPerson: string;    
  email: string;            
  phone: string;            
  taxId: string;            
  mailNo: string;           
  roomNo: string;           
  bestContactTime: string;  
  tags: string[];           
  note: string;             
  salesNote: string;         
  paymentCycle: string;     
  building: BuildingId;
  owner: string;
  monthlyRent: number;
  contractStartDate?: string;
  contractEndDate?: string;
  taxType: TaxType;         
  actualRentExclTax: number;
  actualRentInclTax: number;
  contractMonths: number;
  totalContractAmount: number;
  preDealEstimatedAmount?: number;
  stage: StageId;
  updatedAt: any;
  stageStartedAt: string; 
  stageEndedAt?: string;  
  stageHistory?: { [key: string]: string }; 
  createdAt: string;
  todos?: TodoItem[]; 
  attachments?: Attachment[];
}

const ADMIN_EMAILS = ["jadepan0924@gmail.com"];

const STAGES: { id: StageId; title: string; hint: string; checks: string[] }[] = [
  { id: "S1", title: "S1 待處理", hint: "來源建立", checks: ["基本需求確認"] },
  { id: "S2", title: "S2 需求訪談", hint: "深入了解", checks: ["已完成訪談"] },
  { id: "S3", title: "S3 口頭報價", hint: "條件達成", checks: ["已傳送報價"] },
  { id: "S4", title: "S4 現場場勘", hint: "帶看安排", checks: ["場勘紀錄已填寫"] },
  { id: "S5", title: "S5 需求確認(議價)", hint: "價格攻防", checks: ["統編資料確認"] },
  { id: "S6", title: "S6 擬定合約", hint: "法務審閱", checks: ["合約草稿確認"] },
  { id: "S7", title: "S7 成交", hint: "流程完成", checks: ["押金已入帳"] },
  { id: "S8", title: "S8 暫停", hint: "案件保留", checks: ["暫停原因備註"] },
];

const FIXED_TODO_LIST = [
  "S1 初步諮詢：確認需求大方向、提供基本簡介",
  "S2 對齊需求：覆誦需求內容（人數、預算、租期）。",
  "S3 初步報價：根據需求提供估算範圍、提供3個參考建議。",
  "S4 邀請參觀：預約現場看屋時間、告知交通資訊。",
  "S5 正式報價：提供含稅、其他客製正式書面報價單。",
  "S6 議價協商：討論租期優惠、裝修期或特殊硬體需求。",
  "S7 簽約/訂金確認：合約審閱、收取訂金、核對統編資訊。",
  "S8 資訊入系統：建立承租戶資料、設定門禁、郵務、Booking，提供道騰資源。"
];

function currency(n: number) {
  return new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 }).format(n || 0);
}

function getDisplayDays(item: LeaseCard) {
  const isFinalStage = item.stage === "S7" || item.stage === "S8";

  if (isFinalStage) {
    // S7/S8：天數要凍結成「從S1進入到移入S7/S8」的總天數
    const startDateStr = item.stageHistory?.["S1"] || item.createdAt;
    const startTime = new Date(startDateStr).getTime();

    const endDateStr = item.stageHistory?.[item.stage] || item.stageEndedAt;
    const endTime = endDateStr ? new Date(endDateStr).getTime() : Date.now();

    const diffTime = endTime - startTime;
    return Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
  }

  const start = new Date(item.stageStartedAt);
  const end = new Date();
  const diffTime = end.getTime() - start.getTime();
  return Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
}

function calculateMonths(start?: string, end?: string) {
  if (!start || !end) return 0;
  const s = new Date(start);
  const e = new Date(end);
  const diff = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
  return Math.max(0, diff + 1);
}

/* ============================================================
   抽屜共用樣式元件
   欄位加上淡底色，讓一整頁的輸入框有明確邊界；
   原本全是浮動底線，欄位一多就分不出哪裡到哪裡。
   ============================================================ */
const fieldClass =
  "w-full bg-[#FAFAF8] border border-[#E8E6E1] rounded-lg px-3 py-2.5 text-[13px] text-[#1A1A18] outline-none transition-colors focus:bg-white focus:border-[#B0ADA6] placeholder:text-[#C4C1B9]";

const readonlyFieldClass =
  "w-full bg-[#F0EEE9] border border-[#E8E6E1] rounded-lg px-3 py-2.5 text-[13px] text-[#8A8780] tabular-nums";

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-[11px] font-medium text-[#8A8780] mb-1.5">
      {children}
      {required && <span className="text-[#B4483C] ml-0.5">*</span>}
    </label>
  );
}

/** 區塊標題：小字灰色 eyebrow + 細分隔線，取代原本的藍色粗左邊框 */
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

/**
 * 可搜尋的房號選擇器。
 *
 * 單一館別最多會有 21 間房，原生 select 展開後要逐行掃視很費力，
 * 因此改成可輸入關鍵字過濾，並把可出租的排在最前面 —— 業務要找的九成是那幾間。
 */
function RoomSelect({
  value,
  options,
  onChange,
  onManual,
}: {
  value: string;
  options: Room[];
  onChange: (roomNo: string) => void;
  onManual: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
        setKeyword("");
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const list = useMemo(() => {
    const k = keyword.trim().toLowerCase();
    return options
      .filter(r =>
        !k ||
        r.roomNo.toLowerCase().includes(k) ||
        (r.featureDesc || "").toLowerCase().includes(k)
      )
      .sort((a, b) => {
        // 可出租優先，其次才依房號排序
        const aFree = a.status === "AVAILABLE" ? 0 : 1;
        const bFree = b.status === "AVAILABLE" ? 0 : 1;
        if (aFree !== bFree) return aFree - bFree;
        return a.roomNo.localeCompare(b.roomNo, "zh-Hant", { numeric: true });
      });
  }, [options, keyword]);

  const selected = options.find(r => r.roomNo === value);

  return (
    <div ref={boxRef} className="relative">
      <div className="flex gap-2 items-center">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className={`${fieldClass} text-left flex items-center justify-between gap-2`}
        >
          <span className={value ? "" : "text-[#C4C1B9]"}>
            {value || "點選挑選房號"}
            {selected && (
              <span className="text-[11px] text-[#A5A29B] ml-2">
                {selected.areaPing ? `${selected.areaPing}坪` : ""}
                {selected.status !== "AVAILABLE" ? `　${ROOM_STATUS_LABEL[selected.status]}` : ""}
              </span>
            )}
          </span>
          <span className="text-[#B0ADA6] text-[9px]">{open ? "▲" : "▼"}</span>
        </button>
        <button
          type="button"
          onClick={onManual}
          className="text-[11px] text-[#A5A29B] hover:text-[#1A1A18] whitespace-nowrap transition-colors"
        >
          手動
        </button>
      </div>

      {open && (
        <div className="absolute z-50 left-0 right-0 mt-1.5 bg-white rounded-lg border border-[#E0DDD6] shadow-[0_8px_24px_rgba(0,0,0,0.08)] overflow-hidden">
          <div className="p-2 border-b border-[#F0EEE9]">
            <input
              autoFocus
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
              placeholder="輸入房號或特色搜尋"
              className="w-full px-3 py-2 text-[12px] bg-[#FAFAF8] rounded-md outline-none focus:bg-white text-[#1A1A18] placeholder:text-[#C4C1B9]"
            />
          </div>

          <div className="max-h-64 overflow-y-auto custom-scrollbar">
            {value && (
              <button
                type="button"
                onClick={() => { onChange(""); setOpen(false); setKeyword(""); }}
                className="w-full text-left px-4 py-2 text-[11px] text-[#A5A29B] hover:bg-[#FAFAF8] border-b border-[#F0EEE9] transition-colors"
              >
                清除選擇
              </button>
            )}

            {list.map(r => {
              const isFree = r.status === "AVAILABLE";
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => { onChange(r.roomNo); setOpen(false); setKeyword(""); }}
                  className={`w-full text-left px-4 py-2.5 hover:bg-[#FAFAF8] transition-colors border-b border-[#F5F4F1] last:border-0 ${
                    r.roomNo === value ? "bg-[#FAFAF8]" : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-baseline gap-2 min-w-0">
                      <span className="text-[13px] font-semibold text-[#1A1A18] shrink-0">{r.roomNo}</span>
                      <span className="text-[10px] text-[#A5A29B] shrink-0">
                        {r.areaPing ? `${r.areaPing}坪` : ""}
                        {r.capacityMax ? `・${r.capacityMax}人` : ""}
                      </span>
                      <span className="text-[10px] text-[#B0ADA6] truncate">{r.featureDesc}</span>
                    </div>
                    <span
                      className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${
                        isFree ? "bg-[#E8EFE6] text-[#4F7A52]" : "bg-[#F0EEE9] text-[#A5A29B]"
                      }`}
                    >
                      {ROOM_STATUS_LABEL[r.status]}
                    </span>
                  </div>
                </button>
              );
            })}

            {list.length === 0 && (
              <div className="py-10 text-center text-[12px] text-[#B0ADA6]">
                找不到符合的房號
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * 五個實體場館各自對應一個色相，作為卡片左緣的識別色帶。
 * 取低彩度的建材色（陶土、石板、苔綠、暗紫、赭石），
 * 目的是讓整面看板不用讀字也能看出案件的館別分布。
 */
const BUILDING_ACCENT: Record<BuildingId, string> = {
  "四維館": "#8A6F5C",
  "民權20樓": "#4E6A74",
  "民權21樓": "#6B7C5D",
  "民權27樓": "#87687A",
  "民權28樓": "#A8845C",
};

function CardBase({ item, isOverlay = false }: { item: LeaseCard; isOverlay?: boolean }) {
  const days = getDisplayDays(item);
  const isFinalStage = item.stage === "S7" || item.stage === "S8";
  const accent = BUILDING_ACCENT[item.building] || "#8A8780";

  // 停留天數只有超過門檻才上色，否則整面看板都是警示色，真正該處理的反而看不出來
  const dwellTone = isFinalStage
    ? "text-[#8A8780]"
    : days >= 14
    ? "text-[#B4483C]"
    : days >= 7
    ? "text-[#A97B22]"
    : "text-[#8A8780]";

  const hasAmount = (item.totalContractAmount || 0) > 0;
  const location = [item.building, item.roomNo].filter(Boolean).join(" · ");

  return (
    <div
      className={`group relative bg-white rounded-lg overflow-hidden transition-all ${
        isOverlay
          ? "shadow-xl ring-1 ring-black/10 rotate-1 cursor-grabbing"
          : "shadow-[0_1px_2px_rgba(0,0,0,0.04)] ring-1 ring-[#E8E6E1] hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] hover:ring-[#D5D2CB] cursor-grab"
      }`}
    >
      {/* 館別色帶 */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[3px] transition-all group-hover:w-[5px]"
        style={{ backgroundColor: accent }}
      />

      <div className="pl-5 pr-4 py-4">
        <div className="flex items-start justify-between gap-3 mb-2.5">
          <h4 className="text-[15px] font-semibold text-[#1A1A18] leading-snug tracking-tight line-clamp-2 flex-1">
            {item.companyName || "未命名案件"}
          </h4>
          <span
            className={`text-[11px] font-medium tabular-nums shrink-0 pt-0.5 ${dwellTone}`}
            title={isFinalStage ? "從建立到結案的總天數" : "停留在目前階段的天數"}
          >
            {days}d
          </span>
        </div>

        <div className="text-[11px] text-[#8A8780] leading-relaxed space-y-0.5">
          {location && <div>{location}</div>}
          {item.contactPerson && <div>窗口 {item.contactPerson}</div>}
        </div>

        {/* 金額只在真的有數字時才顯示，避免滿版的 $0 搶走注意力 */}
        {hasAmount && (
          <div className="mt-3 pt-3 border-t border-[#F0EEE9] flex items-baseline justify-between">
            <span className="text-[14px] font-semibold text-[#1A1A18] tabular-nums tracking-tight">
              {currency(item.totalContractAmount)}
            </span>
            {item.taxType === "免稅/未稅" && (
              <span className="text-[10px] text-[#A5A29B]">未稅</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SortableCard({ item, onClick }: { item: LeaseCard; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = { transform: CSS.Translate.toString(transform), transition };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} onClick={onClick} className={isDragging ? "opacity-30" : ""}>
      <CardBase item={item} />
    </div>
  );
}

function StageColumn({ stage, cards, onCardClick }: { stage: typeof STAGES[0]; cards: LeaseCard[]; onCardClick: (id: string) => void }) {
  const { setNodeRef } = useDroppable({ id: stage.id });
  const count = (cards || []).length;
  // 階段代碼與名稱拆開，代碼作為次要標記，名稱才是讀取重點
  const [code, ...rest] = stage.title.split(" ");
  const name = rest.join(" ");

  return (
    <div
      ref={setNodeRef}
      className="flex h-full w-[300px] flex-col shrink-0 self-stretch overflow-hidden"
    >
      <div className="px-1 pb-3 shrink-0">
        <div className="flex items-baseline gap-2">
          <span className="text-[10px] font-semibold text-[#B0ADA6] tabular-nums tracking-wider">
            {code}
          </span>
          <h3 className="text-[13px] font-semibold text-[#3A3833] tracking-tight">{name}</h3>
          <span className="ml-auto text-[11px] font-medium text-[#B0ADA6] tabular-nums">
            {count}
          </span>
        </div>
        <div className="mt-2.5 h-px bg-[#E0DDD6]" />
      </div>

      <SortableContext items={(cards || []).map(x => x.id)} strategy={verticalListSortingStrategy}>
        <div className="flex-1 min-h-0 px-1 pt-1 pb-12 space-y-2.5 overflow-y-auto custom-scrollbar">
          {(cards || []).map(item => <SortableCard key={item.id} item={item} onClick={() => onCardClick(item.id)} />)}
          {count === 0 && (
            <div className="min-h-[120px] rounded-lg border border-dashed border-[#E0DDD6]" />
          )}
        </div>
      </SortableContext>
    </div>
  );
}

function DetailDrawer({ item, isCreate, onClose, onSave, onDelete, currentUser, rooms, floors }: { item: LeaseCard | null; isCreate: boolean; onClose: () => void; onSave: (data: LeaseCard) => void; onDelete: (id: string) => void; currentUser: string; rooms: Room[]; floors: Floor[] }) {
  const [formData, setFormData] = useState<Partial<LeaseCard>>({});
  const [activeTab, setActiveTab] = useState<"info" | "todo" | "copy" | "history">("info");
  const [history, setHistory] = useState<HistoryLog[]>([]);
  const [templates, setTemplates] = useState<{id: string, label: string, content: string}[]>([]);
  // --- 附件上傳狀態 ---
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // 新增案件時還沒有文件 ID，先給一個暫用資料夾名稱讓檔案有地方放
  const draftScope = useRef(`draft-${Date.now()}`);
  // 母表沒有的房間（新隔間、特殊情況）仍要能自由輸入
  const [manualRoom, setManualRoom] = useState(false);

  // 依目前選擇的館別過濾房號，業務不必從 69 間裡面找
  const roomOptions = useMemo(() => {
    const floorIds = floors
      .filter((f) => f.building === formData.building)
      .map((f) => f.id);
    return rooms
      .filter((r) => r.active && floorIds.includes(r.floorId))
      .sort((a, b) => a.roomNo.localeCompare(b.roomNo, "zh-Hant", { numeric: true }));
  }, [rooms, floors, formData.building]);

  // 1. 修正後的資料載入 useEffect
  useEffect(() => {
    const defaultTodos: TodoItem[] = FIXED_TODO_LIST.map((text, index) => ({
      id: `fixed-${index}`, text, completed: false
    }));

    if (isCreate) {
      setFormData({
        id: `L-${Date.now()}`, stage: "S1", building: "四維館", stageStartedAt: new Date().toISOString().split('T')[0], createdAt: new Date().toISOString(), updatedAt: "",
        monthlyRent: 0, actualRentExclTax: 0, actualRentInclTax: 0, contractMonths: 0, totalContractAmount: 0, preDealEstimatedAmount: 0,
        roomNo: "", mailNo: "", owner: "未定", todos: defaultTodos, stageHistory: { "S1": new Date().toISOString().split('T')[0] },
        taxType: "應稅(5%)", tags: ["辦公室管理"], companyName: "", contactPerson: "", customer: "", phone: "", taxId: "", email: "", paymentCycle: "月繳", note: "", salesNote: "", bestContactTime: "", attachments: []
      });
      setActiveTab("info");
    } else if (item) {
      setFormData((prev) => {
        const mergedTodos = item.todos && item.todos.length > 0 ? item.todos : defaultTodos;
        if (prev.id !== item.id) setActiveTab("info");
        return { ...item, todos: mergedTodos, attachments: item.attachments || [] };
      });
      // 舊案件的房號可能是自由輸入的格式，母表比對不到就直接切成手動模式，
      // 免得下拉選單顯示成未選擇、讓人以為資料不見了
      if (item.roomNo && !rooms.some((r) => r.roomNo === item.roomNo)) {
        setManualRoom(true);
      } else {
        setManualRoom(false);
      }

      const qLogs = query(collection(db, "cases", item.id, "logs"), orderBy("timestamp", "desc"));
      const unsubLogs = onSnapshot(qLogs, (snapshot) => {
        setHistory(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as HistoryLog[]);
      });

      const qTemplates = query(
        collection(db, "copyTemplates"), 
        where("category", "==", "辦公室出租"), 
        orderBy("order", "asc")
      );
      const unsubTemplates = onSnapshot(qTemplates, (snapshot) => {
        setTemplates(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any);
      });

      return () => {
        unsubLogs();
        unsubTemplates();
      };
    }
  }, [item?.id, isCreate]); 

  // 2. 財務計算 useEffect
  useEffect(() => {
    if (!formData.contractStartDate || !formData.contractEndDate) return;
    const start = new Date(formData.contractStartDate);
    const end = new Date(formData.contractEndDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    const calculatedMonths = Math.ceil(diffDays / 30);
    const taxMultiplier = formData.taxType === "應稅(5%)" ? 1.05 : 1;
    const inclTax = Math.round((formData.actualRentExclTax || 0) * taxMultiplier);
    const total = Math.round((formData.actualRentExclTax || 0) * calculatedMonths * taxMultiplier);

    setFormData(prev => ({ 
      ...prev, 
      contractMonths: calculatedMonths, 
      actualRentInclTax: inclTax, 
      totalContractAmount: total 
    }));
  }, [formData.contractStartDate, formData.contractEndDate, formData.actualRentExclTax, formData.taxType]);

  const addLogLocal = async (action: string) => {
    if (!item?.id) return;
    await addDoc(collection(db, "cases", item.id, "logs"), { action, user: currentUser, timestamp: serverTimestamp() });
  };

  // ✅ 真正上傳到 Firebase Storage，重新整理後仍然存在
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const scope = item?.id || draftScope.current;
    setUploading(true);
    setUploadPct(0);

    try {
      const url = await uploadCaseAttachment(scope, file, setUploadPct);
      const newAttachment: Attachment = {
        name: file.name,
        url,
        uploadedAt: new Date().toISOString()
      };
      const updatedAttachments = [...(formData.attachments || []), newAttachment];
      setFormData(prev => ({ ...prev, attachments: updatedAttachments }));

      // 既有案件直接寫回資料庫，避免使用者忘記按儲存導致附件遺失
      if (!isCreate && item?.id) {
        await updateDoc(doc(db, "cases", item.id), { attachments: updatedAttachments });
        addLogLocal(`上傳附件: ${file.name}`);
      }
    } catch (err) {
      console.error("附件上傳失敗:", err);
      alert(`上傳失敗：${err instanceof Error ? err.message : "未知錯誤"}`);
    } finally {
      setUploading(false);
      setUploadPct(0);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // 移除附件時一併刪除雲端檔案，避免留下沒人管的孤兒檔
  const handleRemoveAttachment = async (idx: number) => {
    const target = (formData.attachments || [])[idx];
    if (!target) return;
    if (!confirm(`確定移除「${target.name}」？\n\n檔案會一併從雲端刪除。`)) return;

    try {
      await deleteByUrl(target.url);
    } catch (err) {
      console.error("刪除雲端檔案失敗:", err);
    }

    const updated = (formData.attachments || []).filter((_, i) => i !== idx);
    setFormData(prev => ({ ...prev, attachments: updated }));

    if (!isCreate && item?.id) {
      await updateDoc(doc(db, "cases", item.id), { attachments: updated });
      addLogLocal(`移除附件: ${target.name}`);
    }
  };

  const handleToggleTodo = async (todoId: string) => {
    if (!item) return;
    const updatedTodos = (formData.todos || []).map(t => {
      if (t.id === todoId) {
        const isNowCompleted = !t.completed;
        const statusText = isNowCompleted ? "勾選完成" : "取消勾選";
        addLogLocal(`${statusText}事項: ${t.text}`);
        return { ...t, completed: isNowCompleted, completedBy: isNowCompleted ? currentUser : "", completedAt: isNowCompleted ? new Date().toLocaleString() : null };
      }
      return t;
    });
    setFormData({ ...formData, todos: updatedTodos });
    await updateDoc(doc(db, "cases", item.id), { todos: updatedTodos });
  };

  // 複製後在按鈕上顯示狀態，比跳 alert 打斷操作好
  const handleCopy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      alert("複製失敗，請手動選取內容");
    }
  };

  const handleValidateAndSave = () => {
    if (!formData.companyName || !formData.contactPerson) {
      alert("⚠️ 請檢查必填欄位！");
      return;
    }
    if (uploading) {
      alert("附件還在上傳中，請稍候再儲存");
      return;
    }
    if (!formData.taxId) {
      const ok = confirm("⚠️ 未填寫統編\n\n系統將無法比對現有客戶，會直接建立一筆新資料。\n\n確定不填統編直接儲存嗎？");
      if (!ok) return;
    }
    onSave(formData as LeaseCard);
  };

  if (!item && !isCreate) return null;

  const TABS: { id: typeof activeTab; label: string }[] = [
    { id: "info", label: "基本資訊" },
    { id: "todo", label: "待辦清單" },
    { id: "copy", label: "內容複製" },
    { id: "history", label: "歷程記錄" },
  ];

  const doneCount = (formData.todos || []).filter(t => t.completed).length;
  const totalTodos = (formData.todos || []).length;

  return (
    <div className="fixed inset-0 z-[300] flex justify-end font-sans">
      <div className="absolute inset-0 bg-[#1A1A18]/30 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-white h-full shadow-[0_0_40px_rgba(0,0,0,0.12)] flex flex-col overflow-hidden">
        <header className="px-8 pt-7 shrink-0 bg-white">
          <div className="flex justify-between items-start mb-6">
            <div className="min-w-0 pr-4">
              <div className="text-[10px] font-semibold text-[#B0ADA6] tracking-[0.16em] uppercase mb-1.5">
                {isCreate ? "New case" : "Case detail"}
              </div>
              <h2 className="text-[19px] font-semibold text-[#1A1A18] tracking-tight truncate">
                {isCreate ? "新增出租案件" : (formData.companyName || "未命名案件")}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-[#A5A29B] hover:bg-[#F5F4F1] hover:text-[#1A1A18] transition-colors"
            >
              ✕
            </button>
          </div>
          {!isCreate && (
            <div className="flex gap-1 -mb-px">
              {TABS.map((tab) => {
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-3.5 py-2.5 text-[13px] font-medium transition-colors relative ${
                      active ? "text-[#1A1A18]" : "text-[#A5A29B] hover:text-[#3A3833]"
                    }`}
                  >
                    {tab.label}
                    {tab.id === "todo" && totalTodos > 0 && (
                      <span className="ml-1.5 text-[10px] tabular-nums text-[#B0ADA6]">
                        {doneCount}/{totalTodos}
                      </span>
                    )}
                    {active && (
                      <span className="absolute left-3 right-3 -bottom-px h-[2px] bg-[#1A1A18] rounded-full" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
          <div className="h-px bg-[#E8E6E1]" />
        </header>

        <div className="flex-1 overflow-y-auto px-8 py-8 custom-scrollbar bg-white">
          {activeTab === "info" && (
            <div className="space-y-10">
              {/* ---------- 基本資訊 ---------- */}
              <section>
                <SectionHead>基本資訊</SectionHead>
                <div className="grid grid-cols-2 gap-x-5 gap-y-5">
                  <div className="col-span-2">
                    <FieldLabel required>所屬館別</FieldLabel>
                    <div className="flex flex-wrap gap-1.5">
                      {BUILDINGS.map(b => {
                        const active = formData.building === b;
                        return (
                          <button
                            key={b}
                            type="button"
                            onClick={() => setFormData({...formData, building: b})}
                            className={`px-3.5 py-2 text-[12px] font-medium rounded-lg border transition-all ${
                              active
                                ? "bg-[#1A1A18] text-white border-[#1A1A18]"
                                : "bg-white text-[#8A8780] border-[#E0DDD6] hover:border-[#B0ADA6]"
                            }`}
                          >
                            {b}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="col-span-2">
                    <FieldLabel required>公司／案件全銜</FieldLabel>
                    <input
                      value={formData.companyName || ""}
                      onChange={e => setFormData({...formData, companyName: e.target.value})}
                      className={fieldClass}
                      placeholder="輸入公司或案件名稱"
                    />
                  </div>

                  <div>
                    <FieldLabel required>主要窗口姓名</FieldLabel>
                    <input
                      value={formData.contactPerson || ""}
                      onChange={e => setFormData({...formData, contactPerson: e.target.value})}
                      className={fieldClass}
                    />
                  </div>

                  <div>
                    <FieldLabel>聯絡電話</FieldLabel>
                    <input
                      value={formData.phone || ""}
                      onChange={e => setFormData({...formData, phone: e.target.value})}
                      className={fieldClass}
                    />
                  </div>

                  <div>
                    <FieldLabel>公司統編</FieldLabel>
                    <input
                      value={formData.taxId || ""}
                      onChange={e => setFormData({...formData, taxId: e.target.value})}
                      className={`${fieldClass} tabular-nums`}
                      placeholder="8 碼數字"
                    />
                  </div>

                  <div>
                    <FieldLabel>房號</FieldLabel>
                    {manualRoom ? (
                      <div className="flex gap-2 items-center">
                        <input
                          value={formData.roomNo || ""}
                          onChange={e => setFormData({...formData, roomNo: e.target.value})}
                          className={fieldClass}
                          placeholder="自行輸入房號"
                        />
                        <button
                          type="button"
                          onClick={() => setManualRoom(false)}
                          className="text-[11px] text-[#A5A29B] hover:text-[#1A1A18] whitespace-nowrap transition-colors"
                        >
                          選單
                        </button>
                      </div>
                    ) : (
                      <RoomSelect
                        value={formData.roomNo || ""}
                        options={roomOptions}
                        onChange={(roomNo) => setFormData({ ...formData, roomNo })}
                        onManual={() => setManualRoom(true)}
                      />
                    )}
                    {!manualRoom && roomOptions.length === 0 && (
                      <p className="text-[11px] text-[#A97B22] mt-1.5">
                        此館別在房型母表尚無資料，可改用手動輸入
                      </p>
                    )}
                  </div>

                  <div className="col-span-2">
                    <FieldLabel>信件編號</FieldLabel>
                    <input
                      value={formData.mailNo || ""}
                      onChange={e => setFormData({...formData, mailNo: e.target.value})}
                      className={fieldClass}
                      placeholder="信件掛號編號或備註"
                    />
                  </div>

                  <div className="col-span-2">
                    <FieldLabel>成交前預估金額</FieldLabel>
                    <input
                      type="number"
                      value={formData.preDealEstimatedAmount === 0 ? "" : formData.preDealEstimatedAmount || ""}
                      onChange={e => setFormData({...formData, preDealEstimatedAmount: Number(e.target.value)})}
                      className={`${fieldClass} tabular-nums`}
                      placeholder="尚未成交前的預估金額"
                    />
                  </div>

                  <div className="col-span-2">
                    <FieldLabel>卡片建立時間</FieldLabel>
                    <div className={readonlyFieldClass}>
                      {formData.createdAt ? new Date(formData.createdAt).toLocaleString('zh-TW', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : "—"}
                    </div>
                  </div>
                </div>
              </section>

              {/* ---------- 財務與週期 ---------- */}
              <section>
                <SectionHead>財務與週期</SectionHead>
                <div className="grid grid-cols-2 gap-x-5 gap-y-5">
                  <div>
                    <FieldLabel>稅別</FieldLabel>
                    <select
                      value={formData.taxType || "應稅(5%)"}
                      onChange={e => setFormData({...formData, taxType: e.target.value as TaxType})}
                      className={fieldClass}
                    >
                      <option value="應稅(5%)">應稅(5%)</option>
                      <option value="免稅/未稅">免稅/未稅</option>
                    </select>
                  </div>
                  <div>
                    <FieldLabel>繳費週期</FieldLabel>
                    <select
                      value={formData.paymentCycle || "月繳"}
                      onChange={e => setFormData({...formData, paymentCycle: e.target.value})}
                      className={fieldClass}
                    >
                      <option value="月繳">月繳</option>
                      <option value="季繳">季繳</option>
                      <option value="半年繳">半年繳</option>
                      <option value="年繳">年繳</option>
                    </select>
                  </div>
                  <div>
                    <FieldLabel>合約起日</FieldLabel>
                    <input
                      type="date"
                      value={formData.contractStartDate || ""}
                      onChange={e => setFormData({...formData, contractStartDate: e.target.value})}
                      className={fieldClass}
                    />
                  </div>
                  <div>
                    <FieldLabel>合約迄日</FieldLabel>
                    <input
                      type="date"
                      value={formData.contractEndDate || ""}
                      onChange={e => setFormData({...formData, contractEndDate: e.target.value})}
                      className={fieldClass}
                    />
                  </div>
                  <div>
                    <FieldLabel>實際月租（未稅）</FieldLabel>
                    <input
                      type="number"
                      value={formData.actualRentExclTax || ""}
                      onChange={e => setFormData({...formData, actualRentExclTax: Number(e.target.value)})}
                      className={`${fieldClass} tabular-nums`}
                    />
                  </div>
                  <div>
                    <FieldLabel>合約週期（自動計算）</FieldLabel>
                    <div className={readonlyFieldClass}>
                      {formData.contractMonths || 0} 個月
                    </div>
                  </div>

                  <div className="col-span-2 mt-1 bg-[#FAFAF8] border border-[#E8E6E1] rounded-lg px-5 py-4 flex items-baseline justify-between">
                    <div>
                      <div className="text-[11px] text-[#8A8780]">總金額（含稅）</div>
                      <div className="text-[10px] text-[#B0ADA6] mt-0.5">
                        依起訖日期自動判定，不足 30 天以 1 個月計
                      </div>
                    </div>
                    <span className="text-[20px] font-semibold text-[#1A1A18] tabular-nums tracking-tight">
                      {currency(formData.totalContractAmount || 0)}
                    </span>
                  </div>
                </div>
              </section>

              {/* ---------- 合約附件 ---------- */}
              <section>
                <SectionHead
                  action={
                    <label
                      className={`shrink-0 text-[11px] font-medium px-3 py-1.5 rounded-lg border cursor-pointer transition-all ${
                        uploading
                          ? "bg-[#F0EEE9] text-[#B0ADA6] border-[#E8E6E1] cursor-wait"
                          : "bg-white text-[#3A3833] border-[#E0DDD6] hover:border-[#B0ADA6]"
                      }`}
                    >
                      {uploading ? `上傳中 ${uploadPct}%` : "選取檔案"}
                      <input ref={fileInputRef} type="file" className="hidden" disabled={uploading} onChange={handleFileUpload} />
                    </label>
                  }
                >
                  合約附件
                </SectionHead>

                {uploading && (
                  <div className="mb-4 h-[3px] bg-[#F0EEE9] rounded-full overflow-hidden">
                    <div className="h-full bg-[#1A1A18] transition-all" style={{ width: `${uploadPct}%` }} />
                  </div>
                )}

                <div className="space-y-2">
                  {(formData.attachments || []).map((file, idx) => (
                    <div
                      key={idx}
                      className="group flex justify-between items-center gap-4 px-4 py-3 bg-[#FAFAF8] rounded-lg border border-[#E8E6E1] hover:border-[#D5D2CB] transition-colors"
                    >
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="text-[13px] text-[#1A1A18] truncate">{file.name}</span>
                        <span className="text-[11px] text-[#A5A29B] mt-0.5">
                          {file.uploadedAt?.substring(0, 10)}
                          {file.url?.startsWith("blob:") && (
                            <span className="ml-2 text-[#B4483C]">舊檔已失效，請重新上傳</span>
                          )}
                        </span>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <a
                          href={file.url}
                          target="_blank"
                          className="text-[11px] px-2.5 py-1.5 rounded-md text-[#3A3833] hover:bg-white transition-colors"
                        >
                          檢視
                        </a>
                        <button
                          type="button"
                          onClick={() => handleRemoveAttachment(idx)}
                          className="text-[11px] px-2.5 py-1.5 rounded-md text-[#A5A29B] hover:text-[#B4483C] hover:bg-white transition-colors"
                        >
                          移除
                        </button>
                      </div>
                    </div>
                  ))}

                  {(!formData.attachments || formData.attachments.length === 0) && (
                    <div className="py-10 text-center border border-dashed border-[#E0DDD6] rounded-lg">
                      <p className="text-[12px] text-[#A5A29B]">尚未上傳合約附件</p>
                    </div>
                  )}
                </div>
              </section>
            </div>
          )}

          {/* ---------- 待辦清單 ---------- */}
          {activeTab === "todo" && (
            <div>
              <SectionHead
                action={
                  <span className="shrink-0 text-[11px] tabular-nums text-[#A5A29B]">
                    {doneCount} / {totalTodos}
                  </span>
                }
              >
                服務檢查清單
              </SectionHead>

              <div className="space-y-1">
                {(formData.todos || []).map(todo => (
                  <label
                    key={todo.id}
                    className="flex items-start gap-3.5 px-4 py-3.5 rounded-lg cursor-pointer hover:bg-[#FAFAF8] transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={todo.completed}
                      onChange={() => handleToggleTodo(todo.id)}
                      className="mt-0.5 w-[18px] h-[18px] accent-[#1A1A18] cursor-pointer shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className={`text-[13px] leading-relaxed transition-colors ${
                        todo.completed ? "line-through text-[#B0ADA6]" : "text-[#1A1A18]"
                      }`}>
                        {todo.text}
                      </p>
                      {todo.completed && (
                        <p className="text-[11px] text-[#B0ADA6] mt-1">
                          {todo.completedBy} · {todo.completedAt}
                        </p>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* ---------- 內容複製 ---------- */}
          {activeTab === "copy" && (
            <div>
              <SectionHead>常用範本</SectionHead>
              <div className="space-y-3">
                {templates.length > 0 ? (
                  templates.map((temp: any) => (
                    <div
                      key={temp.id}
                      className="group bg-[#FAFAF8] rounded-lg border border-[#E8E6E1] p-4 hover:border-[#D5D2CB] transition-colors"
                    >
                      <div className="flex items-start justify-between gap-4 mb-2.5">
                        <span className="text-[12px] font-medium text-[#3A3833]">{temp.label}</span>
                        <button
                          onClick={() => handleCopy(temp.content, temp.id)}
                          className="shrink-0 text-[11px] px-2.5 py-1 rounded-md text-[#A5A29B] hover:text-[#1A1A18] hover:bg-white transition-colors"
                        >
                          {copiedId === temp.id ? "已複製" : "複製"}
                        </button>
                      </div>
                      <p className="text-[13px] whitespace-pre-wrap leading-relaxed text-[#5F5E5A]">
                        {temp.content}
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="py-16 text-center border border-dashed border-[#E0DDD6] rounded-lg">
                    <p className="text-[12px] text-[#A5A29B]">尚無可用範本</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ---------- 歷程記錄 ---------- */}
          {activeTab === "history" && (
            <div className="space-y-10">
              <section>
                <SectionHead>階段停留天數</SectionHead>
                <div className="border border-[#E8E6E1] rounded-lg overflow-hidden">
                  {STAGES.map((s, i) => {
                    const entryDate = formData.stageHistory?.[s.id];
                    const isFinalStage = s.id === "S7" || s.id === "S8";
                    const isCurrent = formData.stage === s.id;
                    let duration = "—";

                    if (entryDate) {
                      if (isFinalStage) {
                        // S7/S8：只有目前真的還停留在這個最終階段時才顯示凍結天數，
                        // 一旦被移出去（不再是成交/暫停狀態），就不再顯示舊的天數，避免誤解
                        if (formData.stage === s.id) {
                          const startDateStr = formData.stageHistory?.["S1"] || formData.createdAt || new Date().toISOString();
                          const days = Math.floor((new Date(entryDate).getTime() - new Date(startDateStr).getTime()) / (1000 * 60 * 60 * 24));
                          duration = `${Math.max(0, days)} 天`;
                        }
                      } else {
                        // S1~S6：算到「時間上最接近的下一筆轉換紀錄」，如果目前還停留在這階段，就算到今天
                        const entryTime = new Date(entryDate).getTime();
                        const laterEntries = Object.entries(formData.stageHistory || {})
                          .filter(([key, val]) => key !== s.id && !!val && new Date(val).getTime() > entryTime)
                          .map(([, val]) => new Date(val as string).getTime());

                        let endTime: number;
                        if (laterEntries.length > 0) {
                          endTime = Math.min(...laterEntries);
                        } else if (formData.stage === s.id) {
                          endTime = Date.now();
                        } else {
                          endTime = entryTime;
                        }

                        const days = Math.floor((endTime - entryTime) / (1000 * 60 * 60 * 24));
                        duration = `${Math.max(0, days)} 天`;
                      }
                    }
                    return (
                      <div
                        key={s.id}
                        className={`flex justify-between items-center px-4 py-3 ${
                          i > 0 ? "border-t border-[#F0EEE9]" : ""
                        } ${isCurrent ? "bg-[#FAFAF8]" : ""}`}
                      >
                        <span className={`text-[12px] ${isCurrent ? "text-[#1A1A18] font-medium" : "text-[#5F5E5A]"}`}>
                          {s.title}
                          {isCurrent && <span className="ml-2 text-[10px] text-[#A5A29B]">目前階段</span>}
                        </span>
                        <span className="text-[13px] tabular-nums text-[#3A3833]">{duration}</span>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section>
                <SectionHead>操作紀錄</SectionHead>
                <div className="relative border-l border-[#E8E6E1] ml-1 pl-6 space-y-6">
                  {history.map(log => (
                    <div key={log.id} className="relative">
                      <div className="absolute -left-[27px] top-1.5 w-[7px] h-[7px] rounded-full bg-[#D5D2CB] ring-2 ring-white" />
                      <div className="text-[11px] text-[#B0ADA6] mb-1 tabular-nums">
                        {log.timestamp?.toDate().toLocaleString() || "剛才"}
                      </div>
                      <div className="text-[13px] text-[#3A3833] leading-relaxed">
                        {log.action}
                        <span className="text-[#B0ADA6] text-[11px] ml-2">{log.user}</span>
                      </div>
                    </div>
                  ))}
                  {history.length === 0 && (
                    <p className="text-[12px] text-[#A5A29B]">尚無操作紀錄</p>
                  )}
                </div>
              </section>
            </div>
          )}
        </div>

        {(activeTab === "info" || isCreate) && (
          <footer className="px-8 py-5 border-t border-[#E8E6E1] bg-white flex items-center gap-4 shrink-0">
            {/* 刪除是不可逆操作，降級成文字連結，不與儲存爭奪視覺重量 */}
            {!isCreate && (
              <button
                type="button"
                onClick={() => { if(confirm(`確定要刪除「${formData.companyName}」這筆案件嗎？\n\n附件會一併從雲端刪除，此動作無法復原。`)) onDelete(formData.id!); }}
                className="text-[12px] text-[#A5A29B] hover:text-[#B4483C] transition-colors shrink-0"
              >
                刪除案件
              </button>
            )}
            <button
              type="button"
              onClick={handleValidateAndSave}
              className="ml-auto bg-[#1A1A18] text-white px-8 py-3 rounded-lg text-[13px] font-medium hover:bg-black transition-colors"
            >
              儲存
            </button>
          </footer>
        )}
      </div>
    </div> 
  );
}

export default function CasesPage() {
  const router = useRouter();
  const { width: sidebarWidth } = useSidebar();
  const [hasMounted, setHasMounted] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [searchInput, setSearchInput] = useState("");
    const [monthStartInput, setMonthStartInput] = useState("");
    const [monthEndInput, setMonthEndInput] = useState("");
    const [tagInput, setTagInput] = useState("全部");
    const [cycleInput, setCycleInput] = useState("全部");

    // 這是實際按下「執行」按鈕後才生效的篩選條件
    const [appliedFilters, setAppliedFilters] = useState({
      query: "", start: "", end: "", tag: "全部", cycle: "全部"
    });

    // 定義「執行」按鈕邏輯
    const handleApplyFilter = () => {
      setAppliedFilters({ 
        query: searchInput, 
        start: monthStartInput, 
        end: monthEndInput, 
        tag: tagInput, 
        cycle: cycleInput 
      });
    };

    // 定義「清除」按鈕邏輯
    const handleClearFilter = () => {
      setSearchInput(""); 
      setMonthStartInput(""); 
      setMonthEndInput(""); 
      setTagInput("全部"); 
      setCycleInput("全部");
      setAppliedFilters({ 
        query: "", 
        start: "", 
        end: "", 
        tag: "全部", 
        cycle: "全部" 
      });
    };
    // --- 💡 貼到這裡結束 ---
  const [cards, setCards] = useState<LeaseCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [currentUser, setCurrentUser] = useState<string>("ADMIN");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [floors, setFloors] = useState<Floor[]>([]);

  useEffect(() => {
      setHasMounted(true);
      const unsubscribeAuth = onAuthStateChanged(auth, (user) => { 
        if (!user) router.push("/login"); 
        else setCurrentUser(user.email || user.displayName || "Unknown User");
      });
      
      const unsubscribeData = onSnapshot(query(collection(db, "cases"), orderBy("createdAt", "desc")), (snapshot) => {
        const newCards = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as LeaseCard[];
        setCards(newCards);
        setLoading(false);

        // 💡 關鍵新增：偵測網址參數並自動開啟彈窗
        const params = new URLSearchParams(window.location.search);
        const idFromUrl = params.get('id');
        if (idFromUrl) {
          setSelectedId(idFromUrl);
          // 選項：清除網址參數，避免重新整理時重複彈出
          window.history.replaceState({}, '', window.location.pathname);
        }
      });

      const unsubRooms = onSnapshot(collection(db, "rooms"), (snap) =>
        setRooms(snap.docs.map(d => ({ ...(d.data() as Room), id: d.id })))
      );
      const unsubFloors = onSnapshot(collection(db, "floors"), (snap) =>
        setFloors(snap.docs.map(d => ({ ...(d.data() as Floor), id: d.id })))
      );

      return () => { unsubscribeAuth(); unsubscribeData(); unsubRooms(); unsubFloors(); };
    }, [router]);

  // 案件成交或退出成交時，同步更新房型母表的出租狀態與承租資訊。
  // 寫入後仍可在房型維護頁手動調整，這裡只負責省去人工同步的步驟。
  const syncRoomStatus = async (card: LeaseCard | undefined, toStage: StageId) => {
    if (!card?.roomNo) return;
    const target = rooms.find(r => r.roomNo === card.roomNo);
    if (!target) return; // 房號是自由輸入、母表沒有對應資料就不動

    try {
      if (toStage === "S7") {
        await updateDoc(doc(db, "rooms", target.id), {
          status: "OCCUPIED",
          tenantName: card.companyName || "",
          leaseStartDate: card.contractStartDate || "",
          leaseEndDate: card.contractEndDate || "",
          currentCaseId: card.id,
          tenantSyncedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else if (card.stage === "S7") {
        // 從成交被拖回前面的階段，代表這筆沒有真的成交，把房間釋放回可出租
        await updateDoc(doc(db, "rooms", target.id), {
          status: "AVAILABLE",
          tenantName: "",
          leaseStartDate: "",
          leaseEndDate: "",
          currentCaseId: "",
          updatedAt: serverTimestamp(),
        });
      }
    } catch (e) {
      console.error("同步房型狀態失敗:", e);
    }
  };

  const addLogExternal = async (caseId: string, action: string) => {
    await addDoc(collection(db, "cases", caseId, "logs"), { action, user: currentUser, timestamp: serverTimestamp() });
  };

  const handleSave = async (data: LeaseCard) => {
    try {
      const { id, ...rest } = data;
      const saveData = { ...rest, updatedAt: serverTimestamp() };
      
      if (isCreating) {
        // 修改後：保留完整的 ISO 字串，包含時分秒
        const newRef = await addDoc(collection(db, "cases"), { ...saveData, createdAt: new Date().toISOString(), stageStartedAt: new Date().toISOString() });
        await addDoc(collection(db, "cases", newRef.id, "logs"), { action: "建立了新案件", user: currentUser, timestamp: serverTimestamp() });
      } else {
        await updateDoc(doc(db, "cases", id), saveData);
        // 已成交的案件若修改了合約日期或公司名稱，房型那邊要跟著更新
        if (data.stage === "S7" && data.roomNo) {
          const target = rooms.find(r => r.roomNo === data.roomNo);
          if (target) {
            await updateDoc(doc(db, "rooms", target.id), {
              // 狀態要一起寫，否則走儲存這條路徑時房間會停留在可出租
              status: "OCCUPIED",
              tenantName: data.companyName || "",
              leaseStartDate: data.contractStartDate || "",
              leaseEndDate: data.contractEndDate || "",
              currentCaseId: id,
              tenantSyncedAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }
        }
      }

      const memberInfo = {
        companyName: data.companyName,
        totalContractAmount: data.totalContractAmount || 0,           
        contactPerson: data.contactPerson,
        phone: data.phone || "",
        taxId: data.taxId || "",
        // 💡 補上這兩行，合約中心才看得到租期
        contractStartDate: data.contractStartDate || "",
        contractEndDate: data.contractEndDate || "",
        updatedAt: serverTimestamp(),       
      };

      // 只有統編才是可靠的唯一鍵。公司名稱會有「大成」這種同名不同統編的情況，
      // 也會有全銜寫法不一的問題，拿來比對可能把兩家公司併成一筆並覆蓋掉對方資料。
      // 沒填統編時寧可多建一筆重複資料（之後補統編再合併），也不要錯誤合併。
      let existingMemberId: string | null = null;
      if (data.taxId) {
        const memberSnap = await getDocs(
          query(collection(db, "members"), where("taxId", "==", data.taxId))
        );
        if (!memberSnap.empty) {
          existingMemberId = memberSnap.docs[0].id;
          const currentTags = memberSnap.docs[0].data().tags || [];
          const newTags = currentTags.includes("辦公室管理") ? currentTags : [...currentTags, "辦公室管理"];
          await updateDoc(doc(db, "members", existingMemberId), { ...memberInfo, tags: newTags });
        }
      }

      if (!existingMemberId) {
        await addDoc(collection(db, "members"), { ...memberInfo, tags: ["辦公室管理"], createdAt: serverTimestamp() });
      }

      setIsCreating(false); setSelectedId(null);
    } catch (e) {
      console.error("儲存案件失敗:", e);
      alert(`儲存失敗：${e instanceof Error ? e.message : "未知錯誤"}`);
    }
  };

  // --- 💡 第二步：改為支援多重條件過濾的 byStage 邏輯 ---
    const byStage = useMemo(() => {
      const map = new Map<StageId, LeaseCard[]>();
      STAGES.forEach(s => map.set(s.id, []));

      cards.filter(card => {
        // 從第一步定義的 appliedFilters 提取執行中的過濾條件
        const { query, start, end, tag, cycle } = appliedFilters;
        const s = query.toLowerCase();

        // 1. 關鍵字過濾 (公司名稱 / 窗口 / 統編 / 房號)
        if (s && !(
          (card.companyName || "").toLowerCase().includes(s) ||
          (card.contactPerson || "").toLowerCase().includes(s) ||
          (card.taxId || "").includes(s) ||
          (card.roomNo || "").toLowerCase().includes(s)
        )) return false;

        // 2. 月份區間過濾 (根據建立時間)
        if (start || end) {
          const createMonth = card.createdAt?.substring(0, 7);
          if (start && createMonth < start) return false;
          if (end && createMonth > end) return false;
        }

        // 3. 館別過濾 (對應標籤：tag)
        if (tag !== "全部" && card.building !== tag) return false;

        // 4. 繳費週期過濾 (對應：cycle)
        if (cycle !== "全部" && card.paymentCycle !== cycle) return false;

        return true;
      }).forEach(c => {
        if (map.has(c.stage)) map.get(c.stage)!.push(c);
      });

      return map;
    }, [cards, appliedFilters]); // 💡 監聽對象改為 appliedFilters

  const activeCard = useMemo(() => cards.find(c => c.id === activeId), [activeId, cards]);

  if (!hasMounted || loading) return <div className="h-screen flex items-center justify-center font-bold text-slate-400 text-slate-800">正在與雲端資料庫同步...</div>;

  return (
    <div style={{ left: sidebarWidth, transition: "left 200ms", backgroundColor: "#F5F4F1" }} className="fixed inset-0 flex flex-col font-sans overflow-hidden text-slate-800">
  <header className="px-8 pt-8 pb-6 shrink-0 bg-white border-b border-[#E8E6E1] z-10">
          <div className="flex justify-between items-center mb-5">
            <div>
              <h1 className="text-[22px] font-semibold text-[#1A1A18] tracking-tight">辦公室出租管理</h1>
              <p className="text-[11px] text-[#A5A29B] mt-1">左側色帶代表館別，數字為停留天數</p>
            </div>
            <button onClick={() => setIsCreating(true)} className="bg-[#1A1A18] text-white px-5 py-2.5 rounded-lg text-[13px] font-medium hover:bg-black transition-all">新增案件</button>
          </div>

          {/* 💡 修正後的進階篩選列 */}
          <div className="flex items-center gap-3 bg-[#FAFAF8] p-2 rounded-lg border border-[#E8E6E1]">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black text-slate-400 uppercase">搜尋</span>
              <input 
                placeholder="名稱/窗口/統編/房號" 
                value={searchInput} 
                onChange={(e) => setSearchInput(e.target.value)} 
                className="px-2 py-1.5 border border-slate-200 rounded-lg text-xs w-40 outline-none focus:border-blue-400 bg-white text-slate-800" 
              />
            </div>
            
            <div className="h-4 w-px bg-slate-200" />
            
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black text-slate-400 uppercase">月份</span>
              <div className="flex items-center gap-1">
                <input type="month" value={monthStartInput} onChange={(e) => setMonthStartInput(e.target.value)} className="px-1.5 py-1 border border-slate-200 rounded text-xs outline-none bg-white text-slate-800" />
                <span className="text-slate-300 text-[10px]">~</span>
                <input type="month" value={monthEndInput} onChange={(e) => setMonthEndInput(e.target.value)} className="px-1.5 py-1 border border-slate-200 rounded text-xs outline-none bg-white text-slate-800" />
              </div>
            </div>

            <div className="h-4 w-px bg-slate-200" />

            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black text-slate-400 uppercase">館別</span>
              <select value={tagInput} onChange={(e) => setTagInput(e.target.value)} className="px-2 py-1 border border-slate-200 rounded-lg text-xs font-bold text-slate-600 bg-white w-28 text-slate-800">
                <option value="全部">全部館別</option>
                {BUILDINGS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>

            <div className="h-4 w-px bg-slate-200" />

            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black text-slate-400 uppercase">週期</span>
              <select value={cycleInput} onChange={(e) => setCycleInput(e.target.value)} className="px-2 py-1 border border-slate-200 rounded-lg text-xs font-bold text-slate-600 bg-white w-28 text-slate-800">
                <option value="全部">全部週期</option>
                {["月繳", "季繳", "半年繳", "年繳"].map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>

            <div className="flex gap-1.5 ml-auto">
              <button onClick={handleClearFilter} className="px-3 py-1.5 text-xs font-bold text-slate-400 hover:text-slate-600">清除</button>
              <button onClick={handleApplyFilter} className="px-4 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm">執行</button>
            </div>
          </div>
        </header>
      <main className="flex-1 min-h-0 px-8 pt-6 pb-0 overflow-hidden flex flex-col">
        <div className="board-scroll flex-1 min-h-0 overflow-auto custom-scrollbar rounded-b-2xl">
          <DndContext sensors={sensors} onDragStart={(e) => setActiveId(String(e.active.id))} onDragEnd={(e) => { 
            const { active, over } = e; setActiveId(null); if (over) { 
              const aId = String(active.id); const oId = String(over.id);
              let toStage = oId as StageId; if (!STAGES.some(s => s.id === oId)) toStage = cards.find(c => c.id === oId)?.stage as StageId;
              const card = cards.find(c => c.id === aId);
              if (toStage && card?.stage !== toStage) {
                const today = new Date().toISOString().split('T')[0];
                // 每個階段的日期只記錄「第一次進入」的時間，之後不管再回到這個階段幾次都不覆寫，
                // 避免不小心拖錯又拖回去時，把原本真實的進入日期洗掉
                const historyUpdate = { ...card?.stageHistory, [toStage]: card?.stageHistory?.[toStage] || today };
                // stageStartedAt 直接沿用同一個被保護的日期，卡片上的「停留天數」才不會被誤觸的移動重置
                const protectedStageStart = historyUpdate[toStage];
                const updatePayload: any = { stage: toStage, stageStartedAt: protectedStageStart, stageHistory: historyUpdate, updatedAt: serverTimestamp() };
                if (toStage === "S7" || toStage === "S8") updatePayload.stageEndedAt = today;
                else updatePayload.stageEndedAt = null;

                updateDoc(doc(db, "cases", aId), updatePayload);
                addLogExternal(aId, `將案件從 ${card?.stage} 變更至 ${toStage}`);
                syncRoomStatus(card, toStage);
              }
            }
          }}>
            <div className="inline-flex h-full min-h-0 gap-6 items-stretch pr-8 pb-8">
              {STAGES.map((s) => (
                <StageColumn key={s.id} stage={s} cards={byStage.get(s.id) || []} onCardClick={setSelectedId} />
              ))}
            </div>
            {createPortal(<DragOverlay dropAnimation={null}>{activeCard ? <CardBase item={activeCard} isOverlay /> : null}</DragOverlay>, document.body)}
          </DndContext>
        </div>
      </main>
      <DetailDrawer
        item={cards.find(c => c.id === selectedId) || null}
        isCreate={isCreating}
        onClose={() => { setSelectedId(null); setIsCreating(false); }}
        onSave={handleSave}
        onDelete={async (id) => {
          const target = cards.find(c => c.id === id);
          // 先清雲端檔案，否則刪掉案件後這些附件會變成沒人管的孤兒檔
          await deleteManyByUrl((target?.attachments || []).map(a => a.url));
          await deleteDoc(doc(db, "cases", id));
          setSelectedId(null);
        }}
        currentUser={currentUser}
        rooms={rooms}
        floors={floors}
      />
      <style jsx global>{` 
        .board-scroll { scrollbar-gutter: stable; }
        .custom-scrollbar::-webkit-scrollbar { height: 10px; width: 6px; } 
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; } 
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #D5D2CB; border-radius: 999px; border: 2px solid #F5F4F1; } 
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #B0ADA6; } 
      `}</style>
    </div>
  );
}
