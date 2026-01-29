"use client";

import { useMemo, useState, useEffect } from "react";
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
import { db } from "@/lib/firebase"; 
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  query, 
  orderBy, 
  serverTimestamp 
} from "firebase/firestore";

// --- 類型定義 ---
type StageId = "S1" | "S2" | "S3" | "S4" | "S5" | "S6" | "S7" | "S8";
type BuildingId = "四維館" | "民權20樓" | "民權21樓" | "民權27樓" | "民權28樓";
type DateFilter = "全部" | "今日建立" | "本月建立";
type TaxType = "應稅(5%)" | "免稅/未稅";

interface LeaseCard {
  id: string;
  title: string;
  customer: string;
  building: BuildingId;
  companyTaxId?: string;
  contactPerson?: string;
  contactPhone?: string;
  owner: string;
  monthlyRent: number;
  roomNo: string;
  contractStartDate?: string;
  contractEndDate?: string;
  taxType: TaxType;
  actualRentExclTax: number;
  actualRentInclTax: number;
  contractMonths: number;
  totalContractAmount: number;
  stage: StageId;
  updatedAt: any;
  stageStartedAt: string;
  createdAt: string;
  hasAttachment?: boolean;
}

const STAGES: { id: StageId; title: string; hint: string; checks: string[] }[] = [
  { id: "S1", title: "S1 待處理", hint: "來源建立 / 初步需求", checks: ["基本需求確認", "客戶背景調查"] },
  { id: "S2", title: "S2 需求訪談", hint: "深入了解需求", checks: ["已完成訪談", "需求規格紀錄"] },
  { id: "S3", title: "S3 口頭報價", hint: "初步條件達成", checks: ["報價單內容核對", "已傳送口頭報價"] },
  { id: "S4", title: "S4 現場場勘", hint: "帶看安排", checks: ["已完成現場帶看", "場勘紀錄已填寫"] },
  { id: "S5", title: "S5 需求確認(議價)", hint: "最後價格攻防", checks: ["議價紀錄更新", "統編資料確認"] },
  { id: "S6", title: "S6 擬定合約", hint: "法務審閱中", checks: ["合約草稿確認", "雙方印鑑核對"] },
  { id: "S7", title: "S7 成交", hint: "流程完成", checks: ["押金已入帳", "點交文件歸檔"] },
  { id: "S8", title: "S8 暫停", hint: "案件保留", checks: ["暫停原因備註"] },
];

const BUILDINGS: BuildingId[] = ["四維館", "民權20樓", "民權21樓", "民權27樓", "民權28樓"];

// --- 工具函數 ---
function currency(n: number) {
  return new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 }).format(n);
}

function getDaysDiff(startDate: string) {
  if (!startDate) return 0;
  const start = new Date(startDate);
  const today = new Date();
  const diffTime = today.getTime() - start.getTime();
  return Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
}

function calculateMonths(start?: string, end?: string) {
  if (!start || !end) return 0;
  const s = new Date(start);
  const e = new Date(end);
  const diff = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
  return Math.max(0, diff + 1);
}

// --- 1. 卡片 UI 組件 ---
function CardBase({ item, isOverlay = false }: { item: LeaseCard; isOverlay?: boolean }) {
  const days = getDaysDiff(item.stageStartedAt);
  const badgeStyle = days >= 7 ? "bg-red-500 text-white" : days >= 3 ? "bg-amber-400 text-white" : "bg-emerald-500 text-white";

  return (
    <div 
      style={{ backgroundColor: "#E6F7FF" }}
      className={`relative rounded-xl border border-slate-200 p-3 shadow-sm transition-all ${
      isOverlay ? "shadow-2xl ring-2 ring-blue-500 scale-105 cursor-grabbing" : "hover:ring-2 hover:ring-blue-400 cursor-grab"
    }`}>
      <div className="flex justify-between items-start mb-2">
        <div className="text-sm font-bold text-slate-800 line-clamp-1 pr-12">{item.title}</div>
        <div className={`absolute top-3 right-3 px-2 py-0.5 rounded text-[10px] font-bold shadow-sm ${badgeStyle}`}>
          停留 {days}天
        </div>
      </div>
      <div className="flex items-center gap-2 mb-3">
        <div className="text-[11px] text-slate-400">{item.customer}</div>
        <span className={`text-[9px] px-1 rounded border border-slate-200 font-bold ${item.taxType === "應稅(5%)" ? "bg-blue-50 text-blue-500" : "bg-slate-50 text-slate-500"}`}>
          {item.taxType}
        </span>
      </div>
      <div className="flex justify-between items-end mt-auto">
        <div className="space-y-1">
          <div className="text-[10px] font-bold bg-slate-100/50 text-slate-600 px-1.5 py-0.5 rounded w-fit italic border border-slate-200">{item.building}</div>
          <div className="text-sm font-bold text-blue-600">{currency(item.totalContractAmount)}</div>
        </div>
        <span className="text-[10px] text-slate-400 italic">房號: {item.roomNo || "未定"}</span>
      </div>
    </div>
  );
}

// --- 2. 可排序卡片 ---
function SortableCard({ item, onClick }: { item: LeaseCard; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = { transform: CSS.Translate.toString(transform), transition };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} onClick={onClick} className={isDragging ? "opacity-30" : ""}>
      <CardBase item={item} />
    </div>
  );
}

// --- 3. 階段列 (修正：移除捲軸，改為隨頁面撐開) ---
function StageColumn({ stage, cards, onCardClick }: { stage: typeof STAGES[0]; cards: LeaseCard[]; onCardClick: (id: string) => void }) {
  const { setNodeRef } = useDroppable({ id: stage.id });
  return (
    <div 
      ref={setNodeRef} 
      className="flex min-h-full w-[320px] flex-col rounded-2xl border border-slate-200 bg-white p-4 shrink-0 shadow-sm"
    >
      <h3 className="font-bold text-sm text-slate-800 mb-4 flex items-center justify-between shrink-0">
        {stage.title}
        <span className="bg-slate-200/50 text-slate-500 text-[10px] px-2 py-0.5 rounded-full font-bold">{cards.length}</span>
      </h3>
      <SortableContext items={cards.map(x => x.id)} strategy={verticalListSortingStrategy}>
        {/* 修正：移除 overflow-y-auto, 讓內容直接撐開白色容器 */}
        <div className="flex-1 space-y-4 pr-1">
          {cards.map(item => <SortableCard key={item.id} item={item} onClick={() => onCardClick(item.id)} />)}
          {cards.length === 0 && (
            <div className="h-[200px] border-2 border-dashed border-slate-50 rounded-xl" />
          )}
        </div>
      </SortableContext>
    </div>
  );
}

// --- 4. 確認移動彈窗 ---
function ConfirmModal({ show, onConfirm, onCancel, stageId, cardTitle }: { show: boolean; onConfirm: () => void; onCancel: () => void; stageId: StageId | null; cardTitle: string }) {
  const [copyLabel, setCopyLabel] = useState("複製內容");
  const [msgContent, setMsgContent] = useState("");
  
  useEffect(() => {
    if (show && stageId) {
      const stageInfo = STAGES.find(s => s.id === stageId);
      setMsgContent(`您好，關於「${cardTitle}」案件，目前進度已更新至：${stageInfo?.title}。\n後續將由專人與您聯繫，謝謝。`);
    }
  }, [show, stageId, cardTitle]);

  if (!show || !stageId) return null;
  const stageInfo = STAGES.find(s => s.id === stageId);

  const handleCopy = () => {
    navigator.clipboard.writeText(msgContent);
    setCopyLabel("✅ 已複製");
    setTimeout(() => setCopyLabel("複製內容"), 2000);
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95">
        <div className="p-8">
          <h3 className="text-2xl font-black text-slate-800 tracking-tight">進度移動確認</h3>
          <p className="text-base text-slate-500 mt-3">
            將 <span className="text-slate-900 font-bold underline decoration-blue-500 decoration-2 underline-offset-4">{cardTitle}</span> 移至 
            <span className="ml-2 px-3 py-1 bg-slate-100 rounded-lg text-slate-900 font-bold">{stageInfo?.title}</span>？
          </p>
          
          <div className="mt-8 p-6 bg-blue-50/50 rounded-2xl border border-blue-100">
            <p className="text-base font-black text-blue-600 mb-4 uppercase tracking-widest">該階段內控核對清單：</p>
            <ul className="space-y-4">
              {stageInfo?.checks.map((c, i) => (
                <li key={i} className="flex items-center gap-3 text-base text-slate-700 font-bold">
                  <input type="checkbox" className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500" /> {c}
                </li>
              ))}
              <li className="flex items-center gap-3 text-base text-slate-800 font-black mt-4 pt-5 border-t border-blue-100">
                <input type="checkbox" className="w-5 h-5 rounded border-slate-300 text-green-600 shadow-sm focus:ring-green-500" /> 
                📱 已傳送 line@ 通知客戶
              </li>
            </ul>
            
            <div className="mt-5 relative">
              <textarea 
                className="w-full text-base p-4 bg-white border border-blue-200 rounded-xl text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none resize-none leading-relaxed h-32 shadow-inner"
                value={msgContent}
                onChange={(e) => setMsgContent(e.target.value)}
              />
              <button 
                onClick={handleCopy}
                className="absolute bottom-3 right-3 px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-lg shadow-md hover:bg-blue-700 active:scale-95 transition-all"
              >
                {copyLabel}
              </button>
            </div>
          </div>
        </div>
        <div className="bg-slate-50 p-6 flex gap-4 border-t">
          <button onClick={onConfirm} className="flex-1 bg-slate-900 text-white py-4 rounded-2xl text-base font-black shadow-lg hover:bg-black transition-all">確認移動</button>
          <button onClick={onCancel} className="flex-1 bg-white border border-slate-200 text-slate-600 py-4 rounded-2xl text-base font-bold hover:bg-slate-100 transition-all">取消</button>
        </div>
      </div>
    </div>
  );
}

// --- 5. 詳情/新增 側邊欄 ---
function DetailDrawer({ item, isCreate, onClose, onSave }: { item: LeaseCard | null; isCreate: boolean; onClose: () => void; onSave: (data: LeaseCard) => void; }) {
  const [formData, setFormData] = useState<Partial<LeaseCard>>({});

  useEffect(() => {
    if (isCreate) {
      setFormData({
        id: `L-${Date.now()}`, stage: "S1", building: "四維館", stageStartedAt: new Date().toISOString().split('T')[0], createdAt: new Date().toISOString().split('T')[0], updatedAt: "",
        monthlyRent: 0, actualRentExclTax: 0, actualRentInclTax: 0, contractMonths: 0, totalContractAmount: 0, roomNo: "", owner: "未定", hasAttachment: false,
        taxType: "應稅(5%)"
      });
    } else if (item) {
      setFormData(item);
    }
  }, [item, isCreate]);

  useEffect(() => {
    const months = calculateMonths(formData.contractStartDate, formData.contractEndDate);
    const multiplier = formData.taxType === "應稅(5%)" ? 1.05 : 1;
    const inclTax = Math.round((formData.actualRentExclTax || 0) * multiplier);
    const total = inclTax * months;
    setFormData(prev => ({ ...prev, contractMonths: months, actualRentInclTax: inclTax, totalContractAmount: total }));
  }, [formData.contractStartDate, formData.contractEndDate, formData.actualRentExclTax, formData.taxType]);

  if (!item && !isCreate) return null;

  return (
    <div className="fixed inset-0 z-[100] flex justify-end">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-300">
        <header className="p-6 border-b flex justify-between items-center bg-white">
          <h2 className="text-xl font-bold text-slate-800">{isCreate ? "🆕 新增出租案件" : "📝 編輯案件詳情"}</h2>
          <button onClick={onClose} className="text-slate-400 text-2xl hover:text-slate-600 transition-colors">✕</button>
        </header>
        <div className="flex-1 overflow-y-auto p-8 space-y-10">
          <section className="space-y-4">
            <h3 className="text-sm font-bold border-l-4 border-blue-600 pl-3 text-slate-800 uppercase tracking-widest">Basic / 基本資訊</h3>
            <div className="grid grid-cols-2 gap-6">
              <div className="col-span-2 space-y-2">
                <label className="text-xs font-bold text-slate-500">所屬館別</label>
                <div className="flex flex-wrap gap-2">
                  {BUILDINGS.map(b => (
                    <button key={b} onClick={() => setFormData({...formData, building: b})} className={`px-4 py-2 text-xs font-bold rounded-xl border transition-all ${formData.building === b ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-500 border-slate-200"}`}>{b}</button>
                  ))}
                </div>
              </div>
              <div className="col-span-2"><label className="text-xs font-bold text-slate-500">案件名稱</label>
                <input placeholder="例如：50P 擴編需求案" value={formData.title || ""} onChange={e => setFormData({...formData, title: e.target.value})} className="w-full border-b py-2 text-sm outline-none focus:border-blue-600 font-medium" />
              </div>
            </div>
          </section>
          <section className="space-y-4">
            <h3 className="text-sm font-bold border-l-4 border-emerald-500 pl-3 text-slate-800 uppercase tracking-widest">Finance / 稅別與財務條件</h3>
            <div className="bg-emerald-50/30 p-6 rounded-2xl border border-emerald-100 space-y-6">
              <div className="space-y-3">
                <label className="text-xs font-bold text-emerald-600">合約稅別設定</label>
                <div className="flex gap-2">
                  {["應稅(5%)", "免稅/未稅"].map(t => (
                    <button key={t} onClick={() => setFormData({...formData, taxType: t as TaxType})} className={`flex-1 py-2 text-xs font-bold rounded-xl border transition-all ${formData.taxType === t ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-emerald-600 border-emerald-200"}`}>{t}</button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div><label className="text-xs font-bold text-emerald-600">合約起日</label>
                  <input type="date" value={formData.contractStartDate || ""} onChange={e => setFormData({...formData, contractStartDate: e.target.value})} className="w-full border-b border-emerald-200 py-2 text-sm outline-none bg-transparent" />
                </div>
                <div><label className="text-xs font-bold text-emerald-600">合約迄日</label>
                  <input type="date" value={formData.contractEndDate || ""} onChange={e => setFormData({...formData, contractEndDate: e.target.value})} className="w-full border-b border-emerald-200 py-2 text-sm outline-none bg-transparent" />
                </div>
                <div><label className="text-xs font-bold text-emerald-600">實際月租 (未稅)</label>
                  <input type="number" value={formData.actualRentExclTax || ""} onChange={e => setFormData({...formData, actualRentExclTax: Number(e.target.value)})} className="w-full border-b border-emerald-200 py-2 text-sm font-bold outline-none bg-transparent text-emerald-700" />
                </div>
                <div><label className="text-xs font-bold text-slate-400">實際月租 (含稅結果)</label>
                  <div className="py-2 text-sm font-bold text-slate-500 border-b border-dashed border-slate-200">{currency(formData.actualRentInclTax || 0)}</div>
                </div>
              </div>
              <div className="pt-4 grid grid-cols-2 gap-4 border-t border-emerald-100">
                <div className="text-center p-3 bg-white rounded-xl shadow-sm">
                  <div className="text-[10px] font-bold text-slate-400 uppercase">總期數</div>
                  <div className="text-lg font-black text-indigo-600">{formData.contractMonths} <span className="text-xs">個月</span></div>
                </div>
                <div className="text-center p-3 bg-white rounded-xl shadow-sm">
                  <div className="text-[10px] font-bold text-slate-400 uppercase">合約總產值</div>
                  <div className="text-lg font-black text-slate-800">{currency(formData.totalContractAmount || 0)}</div>
                </div>
              </div>
            </div>
          </section>
        </div>
        <footer className="p-6 border-t bg-slate-50"><button onClick={() => onSave(formData as LeaseCard)} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold shadow-lg active:scale-[0.98]">儲存更新內容</button></footer>
      </div>
    </div>
  );
}

// --- 6. 主頁面 ---
export default function CasesPage() {
  const [hasMounted, setHasMounted] = useState(false);
  const [viewMode, setViewMode] = useState<"kanban" | "list">("kanban");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState<DateFilter>("全部");
  const [filterBuilding, setFilterBuilding] = useState<BuildingId | "全部">("全部");

  const [cards, setCards] = useState<LeaseCard[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [pendingMove, setPendingMove] = useState<{ activeId: string; toStage: StageId } | null>(null);

  useEffect(() => {
    setHasMounted(true);
    const q = query(collection(db, "cases"), orderBy("createdAt", "desc"));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const casesData = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id,
      })) as LeaseCard[];
      setCards(casesData);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const filteredCards = useMemo(() => {
    return cards.filter(c => {
      const matchBuilding = filterBuilding === "全部" || c.building === filterBuilding;
      const matchSearch = c.title?.includes(searchQuery) || c.customer?.includes(searchQuery);
      return matchBuilding && matchSearch;
    });
  }, [cards, filterBuilding, searchQuery]);

  const byStage = useMemo(() => {
    const map = new Map<StageId, LeaseCard[]>();
    STAGES.forEach(s => map.set(s.id, []));
    filteredCards.forEach(c => map.get(c.stage)!.push(c));
    return map;
  }, [filteredCards]);

  const handleSave = async (data: LeaseCard) => {
    try {
      if (isCreating) {
        await addDoc(collection(db, "cases"), {
          ...data,
          createdAt: new Date().toISOString().split('T')[0],
          updatedAt: serverTimestamp(),
          stageStartedAt: new Date().toISOString().split('T')[0],
        });
      } else {
        const docRef = doc(db, "cases", data.id);
        const { id, ...updateData } = data;
        await updateDoc(docRef, {
          ...updateData,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (e) {
      console.error("Firebase Error:", e);
    }
    setIsCreating(false); 
    setSelectedId(null);
  };

  const handleConfirmMove = async () => {
    if (pendingMove) {
      const docRef = doc(db, "cases", pendingMove.activeId);
      await updateDoc(docRef, {
        stage: pendingMove.toStage,
        stageStartedAt: new Date().toISOString().split('T')[0],
        updatedAt: serverTimestamp(),
      });
      setPendingMove(null);
    }
  };

  const activeCard = useMemo(() => cards.find(c => c.id === activeId), [activeId, cards]);

  if (!hasMounted || loading) return <div className="flex-1 h-screen flex items-center justify-center bg-slate-50 font-bold text-slate-400 animate-pulse text-sm tracking-widest uppercase">系統資料同步中...</div>;

  return (
    /* 修正：移除 overflow-hidden, 讓整體頁面可以根據內容高度產生原生捲軸 */
    <div className="min-h-screen flex flex-col bg-slate-50/50">
      <header className="p-8 shrink-0 bg-white border-b shadow-sm z-10 sticky top-0">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight italic decoration-blue-500/30 underline">辦公室案件管理</h1>
            <p className="text-sm text-slate-400 mt-2 font-medium">支援多種稅別標籤與自動化財務計算</p>
          </div>
          <div className="flex gap-4 items-center">
            <div className="flex bg-slate-100 p-1 rounded-xl shadow-inner">
              <button onClick={() => setViewMode("kanban")} className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${viewMode === "kanban" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"}`}>看板模式</button>
              <button onClick={() => setViewMode("list")} className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${viewMode === "list" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"}`}>列表模式</button>
            </div>
            <button onClick={() => setIsCreating(true)} className="bg-blue-600 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg hover:bg-blue-700 transition-all">+ 新增案件</button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-5">
          <input type="text" placeholder="搜尋案件或客戶..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-4 pr-10 py-2 border border-slate-200 rounded-xl text-sm w-72 outline-none focus:ring-2 focus:ring-blue-500/20 bg-slate-50/50 transition-all" />
          <div className="flex gap-2">{BUILDINGS.map((b) => (
              <button key={b} onClick={() => setFilterBuilding(b as any)} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${filterBuilding === b ? "bg-slate-800 text-white shadow-md" : "bg-white border border-slate-200 text-slate-500 hover:border-slate-300"}`}>{b}</button>
          ))}</div>
          <div className="w-[1px] h-6 bg-slate-200 mx-2" />
          <div className="flex gap-2 bg-slate-100 p-1.5 rounded-lg">
            {["全部", "今日建立", "本月建立"].map((f) => (
              <button key={f} onClick={() => setDateFilter(f as DateFilter)} className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all ${dateFilter === f ? "bg-white text-slate-800 shadow-sm" : "text-slate-400"}`}>{f}</button>
            ))}
          </div>
        </div>
      </header>

      {/* 修正：由 flex-1 改為 fit-content, 並移除捲軸限制, 讓頁面捲軸接管 */}
      <main className="flex-1 px-8 py-6 overflow-x-auto custom-scrollbar min-h-0">
        {viewMode === "kanban" ? (
          <DndContext sensors={sensors} onDragStart={(e) => setActiveId(String(e.active.id))} onDragEnd={(e) => {
              const { active, over } = e;
              setActiveId(null);
              if (!over) return;
              const aId = String(active.id);
              const oId = String(over.id);
              let toStage = oId as StageId; 
              if (!STAGES.some(s => s.id === oId)) toStage = cards.find(c => c.id === oId)?.stage as StageId;
              if (toStage && cards.find(c => c.id === aId)?.stage !== toStage) setPendingMove({ activeId: aId, toStage });
            }}>
            {/* 修正：使用 min-h-[calc(100vh-250px)] 並設為 flex-stretch 讓白色區塊始終延伸到底部 */}
            <div className="inline-flex gap-8 items-stretch pr-8 min-h-[calc(100vh-280px)]">
              {STAGES.map((s) => (<StageColumn key={s.id} stage={s} cards={byStage.get(s.id) || []} onCardClick={setSelectedId} />))}
            </div>
            {typeof document !== "undefined" && createPortal(
              <DragOverlay dropAnimation={{ duration: 250, easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)' }}>
                {activeCard ? <CardBase item={activeCard} isOverlay /> : null}
              </DragOverlay>, document.body
            )}
          </DndContext>
        ) : (
          <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm min-w-[1000px]">
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-5 font-bold text-slate-700 text-base">案件名稱 / 客戶</th>
                  <th className="px-6 py-5 font-bold text-slate-700 text-base text-center">稅別</th>
                  <th className="px-6 py-5 font-bold text-slate-700 text-base text-right">合約總額</th>
                  <th className="px-6 py-5 font-bold text-slate-700 text-base text-center">停留天數</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCards.map(item => (
                  <tr key={item.id} onClick={() => setSelectedId(item.id)} className="hover:bg-slate-50/50 cursor-pointer transition-colors group">
                    <td className="px-6 py-4"><div className="font-bold text-slate-800 group-hover:text-blue-600 text-base">{item.title}</div><div className="text-xs text-slate-400">{item.customer}</div></td>
                    <td className="px-6 py-4 text-center">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-bold border border-slate-200 ${item.taxType === "應稅(5%)" ? "bg-blue-50 text-blue-600" : "bg-slate-50 text-slate-500"}`}>{item.taxType}</span>
                    </td>
                    <td className="px-6 py-4 font-bold text-slate-800 text-right text-base">{currency(item.totalContractAmount || 0)}</td>
                    <td className="px-6 py-4 text-center"><span className={`font-mono font-bold text-sm ${getDaysDiff(item.stageStartedAt) >= 7 ? "text-red-500" : "text-slate-500"}`}>{getDaysDiff(item.stageStartedAt)} 天</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
      
      <DetailDrawer item={cards.find(c => c.id === selectedId) || null} isCreate={isCreating} onClose={() => { setSelectedId(null); setIsCreating(false); }} onSave={handleSave} />
      
      <ConfirmModal 
        show={!!pendingMove} 
        onConfirm={handleConfirmMove} 
        onCancel={() => setPendingMove(null)} 
        stageId={pendingMove?.toStage || null} 
        cardTitle={cards.find(c => c.id === pendingMove?.activeId)?.title || "案件"} 
      />

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          height: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f1f5f9;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }
      `}</style>
    </div>
  );
}