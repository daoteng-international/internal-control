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

import { db, auth } from "@/lib/firebase"; 
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  serverTimestamp,
  where,
  orderBy,
} from "firebase/firestore";

// --- 類型與常數定義 ---
type RegStageId = "S1" | "S2" | "S3" | "S4" | "S5" | "S6" | "S7";
type CustomerTag = "一般客戶" | "MVP客戶" | "VIP客戶";
type TaxType = "應稅(5%)" | "免稅/未稅";

const CUSTOMER_TAGS: CustomerTag[] = ["一般客戶", "MVP客戶", "VIP客戶"];
const BILLING_CYCLES = [
  { label: "月繳", value: 1 },
  { label: "季繳", value: 3 },
  { label: "半年繳", value: 6 },
  { label: "年繳", value: 12 },
  { label: "兩年繳", value: 24 },
];

const PAUSE_OPTIONS = ["輸給競爭對手", "預算不符", "暫停評估", "其他"];

interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
  completedBy?: string;
  completedAt?: string;
}

interface ActivityLog {
  id: string;
  action: string;
  user: string;
  timestamp: any;
}

interface RegCard {
  id: string;
  title: string;          
  customer: string;       
  customerTag: CustomerTag;
  owner: string;
  roomNo: string;         
  taxType: TaxType;
  actualRentExclTax: number;
  actualRentInclTax: number;
  contractMonths: number;
  totalContractAmount: number;
  stage: RegStageId;
  updatedAt: any;
  stageStartedAt: string;
  stageEndedAt?: string;  
  stageHistory?: { [key: string]: string }; 
  createdAt: string;
  productLines: string[];
  taxId: string;          
  billingCycle: string;   
  monthlyRent: number;    
  mailHandling: string;   
  email: string;          
  phone: string;          
  accountant: string;     
  shippingAddress: string;
  specialNotes: string;   
  attachments?: any[]; 
  todos?: TodoItem[];
  startDate?: string;
  endDate?: string;
  pauseReason?: string;
}

const STAGES: { id: RegStageId; title: string; hint: string }[] = [
  { id: "S1", title: "S1 待處理", hint: "需求意向確認" },
  { id: "S2", title: "S2 需求訪談", hint: "產品組合建議" },
  { id: "S3", title: "S3 口頭報價", hint: "價格條件提供" },
  { id: "S4", title: "S4 追蹤關懷", hint: "客戶意願追蹤" },
  { id: "S5", title: "S5 簽約中", hint: "合約流程執行" },
  { id: "S6", title: "S6 成交", hint: "正式結案簽署" },
  { id: "S7", title: "S7 暫停", hint: "暫時停止跟進" },
];

const FIXED_REG_TODO = [
  "S1: 客戶資料初步收集 / 諮詢服務紀錄",
  "S2: 報價方案確認 / 服務項目選定",
  "S3: 發送正式報價單 / 確認客戶預算",
  "S4: 關懷聯繫紀錄 / 異議處理排除",
  "S5: 合約條款核對 / 印鑑資料準備",
  "S6: 完成合約簽署 / 首筆款項入帳",
  "S7: 標記暫停原因 / 預約未來聯繫"
];

// --- 輔助函式 ---
function currency(n: number) {
  return new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 }).format(n || 0);
}

function getDisplayDays(item: RegCard) {
  const start = new Date(item.stageStartedAt || item.createdAt);
  const end = (item.stage === "S6" || item.stage === "S7") && item.stageEndedAt 
    ? new Date(item.stageEndedAt)
    : new Date();
  const diffTime = end.getTime() - start.getTime();
  return Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
}

function RequiredLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-[11px] font-bold flex items-center gap-0.5 text-slate-500 mb-1">
      {children} <span className="text-red-500">*</span>
    </label>
  );
}

// --- 子組件：暫停原因 Modal ---
function PauseReasonModal({ isOpen, onConfirm, onCancel }: { isOpen: boolean, onConfirm: (reason: string) => void, onCancel: () => void }) {
  const [selectedOption, setSelectedOption] = useState("");
  const [customReason, setCustomReason] = useState("");
  const handleConfirm = () => {
    const finalReason = selectedOption === "其他" ? customReason : selectedOption;
    onConfirm(finalReason || "未註明原因");
    setSelectedOption(""); setCustomReason("");
  };
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl p-6 w-[360px] shadow-2xl">
        <h3 className="text-base font-bold mb-4 text-slate-800">⏸ 選擇暫停原因</h3>
        <div className="space-y-1.5 mb-5 text-slate-800">
          {PAUSE_OPTIONS.map(opt => (
            <button key={opt} onClick={() => setSelectedOption(opt)} className={`w-full text-left px-4 py-2.5 rounded-xl border text-xs font-medium transition-all ${selectedOption === opt ? 'bg-red-50 border-red-500 text-red-700' : 'bg-white border-slate-100 text-slate-600 hover:border-red-200'}`}>{opt}</button>
          ))}
        </div>
        {selectedOption === "其他" && (
          <textarea placeholder="請手動輸入原因..." className="w-full border border-red-100 rounded-xl p-3 text-xs min-h-[80px] mb-5 text-slate-800 outline-none" value={customReason} onChange={(e) => setCustomReason(e.target.value)} />
        )}
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-2 text-xs font-bold text-slate-400 hover:bg-slate-50 rounded-lg">取消</button>
          <button onClick={handleConfirm} disabled={!selectedOption || (selectedOption === "其他" && !customReason)} className="flex-1 py-2 text-xs font-bold bg-red-500 text-white rounded-lg shadow-lg hover:bg-red-600 transition-all disabled:opacity-30">確認暫停</button>
        </div>
      </div>
    </div>
  );
}

// --- 看板卡片元件 ---
function CardBase({ item, isOverlay = false }: { item: RegCard; isOverlay?: boolean }) {
  const days = getDisplayDays(item);
  const isFinished = item.stage === "S6";
  const isPaused = item.stage === "S7";
  
  const tagStyles: Record<CustomerTag, string> = {
    "一般客戶": "bg-white text-slate-400 border border-slate-200",
    "MVP客戶": "bg-amber-50 text-amber-600 border border-amber-200",
    "VIP客戶": "bg-yellow-100 text-yellow-700 border border-yellow-300",
  };

  let badgeStyle = isFinished ? "bg-slate-400" : isPaused ? "bg-red-600" : (days >= 14 ? "bg-red-800" : days >= 7 ? "bg-red-500" : "bg-emerald-500");
  
  return (
    <div 
      style={{ backgroundColor: isPaused ? "#FFF5F5" : "#FFF7ED" }} 
      className={`relative rounded-xl border border-slate-200 p-4 shadow-sm transition-all duration-200 ${isOverlay ? "shadow-2xl ring-2 ring-blue-500 scale-105" : "hover:ring-2 hover:ring-blue-400 cursor-grab"}`}
    >
      <div className="flex justify-between items-start mb-2 text-slate-800">
        <div className="text-sm font-bold line-clamp-1 pr-12">{item.title}</div>
        <div className={`absolute top-3 right-3 px-2 py-0.5 rounded text-[10px] font-bold text-white shadow-sm ${badgeStyle}`}>
          {isPaused ? "暫停中" : isFinished ? `耗時 ${days}天` : `停留 ${days}天`}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        <div className="bg-orange-500 text-white text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-tighter">工商登記</div>
        <div className={`text-[9px] font-bold px-2 py-0.5 rounded ${tagStyles[item.customerTag]}`}>{item.customerTag}</div>
      </div>

      <div className="text-[11px] text-slate-700 font-bold mb-1 flex items-center justify-between">
        <span>窗口: {item.customer || "未填寫"}</span>
        <span className="text-[9px] font-normal bg-blue-50 text-blue-500 px-1 rounded uppercase">{item.taxType}</span>
      </div>
      
      {isPaused && item.pauseReason && <div className="mb-3 px-2 py-1.5 bg-red-100 border border-red-200 rounded-lg text-[10px] text-red-700 font-bold flex items-start gap-1.5 line-clamp-2"><span>⚠️</span> {item.pauseReason}</div>}

      <div className="flex justify-between items-end mt-3 pt-3 border-t border-slate-50 text-slate-800">
        <div className="text-lg font-black text-blue-600">{currency(item.totalContractAmount)}</div>
        <div className="text-right">
          <p className="text-[10px] text-slate-400 font-medium">房號: {item.roomNo || "未定"}</p>
          <p className="text-[10px] text-slate-300">信件: {item.mailHandling || "-"}</p>
        </div>
      </div>
    </div>
  );
}

function SortableCard({ item, onClick }: { item: RegCard; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = { transform: CSS.Translate.toString(transform), transition };
  return <div ref={setNodeRef} style={style} {...attributes} {...listeners} onClick={onClick} className={isDragging ? "opacity-30" : ""}><CardBase item={item} /></div>;
}

function StageColumn({ stage, cards, onCardClick }: { stage: (typeof STAGES)[0]; cards: RegCard[]; onCardClick: (id: string) => void }) {
  const { setNodeRef } = useDroppable({ id: stage.id });
  return (
    <div ref={setNodeRef} className="flex min-h-full w-[300px] flex-col rounded-2xl border border-slate-200 bg-slate-50/50 shadow-sm shrink-0 self-stretch overflow-hidden">
      <div className="p-4 pb-3 shrink-0 bg-white text-slate-800 border-b border-slate-100">
        <h3 className="font-bold text-sm flex items-center justify-between">{stage.title} <span className="bg-slate-200 text-slate-500 text-[10px] px-2 py-0.5 rounded-full font-bold">{cards.length}</span></h3>
      </div>
      <SortableContext items={cards.map((x) => x.id)} strategy={verticalListSortingStrategy}>
        <div className="flex-1 min-h-0 px-3 pt-4 pb-12 space-y-4 overflow-y-auto custom-scrollbar text-slate-800">
          {cards.map((item) => <SortableCard key={item.id} item={item} onClick={() => onCardClick(item.id)} />)}
          {cards.length === 0 && <div className="min-h-[140px] border-2 border-dashed border-slate-200 rounded-xl bg-white/50" />}
        </div>
      </SortableContext>
    </div>
  );
}

// --- 詳情抽屜 ---
function DetailDrawer({ item, isCreate, onClose, onSave, currentUser, onDelete }: { 
  item: RegCard | null; isCreate: boolean; onClose: () => void; onSave: (data: RegCard) => void; currentUser: string; onDelete: (id: string) => void;
}) {
  const [formData, setFormData] = useState<Partial<RegCard>>({});
  const [activeTab, setActiveTab] = useState<"info" | "todo" | "copy" | "history">("info");
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [templates, setTemplates] = useState<{id: string, label: string, content: string}[]>([]);

  useEffect(() => {
    const defaultTodos: TodoItem[] = FIXED_REG_TODO.map((text, index) => ({ id: `reg-${index}`, text, completed: false }));
    if (isCreate) {
      setFormData({ id: "NEW", stage: "S1", customerTag: "一般客戶", stageStartedAt: new Date().toISOString().split("T")[0], createdAt: new Date().toISOString().split("T")[0], billingCycle: "月繳", contractMonths: 1, taxType: "應稅(5%)", productLines: ["工商登記"], accountant: "", attachments: [], todos: defaultTodos, stageHistory: { "S1": new Date().toISOString().split("T")[0] } });
      setActiveTab("info");
    } else if (item) {
      setFormData({ ...item, todos: item.todos && item.todos.length > 0 ? item.todos : defaultTodos });
      const qLogs = query(collection(db, "members", item.id, "logs"), orderBy("timestamp", "desc"));
      const unsubLogs = onSnapshot(qLogs, (snapshot) => setLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as ActivityLog[]));
      const qTemplates = query(collection(db, "copyTemplates"), where("category", "==", "工商登記"), orderBy("order", "asc"));
      const unsubTemplates = onSnapshot(qTemplates, (snapshot) => { setTemplates(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any); });
      return () => { unsubLogs(); unsubTemplates(); };
    }
  }, [item?.id, isCreate]);

  // --- 自動財務計算：與辦公室邏輯一致 ---
  useEffect(() => {
      if (!formData.startDate || !formData.endDate) return;
      const start = new Date(formData.startDate);
      const end = new Date(formData.endDate);
      const diffTime = Math.abs(end.getTime() - start.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
      const calculatedMonths = Math.ceil(diffDays / 30); // 不足30天進位為一個月
      
      const monthlyRent = formData.monthlyRent || 0;
      const taxMultiplier = formData.taxType === "應稅(5%)" ? 1.05 : 1;
      const total = Math.round(monthlyRent * calculatedMonths * taxMultiplier);

      setFormData(prev => ({ 
        ...prev, 
        contractMonths: calculatedMonths, 
        totalContractAmount: total 
      }));
    }, [formData.startDate, formData.endDate, formData.monthlyRent, formData.taxType]);

    // 💡 第一步新增：處理檔案選取與預覽邏輯
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const newAttachment = {
        name: file.name,
        url: URL.createObjectURL(file), // 產生暫時預覽連結
        uploadedAt: new Date().toISOString()
      };

      setFormData(prev => ({
        ...prev,
        attachments: [...(prev.attachments || []), newAttachment]
      }));

      if (!isCreate && item?.id) {
        await addDoc(collection(db, "members", item.id, "logs"), { 
          action: `準備上傳附件預覽: ${file.name}`, 
          user: currentUser, 
          timestamp: serverTimestamp() 
        });
      }
      alert(`已讀取「${file.name}」，請點擊最下方「儲存並同步」完成更新！`);
    };

    const handleValidateAndSave = () => {
      if (!formData.title?.trim() || !formData.customer?.trim()) {
        alert("⚠️ 請填寫必填欄位：公司全銜 與 主要窗口姓名");
        return;
      }
      onSave(formData as RegCard);
    };
  const handleToggleTodo = async (todoId: string) => {
    if (formData.id === "NEW") { alert("請先存檔建立案件後再勾選事項。"); return; }
    const updated = (formData.todos || []).map(t => t.id === todoId ? { ...t, completed: !t.completed, completedBy: !t.completed ? currentUser : "", completedAt: !t.completed ? new Date().toLocaleString() : "" } : t);
    setFormData({ ...formData, todos: updated });
    if (item?.id) {
      await updateDoc(doc(db, "members", item.id), { todos: updated });
      await addDoc(collection(db, "members", item.id, "logs"), { action: `勾選待辦: ${updated.find(t=>t.id===todoId)?.text}`, user: currentUser, timestamp: serverTimestamp() });
    }
  };

if (!item && !isCreate) return null;

  return (
    <div className="fixed inset-0 z-[100] flex justify-end font-sans text-slate-800">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-300">
        <header className="p-6 border-b flex justify-between items-center bg-white shrink-0 text-slate-800">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold">{isCreate ? "🆕 新增工商登記" : "📝 編輯案件詳情"}</h2>
            {formData.stage === "S7" && <span className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold">暫停中</span>}
          </div>
          <button onClick={onClose} className="text-slate-400 text-2xl hover:text-slate-600 transition-colors">✕</button>
        </header>

        <div className="flex px-8 border-b bg-slate-50/50">
          <button onClick={() => setActiveTab("info")} className={`py-4 px-6 text-sm font-bold border-b-2 transition-all ${activeTab === "info" ? "border-emerald-600 text-emerald-600" : "border-transparent text-slate-500"}`}>基本資訊</button>
          {!isCreate && (
            <>
              <button onClick={() => setActiveTab("todo")} className={`py-4 px-6 text-sm font-bold border-b-2 transition-all ${activeTab === "todo" ? "border-emerald-600 text-emerald-600" : "border-transparent text-slate-500"}`}>待辦清單</button>
              <button onClick={() => setActiveTab("copy")} className={`py-4 px-6 text-sm font-bold border-b-2 transition-all ${activeTab === "copy" ? "border-emerald-600 text-emerald-600" : "border-transparent text-slate-500"}`}>內容複製</button>
              <button onClick={() => setActiveTab("history")} className={`py-4 px-6 text-sm font-bold border-b-2 transition-all ${activeTab === "history" ? "border-emerald-600 text-emerald-600" : "border-transparent text-slate-500"}`}>歷程記錄</button>
            </>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-10 custom-scrollbar text-slate-800">
          {activeTab === "info" && (
            <>
              {formData.stage === "S7" && (
                <section className="bg-red-50 border border-red-100 p-5 rounded-2xl text-slate-800">
                  <RequiredLabel>暫停原因詳述</RequiredLabel>
                  <input value={formData.pauseReason || ""} onChange={(e) => setFormData({ ...formData, pauseReason: e.target.value })} className="w-full border-b border-red-200 py-2 text-sm outline-none focus:border-red-500 font-bold bg-transparent text-red-700" />
                </section>
              )}

              <section className="space-y-4">
                <h3 className="text-sm font-bold border-l-4 border-emerald-600 pl-3 uppercase tracking-widest">案件狀態標籤</h3>
                <div className="flex gap-2">
                  {CUSTOMER_TAGS.map((t) => (
                    <button key={t} onClick={() => setFormData({ ...formData, customerTag: t })} className={`px-4 py-2 text-xs font-bold rounded-xl border ${formData.customerTag === t ? "bg-amber-600 text-white border-amber-600 shadow-sm" : "bg-white text-slate-400 border-slate-200"}`}>{t}</button>
                  ))}
                </div>
              </section>

              <section className="grid grid-cols-2 gap-6 text-slate-800">
                <div className="col-span-2"><RequiredLabel>公司/案件全銜</RequiredLabel><input value={formData.title || ""} onChange={(e) => setFormData({ ...formData, title: e.target.value })} className="w-full border-b py-2 text-sm outline-none focus:border-emerald-600 font-medium bg-transparent" /></div>
                <div><RequiredLabel>主要窗口姓名</RequiredLabel><input value={formData.customer || ""} onChange={(e) => setFormData({ ...formData, customer: e.target.value })} className="w-full border-b py-2 text-sm outline-none focus:border-emerald-600 bg-transparent" /></div>
                <div><label className="text-[11px] font-bold text-slate-500 mb-1 block">聯絡電話</label><input value={formData.phone || ""} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} className="w-full border-b py-2 text-sm outline-none focus:border-emerald-600 bg-transparent" /></div>
                <div><label className="text-[11px] font-bold text-slate-500 mb-1 block">公司統編</label><input value={formData.taxId || ""} onChange={(e) => setFormData({ ...formData, taxId: e.target.value })} className="w-full border-b py-2 text-sm outline-none focus:border-emerald-600 bg-transparent" /></div>
                <div><label className="text-[11px] font-bold text-slate-500 mb-1 block">房號</label><input value={formData.roomNo || ""} onChange={(e) => setFormData({ ...formData, roomNo: e.target.value })} className="w-full border-b py-2 text-sm outline-none focus:border-emerald-600 bg-transparent" /></div>
                <div><label className="text-[11px] font-bold text-slate-500 mb-1 block">信件編號</label><input value={formData.mailHandling || ""} onChange={(e) => setFormData({ ...formData, mailHandling: e.target.value })} className="w-full border-b py-2 text-sm outline-none focus:border-emerald-600 bg-transparent" /></div>
                <div className="col-span-2 text-slate-800">
                  <label className="text-xs font-bold text-slate-500 block mb-1">卡片建立時間 (僅供查看)</label>
                  <div className="w-full border-b py-2 text-sm bg-slate-100 text-slate-400 cursor-not-allowed font-mono px-1">
                    {formData.createdAt ? new Date(formData.createdAt).toLocaleString('zh-TW', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : "-"}
                  </div>
                </div>

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
                          <button type="button" onClick={() => setFormData(prev => ({ ...prev, attachments: (prev.attachments || []).filter((_, i) => i !== idx) }))} className="text-[10px] font-black bg-white px-3 py-2 rounded-lg shadow-sm border border-slate-100 text-red-500 hover:bg-red-50">移除</button>
                        </div>
                      </div>
                    ))}
                    {(!formData.attachments || formData.attachments.length === 0) && (
                      <div className="py-10 text-center border-2 border-dashed border-slate-100 rounded-[32px] bg-slate-50/30">
                        <p className="text-xs font-bold text-slate-400 italic">目前尚未上傳任何合約附件</p>
                      </div>
                    )}
                  </div>
                </div>
              </section>

              <section className="space-y-4 text-slate-800">
                <h3 className="text-sm font-bold border-l-4 border-emerald-600 pl-3 uppercase tracking-widest text-slate-800">財務與週期</h3>
                <div className="bg-emerald-50/30 border border-emerald-100 rounded-2xl p-6 space-y-6 text-slate-800">
                  <div className="grid grid-cols-2 gap-6 text-slate-800">
                    <div><label className="text-[11px] font-bold text-emerald-700 mb-1 block">稅別</label><select value={formData.taxType || "應稅(5%)"} onChange={(e) => setFormData({...formData, taxType: e.target.value as TaxType})} className="w-full border-b border-emerald-200 py-2 text-sm outline-none bg-transparent focus:border-emerald-500 text-slate-800"><option value="應稅(5%)">應稅(5%)</option><option value="免稅/未稅">免稅/未稅</option></select></div>
                    <div><label className="text-[11px] font-bold text-emerald-700 mb-1 block">繳費週期</label><select value={formData.billingCycle || "月繳"} onChange={(e) => setFormData({...formData, billingCycle: e.target.value})} className="w-full border-b border-emerald-200 py-2 text-sm outline-none bg-transparent focus:border-emerald-500 text-slate-800">{BILLING_CYCLES.map(c => <option key={c.label} value={c.label}>{c.label}</option>)}</select></div>
                    <div className="col-span-2 bg-white/50 p-4 rounded-xl border border-emerald-100/50">
                      <label className="text-[11px] font-bold text-emerald-700 mb-1 block">合約週期</label>
                      <div className="text-lg font-black text-slate-800">{formData.contractMonths || 0} 個月</div>
                    </div>
                    <div><label className="text-[11px] font-bold text-emerald-700 mb-1 block">合約起日</label><input type="date" value={formData.startDate || ""} onChange={(e) => setFormData({ ...formData, startDate: e.target.value })} className="w-full border-b border-emerald-200 py-2 text-sm outline-none bg-transparent text-slate-800" /></div>
                    <div><label className="text-[11px] font-bold text-emerald-700 mb-1 block">合約迄日</label><input type="date" value={formData.endDate || ""} onChange={(e) => setFormData({ ...formData, endDate: e.target.value })} className="w-full border-b border-emerald-200 py-2 text-sm outline-none bg-transparent text-slate-800" /></div>
                    <div className="col-span-2 text-slate-800">
                      <label className="text-[11px] font-bold text-emerald-700 mb-1 block">實際月租 (未稅)</label>
                      <input type="number" value={formData.monthlyRent === 0 ? "" : formData.monthlyRent || ""} onChange={(e) => setFormData({...formData, monthlyRent: Number(e.target.value)})} className="w-full border-b border-emerald-200 py-2 text-lg font-black outline-none bg-transparent focus:border-emerald-500 text-emerald-800" />
                    </div>
                  </div>
                  <div className="pt-4 border-t border-emerald-100 flex justify-between items-center text-slate-800">
                    <span className="text-xs font-bold text-emerald-700">總金額:</span>
                    <span className="text-2xl font-black text-emerald-600">{currency(formData.totalContractAmount || 0)}</span>
                  </div>
                </div>
              </section>

              <section className="space-y-4 text-slate-800">
                <h3 className="text-sm font-bold border-l-4 border-slate-400 pl-3 uppercase tracking-widest text-slate-800">其他備註</h3>
                <textarea value={formData.specialNotes || ""} onChange={(e) => setFormData({ ...formData, specialNotes: e.target.value })} className="w-full border rounded-xl p-3 text-sm min-h-[80px] bg-slate-50/50 outline-none text-slate-800" />
              </section>
            </>
          )}

          {activeTab === "todo" && (
            <div className="space-y-4 text-slate-800">
              <h3 className="text-sm font-bold border-l-4 border-amber-500 pl-3 uppercase tracking-widest text-slate-800">核對清單</h3>
              <div className="space-y-2">
                {(formData.todos || []).map(todo => (
                  <div key={todo.id} onClick={() => handleToggleTodo(todo.id)} className={`flex items-start gap-4 p-4 rounded-xl border cursor-pointer transition-all ${todo.completed ? "bg-slate-50 border-slate-100 opacity-60" : "bg-white border-slate-200 shadow-sm"}`}>
                    <div className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center ${todo.completed ? "bg-emerald-500 border-emerald-500 text-white" : "border-slate-300"}`}>{todo.completed && "✓"}</div>
                    <div className="flex-1 text-slate-800">
                      <p className={`text-sm font-bold ${todo.completed ? "line-through text-slate-400" : "text-slate-800"}`}>{todo.text}</p>
                      {todo.completed && <p className="text-[10px] text-slate-400 mt-1 italic">✓ {todo.completedBy} @ {todo.completedAt}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "copy" && (
            <div className="space-y-8 text-slate-800">
              <div className="flex justify-between items-center border-l-4 border-emerald-600 pl-3">
                <h3 className="text-sm font-bold uppercase tracking-widest text-slate-800">內容快速複製</h3>
              </div>
              <div className="space-y-6">
                {templates.map((temp: any) => (
                  <div key={temp.id} className="group relative bg-white p-4 rounded-xl border border-slate-200 hover:border-emerald-200 transition-all shadow-sm">
                    <label className="text-xs font-bold text-emerald-600 block mb-2">{temp.label}</label>
                    <p className="text-sm whitespace-pre-wrap leading-relaxed pr-10 text-slate-700">{temp.content}</p>
                    <button onClick={() => { navigator.clipboard.writeText(temp.content); alert("已複製到剪貼簿！"); }} className="absolute top-4 right-4 text-slate-400 hover:text-emerald-600 transition-colors text-xs">📋</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "history" && (
            <div className="space-y-10 text-slate-800">
              <section className="space-y-4">
                <h3 className="text-sm font-bold border-l-4 border-blue-600 pl-3 uppercase tracking-widest text-slate-800">詳細歷史紀錄</h3>
                <div className="relative border-l-2 border-slate-100 ml-2 pl-6 space-y-8 mt-4">
                  {logs.map(log => (
                    <div key={log.id} className="relative">
                      <div className="absolute -left-[31px] top-1 w-2.5 h-2.5 rounded-full bg-slate-200 border-2 border-white" />
                      <div className="text-[11px] text-slate-400 font-medium mb-1">{log.timestamp?.toDate().toLocaleString() || "剛才"}</div>
                      <div className="text-sm text-slate-700 leading-relaxed font-medium bg-slate-50 p-3 rounded-lg border border-slate-100">{log.action} <span className="text-slate-400 text-xs ml-1 font-normal">by {log.user}</span></div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}
        </div>

      <footer className="p-6 border-t bg-slate-50 shrink-0 flex gap-3 text-slate-800">
        {!isCreate && <button type="button" onClick={() => onDelete(item!.id)} className="px-6 py-4 rounded-2xl font-bold border border-red-200 text-red-500 hover:bg-red-50 transition-colors text-xs">刪除案件</button>}
        {/* 💡 修正：將函數名稱改為 handleValidateAndSave */}
        <button onClick={handleValidateAndSave} className="flex-1 bg-slate-900 text-white py-4 rounded-2xl font-bold hover:bg-black transition-all shadow-lg text-xs">儲存並同步</button>
      </footer>
      </div>
    </div>
  );
}
// --- 主看板頁面 ---
export default function RegistrationsPage() {
  const [hasMounted, setHasMounted] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [searchInput, setSearchInput] = useState("");
  const [monthStartInput, setMonthStartInput] = useState("");
  const [monthEndInput, setMonthEndInput] = useState("");
  const [tagInput, setTagInput] = useState("全部");
  const [cycleInput, setCycleInput] = useState("全部");
  const [appliedFilters, setAppliedFilters] = useState({ query: "", start: "", end: "", tag: "全部", cycle: "全部" });
  const [cards, setCards] = useState<RegCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [currentUser, setCurrentUser] = useState<string>("ADMIN");
  const [pendingPauseAction, setPendingPauseAction] = useState<{ cardId: string, toStage: RegStageId } | null>(null);
  const [signedOffOverdue, setSignedOffOverdue] = useState<string[]>([]);

  useEffect(() => {
      setHasMounted(true);
      onAuthStateChanged(auth, (user) => { if (user) setCurrentUser(user.email || "User"); });
      const q = query(collection(db, "members"), where("productLines", "array-contains", "工商登記"));
      
      const unsubscribe = onSnapshot(q, (snapshot) => { 
        const newCards = snapshot.docs.map(d => ({ ...d.data(), id: d.id })) as RegCard[];
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
      
      return () => unsubscribe();
    }, []);

  const handleApplyFilter = () => setAppliedFilters({ query: searchInput, start: monthStartInput, end: monthEndInput, tag: tagInput, cycle: cycleInput });
  const handleClearFilter = () => { setSearchInput(""); setMonthStartInput(""); setMonthEndInput(""); setTagInput("全部"); setCycleInput("全部"); setAppliedFilters({ query: "", start: "", end: "", tag: "全部", cycle: "全部" }); };

  const filteredCards = useMemo(() => cards.filter(card => {
    const { query, start, end, tag, cycle } = appliedFilters;
    const s = query.toLowerCase();
    if (s && !((card.title || "").toLowerCase().includes(s) || (card.customer || "").toLowerCase().includes(s) || (card.taxId || "").includes(s) || (card.roomNo || "").toLowerCase().includes(s))) return false;
    if (start && card.createdAt.substring(0, 7) < start) return false;
    if (end && card.createdAt.substring(0, 7) > end) return false;
    if (tag !== "全部" && card.customerTag !== tag) return false;
    if (cycle !== "全部" && card.billingCycle !== cycle) return false;
    return true;
  }), [cards, appliedFilters]);

  const overdueAlerts = useMemo(() => {
    const now = new Date().getTime();
    return cards.filter(card => card.stage === "S5" && !signedOffOverdue.includes(card.id) && (now - new Date(card.stageStartedAt).getTime()) > 3 * 24 * 60 * 60 * 1000);
  }, [cards, signedOffOverdue]);

  const handleSignOff = async (cardId: string) => { await addDoc(collection(db, "members", cardId, "logs"), { action: "主管已核閱逾期風險並簽署", user: currentUser, timestamp: serverTimestamp() }); setSignedOffOverdue(p => [...p, cardId]); };

  const handleSave = async (data: RegCard) => {
    const { id, ...rest } = data;
    const payload = { 
      ...rest, 
      name: data.title, 
      contactPerson: data.customer, 
      productLines: ["工商登記"], // 💡 確保保留標籤，契約中心才能分類
      attachments: data.attachments || [], // 💡 關鍵新增：同步附件陣列
      updatedAt: serverTimestamp() 
    };
    if (isCreating || id === "NEW") {
      const ref = await addDoc(collection(db, "members"), { ...payload, createdAt: new Date().toISOString(), stageStartedAt: new Date().toISOString(), stageHistory: { "S1": new Date().toISOString() } });
      await addDoc(collection(db, "members", ref.id, "logs"), { action: "建立了新工商案件", user: currentUser, timestamp: serverTimestamp() });
    } else await updateDoc(doc(db, "members", id), payload);
    setIsCreating(false); setSelectedId(null);
  };

  const handleDelete = async (id: string) => { if (confirm("確定刪除？")) { await deleteDoc(doc(db, "members", id)); setSelectedId(null); } };

  const handleConfirmPause = async (reason: string) => {
    if (!pendingPauseAction) return;
    const { cardId, toStage } = pendingPauseAction;
    const card = cards.find(c => c.id === cardId);
    const today = new Date().toISOString().split('T')[0];
    await updateDoc(doc(db, "members", cardId), { stage: toStage, stageStartedAt: today, stageHistory: { ...card?.stageHistory, [toStage]: today }, pauseReason: reason, updatedAt: serverTimestamp() });
    await addDoc(collection(db, "members", cardId, "logs"), { action: `階段移動至暫停，原因：${reason}`, user: currentUser, timestamp: serverTimestamp() });
    setPendingPauseAction(null);
  };

  const byStage = useMemo(() => {
    const map = new Map<RegStageId, RegCard[]>();
    STAGES.forEach(s => map.set(s.id, []));
    filteredCards.forEach(c => map.get(c.stage)?.push(c));
    return map;
  }, [filteredCards]);

  if (!hasMounted || loading) return <div className="h-screen flex items-center justify-center font-bold text-slate-400 bg-slate-50 text-slate-800">載入中...</div>;

  return (
    <div className="fixed inset-0 left-[260px] flex flex-col bg-slate-50/50 overflow-hidden text-slate-800">
      <header className="p-8 pb-4 shrink-0 bg-white border-b shadow-sm z-10 text-slate-800">
        <div className="flex justify-between items-center mb-6 text-slate-800">
          <h1 className="text-2xl font-bold underline decoration-blue-500/30 text-slate-800">工商登記管理看板</h1>
          <button onClick={() => setIsCreating(true)} className="bg-slate-900 text-white px-5 py-2 rounded-lg font-bold shadow-md hover:bg-black transition-all text-xs">+ 新增案件</button>
        </div>
        <div className="flex items-center gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-slate-800">
          <div className="flex items-center gap-2 text-slate-800"><span className="text-[10px] font-black text-slate-400 uppercase text-slate-400">搜尋</span><input placeholder="名稱/窗口/統編" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} className="px-2 py-1.5 border border-slate-200 rounded-lg text-xs w-36 outline-none focus:border-blue-400 bg-white text-slate-800" /></div>
          <div className="h-4 w-px bg-slate-200" /><div className="flex items-center gap-2 text-slate-800"><span className="text-[10px] font-black text-slate-400 uppercase text-slate-400">月份</span><div className="flex items-center gap-1 text-slate-800"><input type="month" value={monthStartInput} onChange={(e) => setMonthStartInput(e.target.value)} className="px-1.5 py-1 border border-slate-200 rounded text-xs outline-none bg-white text-slate-800" /><span className="text-slate-300 text-[10px]">~</span><input type="month" value={monthEndInput} onChange={(e) => setMonthEndInput(e.target.value)} className="px-1.5 py-1 border border-slate-200 rounded text-xs outline-none bg-white text-slate-800" /></div></div>
          <div className="h-4 w-px bg-slate-200" /><div className="flex items-center gap-2 text-slate-800"><span className="text-[10px] font-black text-slate-400 uppercase text-slate-400">標籤</span><select value={tagInput} onChange={(e) => setTagInput(e.target.value)} className="px-2 py-1 border border-slate-200 rounded-lg text-xs font-bold text-slate-600 bg-white w-28 text-slate-800"><option value="全部">全部標籤</option>{CUSTOMER_TAGS.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
          <div className="h-4 w-px bg-slate-200" /><div className="flex items-center gap-2 text-slate-800"><span className="text-[10px] font-black text-slate-400 uppercase text-slate-400">週期</span><select value={cycleInput} onChange={(e) => setCycleInput(e.target.value)} className="px-2 py-1 border border-slate-200 rounded-lg text-xs font-bold text-slate-600 bg-white w-28 text-slate-800"><option value="全部">全部週期</option>{BILLING_CYCLES.map(c => <option key={c.label} value={c.label}>{c.label}</option>)}</select></div>
          <div className="flex gap-1.5 ml-auto text-slate-800"><button onClick={handleClearFilter} className="px-3 py-1.5 text-xs font-bold text-slate-400 hover:text-slate-600 text-slate-400">清除</button><button onClick={handleApplyFilter} className="px-4 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm text-white">執行</button></div>
        </div>
      </header>

      {overdueAlerts.length > 0 && <div className="px-8 mt-2 space-y-1 text-slate-800">{overdueAlerts.map(a => (<div key={a.id} className="bg-red-50 border-l-4 border-red-500 p-3 rounded-r-lg shadow-sm flex items-center justify-between text-slate-800"><div className="flex items-center gap-2 text-slate-800"><span className="text-sm">⚠️</span><h4 className="text-red-800 font-black text-[11px] text-red-800">簽約逾期：{a.title}</h4></div><button onClick={() => handleSignOff(a.id)} className="px-3 py-1 text-[10px] font-bold text-white bg-red-600 rounded shadow-sm hover:bg-red-700 text-white">簽署</button></div>))}</div>}

      <main className="flex-1 min-h-0 px-8 pt-4 pb-6 flex flex-col text-slate-800">
        <div className="board-scroll flex-1 min-h-0 overflow-auto custom-scrollbar rounded-b-2xl text-slate-800">
          <DndContext sensors={sensors} onDragStart={(e) => setActiveId(String(e.active.id))} onDragEnd={async (e) => {
            const { active, over } = e; setActiveId(null); if (!over) return;
            const aId = String(active.id); const oId = String(over.id);
            let toStage = oId as RegStageId; if (!STAGES.some(s => s.id === oId)) toStage = cards.find(c => c.id === oId)?.stage as RegStageId;
            const card = cards.find(c => c.id === aId);
            if (toStage && card?.stage !== toStage) {
              if (toStage === "S7") setPendingPauseAction({ cardId: aId, toStage });
              else {
                const today = new Date().toISOString().split('T')[0];
                const data: any = { stage: toStage, stageStartedAt: today, stageHistory: { ...card?.stageHistory, [toStage]: today }, updatedAt: serverTimestamp() };
                if (card?.stage === "S7") data.pauseReason = "";
                await updateDoc(doc(db, "members", aId), data);
                await addDoc(collection(db, "members", aId, "logs"), { action: `階段變更至 ${toStage}`, user: currentUser, timestamp: serverTimestamp() });
              }
            }
          }}>
            <div className="inline-flex h-full min-h-0 gap-8 items-stretch pr-8 pb-8 text-slate-800">
              {STAGES.map((s) => (<StageColumn key={s.id} stage={s} cards={byStage.get(s.id) || []} onCardClick={setSelectedId} />))}
            </div>
            {createPortal(<DragOverlay dropAnimation={null}>{activeId ? <CardBase item={cards.find(c => c.id === activeId)!} isOverlay /> : null}</DragOverlay>, document.body)}
          </DndContext>
        </div>
      </main>

      <DetailDrawer item={cards.find(c => c.id === selectedId) || null} isCreate={isCreating} onClose={() => { setSelectedId(null); setIsCreating(false); }} onSave={handleSave} currentUser={currentUser} onDelete={handleDelete} />
      <PauseReasonModal isOpen={!!pendingPauseAction} onConfirm={handleConfirmPause} onCancel={() => setPendingPauseAction(null)} />
      <style jsx global>{` .board-scroll { scrollbar-gutter: stable; } .custom-scrollbar::-webkit-scrollbar { width: 12px; height: 12px; } .custom-scrollbar::-webkit-scrollbar-track { background: #f1f5f9; border-radius: 999px; } .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 999px; border: 3px solid #f1f5f9; } .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; } `}</style>
    </div>
  );
}