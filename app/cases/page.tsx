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
import { db, auth } from "@/lib/firebase"; 
import { onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";
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
  stage: StageId;
  updatedAt: any;
  stageStartedAt: string; 
  stageEndedAt?: string;  
  stageHistory?: { [key: string]: string }; 
  createdAt: string;
  todos?: TodoItem[]; 
  attachments?: Attachment[];
}

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
  const start = new Date(item.stageStartedAt);
  const end = (item.stage === "S7" || item.stage === "S8") && item.stageEndedAt 
    ? new Date(item.stageEndedAt) 
    : new Date();
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

function RequiredLabel({ children, className = "" }: { children: React.ReactNode, className?: string }) {
  return (
    <label className={`text-xs font-bold flex items-center gap-0.5 ${className}`}>
      {children} <span className="text-red-500">*</span>
    </label>
  );
}

function CardBase({ item, isOverlay = false }: { item: LeaseCard; isOverlay?: boolean }) {
  const days = getDisplayDays(item);
  const isFinalStage = item.stage === "S7" || item.stage === "S8";
  const badgeStyle = isFinalStage 
    ? "bg-slate-400 text-white" 
    : (days >= 7 ? "bg-red-500 text-white" : days >= 3 ? "bg-amber-400 text-white" : "bg-emerald-500 text-white");

  return (
    <div 
      style={{ backgroundColor: "#E6F7FF" }}
      className={`relative rounded-xl border border-slate-200 p-4 shadow-sm transition-all ${
      isOverlay ? "shadow-2xl ring-2 ring-blue-500 scale-105 cursor-grabbing" : "hover:ring-2 hover:ring-blue-400 cursor-grab"
    }`}>
      <div className="flex justify-between items-start mb-2">
        <div className="text-sm font-bold text-slate-800 line-clamp-1 pr-12">{item.companyName}</div>
        <div className={`absolute top-3 right-3 px-2 py-0.5 rounded text-[10px] font-bold shadow-sm ${badgeStyle}`}>
          {isFinalStage ? `耗時 ${days}天` : `停留 ${days}天`}
        </div>
      </div>
      <div className="mb-2">
        <span className="bg-orange-500 text-white text-[10px] font-bold px-2.5 py-1 rounded shadow-sm italic">辦公室出租</span>
      </div>
      <div className="flex items-center gap-2 mb-3">
        <div className="text-[11px] text-slate-400 font-medium">{item.contactPerson}</div>
        <span className={`text-[9px] px-1 rounded border border-slate-200 font-bold ${item.taxType === "應稅(5%)" ? "bg-blue-50 text-blue-500" : "bg-slate-50 text-slate-500"}`}>
          {item.taxType}
        </span>
      </div>
      <div className="flex justify-between items-end mt-auto">
        <div className="space-y-1">
          <div className="text-[10px] font-bold bg-slate-100/50 text-slate-600 px-1.5 py-0.5 rounded w-fit italic border border-slate-200">{item.building}</div>
          <div className="text-sm font-bold text-blue-600">{currency(item.totalContractAmount)}</div>
        </div>
        <div className="text-right">
          <div className="text-[9px] text-slate-400">信件: {item.mailNo || "-"}</div>
          <div className="text-[10px] text-slate-500 font-bold">房號: {item.roomNo || "未定"}</div>
        </div>
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
  return (
    <div ref={setNodeRef} className="flex h-full w-[320px] flex-col rounded-2xl border border-slate-200 bg-white shadow-sm shrink-0 self-stretch overflow-hidden text-slate-800">
      <div className="p-4 pb-3 shrink-0 bg-white text-slate-800">
        <h3 className="font-bold text-sm text-slate-800 flex items-center justify-between">
          {stage.title}
          <span className="bg-slate-200/50 text-slate-500 text-[10px] px-2 py-0.5 rounded-full font-bold">{(cards || []).length}</span>
        </h3>
        <div className="mt-3 h-px bg-slate-100" />
      </div>
      <SortableContext items={(cards || []).map(x => x.id)} strategy={verticalListSortingStrategy}>
        <div className="flex-1 min-h-0 px-4 pt-4 pb-12 space-y-4 overflow-y-auto custom-scrollbar">
          {(cards || []).map(item => <SortableCard key={item.id} item={item} onClick={() => onCardClick(item.id)} />)}
          {(cards || []).length === 0 && <div className="min-h-[140px] border-2 border-dashed border-slate-100 rounded-xl bg-slate-50/40" />}
        </div>
      </SortableContext>
    </div>
  );
}

function DetailDrawer({ item, isCreate, onClose, onSave, onDelete, currentUser }: { item: LeaseCard | null; isCreate: boolean; onClose: () => void; onSave: (data: LeaseCard) => void; onDelete: (id: string) => void; currentUser: string }) {
  const [formData, setFormData] = useState<Partial<LeaseCard>>({});
  const [activeTab, setActiveTab] = useState<"info" | "todo" | "copy" | "history">("info");
  const [history, setHistory] = useState<HistoryLog[]>([]);

  useEffect(() => {
    const defaultTodos: TodoItem[] = FIXED_TODO_LIST.map((text, index) => ({
      id: `fixed-${index}`, text, completed: false
    }));

    if (isCreate) {
      setFormData({
        id: `L-${Date.now()}`, stage: "S1", building: "四維館", stageStartedAt: new Date().toISOString().split('T')[0], createdAt: new Date().toISOString().split('T')[0], updatedAt: "",
        monthlyRent: 0, actualRentExclTax: 0, actualRentInclTax: 0, contractMonths: 0, totalContractAmount: 0, 
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
      const q = query(collection(db, "cases", item.id, "logs"), orderBy("timestamp", "desc"));
      return onSnapshot(q, (snapshot) => {
        setHistory(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as HistoryLog[]);
      });
    }
  }, [item?.id, isCreate]); 

  useEffect(() => {
    const months = calculateMonths(formData.contractStartDate, formData.contractEndDate);
    const multiplier = formData.taxType === "應稅(5%)" ? 1.05 : 1;
    const inclTax = Math.round((formData.actualRentExclTax || 0) * multiplier);
    const total = inclTax * months;
    setFormData(prev => ({ ...prev, contractMonths: months, actualRentInclTax: inclTax, totalContractAmount: total }));
  }, [formData.contractStartDate, formData.contractEndDate, formData.actualRentExclTax, formData.taxType]);

  const addLogLocal = async (action: string) => {
    if (!item?.id) return;
    await addDoc(collection(db, "cases", item.id, "logs"), { action, user: currentUser, timestamp: serverTimestamp() });
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

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    alert("內容已複製到剪貼簿！");
  };

  const handleValidateAndSave = () => {
    if (!formData.companyName || !formData.contactPerson) {
      alert("⚠️ 請檢查必填欄位！");
      return;
    }
    onSave(formData as LeaseCard);
  };

  if (!item && !isCreate) return null;

  return (
    <div className="fixed inset-0 z-[300] flex justify-end font-sans text-slate-800">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-300">
        <header className="p-6 border-b flex flex-col gap-4 bg-white shrink-0 text-slate-800">
          <div className="flex justify-between items-center text-slate-800">
            <h2 className="text-xl font-bold">{isCreate ? "🆕 新增出租案件" : "📝 編輯案件詳情"}</h2>
            <button onClick={onClose} className="text-slate-400 text-2xl hover:text-slate-600 transition-colors">✕</button>
          </div>
          {!isCreate && (
            <div className="flex gap-6 border-b border-slate-100 text-slate-800">
              <button onClick={() => setActiveTab("info")} className={`pb-2 px-1 text-sm font-bold transition-all ${activeTab === "info" ? "text-blue-600 border-b-2 border-blue-600" : "text-slate-400"}`}>基本資訊</button>
              <button onClick={() => setActiveTab("todo")} className={`pb-2 px-1 text-sm font-bold transition-all ${activeTab === "todo" ? "text-blue-600 border-b-2 border-blue-600" : "text-slate-400"}`}>待辦清單</button>
              <button onClick={() => setActiveTab("copy")} className={`pb-2 px-1 text-sm font-bold transition-all ${activeTab === "copy" ? "text-blue-600 border-b-2 border-blue-600" : "text-slate-400"}`}>內容複製</button>
              <button onClick={() => setActiveTab("history")} className={`pb-2 px-1 text-sm font-bold transition-all ${activeTab === "history" ? "text-blue-600 border-b-2 border-blue-600" : "text-slate-400"}`}>歷程記錄</button>
            </div>
          )}
        </header>

        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          {activeTab === "info" && (
            <div className="space-y-10">
              <section className="space-y-4">
                <h3 className="text-sm font-bold border-l-4 border-blue-600 pl-3 uppercase tracking-widest text-slate-800">基本資訊</h3>
                <div className="grid grid-cols-2 gap-6 text-slate-800">
                  <div className="col-span-2 space-y-2">
                    <RequiredLabel>所屬館別</RequiredLabel>
                    <div className="flex flex-wrap gap-2 text-slate-800">
                      {BUILDINGS.map(b => (
                        <button key={b} type="button" onClick={() => setFormData({...formData, building: b})} className={`px-4 py-2 text-xs font-bold rounded-xl border transition-all ${formData.building === b ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-500 border-slate-200 text-slate-800"}`}>{b}</button>
                      ))}
                    </div>
                  </div>
                  <div className="col-span-2 text-slate-800"><RequiredLabel>公司/案件全銜</RequiredLabel><input placeholder="大騰有限公司" value={formData.companyName || ""} onChange={e => setFormData({...formData, companyName: e.target.value})} className="w-full border-b py-2 text-sm outline-none focus:border-blue-600 font-medium text-slate-800" /></div>
                  <div className="text-slate-800"><RequiredLabel>主要窗口姓名</RequiredLabel><input placeholder="聯絡人姓名" value={formData.contactPerson || ""} onChange={e => setFormData({...formData, contactPerson: e.target.value})} className="w-full border-b py-2 text-sm outline-none focus:border-blue-600 font-medium text-slate-800" /></div>
                  <div className="text-slate-800"><label className="text-xs font-bold text-slate-500 block mb-1">聯絡電話</label><input placeholder="09XX..." value={formData.phone || ""} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full border-b py-2 text-sm outline-none focus:border-blue-600 font-medium text-slate-800" /></div>
                  <div className="text-slate-800"><label className="text-xs font-bold text-slate-500 block mb-1">公司統編</label><input placeholder="8碼數字" value={formData.taxId || ""} onChange={e => setFormData({...formData, taxId: e.target.value})} className="w-full border-b py-2 text-sm outline-none focus:border-blue-600 font-medium text-slate-800" /></div>
                  <div className="text-slate-800"><label className="text-xs font-bold text-slate-500 block mb-1">房號</label><input placeholder="例如：A01" value={formData.roomNo || ""} onChange={e => setFormData({...formData, roomNo: e.target.value})} className="w-full border-b py-2 text-sm outline-none focus:border-blue-600 font-medium text-slate-800" /></div>
                  <div className="text-slate-800"><label className="text-xs font-bold text-slate-500 block mb-1">信件編號</label><input placeholder="輸入信件掛號編號或備註" value={formData.mailNo || ""} onChange={e => setFormData({...formData, mailNo: e.target.value})} className="w-full border-b py-2 text-sm outline-none focus:border-blue-600 font-medium text-slate-800" /></div>
                  <div className="col-span-2 text-slate-800">
                    <label className="text-xs font-bold text-slate-500 block mb-1">業務備註 (僅供內部紀錄)</label>
                    <textarea placeholder="輸入業務開發相關細節或後續追蹤備註..." value={formData.salesNote || ""} onChange={e => setFormData({...formData, salesNote: e.target.value})} className="w-full border rounded-xl p-3 text-sm outline-none focus:border-blue-600 min-h-[100px] text-slate-800 bg-slate-50/50" />
                  </div>
                </div>
              </section>

              <section className="space-y-4">
                <h3 className="text-sm font-bold border-l-4 border-indigo-500 pl-3 uppercase tracking-widest text-slate-800">合約與附件檔案</h3>
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                  <div className="flex items-center gap-2 mb-4">
                    <input type="text" placeholder="輸入雲端硬碟連結 (如: Google Drive)" className="flex-1 border-b py-2 text-sm outline-none focus:border-indigo-600 bg-transparent text-slate-800" id="attach_input" />
                    <button onClick={() => {
                      const input = document.getElementById('attach_input') as HTMLInputElement;
                      if (!input.value) return;
                      const newAttach = { name: "合約文件/參考資料", url: input.value, uploadedAt: new Date().toLocaleDateString() };
                      setFormData({ ...formData, attachments: [...(formData.attachments || []), newAttach] });
                      input.value = "";
                    }} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-xs font-bold shadow-sm">+ 新增連結</button>
                  </div>
                  <div className="space-y-2">
                    {(formData.attachments || []).map((file, i) => (
                      <div key={i} className="flex justify-between items-center bg-white p-3 rounded-xl border border-slate-100 shadow-sm text-slate-800">
                        <div className="flex items-center gap-2 overflow-hidden">
                          <span className="text-lg">📄</span>
                          <div className="truncate">
                            <p className="text-xs font-bold truncate text-slate-800">{file.name}</p>
                            <p className="text-[10px] text-slate-400">{file.uploadedAt}</p>
                          </div>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <a href={file.url} target="_blank" className="text-blue-500 text-xs font-bold hover:underline">查看</a>
                          <button onClick={() => setFormData({ ...formData, attachments: formData.attachments?.filter((_, idx) => idx !== i) })} className="text-red-400 text-xs font-bold">移除</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <section className="space-y-4">
                <h3 className="text-sm font-bold border-l-4 border-emerald-500 pl-3 uppercase tracking-widest text-slate-800">財務與週期</h3>
                <div className="bg-emerald-50/30 p-6 rounded-2xl border border-emerald-100 space-y-6">
                  <div className="grid grid-cols-2 gap-6 text-slate-800">
                    <div><label className="text-xs font-bold text-slate-500 block mb-1">信件處理 (稅別)</label>
                      <select value={formData.taxType || "應稅(5%)"} onChange={e => setFormData({...formData, taxType: e.target.value as TaxType})} className="w-full border-b border-emerald-200 py-2 text-sm font-bold bg-transparent outline-none text-slate-800">
                        <option value="應稅(5%)">應稅(5%)</option><option value="免稅/未稅">免稅/未稅</option>
                      </select>
                    </div>
                    <div><label className="text-xs font-bold text-slate-500 block mb-1">繳費週期</label>
                      <select value={formData.paymentCycle || "月繳"} onChange={e => setFormData({...formData, paymentCycle: e.target.value})} className="w-full border-b border-emerald-200 py-2 text-sm font-bold bg-transparent outline-none text-slate-800">
                        <option value="月繳">月繳</option><option value="季繳">季繳</option><option value="半年繳">半年繳</option><option value="年繳">年繳</option>
                      </select>
                    </div>
                    <div><label className="text-xs font-bold text-slate-500">合約起日</label><input type="date" value={formData.contractStartDate || ""} onChange={e => setFormData({...formData, contractStartDate: e.target.value})} className="w-full border-b border-emerald-200 py-2 text-sm font-bold bg-transparent outline-none text-slate-800" /></div>
                    <div><label className="text-xs font-bold text-slate-500">合約迄日</label><input type="date" value={formData.contractEndDate || ""} onChange={e => setFormData({...formData, contractEndDate: e.target.value})} className="w-full border-b border-emerald-200 py-2 text-sm font-bold bg-transparent outline-none text-slate-800" /></div>
                    <div><label className="text-xs font-bold text-slate-500">實際月租 (未稅)</label><input type="number" value={formData.actualRentExclTax || ""} onChange={e => setFormData({...formData, actualRentExclTax: Number(e.target.value)})} className="w-full border-b border-emerald-200 py-2 text-sm font-bold bg-transparent outline-none text-slate-800" /></div>
                  </div>
                  <div className="pt-4 flex justify-between items-center border-t border-emerald-100">
                    <span className="text-xs font-bold text-slate-400 text-slate-800">總金額 (含稅結果):</span>
                    <span className="text-lg font-black text-emerald-700">{currency(formData.totalContractAmount || 0)}</span>
                  </div>
                </div>
              </section>
            </div>
          )}

          {activeTab === "todo" && (
            <div className="space-y-6">
              <h3 className="text-sm font-bold border-l-4 border-amber-500 pl-3 uppercase tracking-widest text-slate-800">固定服務檢查清單</h3>
              <div className="space-y-3 mt-4">
                {(formData.todos || []).map(todo => (
                  <div key={todo.id} className="flex items-start gap-4 p-4 bg-slate-50 rounded-xl border border-slate-100 hover:border-amber-200 transition-colors text-slate-800">
                    <input type="checkbox" checked={todo.completed} onChange={() => handleToggleTodo(todo.id)} className="mt-1 w-6 h-6 accent-amber-500 cursor-pointer shadow-sm text-slate-800" />
                    <div className="flex-1">
                      <p className={`text-base font-bold ${todo.completed ? "line-through text-slate-400" : "text-slate-800"}`}>{todo.text}</p>
                      {todo.completed && (
                        <p className="text-[10px] text-slate-400 mt-1 font-medium italic">✓ 由 {todo.completedBy} 於 {todo.completedAt} 完成</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "copy" && (
            <div className="space-y-8">
              <h3 className="text-sm font-bold border-l-4 border-purple-600 pl-3 uppercase tracking-widest text-slate-800">內容快速複製</h3>
              <div className="space-y-6 text-slate-800">
                {[
                  { label: "S1 初步諮詢 - 需求蒐集", content: "感謝您的來訊！ 可以簡單提供以下資料或詳細說明,有助於提供最合適您的辦公室~ \n預計使用人數： \n預算範圍： \n方便參觀時間： \n我們將立即安排專員與您聯繫，提供專屬方案 「我們不是最便宜，但最划算——讓創業者安心、快速展開。」" },
                  { label: "S1 初步諮詢 - 報價制度說明", content: "我們的報價採全包制，已包含物業管理、高速網路、水費以及公共區域清潔。電費部分則是採獨立電表計算（或視專案包含），讓您的營運成本更單純好控管。" },
                  { label: "S1 初步諮詢 - 彈性方案推薦", content: "沒問題！我們提供高度彈性的租期方案，從單日行動位到按月計費的獨立辦公室皆有。請問您預計的使用人數與起始日期是？" },
                  { label: "S3 方案建議 - 3個首選方案", content: "您好，感謝您的耐心等待！根據您的需求，我整理了以下 3 個首選方案：\n\n【方案建議】\n[型號 A]：高效率空間，約 $[金額]/月（專注首選）\n[型號 B]：大面採光間，約 $[金額]/月（形象首選）\n[型號 C]：高 CP 值基本間，約 $[金額]/月（創業首選）\n\n【選擇我們的隱形優勢】\n真正全包：免水電、管理費、清潔費，營運成本超單純。\n企業門面：專業秘書接待訪客，提升您的商務形象。\n即刻入駐：桌椅俱全，省下裝潢與等待時間，帶電腦即可開工。\n優質社群：定期舉辦商務連結活動，入駐即擁有現成資源。\n\n照片看百遍，不如現場看一遍。本週 [日期/時間] 方便" },
                  { label: "S3 方案建議 - 簽約優惠爭取", content: "這份報價已包含目前最完整的商務配套。如果您願意一次簽約一年（年繳），或是近期內完成簽約，我可以幫您向公司爭取額外的優惠折扣或贈送會議室時數。" },
                  { label: "S4 邀請參觀 - 現場感官體驗", content: "以上是為您初步篩選的空間方案。照片與規格只能呈現硬體，辦公室的氛圍與服務能量建議您親自感受。建議撥冗 30 分鐘現場參觀，邀請您過來喝杯咖啡，親自確認空間細節嗎？現場參觀將能為您爭取更合適的入駐優惠！我能現場為您說明入駐後的商務資源與配套服務。\n您可以跟我說一個方便的時段?" },
                  { label: "S4 邀請參觀 - 續約通知彈性", content: "合約條款是為了保障雙方的營運權益。關於您在意的部分，我們可以討論是否透過縮短續約通知期來增加彈性，這樣對您的風險較低，也不會更動到核心合約架構。" },
                  { label: "S4 邀請參觀 - 隔間工程需求", content: "我們提供的是『即租即用』的標準配置，能讓您省下大筆裝潢費。\n若有特殊隔間或插座需求，您可以選擇自行委託廠商（退租時恢復原狀即可），或由我們配合的特約工程團隊代為施工。使用特約團隊的優點是：他們對本中心管線與消防法規非常熟悉，能省去您找工班與溝通的麻煩，確保合規且高效。\n\n您希望針對哪個位置做調整？我可以請工程部先幫您初步評估可行性。" },
                  { label: "S5 正式報價 - 報價單確認", content: "您好，感謝您先前的溝通與確認。附件為您準備的正式書面報價單，內容已包含稅金、管理費及等其他各項商務配套。\n\n針對我們先前討論的客製化需求（如：[填入需求項目]），我已將其一併納入此份報價說明中。此方案與保留間別的有效期限至 [日期]，建議您先行參閱以確保您的入駐權益。\n\n若報價內容確認無誤，我們即可對租期或搬遷時程做最終確認。如有任何需要調整的地方，歡迎隨時告訴我！" },
                  { label: "S6 議價協商 - 事業夥伴價值", content: "您好，針對您的預算考量，我們更希望透過『共好』模式支持您的事業。除了租金外，入駐我們這裡您將獲得：\n\n管理提效：提供標準化內部管理系統.\n商務資源：享有專屬的輕分享與社群活動。\n\n專業後援：秘書團隊作為您的企業門面接待訪客，並提供靈活的空間擴張彈性，降低營運風險。\n\n我們不只是租賃空間，更是您的事業夥伴。若您認同這份價值，我將為您申請最優化的 [租期/年繳] 方案，讓我們一起在這裡成長！" },
                  { label: "S6 議價協商 - 會議室時數爭取", content: "若預算上有特定考量，除了租金外，我也能試試為您爭取每月額外的 [小時] 小時會議室使用時數，或是郵件代收發的加值服務。這對經常有訪客接待需求的團隊來說非常實用。您覺得這樣是否能讓整體方案更符合您的需求？" },
                  { label: "S7 簽約確認 - 入駐條件總結", content: "您好，感謝您對我們的喜愛！為確保入駐流程精準無誤，我已將我們先前達成的共識整理如下，請您協助確認：\n\n【入駐條件總結】\n合約期間：[起始日] 至 [結束日]，共計 [月數] 個月。\n空間費用：月租金 $[金額]（含稅/含管），本次需支付 [押金月數] 個月押金與首月租金。\n繳費方式：採 [年繳 / 季繳 / 月繳] 方式。\n特殊約定：包含之前確認的 [例如：免租裝修期天數、贈送會議室時數、特定硬體改裝等]。" },
                  { label: "S7 簽約確認 - 基本資料蒐集", content: "手打資訊回覆\n公司名稱：\n負責人姓名：\n統一編號（若未取得可留空）：\n聯繫地址：\n聯繫電話：\n授權代表或緊急聯絡人：\n緊急聯絡人電話：\n請款單寄送 Email 信箱：\n👉 並提供: 負責人身分證正反面拍照、營登\n1️⃣ 公司大小章\n2️⃣ 費用 匯款/現金\n「我們的行政與秘書群，將全程協助您順利完成登記與進場。」" },
                  { label: "S7 簽約確認 - 合約保留通知", content: "合約已寄至您的信箱，請於 3 日內確認內容並完成訂金匯款，以利為您保留該空間位子。" },
                  { label: "S7 簽約確認 - 歡迎入駐引導", content: "親愛的___________您好，\n📌簽立合約: 線上/現場\n📌租金與押金:匯款/現金\n📌安排進場與設備交接\n付款完成後，我們將協助安排進場時間，並說明門禁、空間使用方式與設備操作。 若有任何特殊需求（如公司報帳流程、進場時間、客製家具等），我們將盡力協助。\n歡迎你們 ~~" },
                  { label: "S8 資訊入系統 - 入駐懶人包", content: "歡迎入駐！這是您的入駐懶人包與相關系統設定。\n在道騰，登記只是開始，想盡辦法幫助您們成功，才是我們真正的服務。\n以下是《道騰國際商務中心 顧客成功問卷》 https://reurl.cc/lYGlq6\n邀請您們團隊的每位同仁填寫。\n歡迎來到道騰，有你們真好!!\n\n全區 Wi-Fi\n帳號：Dao Teng 21F A區/B區（或 20F/27F/28F）\n密碼：1234567890\n現磨咖啡：每杯 30 元，收益全數捐贈慈善機構。\n空調提醒：20F/21F 為中央空調，非上班時間預設送風模式。\n\n我們非常樂意協助舉辦活動，一起同樂！有想法隨時分享～\nWish you a wonderful office life." },
                  { label: "S2 對齊需求 - 空間規格提供", content: "感謝您提供的資訊，為了預備最合適您的辦公室方案，這裡先提供我們目前的空間規格給您參考。" },
                ].map((item, idx) => (
                  <div key={idx} className="group relative bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <label className="text-xs font-bold text-purple-600 block mb-2 text-slate-800">{item.label}</label>
                    <p className="text-sm whitespace-pre-wrap leading-relaxed pr-10 text-slate-800">{item.content}</p>
                    <button onClick={() => handleCopy(item.content)} className="absolute top-4 right-4 text-slate-400 hover:text-purple-600 transition-colors" title="點擊複製">📋</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "history" && (
            <div className="space-y-8">
              <section className="space-y-4">
                <h3 className="text-sm font-bold border-l-4 border-blue-600 pl-3 uppercase tracking-widest text-slate-800 text-slate-800">各階段停留天數分析</h3>
                <div className="grid grid-cols-2 gap-4 bg-blue-50/50 p-4 rounded-xl border border-blue-100 text-slate-800">
                  {STAGES.map(s => {
                    const entryDate = formData.stageHistory?.[s.id];
                    let duration = "-";
                    if (entryDate) {
                      const start = new Date(entryDate);
                      const nextStage = STAGES[STAGES.findIndex(x => x.id === s.id) + 1];
                      const end = formData.stageHistory?.[nextStage?.id || ''] 
                        ? new Date(formData.stageHistory[nextStage.id]) 
                        : (formData.stageEndedAt && (s.id === "S7" || s.id === "S8") ? new Date(formData.stageEndedAt) : new Date());
                      const diff = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
                      duration = `${diff} 天`;
                    }
                    return (
                      <div key={s.id} className="flex justify-between items-center p-2 border-b border-blue-100 last:border-0 text-slate-800">
                        <span className="text-xs font-bold text-blue-800">{s.title}</span>
                        <span className="text-sm font-black text-slate-700">{duration}</span>
                      </div>
                    );
                  })}
                </div>
              </section>
              <section className="space-y-4">
                <h3 className="text-sm font-bold border-l-4 border-slate-400 pl-3 uppercase tracking-widest text-slate-800 text-slate-800">詳細操作歷史</h3>
                <div className="relative border-l-2 border-slate-100 ml-2 pl-6 space-y-8 mt-4 text-slate-800">
                  {history.map(log => (
                    <div key={log.id} className="relative text-slate-800 text-slate-800">
                      <div className="absolute -left-[31px] top-1 w-2.5 h-2.5 rounded-full bg-slate-200 border-2 border-white text-slate-800" />
                      <div className="text-[11px] text-slate-400 font-medium mb-1 text-slate-800">{log.timestamp?.toDate().toLocaleString() || "剛才"}</div>
                      <div className="text-sm text-slate-700 leading-relaxed font-medium bg-slate-50 p-3 rounded-lg border border-slate-100 shadow-sm text-slate-800">{log.action} <span className="text-slate-400 text-xs ml-1 font-normal">by {log.user}</span></div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}
        </div>

        {activeTab === "info" && (
          <footer className="p-6 border-t bg-slate-50 flex gap-4 shrink-0 text-slate-800 text-slate-800">
            {!isCreate && <button type="button" onClick={() => { if(confirm("確定刪除？")) onDelete(formData.id!); }} className="px-6 py-4 rounded-2xl font-bold border border-red-200 text-red-500 hover:bg-red-50 shadow-sm transition-all text-slate-800">刪除案件</button>}
            <button type="button" onClick={handleValidateAndSave} className="flex-1 bg-slate-900 text-white py-4 rounded-2xl font-bold shadow-lg hover:bg-black transition-all">儲存內容並記錄</button>
          </footer>
        )}
      </div>
    </div>
  );
}

export default function CasesPage() {
  const router = useRouter();
  const [hasMounted, setHasMounted] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [searchQuery, setSearchQuery] = useState("");
  const [cards, setCards] = useState<LeaseCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [currentUser, setCurrentUser] = useState<string>("ADMIN");

  useEffect(() => {
    setHasMounted(true);
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => { 
      if (!user) router.push("/login"); 
      else setCurrentUser(user.email || user.displayName || "Unknown User");
    });
    const unsubscribeData = onSnapshot(query(collection(db, "cases"), orderBy("createdAt", "desc")), (snapshot) => {
      setCards(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as LeaseCard[]);
      setLoading(false);
    });
    return () => { unsubscribeAuth(); unsubscribeData(); };
  }, [router]);

  const addLogExternal = async (caseId: string, action: string) => {
    await addDoc(collection(db, "cases", caseId, "logs"), { action, user: currentUser, timestamp: serverTimestamp() });
  };

  const handleSave = async (data: LeaseCard) => {
    try {
      const { id, ...rest } = data;
      const saveData = { ...rest, updatedAt: serverTimestamp() };
      
      if (isCreating) {
        const newRef = await addDoc(collection(db, "cases"), { ...saveData, createdAt: new Date().toISOString().split('T')[0], stageStartedAt: new Date().toISOString().split('T')[0] });
        await addDoc(collection(db, "cases", newRef.id, "logs"), { action: "建立了新案件", user: currentUser, timestamp: serverTimestamp() });
      } else {
        await updateDoc(doc(db, "cases", id), saveData);
      }

      const memberQuery = query(collection(db, "members"), where("companyName", "==", data.companyName));
      const memberSnap = await getDocs(memberQuery);
      const memberInfo = {
        companyName: data.companyName,
        contactPerson: data.contactPerson,
        phone: data.phone || "",
        taxId: data.taxId || "",
        updatedAt: serverTimestamp(),
      };

      if (memberSnap.empty) {
        await addDoc(collection(db, "members"), { ...memberInfo, tags: ["辦公室管理"], createdAt: serverTimestamp() });
      } else {
        const memberId = memberSnap.docs[0].id;
        const currentTags = memberSnap.docs[0].data().tags || [];
        const newTags = currentTags.includes("辦公室管理") ? currentTags : [...currentTags, "辦公室管理"];
        await updateDoc(doc(db, "members", memberId), { ...memberInfo, tags: newTags });
      }

      setIsCreating(false); setSelectedId(null);
    } catch (e) { alert("儲存失敗"); }
  };

  const byStage = useMemo(() => {
    const map = new Map<StageId, LeaseCard[]>();
    STAGES.forEach(s => map.set(s.id, []));
    cards.filter(c => (c.companyName || "").toLowerCase().includes(searchQuery.toLowerCase())).forEach(c => {
      if (map.has(c.stage)) map.get(c.stage)!.push(c);
    });
    return map;
  }, [cards, searchQuery]);

  const activeCard = useMemo(() => cards.find(c => c.id === activeId), [activeId, cards]);

  if (!hasMounted || loading) return <div className="h-screen flex items-center justify-center font-bold text-slate-400 text-slate-800">正在與雲端資料庫同步...</div>;

  return (
    <div className="fixed inset-0 left-[260px] flex flex-col bg-slate-50/50 font-sans overflow-hidden text-slate-800 text-slate-800">
      <header className="p-8 shrink-0 bg-white border-b shadow-sm z-10 text-slate-800 text-slate-800">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold italic underline decoration-blue-500/30 text-slate-800">辦公室案件管理</h1>
          <button onClick={() => setIsCreating(true)} className="bg-slate-900 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg hover:bg-black transition-all">+ 新增案件</button>
        </div>
        <input type="text" placeholder="搜尋公司名稱..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-4 pr-10 py-2 border border-slate-200 rounded-xl text-sm w-72 outline-none focus:ring-4 focus:ring-blue-500/10 bg-slate-50/50 text-slate-800 text-slate-800" />
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
                const historyUpdate = { ...card?.stageHistory, [toStage]: today };
                const updatePayload: any = { stage: toStage, stageStartedAt: today, stageHistory: historyUpdate, updatedAt: serverTimestamp() };
                if (toStage === "S7" || toStage === "S8") updatePayload.stageEndedAt = today;
                else updatePayload.stageEndedAt = null;

                updateDoc(doc(db, "cases", aId), updatePayload);
                addLogExternal(aId, `將案件從 ${card?.stage} 變更至 ${toStage}`);
              }
            }
          }}>
            <div className="inline-flex h-full min-h-0 gap-8 items-stretch pr-8 pb-8 text-slate-800">
              {STAGES.map((s) => (
                <StageColumn key={s.id} stage={s} cards={byStage.get(s.id) || []} onCardClick={setSelectedId} />
              ))}
            </div>
            {createPortal(<DragOverlay dropAnimation={null}>{activeCard ? <CardBase item={activeCard} isOverlay /> : null}</DragOverlay>, document.body)}
          </DndContext>
        </div>
      </main>
      <DetailDrawer item={cards.find(c => c.id === selectedId) || null} isCreate={isCreating} onClose={() => { setSelectedId(null); setIsCreating(false); }} onSave={handleSave} onDelete={async (id) => { await deleteDoc(doc(db, "cases", id)); setSelectedId(null); }} currentUser={currentUser} />
      <style jsx global>{` 
        .board-scroll { scrollbar-gutter: stable; }
        .custom-scrollbar::-webkit-scrollbar { height: 12px; width: 6px; } 
        .custom-scrollbar::-webkit-scrollbar-track { background: #f1f5f9; } 
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 999px; border: 3px solid #f1f5f9; } 
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; } 
      `}</style>
    </div>
  );
}