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
type EventStageId = "S1" | "S2" | "S3" | "S4" | "S5" | "S6" | "S7" | "S8" | "S9" | "S10" | "S11";
type CustomerTag = "一般客戶" | "VIP客戶" | "黃金客戶";
type TaxType = "應稅(5%)" | "免稅/未稅";

const CUSTOMER_TAGS: CustomerTag[] = ["一般客戶", "VIP客戶", "黃金客戶"];
const BILLING_CYCLES = [
  { label: "單次活動", value: 1 },
  { label: "月繳", value: 1 },
  { label: "季繳", value: 3 },
  { label: "半年繳", value: 6 },
  { label: "年繳", value: 12 },
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

interface EventCard {
  id: string;
  title: string;          
  customer: string;       
  customerTag: CustomerTag;
  owner: string;
  taxType: TaxType;
  actualAmountExclTax: number; 
  totalContractAmount: number; 
  stage: EventStageId;
  updatedAt: any;
  stageStartedAt: string;
  stageEndedAt?: string;  
  stageHistory?: { [key: string]: string }; 
  createdAt: string;
  productLines: string[];
  phone: string;          
  taxId: string;
  roomNo: string;
  eventDate?: string;
  specialNotes: string;   
  todos?: TodoItem[];
  pauseReason?: string;
  attachments?: { name: string; url: string }[];
}

const STAGES: { id: EventStageId; title: string; hint: string }[] = [
  { id: "S1", title: "S1 初步諮詢", hint: "需求意向確認" },
  { id: "S2", title: "S2 對齊需求", hint: "細節規格確認" },
  { id: "S3", title: "S3 初步報價", hint: "預算範圍提供" },
  { id: "S4", title: "S4 設備測試/參觀", hint: "現場評估" },
  { id: "S5", title: "S5 正式報價：回簽與成交 Q&A", hint: "商議成交細節" },
  { id: "S6", title: "S6 議價協商", hint: "價格條件調整" },
  { id: "S7", title: "S7 簽約/訂金確認", hint: "流程執行確認" },
  { id: "S8", title: "S8 成交", hint: "正式結案簽署" },
  { id: "S9", title: "S9 活動前提醒", hint: "後勤準備確認" },
  { id: "S10", title: "S10 活動前中後", hint: "現場執行與結案" },
  { id: "S11", title: "S11 暫停", hint: "暫時停止跟進" },
];

const FIXED_EVENT_TODO = [
  "S1 初步諮詢：感謝詢問、索取活動關鍵五要素（日期、時段、人數、類型、單位）",
  "S2 對齊需求：覆誦需求內容（例:人數、設備、資料文件、餐點）。",
  "S3 初步報價：提供報價單費用:餐飲 進出場 及其他設備備註。",
  "S4 設備測試/參觀：展現開放態度、強調視覺，建立預約機制以確保現場有人接待。",
  "S5 正式報價：目標是完成最後的法律與財務確認，並引導顧客完成「回簽」與「付訂」。",
  "S6 議價協商：引導專員客製化 專屬服務。",
  "S7 簽約/訂金確認：入帳確認與給予確認的安心。",
  "S8 成交：確認合約用印、首筆款項入帳紀錄",
  "S9 活動前提醒：專業感與減少重複溝通。",
  "S10 活動前中後：現場報到支援、場地復原巡檢。"
];

function currency(n: number) {
  return new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 }).format(n || 0);
}

function getDisplayDays(item: EventCard) {
  const start = new Date(item.stageStartedAt || item.createdAt);
  const end = (item.stage === "S8" || item.stage === "S11") && item.stageEndedAt ? new Date(item.stageEndedAt) : new Date();
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

function InputLineStyle({ ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input 
      className="w-full border-b py-2 text-sm outline-none focus:border-purple-600 bg-transparent placeholder:text-slate-300 font-medium text-slate-800"
      {...props}
    />
  );
}

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
            <button key={opt} onClick={() => setSelectedOption(opt)} className={`w-full text-left px-4 py-2.5 rounded-xl border text-xs font-medium transition-all ${selectedOption === opt ? 'bg-purple-50 border-purple-500 text-purple-700' : 'bg-white border-slate-100 text-slate-600 hover:border-purple-200'}`}>{opt}</button>
          ))}
        </div>
        {selectedOption === "其他" && (
          <textarea placeholder="請手動輸入原因..." className="w-full border border-slate-100 rounded-xl p-3 text-xs min-h-[80px] mb-5 text-slate-800 outline-none focus:ring-2 focus:ring-purple-200" value={customReason} onChange={(e) => setCustomReason(e.target.value)} />
        )}
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-2 text-xs font-bold text-slate-400 hover:bg-slate-50 rounded-lg transition-all">取消</button>
          <button onClick={handleConfirm} disabled={!selectedOption || (selectedOption === "其他" && !customReason)} className="flex-1 py-2 text-xs font-bold bg-purple-600 text-white rounded-lg shadow-lg hover:bg-purple-700 disabled:opacity-30">確認暫停</button>
        </div>
      </div>
    </div>
  );
}

function CardBase({ item, isOverlay = false }: { item: EventCard; isOverlay?: boolean }) {
  const days = getDisplayDays(item);
  const isFinished = item.stage === "S8";
  const isPaused = item.stage === "S11";
  let cardStyle = "bg-purple-50 border-slate-200";
  if (isPaused) cardStyle = "bg-red-50 border-red-200";
  let badgeStyle = isFinished ? "bg-slate-400" : isPaused ? "bg-red-600" : (days >= 14 ? "bg-red-800" : days >= 7 ? "bg-red-500" : "bg-emerald-500");
  
  return (
    <div className={[
        "relative rounded-xl border p-4 shadow-sm transition-all duration-200 cursor-grab",
        "will-change-transform",
        "hover:border-purple-500 hover:ring-2 hover:ring-purple-200", 
        isOverlay ? "shadow-2xl ring-2 ring-purple-600 scale-105 border-purple-600" : "", 
        cardStyle
      ].join(" ")}
    >
      <div className="flex justify-between items-start mb-2">
        <div className="text-sm font-bold text-slate-800 line-clamp-1 pr-12">{item.title}</div>
        <div className={`absolute top-3 right-3 px-2 py-0.5 rounded text-[10px] font-bold text-white shadow-sm ${badgeStyle}`}>{isPaused ? "暫停中" : isFinished ? `耗時 ${days}天` : `停留 ${days}天`}</div>
      </div>
      <div className="mb-3">
        <div className="bg-purple-600 text-white text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-tighter shadow-sm w-fit">活動管理</div>
      </div>
      <div className="text-[11px] text-slate-700 font-bold mb-1 flex items-center justify-between">
        <span>窗口: {item.customer || "未填"}</span>
        <span className="text-[9px] font-normal bg-blue-50 text-blue-500 px-1 rounded uppercase tracking-widest">{item.taxType}</span>
      </div>
      {isPaused && item.pauseReason && <div className="mb-3 px-2 py-1.5 bg-red-100 border border-red-200 rounded-lg text-[10px] text-red-700 font-bold flex items-start gap-1.5 line-clamp-2"><span>⚠️</span> {item.pauseReason}</div>}
      <div className="flex justify-between items-end mt-3 pt-3 border-t border-slate-50">
        <div className="text-lg font-black text-purple-600">{currency(item.totalContractAmount)}</div>
        <div className="text-right">
          <p className="text-[10px] text-slate-400 font-medium">日期: {item.eventDate || "-"}</p>
          <p className="text-[10px] text-slate-300 italic">ID: {item.id.slice(-4)}</p>
        </div>
      </div>
    </div>
  );
}

function SortableCard({ item, onClick }: { item: EventCard; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = { transform: CSS.Translate.toString(transform), transition };
  return <div ref={setNodeRef} style={style} {...attributes} {...listeners} onClick={onClick} className={isDragging ? "opacity-30" : ""}><CardBase item={item} /></div>;
}

function StageColumn({ stage, cards, onCardClick }: { stage: (typeof STAGES)[0]; cards: EventCard[]; onCardClick: (id: string) => void }) {
  const { setNodeRef } = useDroppable({ id: stage.id });
  return (
    <div ref={setNodeRef} className="flex min-h-full w-[300px] flex-col rounded-2xl border border-slate-200 bg-slate-50/50 shadow-sm shrink-0 self-stretch overflow-hidden">
      <div className="p-4 pb-3 shrink-0 bg-white text-slate-800 border-b border-slate-100">
        <h3 className="font-bold text-sm flex items-center justify-between">{stage.title} <span className="bg-slate-200 text-slate-500 text-[10px] px-2 py-0.5 rounded-full font-bold">{cards.length}</span></h3>
      </div>
      <SortableContext items={cards.map((x) => x.id)} strategy={verticalListSortingStrategy}>
        <div className="flex-1 min-h-0 px-3 pt-4 pb-12 space-y-4 overflow-y-auto custom-scrollbar">
          {cards.map((item) => <SortableCard key={item.id} item={item} onClick={() => onCardClick(item.id)} />)}
          {cards.length === 0 && <div className="min-h-[140px] border-2 border-dashed border-slate-200 rounded-xl bg-white/50" />}
        </div>
      </SortableContext>
    </div>
  );
}

function DetailDrawer({ item, isCreate, onClose, onSave, currentUser, onDelete }: { 
  item: EventCard | null; isCreate: boolean; onClose: () => void; onSave: (data: EventCard) => void; currentUser: string; onDelete: (id: string) => void;
}) {
  const [formData, setFormData] = useState<Partial<EventCard>>({});
  const [activeTab, setActiveTab] = useState<"info" | "todo" | "copy" | "history">("info");
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [templates, setTemplates] = useState<{id: string, label: string, content: string}[]>([]);

  useEffect(() => {
    // 💡 預先定義預設待辦清單
    const defaultTodos: TodoItem[] = FIXED_EVENT_TODO.map((text, index) => ({ 
      id: `evt-${index}`, 
      text, 
      completed: false 
    }));

    if (isCreate) {
      setFormData({ 
        id: "NEW", stage: "S1", customerTag: "一般客戶", 
        createdAt: new Date().toISOString().split("T")[0],
        taxType: "應稅(5%)", totalContractAmount: 0, 
        todos: defaultTodos, 
        attachments: []
      });
      setActiveTab("info");
    } else if (item) {
      setFormData({ 
        ...item, 
        todos: item.todos && item.todos.length > 0 ? item.todos : defaultTodos,
        attachments: item.attachments || []
      });
      
      const qLogs = query(collection(db, "members", item.id, "logs"), orderBy("timestamp", "desc"));
      const unsubLogs = onSnapshot(qLogs, (snapshot) => setLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as ActivityLog[]));
      
      const qTemplates = query(
        collection(db, "copyTemplates"), 
        where("category", "==", "活動管理"), 
        orderBy("updatedAt", "asc")
      );
      const unsubTemplates = onSnapshot(qTemplates, (snapshot) => {
        setTemplates(snapshot.docs.map(doc => ({ 
          id: doc.id, 
          label: doc.data().label || "未命名範本", 
          content: doc.data().content || "無內容描述" 
        })));
      });

      return () => { unsubLogs(); unsubTemplates(); };
    }
  }, [item?.id, isCreate]);

  const handleValidateAndSave = () => {
    if (!formData.title?.trim() || !formData.customer?.trim()) { alert("⚠️ 請填寫必填欄位：公司/案件全銜 與 主要窗口姓名"); return; }
    onSave(formData as EventCard);
  };

  const updateFinancials = (updates: Partial<EventCard>) => {
    const newExcl = updates.actualAmountExclTax !== undefined ? updates.actualAmountExclTax : (formData.actualAmountExclTax || 0);
    const newTaxType = updates.taxType !== undefined ? updates.taxType : (formData.taxType || "應稅(5%)");
    const total = newTaxType === "應稅(5%)" ? Math.round(newExcl * 1.05) : newExcl;
    setFormData({ ...formData, ...updates, actualAmountExclTax: newExcl, totalContractAmount: total });
  };

  const handleToggleTodo = async (todoId: string) => {
      if (formData.id === "NEW") { 
        alert("請先儲存案件基本資訊後，再開始執行檢查清單勾選。"); 
        return; 
      }
      const updated = (formData.todos || []).map(t => {
        if (t.id === todoId) {
          const isNowCompleted = !t.completed;
          return {
            ...t,
            completed: isNowCompleted,
            completedBy: isNowCompleted ? currentUser : "",
            completedAt: isNowCompleted ? new Date().toLocaleString('zh-TW', { hour12: false }) : ""
          };
        }
        return t;
      });
      setFormData(prev => ({ ...prev, todos: updated }));
      if (item?.id) {
        try {
          const targetTodo = updated.find(t => t.id === todoId);
          await updateDoc(doc(db, "members", item.id), { todos: updated });
          await addDoc(collection(db, "members", item.id, "logs"), { 
            action: `${targetTodo?.completed ? '完成' : '取消'}待辦事項: ${targetTodo?.text}`, 
            user: currentUser, 
            timestamp: serverTimestamp() 
          });
        } catch (error) { console.error("Todo Sync Error:", error); }
      }
    };

  if (!item && !isCreate) return null;

  return (
    <div className="fixed inset-0 z-[100] flex justify-end font-sans text-slate-800">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-300 text-slate-800">
        <header className="p-6 border-b flex justify-between items-center bg-white shrink-0">
          <div className="flex items-center gap-3"><h2 className="text-xl font-bold">{isCreate ? "🆕 新增活動案件" : "📝 編輯案件詳情"}</h2>{formData.stage === "S11" && <span className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold">暫停中</span>}</div>
          <button onClick={onClose} className="text-slate-400 text-2xl hover:text-slate-600 transition-colors">✕</button>
        </header>
        <div className="flex px-8 border-b bg-slate-50/50">
          <button onClick={() => setActiveTab("info")} className={`py-4 px-6 text-sm font-bold border-b-2 transition-all ${activeTab === "info" ? "border-purple-600 text-purple-600" : "border-transparent text-slate-500"}`}>基本資訊</button>
          {!isCreate && (
            <>
              <button onClick={() => setActiveTab("todo")} className={`py-4 px-6 text-sm font-bold border-b-2 transition-all ${activeTab === "todo" ? "border-purple-600 text-purple-600" : "border-transparent text-slate-500"}`}>待辦清單</button>
              <button onClick={() => setActiveTab("copy")} className={`py-4 px-6 text-sm font-bold border-b-2 transition-all ${activeTab === "copy" ? "border-purple-600 text-purple-600" : "border-transparent text-slate-500"}`}>內容複製</button>
              <button onClick={() => setActiveTab("history")} className={`py-4 px-6 text-sm font-bold border-b-2 transition-all ${activeTab === "history" ? "border-purple-600 text-purple-600" : "border-transparent text-slate-500"}`}>歷程記錄</button>
            </>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-8 space-y-10 custom-scrollbar text-slate-800">
          {activeTab === "info" && (
            <>
              {formData.stage === "S11" && <section className="bg-red-50 border border-red-100 p-5 rounded-2xl animate-in slide-in-from-top-2 text-slate-800"><RequiredLabel>暫停原因詳述</RequiredLabel><input value={formData.pauseReason || ""} onChange={(e) => setFormData({ ...formData, pauseReason: e.target.value })} className="w-full border-b border-red-200 py-2 text-sm outline-none focus:border-red-500 font-bold bg-transparent text-red-700" /></section>}
              
              <section className="space-y-4 text-slate-800">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest text-slate-400">基本與聯繫</h3>
                <div className="grid grid-cols-2 gap-x-6 gap-y-4 text-slate-800">
                  <div className="col-span-2">
                    <RequiredLabel>公司/活動全銜</RequiredLabel>
                    <InputLineStyle value={formData.title || ""} onChange={(e) => setFormData({ ...formData, title: e.target.value })} placeholder="活動名稱" />
                  </div>
                  <div>
                    <RequiredLabel>主要窗口姓名</RequiredLabel>
                    <InputLineStyle value={formData.customer || ""} onChange={(e) => setFormData({ ...formData, customer: e.target.value })} placeholder="姓名" />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-500 mb-1 block">聯絡電話</label>
                    <InputLineStyle value={formData.phone || ""} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} placeholder="09XX..." />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-500 mb-1 block">活動預定日期</label>
                    <InputLineStyle type="date" value={formData.eventDate || ""} onChange={(e) => setFormData({ ...formData, eventDate: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-500 mb-1 block">公司統編</label>
                    <InputLineStyle value={formData.taxId || ""} onChange={(e) => setFormData({ ...formData, taxId: e.target.value })} placeholder="8碼數字" />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-500 mb-1 block text-slate-500">房號</label>
                    <InputLineStyle value={formData.roomNo || ""} onChange={(e) => setFormData({ ...formData, roomNo: e.target.value })} placeholder="例如：A01" />
                  </div>

                <div className="text-slate-800">
                  <label className="text-[11px] font-bold text-slate-500 mb-1 block text-slate-500">卡片建立時間 (僅供查看)</label>
                  <div className="w-full border-b py-2 text-sm bg-slate-100 text-slate-400 cursor-not-allowed font-mono px-1">
                    {formData.createdAt ? new Date(formData.createdAt).toLocaleString('zh-TW', { 
                      year: 'numeric', 
                      month: 'numeric', 
                      day: 'numeric', 
                      hour: '2-digit', 
                      minute: '2-digit', 
                      second: '2-digit',
                      hour12: false 
                    }) : "-"}
                  </div>
                  </div>
                </div>
              </section>

              <section className="space-y-4 text-slate-800"><h3 className="text-sm font-bold border-l-4 border-purple-600 pl-3 uppercase tracking-widest text-slate-800">預算與金額</h3>
                <div className="bg-purple-50/30 border border-purple-100 rounded-2xl p-6 space-y-6 text-slate-800">
                  <div className="grid grid-cols-2 gap-6">
                    <div><label className="text-[11px] font-bold text-purple-700 mb-1 block text-purple-700 text-slate-800">稅別</label><select value={formData.taxType || "應稅(5%)"} onChange={(e) => updateFinancials({ taxType: e.target.value as TaxType })} className="w-full border-b border-purple-200 py-2 text-sm outline-none bg-transparent focus:border-purple-500 font-medium text-slate-800"><option value="應稅(5%)">應稅(5%)</option><option value="免稅/未稅">免稅/未稅</option></select></div>
                    <div className="col-span-2 text-slate-800"><label className="text-[11px] font-bold text-purple-700 mb-1 block text-purple-700 text-slate-800">活動總預算/報價 (未稅)</label><input type="number" value={formData.actualAmountExclTax || 0} onChange={(e) => updateFinancials({ actualAmountExclTax: Number(e.target.value) })} className="w-full border-b border-purple-200 py-2 text-lg font-black outline-none bg-transparent focus:border-purple-500 text-purple-800" /></div>
                  </div>
                  <div className="pt-4 border-t border-purple-100 flex justify-between items-center text-slate-800"><span className="text-xs font-bold text-purple-700 text-slate-800">總計金額 (含稅結果):</span><span className="text-2xl font-black text-purple-600 text-slate-800">{currency(formData.totalContractAmount || 0)}</span></div>
                </div>
              </section>

              {/* ✅ 補回合約與附件中心 */}
              <section className="space-y-4 text-slate-800">
                <div className="flex justify-between items-center border-l-4 border-blue-600 pl-3">
                  <h3 className="text-sm font-bold uppercase tracking-widest text-slate-800">合約與附件中心</h3>
                  <label className="cursor-pointer bg-blue-600 text-white px-4 py-2 rounded-xl text-[10px] font-black hover:bg-black transition-all shadow-md">
                    + 上傳附件
                    <input 
                      type="file" 
                      className="hidden" 
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const newAttachments = [...(formData.attachments || []), { name: file.name, url: "#" }];
                          setFormData({ ...formData, attachments: newAttachments });
                          alert(`✅ 附件「${file.name}」已準備好同步，儲存活動後生效。`);
                        }
                      }} 
                    />
                  </label>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  {(formData.attachments || []).map((file: any, index: number) => (
                    <div key={index} className="flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-2xl group hover:border-blue-200 transition-all">
                      <div className="flex items-center gap-3">
                        <span className="text-xl">📄</span>
                        <div>
                          <p className="text-sm font-bold text-slate-700">{file.name}</p>
                          <p className="text-[10px] text-slate-400 font-medium">Cloud Synced</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => {
                          const updated = (formData.attachments || []).filter((_: any, i: number) => i !== index);
                          setFormData({ ...formData, attachments: updated });
                        }}
                        className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-all text-xs font-bold"
                      >
                        移除
                      </button>
                    </div>
                  ))}
                  {(formData.attachments || []).length === 0 && (
                    <div className="py-8 text-center border-2 border-dashed border-slate-100 rounded-[32px] text-slate-400 text-xs italic">
                      目前尚無附件上傳
                    </div>
                  )}
                </div>
              </section>

              <section className="space-y-4 text-slate-800"><h3 className="text-sm font-bold border-l-4 border-slate-400 pl-3 uppercase tracking-widest text-slate-800">其他備註</h3><textarea value={formData.specialNotes || ""} onChange={(e) => setFormData({ ...formData, specialNotes: e.target.value })} className="w-full border rounded-xl p-3 text-sm min-h-[80px] bg-slate-50/50 outline-none text-slate-800" placeholder="活動細節備註..." /></section>
            </>
          )}
          {activeTab === "todo" && (
            <div className="space-y-6 text-slate-800">
              <div className="flex justify-between items-center border-l-4 border-purple-600 pl-3">
                <h3 className="text-sm font-bold uppercase tracking-widest text-slate-800">服務檢查清單 (S1-S10)</h3>
                <span className="text-[10px] font-black bg-purple-50 text-purple-600 px-2 py-1 rounded-lg">雲端即時同步</span>
              </div>

              <div className="space-y-3 text-slate-800">
                {(formData.todos || []).map(todo => (
                  <div 
                    key={todo.id} 
                    onClick={() => handleToggleTodo(todo.id)} 
                    className={`flex items-start gap-4 p-4 rounded-2xl border cursor-pointer transition-all duration-200 ${
                      todo.completed 
                        ? "bg-slate-50/80 border-slate-100 opacity-60 scale-[0.98]" 
                        : "bg-white border-slate-200 shadow-sm hover:border-purple-300 hover:shadow-md"
                    }`}
                  >
                    <div className={`mt-0.5 w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-colors ${
                      todo.completed ? "bg-emerald-500 border-emerald-500 text-white" : "border-slate-200 bg-slate-50"
                    }`}>
                      {todo.completed && <span className="text-xs font-bold text-white">✓</span>}
                    </div>
                    
                    <div className="flex-1">
                      <p className={`text-sm font-bold transition-all ${
                        todo.completed ? "line-through text-slate-400" : "text-slate-700"
                      }`}>
                        {todo.text}
                      </p>
                      {todo.completed && (
                        <div className="flex items-center gap-2 mt-1.5 text-slate-800">
                          <span className="text-[10px] bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded font-black uppercase">Completed</span>
                          <p className="text-[10px] text-slate-400 italic">
                            by {todo.completedBy} @ {todo.completedAt}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "copy" && (
            <div className="space-y-8 text-slate-800">
              <div className="flex justify-between items-center border-l-4 border-purple-600 pl-3 text-slate-800">
                <h3 className="text-sm font-bold uppercase tracking-widest text-slate-800">活動範本快速複製</h3>
              </div>
              <div className="space-y-6 text-slate-800">
                {templates.map((temp) => (
                  <div key={temp.id} className="group relative bg-white p-4 rounded-xl border border-slate-200 hover:border-purple-200 transition-all shadow-sm">
                    <label className="text-xs font-bold text-purple-600 block mb-2">{temp.label}</label>
                    <p className="text-sm whitespace-pre-wrap leading-relaxed pr-10 text-slate-700">{temp.content}</p>
                    <button onClick={() => { navigator.clipboard.writeText(temp.content); alert("✅ 活動範本內容已複製到剪貼簿！"); }} className="absolute top-4 right-4 text-slate-400 hover:text-purple-600 transition-colors text-xs text-purple-600">📋</button>
                  </div>
                ))}
                {templates.length === 0 && <div className="py-20 text-center text-slate-400 italic text-sm border-2 border-dashed border-slate-100 rounded-[32px]">目前尚無活動管理相關範本</div>}
              </div>
            </div>
          )}
          
          {activeTab === "history" && (
            <div className="space-y-10 text-slate-800">
              <section className="space-y-4">
                <h3 className="text-sm font-bold border-l-4 border-purple-600 pl-3 uppercase tracking-widest text-slate-800">階段停留分析</h3>
                <div className="bg-white p-6 rounded-2xl border border-slate-200 text-slate-800 shadow-sm grid grid-cols-2 gap-x-8 gap-y-1.5 font-medium">
                  {STAGES.map(s => {
                    const entryDate = formData.stageHistory?.[s.id];
                    let duration = "-";
                    if (entryDate) {
                      const start = new Date(entryDate);
                      const nextStage = STAGES[STAGES.findIndex(x => x.id === s.id) + 1];
                      const end = formData.stageHistory?.[nextStage?.id || ''] 
                        ? new Date(formData.stageHistory[nextStage.id]) 
                        : (formData.stageEndedAt && (s.id === "S8" || s.id === "S11") ? new Date(formData.stageEndedAt) : new Date());
                      duration = `${Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))} 天`;
                    }
                    return (
                      <div key={s.id} className="flex justify-between items-center border-b border-slate-100 pb-1.5 pt-0.5 last:border-0 last:pb-0 text-slate-900">
                        <span className="text-xs font-black text-purple-700">{s.title}</span>
                        <span className="text-sm font-extrabold text-slate-900">{duration}</span>
                      </div>
                    );
                  })}
                </div>
              </section>
              <section className="space-y-4 text-slate-800">
                <h3 className="text-sm font-bold border-l-4 border-slate-400 pl-3 uppercase tracking-widest text-slate-800">詳細歷史紀錄</h3>
                <div className="relative border-l-2 border-slate-100 ml-2 pl-6 space-y-8 mt-4">
                  {logs.map(log => (<div key={log.id} className="relative"><div className="absolute -left-[31px] top-1 w-2.5 h-2.5 rounded-full bg-slate-200 border-2 border-white" /><div className="text-[11px] text-slate-400 font-medium mb-1">{log.timestamp?.toDate().toLocaleString() || "剛才"}</div><div className="text-sm text-slate-700 leading-relaxed font-medium bg-slate-50 p-3 rounded-lg border border-slate-100">{log.action} <span className="text-slate-400 text-xs ml-1 font-normal">by {log.user}</span></div></div>))}
                </div>
              </section>
            </div>
          )}
        </div>
        <footer className="p-6 border-t bg-slate-50 shrink-0 flex gap-3 text-slate-800 text-slate-800">
          {!isCreate && <button type="button" onClick={() => onDelete(item!.id)} className="px-6 py-4 rounded-2xl font-bold border border-red-200 text-red-500 hover:bg-red-50 transition-colors text-xs text-red-500">刪除活動</button>}
          <button onClick={handleValidateAndSave} className="flex-1 bg-slate-900 text-white py-4 rounded-2xl font-bold hover:bg-black transition-all shadow-lg text-xs text-white">儲存活動</button>
        </footer>
      </div>
    </div>
  );
}

// --- 主看板頁面 (搜尋列樣式維持) ---
export default function EventsManagementPage() {
  const [hasMounted, setHasMounted] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [searchInput, setSearchInput] = useState("");
  const [monthStartInput, setMonthStartInput] = useState("");
  const [monthEndInput, setMonthEndInput] = useState("");
  const [appliedFilters, setAppliedFilters] = useState({ query: "", start: "", end: "" });
  const [cards, setCards] = useState<EventCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [currentUser, setCurrentUser] = useState<string>("ADMIN");
  const [pendingPauseAction, setPendingPauseAction] = useState<{ cardId: string, toStage: EventStageId } | null>(null);
  const [signedOffOverdue, setSignedOffOverdue] = useState<string[]>([]);

  useEffect(() => {
      setHasMounted(true);
      onAuthStateChanged(auth, (user) => { if (user) setCurrentUser(user.email || "User"); });
      const q = query(collection(db, "members"), where("productLines", "array-contains", "活動管理"));
      
      const unsubscribe = onSnapshot(q, (snapshot) => { 
        const newCards = snapshot.docs.map(d => ({ ...d.data(), id: d.id })) as EventCard[];
        setCards(newCards); 
        setLoading(false); 

        const params = new URLSearchParams(window.location.search);
        const idFromUrl = params.get('id');
        if (idFromUrl) {
          setSelectedId(idFromUrl);
          window.history.replaceState({}, '', window.location.pathname);
        }
      });
      
      return () => unsubscribe();
    }, []);

  const handleApplyFilter = () => setAppliedFilters({ query: searchInput, start: monthStartInput, end: monthEndInput });
  const handleClearFilter = () => { setSearchInput(""); setMonthStartInput(""); setMonthEndInput(""); setAppliedFilters({ query: "", start: "", end: "" }); };

  const filteredCards = useMemo(() => {
    return cards.filter(card => {
      const { query, start, end } = appliedFilters;
      const searchStr = query.toLowerCase();
      if (searchStr && !((card.title || "").toLowerCase().includes(searchStr) || (card.customer || "").toLowerCase().includes(searchStr) || (card.taxId || "").includes(searchStr))) return false;
      if (start || end) { const cm = card.createdAt.substring(0, 7); if (start && cm < start) return false; if (end && cm > end) return false; }
      return true;
    });
  }, [cards, appliedFilters]);

  const overdueAlerts = useMemo(() => {
    const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
    const now = new Date().getTime();
    return cards.filter(card => {
      if (card.stage !== "S7" || signedOffOverdue.includes(card.id)) return false;
      const stageTime = new Date(card.stageStartedAt).getTime();
      return (now - stageTime) > THREE_DAYS_MS;
    });
  }, [cards, signedOffOverdue]);

  const handleSignOff = async (cardId: string) => { await addDoc(collection(db, "members", cardId, "logs"), { action: "主管已核閱簽約/訂金逾期風險並簽署", user: currentUser, timestamp: serverTimestamp() }); setSignedOffOverdue(prev => [...prev, cardId]); };

  const handleSave = async (data: EventCard) => {
    if (!data.taxId) {
      const ok = confirm("⚠️ 未填寫統編\n\n系統將無法比對現有客戶，會直接建立一筆新資料。\n\n確定不填統編直接儲存嗎？");
      if (!ok) return;
    }
      try {
        const payload = { 
          ...data, 
          name: data.title, 
          contactPerson: data.customer, 
          productLines: ["活動管理"], 
          attachments: (data as any).attachments || [], 
          updatedAt: serverTimestamp() 
        };

        if (isCreating || data.id === "NEW") {
          const newRef = await addDoc(collection(db, "members"), { 
            ...payload, 
            createdAt: new Date().toISOString(), 
            stageStartedAt: new Date().toISOString(), 
            stageHistory: { "S1": new Date().toISOString() } 
          });
          await addDoc(collection(db, "members", newRef.id, "logs"), { action: "建立了新活動案件", user: currentUser, timestamp: serverTimestamp() });
        } else { 
          await updateDoc(doc(db, "members", data.id), payload); 
        }
        
        setIsCreating(false); 
        setSelectedId(null);
        alert("活動案件已儲存，附件已同步至契約中心！");
      } catch (e) { 
        console.error(e); 
        alert("儲存失敗");
      }
    };

  const handleConfirmPause = async (reason: string) => {
    if (!pendingPauseAction) return;
    const card = cards.find(c => c.id === pendingPauseAction.cardId);
    const today = new Date().toISOString().split('T')[0];
    await updateDoc(doc(db, "members", pendingPauseAction.cardId), { stage: pendingPauseAction.toStage, stageStartedAt: today, stageHistory: { ...card?.stageHistory, [pendingPauseAction.toStage]: today }, pauseReason: reason, updatedAt: serverTimestamp() });
    await addDoc(collection(db, "members", pendingPauseAction.cardId, "logs"), { action: `活動移動至暫停，原因：${reason}`, user: currentUser, timestamp: serverTimestamp() });
    setPendingPauseAction(null);
  };

  const byStage = useMemo(() => {
    const map = new Map<EventStageId, EventCard[]>();
    STAGES.forEach(s => map.set(s.id, []));
    filteredCards.forEach(c => map.get(c.stage)?.push(c));
    return map;
  }, [filteredCards]);

  if (!hasMounted || loading) return <div className="h-screen flex items-center justify-center font-bold text-slate-400 bg-slate-50 text-slate-800">載入活動中...</div>;

  return (
    <div className="fixed inset-0 left-[260px] flex flex-col bg-slate-50/50 overflow-hidden text-slate-800">
      <header className="p-8 shrink-0 bg-white border-b shadow-sm z-10 text-slate-800">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold underline decoration-purple-500/30">活動管理看板</h1>
          <button onClick={() => setIsCreating(true)} className="bg-slate-900 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg hover:bg-black transition-all text-sm">+{isCreating ? "" : " "}新增活動案件</button>
        </div>
        <div className="flex items-center gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
          <div className="flex items-center gap-2"><span className="text-[10px] font-black text-slate-400 uppercase shrink-0">搜尋</span><input placeholder="名稱/窗口" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} className="px-2 py-1.5 border border-slate-200 rounded-lg text-xs w-48 outline-none focus:border-purple-400 bg-white" /></div>
          <div className="h-4 w-px bg-slate-200" /><div className="flex items-center gap-2"><span className="text-[10px] font-black text-slate-400 uppercase">月份</span><div className="flex items-center gap-1"><input type="month" value={monthStartInput} onChange={(e) => setMonthStartInput(e.target.value)} className="px-1.5 py-1 border border-slate-200 rounded text-xs outline-none bg-white" /><span className="text-slate-300 text-[10px]">~</span><input type="month" value={monthEndInput} onChange={(e) => setMonthEndInput(e.target.value)} className="px-1.5 py-1 border border-slate-200 rounded text-xs outline-none bg-white" /></div></div>
          <div className="flex gap-1.5 ml-auto text-slate-800"><button onClick={handleClearFilter} className="px-3 py-1.5 text-xs font-bold text-slate-400 hover:text-slate-600">清除條件</button><button onClick={handleApplyFilter} className="px-4 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm">執行查詢</button></div>
        </div>
      </header>

      {overdueAlerts.length > 0 && (
        <div className="px-8 mt-2 space-y-1">{overdueAlerts.map(alert => (<div key={alert.id} className="bg-red-50 border-l-4 border-red-500 p-3 rounded-r-lg shadow-sm flex items-center justify-between"><div className="flex items-center gap-2"><span className="text-sm">⚠️</span><h4 className="text-red-800 font-black text-[11px]">簽約/訂金逾期：{alert.title}</h4></div><button onClick={() => handleSignOff(alert.id)} className="px-3 py-1 text-[10px] font-bold text-white bg-red-600 rounded shadow-sm hover:bg-red-700">主管簽署</button></div>))}</div>
      )}

      <main className="flex-1 min-h-0 px-8 pt-4 pb-6 flex flex-col text-slate-800">
        <div className="board-scroll flex-1 min-h-0 overflow-auto custom-scrollbar rounded-b-2xl">
          <DndContext sensors={sensors} onDragStart={(e) => setActiveId(String(e.active.id))} onDragEnd={async (e) => {
            const { active, over } = e; setActiveId(null); if (!over) return;
            const aId = String(active.id); let toStage = String(over.id) as EventStageId; if (!STAGES.some(s => s.id === toStage)) toStage = cards.find(c => c.id === String(over.id))?.stage as EventStageId;
            const card = cards.find(c => c.id === aId);
            if (toStage && card?.stage !== toStage) {
              if (toStage === "S11") { setPendingPauseAction({ cardId: aId, toStage }); }
              else {
                const today = new Date().toISOString().split('T')[0];
                const updateData: any = { stage: toStage, stageStartedAt: today, stageHistory: { ...card?.stageHistory, [toStage]: today }, updatedAt: serverTimestamp() };
                if (card?.stage === "S11") updateData.pauseReason = "";
                await updateDoc(doc(db, "members", aId), updateData);
                await addDoc(collection(db, "members", aId, "logs"), { action: `活動階段變更至 ${toStage}`, user: currentUser, timestamp: serverTimestamp() });
              }
            }
          }}>
            <div className="inline-flex h-full min-h-0 gap-8 items-stretch pr-8 pb-8">
              {STAGES.map((s) => (<StageColumn key={s.id} stage={s} cards={byStage.get(s.id) || []} onCardClick={setSelectedId} />))}
            </div>
            {createPortal(<DragOverlay dropAnimation={null}>{activeId ? <CardBase item={cards.find(c => c.id === activeId)!} isOverlay /> : null}</DragOverlay>, document.body)}
          </DndContext>
        </div>
      </main>

      <DetailDrawer item={cards.find(c => c.id === selectedId) || null} isCreate={isCreating} onClose={() => { setSelectedId(null); setIsCreating(false); }} onSave={handleSave} currentUser={currentUser} onDelete={(id) => deleteDoc(doc(db, "members", id))} />
      <PauseReasonModal isOpen={!!pendingPauseAction} onConfirm={handleConfirmPause} onCancel={() => setPendingPauseAction(null)} />
      <style jsx global>{` .board-scroll { scrollbar-gutter: stable; } .custom-scrollbar::-webkit-scrollbar { width: 12px; height: 12px; } .custom-scrollbar::-webkit-scrollbar-track { background: #f1f5f9; border-radius: 999px; } .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 999px; border: 3px solid #f1f5f9; } .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; } `}</style>
    </div>
  );
}