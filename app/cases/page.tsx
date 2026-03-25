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
import { useRouter } from "next/navigation";
import { db, auth} from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
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
        <span className="bg-blue-600 text-white text-[10px] font-bold px-2.5 py-1 rounded shadow-sm ">辦公室出租</span>
      </div>
      <div className="flex items-center gap-2 mb-3">
        <div className="text-[11px] text-slate-400 font-medium">窗口:{item.contactPerson}</div>
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
  const [templates, setTemplates] = useState<{id: string, label: string, content: string}[]>([]);

  // 1. 修正後的資料載入 useEffect
  useEffect(() => {
    const defaultTodos: TodoItem[] = FIXED_TODO_LIST.map((text, index) => ({
      id: `fixed-${index}`, text, completed: false
    }));

    if (isCreate) {
      setFormData({
        id: `L-${Date.now()}`, stage: "S1", building: "四維館", stageStartedAt: new Date().toISOString().split('T')[0], createdAt: new Date().toISOString(), updatedAt: "",
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

  // ✅ 這是修正後不會報錯的版本
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 💡 直接使用瀏覽器暫存網址，不經過 Firebase Storage
    const newAttachment: Attachment = {
      name: file.name,
      url: URL.createObjectURL(file), // 💡 產生暫時網址
      uploadedAt: new Date().toISOString()
    };

    const updatedAttachments = [...(formData.attachments || []), newAttachment];
    
    // 更新本地顯示
    setFormData(prev => ({ ...prev, attachments: updatedAttachments }));
    
    if (!isCreate) {
      addLogLocal(`已讀取附件預覽: ${file.name}`);
    }
    
    alert(`已讀取「${file.name}」預覽（重新整理後失效）`);
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
      <div className="relative w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col overflow-hidden">
        <header className="p-6 border-b flex flex-col gap-4 bg-white shrink-0">
          <div className="flex justify-between items-center text-slate-800">
            <h2 className="text-xl font-bold">{isCreate ? "🆕 新增出租案件" : "📝 編輯案件詳情"}</h2>
            <button onClick={onClose} className="text-slate-400 text-2xl hover:text-slate-600">✕</button>
          </div>
          {!isCreate && (
            <div className="flex gap-6 border-b border-slate-100">
              {["info", "todo", "copy", "history"].map((tab) => (
                <button key={tab} onClick={() => setActiveTab(tab as any)} className={`pb-2 px-1 text-sm font-bold transition-all ${activeTab === tab ? "text-blue-600 border-b-2 border-blue-600" : "text-slate-400"}`}>
                  {tab === "info" ? "基本資訊" : tab === "todo" ? "待辦清單" : tab === "copy" ? "內容複製" : "歷程記錄"}
                </button>
              ))}
            </div>
          )}
        </header>

        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          {activeTab === "info" && (
            <div className="space-y-10 text-slate-800">
              <section className="space-y-4">
                <h3 className="text-sm font-bold border-l-4 border-blue-600 pl-3 uppercase tracking-widest">基本資訊</h3>
                <div className="grid grid-cols-2 gap-6">
                  <div className="col-span-2 space-y-2">
                    <RequiredLabel>所屬館別</RequiredLabel>
                    <div className="flex flex-wrap gap-2">
                      {BUILDINGS.map(b => (
                        <button key={b} type="button" onClick={() => setFormData({...formData, building: b})} className={`px-4 py-2 text-xs font-bold rounded-xl border transition-all ${formData.building === b ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-500 border-slate-200"}`}>{b}</button>
                      ))}
                    </div>
                  </div>
                  <div className="col-span-2"><RequiredLabel>公司/案件全銜</RequiredLabel><input value={formData.companyName || ""} onChange={e => setFormData({...formData, companyName: e.target.value})} className="w-full border-b py-2 text-sm outline-none focus:border-blue-600" /></div>
                  <div><RequiredLabel>主要窗口姓名</RequiredLabel><input value={formData.contactPerson || ""} onChange={e => setFormData({...formData, contactPerson: e.target.value})} className="w-full border-b py-2 text-sm outline-none focus:border-blue-600" /></div>
                  <div><label className="text-xs font-bold text-slate-500 block mb-1">聯絡電話</label><input value={formData.phone || ""} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full border-b py-2 text-sm outline-none focus:border-blue-600" /></div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 block mb-1">公司統編</label>
                    <input value={formData.taxId || ""} onChange={e => setFormData({...formData, taxId: e.target.value})} className="w-full border-b py-2 text-sm outline-none focus:border-blue-600 text-slate-800" placeholder="8碼數字" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 block mb-1">房號</label>
                    <input value={formData.roomNo || ""} onChange={e => setFormData({...formData, roomNo: e.target.value})} className="w-full border-b py-2 text-sm outline-none focus:border-blue-600 text-slate-800" placeholder="例如：A01" />
                  </div>
                  <div className="col-span-2 text-slate-800">
                                      <label className="text-xs font-bold text-slate-500 block mb-1">信件編號</label>
                                      <input value={formData.mailNo || ""} onChange={e => setFormData({...formData, mailNo: e.target.value})} className="w-full border-b py-2 text-sm outline-none focus:border-blue-600 text-slate-800" placeholder="輸入信件掛號編號或備註" />
                                    </div>

                                    {/* 💡 關鍵新增：卡片建立時間 (參考工商登記邏輯) */}
                                    <div className="col-span-2 text-slate-800">
                                      <label className="text-xs font-bold text-slate-500 block mb-1">卡片建立時間 (僅供查看)</label>
                                      <div className="w-full border-b py-2 text-sm bg-slate-100 text-slate-400 cursor-not-allowed font-mono px-1">
                                        {formData.createdAt ? new Date(formData.createdAt).toLocaleString('zh-TW', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : "-"}
                                      </div>
                                    </div>

                                    {/* 💡 附件區塊開始 */}
                                    <div className="col-span-2 border-t pt-6 mt-2">
                                      <div className="flex justify-between items-center mb-4 border-l-4 border-red-500 pl-3 bg-red-50 py-2 rounded-r-lg">
                                        <label className="text-sm font-black text-red-600">合約附件管理</label>
                                        <label className="cursor-pointer bg-red-500 text-white text-[10px] font-black px-4 py-1.5 rounded-xl hover:bg-red-600 shadow-md transition-all active:scale-95">
                                          + 選取檔案上傳
                                          <input type="file" className="hidden" onChange={handleFileUpload} />
                                        </label>
                                      </div>

                                      <div className="space-y-3">
                                        {(formData.attachments || []).map((file, idx) => (
                                          <div key={idx} className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl border border-dashed border-slate-200 hover:border-red-200 transition-colors">
                                            <div className="flex flex-col flex-1 truncate pr-4">
                                              <span className="text-xs font-bold text-slate-700 truncate">{file.name}</span>
                                              <span className="text-[9px] text-slate-400 italic mt-1">{file.uploadedAt?.substring(0, 10)} 上傳</span>
                                            </div>
                                            <div className="flex gap-2">
                                              <a href={file.url} target="_blank" className="text-[10px] font-black bg-white px-3 py-2 rounded-lg shadow-sm border border-slate-100 text-blue-600 hover:bg-blue-50 transition-all">檢視</a>
                                              <button 
                                                type="button"
                                                onClick={() => {
                                                  setFormData(prev => ({
                                                    ...prev,
                                                    attachments: (prev.attachments || []).filter((_, i) => i !== idx)
                                                  }));
                                                }}
                                                className="text-[10px] font-black bg-white px-3 py-2 rounded-lg shadow-sm border border-slate-100 text-red-500 hover:bg-red-50"
                                              >
                                                移除
                                              </button>
                                            </div>
                                          </div>
                                        ))}

                                        {/* 💡 修正：將「無附件提示」正確放入區塊內 */}
                                        {(!formData.attachments || formData.attachments.length === 0) && (
                                          <div className="py-10 text-center border-2 border-dashed border-slate-100 rounded-[32px] bg-slate-50/30">
                                            <p className="text-xs font-bold text-slate-400 italic">目前尚未上傳任何合約附件</p>
                                            <p className="text-[10px] text-slate-300 mt-2 uppercase tracking-widest font-black">Waiting for documents...</p>
                                          </div>
                                        )}
                                      </div> {/* 關閉 space-y-3 */}
                                    </div>   {/* 關閉 col-span-2 border-t */}
                                  </div>     {/* 關閉 grid-cols-2 */}
                                </section>   {/* 💡 關閉基本資訊 section */}

              <section className="space-y-4">
                <h3 className="text-sm font-bold border-l-4 border-emerald-500 pl-3 uppercase tracking-widest">財務與週期</h3>
                <div className="bg-emerald-50/30 p-6 rounded-2xl border border-emerald-100 space-y-6">
                  <div className="grid grid-cols-2 gap-6">
                    <div><label className="text-xs font-bold text-slate-500 block mb-1">稅別</label>
                      <select value={formData.taxType || "應稅(5%)"} onChange={e => setFormData({...formData, taxType: e.target.value as TaxType})} className="w-full border-b border-emerald-200 py-2 text-sm font-bold bg-transparent outline-none">
                        <option value="應稅(5%)">應稅(5%)</option><option value="免稅/未稅">免稅/未稅</option>
                      </select>
                    </div>
                    <div><label className="text-xs font-bold text-slate-500 block mb-1">繳費週期</label>
                      <select value={formData.paymentCycle || "月繳"} onChange={e => setFormData({...formData, paymentCycle: e.target.value})} className="w-full border-b border-emerald-200 py-2 text-sm font-bold bg-transparent outline-none">
                        <option value="月繳">月繳</option><option value="季繳">季繳</option><option value="半年繳">半年繳</option><option value="年繳">年繳</option>
                      </select>
                    </div>
                    <div><label className="text-xs font-bold text-slate-500 block mb-1">合約起日</label><input type="date" value={formData.contractStartDate || ""} onChange={e => setFormData({...formData, contractStartDate: e.target.value})} className="w-full border-b border-emerald-200 py-2 text-sm text-slate-800 bg-transparent outline-none" /></div>
                    <div><label className="text-xs font-bold text-slate-500 block mb-1">合約迄日</label><input type="date" value={formData.contractEndDate || ""} onChange={e => setFormData({...formData, contractEndDate: e.target.value})} className="w-full border-b border-emerald-200 py-2 text-sm text-slate-800 bg-transparent outline-none" /></div>
                    {/* 💡 這裡貼上合約週期自動感應區 */}
                    <div className="col-span-2 bg-white/50 p-4 rounded-xl border border-emerald-100/50">
                      <label className="text-[11px] font-bold text-emerald-700 mb-1 block">合約週期 (系統自動感應計算)</label>
                      <div className="text-lg font-black text-slate-800">{formData.contractMonths || 0} 個月</div>
                      <p className="text-[10px] text-slate-400 mt-1 italic">* 根據下方起訖日期自動判定，不足 30 天以 1 個月計</p>
                    </div>
                    {/* 💡 貼到這裡結束 */}
                    <div><label className="text-xs font-bold text-slate-500">實際月租 (未稅)</label><input type="number" value={formData.actualRentExclTax || ""} onChange={e => setFormData({...formData, actualRentExclTax: Number(e.target.value)})} className="w-full border-b border-emerald-200 py-2 text-sm font-bold bg-transparent outline-none" /></div>
                  </div>
                  <div className="pt-4 flex justify-between items-center border-t border-emerald-100 font-black text-emerald-700">
                    <span className="text-xs font-bold text-slate-400">總金額 (含稅結果):</span>
                    <span className="text-lg">{currency(formData.totalContractAmount || 0)}</span>
                  </div>
                </div>
              </section>
            </div>
          )}

          {activeTab === "todo" && (
            <div className="space-y-6 text-slate-800">
              <h3 className="text-sm font-bold border-l-4 border-amber-500 pl-3 uppercase tracking-widest">服務檢查清單</h3>
              <div className="space-y-3">
                {(formData.todos || []).map(todo => (
                  <div key={todo.id} className="flex items-start gap-4 p-4 bg-slate-50 rounded-xl border border-slate-100 hover:border-amber-200">
                    <input type="checkbox" checked={todo.completed} onChange={() => handleToggleTodo(todo.id)} className="mt-1 w-6 h-6 accent-amber-500" />
                    <div className="flex-1">
                      <p className={`text-base font-bold ${todo.completed ? "line-through text-slate-400" : "text-slate-800"}`}>{todo.text}</p>
                      {todo.completed && <p className="text-[10px] text-slate-400 mt-1 italic">✓ 由 {todo.completedBy} 於 {todo.completedAt} 完成</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "copy" && (
            <div className="space-y-8 text-slate-800">
              <div className="flex justify-between items-center border-l-4 border-purple-600 pl-3">
                <h3 className="text-sm font-bold uppercase tracking-widest">內容快速複製</h3>
                <span className="text-[9px] font-black bg-purple-50 text-purple-400 px-2 py-1 rounded-lg border border-purple-100">雲端同步中</span>
              </div>
              <div className="space-y-6">
                {templates.length > 0 ? (
                  templates.map((temp: any) => (
                    <div key={temp.id} className="group relative bg-slate-50 p-4 rounded-xl border border-slate-200 hover:border-purple-200 transition-all">
                      <label className="text-xs font-bold text-purple-600 block mb-2">{temp.label}</label>
                      <p className="text-sm whitespace-pre-wrap leading-relaxed pr-10 text-slate-700">{temp.content}</p>
                      <button onClick={() => handleCopy(temp.content)} className="absolute top-4 right-4 text-slate-400 hover:text-purple-600">📋</button>
                    </div>
                  ))
                ) : (
                  <div className="py-20 text-center text-slate-400 italic">正在載入雲端範本...</div>
                )}
              </div>
            </div>
          )}

          {activeTab === "history" && (
            <div className="space-y-8 text-slate-800">
              <section className="space-y-4">
                <h3 className="text-sm font-bold border-l-4 border-blue-600 pl-3 uppercase tracking-widest">階段天數分析</h3>
                <div className="grid grid-cols-2 gap-4 bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                  {STAGES.map(s => {
                    const entryDate = formData.stageHistory?.[s.id];
                    let duration = entryDate ? `${Math.floor((new Date().getTime() - new Date(entryDate).getTime()) / (1000 * 60 * 60 * 24))} 天` : "-";
                    return (
                      <div key={s.id} className="flex justify-between items-center p-2 border-b border-blue-100 last:border-0">
                        <span className="text-xs font-bold text-blue-800">{s.title}</span>
                        <span className="text-sm font-black text-slate-700">{duration}</span>
                      </div>
                    );
                  })}
                </div>
              </section>
              <section className="space-y-4">
                <h3 className="text-sm font-bold border-l-4 border-slate-400 pl-3 uppercase tracking-widest">操作歷史</h3>
                <div className="relative border-l-2 border-slate-100 ml-2 pl-6 space-y-8 mt-4">
                  {history.map(log => (
                    <div key={log.id} className="relative">
                      <div className="absolute -left-[31px] top-1 w-2.5 h-2.5 rounded-full bg-slate-200 border-2 border-white" />
                      <div className="text-[11px] text-slate-400 font-medium mb-1">{log.timestamp?.toDate().toLocaleString() || "剛才"}</div>
                      <div className="text-sm text-slate-700 bg-slate-50 p-3 rounded-lg border border-slate-100">{log.action} <span className="text-slate-400 text-xs ml-1 font-normal">by {log.user}</span></div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}
        </div>

        {(activeTab === "info" || isCreate) && (
          <footer className="p-6 border-t bg-slate-50 flex gap-4 shrink-0">
            {!isCreate && <button type="button" onClick={() => { if(confirm("確定刪除？")) onDelete(formData.id!); }} className="px-6 py-4 rounded-2xl font-bold border border-red-200 text-red-500 hover:bg-red-50">刪除案件</button>}
            <button type="button" onClick={handleValidateAndSave} className="flex-1 bg-slate-900 text-white py-4 rounded-2xl font-bold hover:bg-black transition-all">儲存內容並記錄</button>
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
        // 修改後：保留完整的 ISO 字串，包含時分秒
        const newRef = await addDoc(collection(db, "cases"), { ...saveData, createdAt: new Date().toISOString(), stageStartedAt: new Date().toISOString() });
        await addDoc(collection(db, "cases", newRef.id, "logs"), { action: "建立了新案件", user: currentUser, timestamp: serverTimestamp() });
      } else {
        await updateDoc(doc(db, "cases", id), saveData);
      }

      const memberQuery = query(collection(db, "members"), where("companyName", "==", data.companyName));
      const memberSnap = await getDocs(memberQuery);
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
    <div className="fixed inset-0 left-[260px] flex flex-col bg-slate-50/50 font-sans overflow-hidden text-slate-800 text-slate-800">
  <header className="p-8 shrink-0 bg-white border-b shadow-sm z-10 text-slate-800">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold underline decoration-blue-500/30">辦公室出租管理</h1>
            <button onClick={() => setIsCreating(true)} className="bg-slate-900 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg hover:bg-black transition-all">+ 新增案件</button>
          </div>

          {/* 💡 修正後的進階篩選列 */}
          <div className="flex items-center gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
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