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
} from "firebase/firestore";

// --- 類型與常數定義 ---
type StageId = "S1" | "S2" | "S3" | "S4" | "S5";

const STAGES: { id: StageId; title: string }[] = [
  { id: "S1", title: "S1 尚未聯繫" },
  { id: "S2", title: "S2 處理中" },
  { id: "S3", title: "S3 報價" },
  { id: "S4", title: "S4 成交" },
  { id: "S5", title: "S5 暫停" },
];

// 固定封閉式暫停原因（不像其他產品線還有「其他」自訂輸入）
const PAUSE_OPTIONS = [
  "不符標準化案件",
  "預算不符",
  "追蹤兩次皆無任何回覆",
  "選擇競爭對手",
];

const FIXED_TODO_LIST = [
  "S1 尚未聯繫：確認名單來源、安排首次聯繫",
  "S2 處理中：釐清需求範圍、確認決策窗口",
  "S3 報價：提供正式報價單、確認預算與時程",
  "S4 成交：簽約/訂金確認、核對統編與交付資訊",
  "S5 暫停：填寫暫停原因、後續追蹤計畫",
];

interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
  completedBy?: string;
  completedAt?: string;
}

interface HistoryLog {
  id: string;
  action: string;
  user: string;
  timestamp: any;
}

interface DeltraCard {
  id: string;
  companyName: string;
  contactPerson: string;
  phone: string;
  email: string;
  taxId: string;
  amount: number;
  notes: string;
  stage: StageId;
  updatedAt: any;
  stageStartedAt: string;
  stageEndedAt?: string;
  stageHistory?: { [key: string]: string };
  createdAt: string;
  pauseReason?: string;
  todos?: TodoItem[];
}

function currency(n: number) {
  return new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 }).format(n || 0);
}

// S1~S3：即時累加（算到今天，或算到下一次轉換）；S4/S5：凍結顯示 S1~S3 的累積總天數
function getDisplayDays(item: DeltraCard) {
  const isFinalStage = item.stage === "S4" || item.stage === "S5";

  if (isFinalStage) {
    const startDateStr = item.stageHistory?.["S1"] || item.createdAt;
    const startTime = new Date(startDateStr).getTime();

    const endDateStr = item.stageHistory?.[item.stage] || item.stageEndedAt;
    const endTime = endDateStr ? new Date(endDateStr).getTime() : Date.now();

    const diffTime = endTime - startTime;
    return Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
  }

  const start = new Date(item.stageStartedAt || item.createdAt);
  const end = new Date();
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

// --- 暫停原因 Modal（封閉式選項，不需要自訂輸入） ---
function PauseReasonModal({ isOpen, onConfirm, onCancel }: { isOpen: boolean; onConfirm: (reason: string) => void; onCancel: () => void }) {
  const [selectedOption, setSelectedOption] = useState("");
  const handleConfirm = () => {
    if (!selectedOption) return;
    onConfirm(selectedOption);
    setSelectedOption("");
  };
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl p-6 w-[360px] shadow-2xl">
        <h3 className="text-base font-bold mb-4 text-slate-800">⏸ 選擇暫停原因</h3>
        <div className="space-y-1.5 mb-5 text-slate-800">
          {PAUSE_OPTIONS.map((opt, i) => (
            <button
              key={opt}
              onClick={() => setSelectedOption(opt)}
              className={`w-full text-left px-4 py-2.5 rounded-xl border text-xs font-medium transition-all ${selectedOption === opt ? "bg-red-50 border-red-500 text-red-700" : "bg-white border-slate-100 text-slate-600 hover:border-red-200"}`}
            >
              {i + 1}. {opt}
            </button>
          ))}
        </div>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-2 text-xs font-bold text-slate-400 hover:bg-slate-50 rounded-lg">取消</button>
          <button onClick={handleConfirm} disabled={!selectedOption} className="flex-1 py-2 text-xs font-bold bg-red-500 text-white rounded-lg shadow-lg hover:bg-red-600 transition-all disabled:opacity-30">確認暫停</button>
        </div>
      </div>
    </div>
  );
}

// --- 看板卡片元件 ---
function CardBase({ item, isOverlay = false }: { item: DeltraCard; isOverlay?: boolean }) {
  const days = getDisplayDays(item);
  const isFinalStage = item.stage === "S4" || item.stage === "S5";
  const badgeStyle = isFinalStage
    ? "bg-slate-400 text-white"
    : (days >= 10 ? "bg-red-500 text-white" : days >= 3 ? "bg-amber-400 text-white" : "bg-emerald-500 text-white");
  const isPaused = item.stage === "S5";

  return (
    <div
      style={{ backgroundColor: isPaused ? "#FFF5F5" : "#F0F5FF" }}
      className={`relative rounded-xl border border-slate-200 p-4 shadow-sm transition-all duration-200 ${isOverlay ? "shadow-2xl ring-2 ring-indigo-500 scale-105" : "hover:ring-2 hover:ring-indigo-400 cursor-grab"}`}
    >
      <div className="flex justify-between items-start mb-2 text-slate-800">
        <div className="text-sm font-bold line-clamp-1 pr-14">{item.companyName || "未命名案件"}</div>
        <div className={`absolute top-3 right-3 px-2 py-0.5 rounded text-[10px] font-bold shadow-sm ${badgeStyle}`}>
          {isFinalStage ? `耗時 ${days}天` : `停留 ${days}天`}
        </div>
      </div>
      <div className="mb-2">
        <span className="bg-indigo-600 text-white text-[10px] font-bold px-2.5 py-1 rounded shadow-sm">Deltra ERP</span>
      </div>
      <div className="text-[11px] text-slate-500 font-medium mb-3">窗口：{item.contactPerson || "未填寫"}</div>
      {isPaused && item.pauseReason && (
        <div className="mb-3 px-2 py-1.5 bg-red-100 border border-red-200 rounded-lg text-[10px] text-red-700 font-bold flex items-start gap-1.5 line-clamp-2">
          <span>⚠️</span> {item.pauseReason}
        </div>
      )}
      <div className="flex justify-between items-end pt-3 border-t border-slate-100">
        <div className="text-lg font-black text-indigo-600">{currency(item.amount)}</div>
        <div className="text-[10px] text-slate-400">{item.taxId || "-"}</div>
      </div>
    </div>
  );
}

function SortableCard({ item, onClick }: { item: DeltraCard; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = { transform: CSS.Translate.toString(transform), transition };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} onClick={onClick} className={isDragging ? "opacity-30" : ""}>
      <CardBase item={item} />
    </div>
  );
}

function StageColumn({ stage, cards, onCardClick }: { stage: (typeof STAGES)[0]; cards: DeltraCard[]; onCardClick: (id: string) => void }) {
  const { setNodeRef } = useDroppable({ id: stage.id });
  return (
    <div ref={setNodeRef} className="flex min-h-full w-[300px] flex-col rounded-2xl border border-slate-200 bg-slate-50/50 shadow-sm shrink-0 self-stretch overflow-hidden">
      <div className="p-4 pb-3 shrink-0 bg-white text-slate-800 border-b border-slate-100">
        <h3 className="font-bold text-sm flex items-center justify-between">
          {stage.title} <span className="bg-slate-200 text-slate-500 text-[10px] px-2 py-0.5 rounded-full font-bold">{cards.length}</span>
        </h3>
      </div>
      <SortableContext items={cards.map((x) => x.id)} strategy={verticalListSortingStrategy}>
        <div className="flex-1 min-h-0 px-3 pt-4 pb-12 space-y-4 overflow-y-auto custom-scrollbar text-slate-800">
          {cards.map((item) => (
            <SortableCard key={item.id} item={item} onClick={() => onCardClick(item.id)} />
          ))}
          {cards.length === 0 && <div className="min-h-[140px] border-2 border-dashed border-slate-200 rounded-xl bg-white/50" />}
        </div>
      </SortableContext>
    </div>
  );
}

// --- 詳情抽屜 ---
function DetailDrawer({
  item, isCreate, onClose, onSave, currentUser, onDelete,
}: {
  item: DeltraCard | null; isCreate: boolean; onClose: () => void; onSave: (data: DeltraCard) => void; currentUser: string; onDelete: (id: string) => void;
}) {
  const [formData, setFormData] = useState<Partial<DeltraCard>>({});
  const [activeTab, setActiveTab] = useState<"info" | "todo" | "history">("info");
  const [logs, setLogs] = useState<HistoryLog[]>([]);

  useEffect(() => {
    const defaultTodos: TodoItem[] = FIXED_TODO_LIST.map((text, index) => ({ id: `deltra-${index}`, text, completed: false }));
    if (isCreate) {
      setFormData({
        id: "NEW",
        stage: "S1",
        stageStartedAt: new Date().toISOString().split("T")[0],
        createdAt: new Date().toISOString(),
        stageHistory: { S1: new Date().toISOString().split("T")[0] },
        amount: 0,
        companyName: "",
        contactPerson: "",
        phone: "",
        email: "",
        taxId: "",
        notes: "",
        todos: defaultTodos,
      });
      setActiveTab("info");
    } else if (item) {
      setFormData({ ...item, todos: item.todos && item.todos.length > 0 ? item.todos : defaultTodos });
      const qLogs = query(collection(db, "deltraCases", item.id, "logs"), orderBy("timestamp", "desc"));
      const unsubLogs = onSnapshot(qLogs, (snapshot) => setLogs(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as HistoryLog[]));
      return () => unsubLogs();
    }
  }, [item?.id, isCreate]);

  const handleToggleTodo = async (todoId: string) => {
    if (formData.id === "NEW") { alert("請先儲存案件後再勾選事項。"); return; }
    const updated = (formData.todos || []).map((t) =>
      t.id === todoId ? { ...t, completed: !t.completed, completedBy: !t.completed ? currentUser : "", completedAt: !t.completed ? new Date().toLocaleString() : "" } : t
    );
    setFormData({ ...formData, todos: updated });
    if (item?.id) {
      await updateDoc(doc(db, "deltraCases", item.id), { todos: updated });
      await addDoc(collection(db, "deltraCases", item.id, "logs"), { action: `勾選待辦: ${updated.find((t) => t.id === todoId)?.text}`, user: currentUser, timestamp: serverTimestamp() });
    }
  };

  const handleValidateAndSave = () => {
    if (!formData.companyName?.trim() || !formData.contactPerson?.trim()) {
      alert("⚠️ 請填寫必填欄位：公司/案件名稱 與 主要窗口姓名");
      return;
    }
    onSave(formData as DeltraCard);
  };

  if (!item && !isCreate) return null;

  return (
    <div className="fixed inset-0 z-[100] flex justify-end font-sans text-slate-800">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col overflow-hidden">
        <header className="p-6 border-b flex justify-between items-center bg-white shrink-0 text-slate-800">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold">{isCreate ? "🆕 新增 Deltra ERP 案件" : "📝 編輯案件詳情"}</h2>
            {formData.stage === "S5" && <span className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold">暫停中</span>}
          </div>
          <button onClick={onClose} className="text-slate-400 text-2xl hover:text-slate-600 transition-colors">✕</button>
        </header>

        <div className="flex px-8 border-b bg-slate-50/50">
          <button onClick={() => setActiveTab("info")} className={`py-4 px-6 text-sm font-bold border-b-2 transition-all ${activeTab === "info" ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-500"}`}>基本資訊</button>
          {!isCreate && (
            <>
              <button onClick={() => setActiveTab("todo")} className={`py-4 px-6 text-sm font-bold border-b-2 transition-all ${activeTab === "todo" ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-500"}`}>待辦清單</button>
              <button onClick={() => setActiveTab("history")} className={`py-4 px-6 text-sm font-bold border-b-2 transition-all ${activeTab === "history" ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-500"}`}>歷程記錄</button>
            </>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-10 custom-scrollbar text-slate-800">
          {activeTab === "info" && (
            <>
              {formData.stage === "S5" && (
                <section className="bg-red-50 border border-red-100 p-5 rounded-2xl text-slate-800">
                  <label className="text-xs font-bold text-red-600 block mb-1">暫停原因</label>
                  <div className="text-sm font-bold text-red-700">{formData.pauseReason || "-"}</div>
                </section>
              )}
              <section className="grid grid-cols-2 gap-6 text-slate-800">
                <div className="col-span-2"><RequiredLabel>公司/案件名稱</RequiredLabel><input value={formData.companyName || ""} onChange={(e) => setFormData({ ...formData, companyName: e.target.value })} className="w-full border-b py-2 text-sm outline-none focus:border-indigo-600 font-medium bg-transparent" /></div>
                <div><RequiredLabel>主要窗口姓名</RequiredLabel><input value={formData.contactPerson || ""} onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })} className="w-full border-b py-2 text-sm outline-none focus:border-indigo-600 bg-transparent" /></div>
                <div><label className="text-[11px] font-bold text-slate-500 mb-1 block">聯絡電話</label><input value={formData.phone || ""} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} className="w-full border-b py-2 text-sm outline-none focus:border-indigo-600 bg-transparent" /></div>
                <div><label className="text-[11px] font-bold text-slate-500 mb-1 block">Email</label><input value={formData.email || ""} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className="w-full border-b py-2 text-sm outline-none focus:border-indigo-600 bg-transparent" /></div>
                <div><label className="text-[11px] font-bold text-slate-500 mb-1 block">公司統編</label><input value={formData.taxId || ""} onChange={(e) => setFormData({ ...formData, taxId: e.target.value })} className="w-full border-b py-2 text-sm outline-none focus:border-indigo-600 bg-transparent" /></div>
                <div className="col-span-2">
                  <label className="text-[11px] font-bold text-slate-500 mb-1 block">卡片建立時間（僅供查看）</label>
                  <div className="w-full border-b py-2 text-sm bg-slate-100 text-slate-400 cursor-not-allowed font-mono px-1">
                    {formData.createdAt ? new Date(formData.createdAt).toLocaleString("zh-TW", { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }) : "-"}
                  </div>
                </div>
              </section>

              <section className="space-y-4 text-slate-800">
                <h3 className="text-sm font-bold border-l-4 border-indigo-600 pl-3 uppercase tracking-widest">成交金額</h3>
                <div className="bg-indigo-50/30 border border-indigo-100 rounded-2xl p-6">
                  <input
                    type="number"
                    value={formData.amount === 0 ? "" : formData.amount || ""}
                    onChange={(e) => setFormData({ ...formData, amount: Number(e.target.value) })}
                    placeholder="0"
                    className="w-full border-b border-indigo-200 py-2 text-2xl font-black outline-none bg-transparent focus:border-indigo-500 text-indigo-800"
                  />
                </div>
              </section>

              <section className="space-y-4 text-slate-800">
                <h3 className="text-sm font-bold border-l-4 border-slate-400 pl-3 uppercase tracking-widest">其他備註</h3>
                <textarea value={formData.notes || ""} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} className="w-full border rounded-xl p-3 text-sm min-h-[80px] bg-slate-50/50 outline-none" />
              </section>
            </>
          )}

          {activeTab === "todo" && (
            <div className="space-y-4 text-slate-800">
              <h3 className="text-sm font-bold border-l-4 border-amber-500 pl-3 uppercase tracking-widest">核對清單</h3>
              <div className="space-y-2">
                {(formData.todos || []).map((todo) => (
                  <div key={todo.id} onClick={() => handleToggleTodo(todo.id)} className={`flex items-start gap-4 p-4 rounded-xl border cursor-pointer transition-all ${todo.completed ? "bg-slate-50 border-slate-100 opacity-60" : "bg-white border-slate-200 shadow-sm"}`}>
                    <div className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center ${todo.completed ? "bg-emerald-500 border-emerald-500 text-white" : "border-slate-300"}`}>{todo.completed && "✓"}</div>
                    <div className="flex-1">
                      <p className={`text-sm font-bold ${todo.completed ? "line-through text-slate-400" : "text-slate-800"}`}>{todo.text}</p>
                      {todo.completed && <p className="text-[10px] text-slate-400 mt-1 italic">✓ {todo.completedBy} @ {todo.completedAt}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "history" && (
            <div className="space-y-10 text-slate-800">
              <section className="space-y-4">
                <h3 className="text-sm font-bold border-l-4 border-blue-600 pl-3 uppercase tracking-widest">階段天數分析</h3>
                <div className="grid grid-cols-2 gap-4 bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                  {STAGES.map((s) => {
                    const entryDate = formData.stageHistory?.[s.id];
                    const isFinalStage = s.id === "S4" || s.id === "S5";
                    let duration = "-";

                    if (entryDate) {
                      if (isFinalStage) {
                        if (formData.stage === s.id) {
                          const startDateStr = formData.stageHistory?.["S1"] || formData.createdAt || new Date().toISOString();
                          const days = Math.floor((new Date(entryDate).getTime() - new Date(startDateStr as string).getTime()) / (1000 * 60 * 60 * 24));
                          duration = `${Math.max(0, days)} 天`;
                        }
                      } else {
                        const entryTime = new Date(entryDate).getTime();
                        const laterEntries = Object.entries(formData.stageHistory || {})
                          .filter(([key, val]) => key !== s.id && !!val && new Date(val).getTime() > entryTime)
                          .map(([, val]) => new Date(val as string).getTime());

                        let endTime: number;
                        if (laterEntries.length > 0) endTime = Math.min(...laterEntries);
                        else if (formData.stage === s.id) endTime = Date.now();
                        else endTime = entryTime;

                        const days = Math.floor((endTime - entryTime) / (1000 * 60 * 60 * 24));
                        duration = `${Math.max(0, days)} 天`;
                      }
                    }
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
                  {logs.map((log) => (
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
          <button onClick={handleValidateAndSave} className="flex-1 bg-slate-900 text-white py-4 rounded-2xl font-bold hover:bg-black transition-all shadow-lg text-xs">儲存並同步</button>
        </footer>
      </div>
    </div>
  );
}

// --- 主看板頁面 ---
export default function DeltraErpPage() {
  const { width: sidebarWidth } = useSidebar();
  const [hasMounted, setHasMounted] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [cards, setCards] = useState<DeltraCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [currentUser, setCurrentUser] = useState<string>("ADMIN");
  const [pendingPauseAction, setPendingPauseAction] = useState<{ cardId: string; toStage: StageId } | null>(null);

  useEffect(() => {
    setHasMounted(true);
    onAuthStateChanged(auth, (user) => { if (user) setCurrentUser(user.email || "User"); });
    const q = query(collection(db, "deltraCases"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setCards(snapshot.docs.map((d) => ({ ...d.data(), id: d.id })) as DeltraCard[]);
      setLoading(false);

      const params = new URLSearchParams(window.location.search);
      const idFromUrl = params.get("id");
      if (idFromUrl) {
        setSelectedId(idFromUrl);
        window.history.replaceState({}, "", window.location.pathname);
      }
    });
    return () => unsubscribe();
  }, []);

  const filteredCards = useMemo(() => {
    const s = appliedSearch.toLowerCase();
    if (!s) return cards;
    return cards.filter((card) =>
      (card.companyName || "").toLowerCase().includes(s) ||
      (card.contactPerson || "").toLowerCase().includes(s) ||
      (card.taxId || "").includes(s)
    );
  }, [cards, appliedSearch]);

  const handleSave = async (data: DeltraCard) => {
    const { id, ...rest } = data;
    const payload = { ...rest, updatedAt: serverTimestamp() };
    if (isCreating || id === "NEW") {
      const ref = await addDoc(collection(db, "deltraCases"), { ...payload, createdAt: new Date().toISOString(), stageStartedAt: new Date().toISOString(), stageHistory: { S1: new Date().toISOString() } });
      await addDoc(collection(db, "deltraCases", ref.id, "logs"), { action: "建立了新 Deltra ERP 案件", user: currentUser, timestamp: serverTimestamp() });
    } else {
      await updateDoc(doc(db, "deltraCases", id), payload);
    }
    setIsCreating(false);
    setSelectedId(null);
  };

  const handleDelete = async (id: string) => {
    if (confirm("確定刪除？")) {
      await deleteDoc(doc(db, "deltraCases", id));
      setSelectedId(null);
    }
  };

  const handleConfirmPause = async (reason: string) => {
    if (!pendingPauseAction) return;
    const { cardId, toStage } = pendingPauseAction;
    const card = cards.find((c) => c.id === cardId);
    const today = new Date().toISOString().split("T")[0];
    // 每個階段只記錄「第一次進入」的日期，之後不論再回到這個階段幾次都不覆寫
    const protectedDate = card?.stageHistory?.[toStage] || today;
    const historyUpdate = { ...card?.stageHistory, [toStage]: protectedDate };
    await updateDoc(doc(db, "deltraCases", cardId), { stage: toStage, stageStartedAt: protectedDate, stageEndedAt: today, stageHistory: historyUpdate, pauseReason: reason, updatedAt: serverTimestamp() });
    await addDoc(collection(db, "deltraCases", cardId, "logs"), { action: `階段移動至暫停，原因：${reason}`, user: currentUser, timestamp: serverTimestamp() });
    setPendingPauseAction(null);
  };

  const byStage = useMemo(() => {
    const map = new Map<StageId, DeltraCard[]>();
    STAGES.forEach((s) => map.set(s.id, []));
    filteredCards.forEach((c) => map.get(c.stage)?.push(c));
    return map;
  }, [filteredCards]);

  if (!hasMounted || loading) return <div className="h-screen flex items-center justify-center font-bold text-slate-400 bg-slate-50">載入中...</div>;

  return (
    <div style={{ left: sidebarWidth, transition: "left 200ms" }} className="fixed inset-0 flex flex-col bg-slate-50/50 overflow-hidden text-slate-800">
      <header className="p-8 pb-4 shrink-0 bg-white border-b shadow-sm z-10">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold underline decoration-indigo-500/30">Deltra ERP 管理看板</h1>
          <button onClick={() => setIsCreating(true)} className="bg-slate-900 text-white px-5 py-2 rounded-lg font-bold shadow-md hover:bg-black transition-all text-xs">+ 新增案件</button>
        </div>
        <div className="flex items-center gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
          <span className="text-[10px] font-black text-slate-400 uppercase">搜尋</span>
          <input
            placeholder="名稱/窗口/統編"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="px-2 py-1.5 border border-slate-200 rounded-lg text-xs w-48 outline-none focus:border-indigo-400 bg-white"
          />
          <button onClick={() => { setSearchInput(""); setAppliedSearch(""); }} className="px-3 py-1.5 text-xs font-bold text-slate-400 hover:text-slate-600">清除</button>
          <button onClick={() => setAppliedSearch(searchInput)} className="px-4 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm">執行</button>
        </div>
      </header>

      <main className="flex-1 min-h-0 px-8 pt-4 pb-6 flex flex-col">
        <div className="board-scroll flex-1 min-h-0 overflow-auto custom-scrollbar rounded-b-2xl">
          <DndContext
            sensors={sensors}
            onDragStart={(e) => setActiveId(String(e.active.id))}
            onDragEnd={async (e) => {
              const { active, over } = e;
              setActiveId(null);
              if (!over) return;
              const aId = String(active.id);
              const oId = String(over.id);
              let toStage = oId as StageId;
              if (!STAGES.some((s) => s.id === oId)) toStage = cards.find((c) => c.id === oId)?.stage as StageId;
              const card = cards.find((c) => c.id === aId);
              if (toStage && card?.stage !== toStage) {
                if (toStage === "S5") {
                  setPendingPauseAction({ cardId: aId, toStage });
                } else {
                  const today = new Date().toISOString().split("T")[0];
                  const protectedDate = card?.stageHistory?.[toStage] || today;
                  const historyUpdate = { ...card?.stageHistory, [toStage]: protectedDate };
                  const data: any = { stage: toStage, stageStartedAt: protectedDate, stageHistory: historyUpdate, updatedAt: serverTimestamp() };
                  if (toStage === "S4") data.stageEndedAt = today;
                  if (card?.stage === "S5") data.pauseReason = "";
                  await updateDoc(doc(db, "deltraCases", aId), data);
                  await addDoc(collection(db, "deltraCases", aId, "logs"), { action: `階段變更至 ${toStage}`, user: currentUser, timestamp: serverTimestamp() });
                }
              }
            }}
          >
            <div className="inline-flex h-full min-h-0 gap-8 items-stretch pr-8 pb-8">
              {STAGES.map((s) => (
                <StageColumn key={s.id} stage={s} cards={byStage.get(s.id) || []} onCardClick={setSelectedId} />
              ))}
            </div>
            {createPortal(<DragOverlay dropAnimation={null}>{activeId ? <CardBase item={cards.find((c) => c.id === activeId)!} isOverlay /> : null}</DragOverlay>, document.body)}
          </DndContext>
        </div>
      </main>

      <DetailDrawer item={cards.find((c) => c.id === selectedId) || null} isCreate={isCreating} onClose={() => { setSelectedId(null); setIsCreating(false); }} onSave={handleSave} currentUser={currentUser} onDelete={handleDelete} />
      <PauseReasonModal isOpen={!!pendingPauseAction} onConfirm={handleConfirmPause} onCancel={() => setPendingPauseAction(null)} />
      <style jsx global>{`
        .board-scroll { scrollbar-gutter: stable; }
        .custom-scrollbar::-webkit-scrollbar { width: 12px; height: 12px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #f1f5f9; border-radius: 999px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 999px; border: 3px solid #f1f5f9; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
      `}</style>
    </div>
  );
}
