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
import { createPortal } from "react-dom";

// --- 引入 Firebase 實時功能 ---
import { db } from "../../lib/firebase";
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  query,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";

// --- 類型定義 ---
type EventStageId = "S1" | "S2" | "S3" | "S4" | "S5" | "S6";
type EventType = "行銷活動" | "企業內訓" | "研討會" | "其他";

interface EventCard {
  id: string;
  title: string;
  customer: string;
  eventType: EventType;
  owner: string;
  budget: number;
  eventDate?: string;
  stage: EventStageId;
  updatedAt: any;
  stageStartedAt: string;
  createdAt: string;
}

const STAGES: { id: EventStageId; title: string; hint: string; checks: string[] }[] = [
  { id: "S1", title: "S1 待處理", hint: "初步接洽/需求收集", checks: ["聯繫主辦單位", "確認初步日期"] },
  { id: "S2", title: "S2 需求分析", hint: "方案規劃與評估", checks: ["完成需求分析表", "方案初步討論"] },
  { id: "S3", title: "S3 待報價", hint: "成本核算中", checks: ["成本清單確認", "報價單製作完成"] },
  { id: "S4", title: "S4 報價議價", hint: "雙方價格磋商", checks: ["報價單已發送", "議價過程紀錄"] },
  { id: "S5", title: "S5 成交", hint: "簽約完成/執行中", checks: ["簽署合約或訂單", "訂金已入帳"] },
  { id: "S6", title: "S6 暫停中(流失)", hint: "案件保留或流失", checks: ["紀錄流失原因", "結案歸檔"] },
];

const EVENT_TYPES: EventType[] = ["行銷活動", "企業內訓", "研討會", "其他"];

// --- 工具函數 ---
function currency(n: number) {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(n);
}

function getDaysDiff(startDate: string) {
  if (!startDate) return 0;
  const start = new Date(startDate);
  const today = new Date();
  const diffTime = today.getTime() - start.getTime();
  return Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
}

// --- 1. 卡片 UI 組件 ---
// ✅ 修正點：
// 1) 仍保留 scale-105（你原本的需求）
// 2) 不再用 ring 畫「粗框」，改用 pseudo-element 的 inset border，避免因 scale/subpixel 造成忽粗忽細
function CardBase({ item, isOverlay = false }: { item: EventCard; isOverlay?: boolean }) {
  const days = getDaysDiff(item.stageStartedAt);
  const badgeStyle =
    days >= 7 ? "bg-red-500 text-white" : days >= 3 ? "bg-amber-400 text-white" : "bg-emerald-500 text-white";

  return (
    <div
      style={{ backgroundColor: "#F9F0FF" }}
      className={[
        "relative rounded-xl border border-purple-200 p-3 shadow-sm transition-all cursor-grab",
        "will-change-transform",
        // ✅ hover / overlay 都用 pseudo border（不吃版面、不會抖、視覺厚度一致）
        "after:pointer-events-none after:content-[''] after:absolute after:inset-0 after:rounded-[12px] after:transition-opacity after:opacity-0",
        "hover:after:opacity-100 hover:after:shadow-none hover:after:ring-0 hover:after:outline-none hover:after:border-0",
        "hover:after:box-border hover:after:border-2 hover:after:border-purple-400",
        isOverlay
          ? "shadow-2xl scale-105 cursor-grabbing after:opacity-100 after:box-border after:border-2 after:border-purple-500"
          : "",
      ].join(" ")}
    >
      <div className="flex justify-between items-start mb-2">
        <div className="text-sm font-bold text-slate-800 line-clamp-1 pr-12">{item.title}</div>
        <div className={`absolute top-3 right-3 px-2 py-0.5 rounded text-[10px] font-bold shadow-sm ${badgeStyle}`}>
          停留 {days}天
        </div>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <div className="text-[11px] text-slate-400">{item.customer}</div>
        <span className="text-[9px] px-1 rounded border border-purple-200 font-bold bg-purple-50 text-purple-600">
          {item.eventType}
        </span>
      </div>

      <div className="flex justify-between items-end mt-auto">
        <div className="space-y-1">
          <div className="text-[10px] font-bold bg-slate-100/50 text-slate-600 px-1.5 py-0.5 rounded w-fit italic border border-slate-200">
            負責人: {item.owner}
          </div>
          <div className="text-sm font-bold text-purple-600">{currency(item.budget)}</div>
        </div>
        <span className="text-[10px] text-slate-400 italic">日期: {item.eventDate || "未定"}</span>
      </div>
    </div>
  );
}

// --- 2. 可排序卡片 ---
// ✅ 修正點：把 transform 位移四捨五入成整數 px，避免 sub-pixel 導致邊框視覺不一致
function SortableCard({ item, onClick }: { item: EventCard; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });

  const style = {
    transform: transform
      ? `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0)`
      : undefined,
    transition,
  } as React.CSSProperties;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={isDragging ? "opacity-30" : ""}
    >
      <CardBase item={item} />
    </div>
  );
}

// --- 3. 階段列（✅新增：拖曳 hover 時顯示「更深更粗外框 + 標題列提示」）---
function StageColumn({
  stage,
  cards,
  onCardClick,
  isDragOver,
}: {
  stage: (typeof STAGES)[0];
  cards: EventCard[];
  onCardClick: (id: string) => void;
  isDragOver: boolean;
}) {
  const { setNodeRef } = useDroppable({ id: stage.id });

  return (
    <div
      ref={setNodeRef}
      className={[
        "flex h-full min-h-0 w-[320px] flex-col rounded-2xl bg-white p-4 shrink-0 shadow-sm transition-all",
        "border border-slate-200",
        isDragOver ? "outline outline-2 outline-blue-600 ring-4 ring-blue-500/10 shadow-md" : "",
      ].join(" ")}
    >
      <h3
        className={[
          "font-bold text-sm mb-4 flex items-center justify-between shrink-0 transition-colors",
          isDragOver ? "text-blue-700" : "text-slate-800",
        ].join(" ")}
      >
        {stage.title}
        <span
          className={[
            "text-[10px] px-2 py-0.5 rounded-full font-bold transition-all",
            isDragOver ? "bg-blue-600 text-white shadow-sm" : "bg-slate-200/50 text-slate-500",
          ].join(" ")}
        >
          {cards.length}
        </span>
      </h3>

      <SortableContext items={cards.map((x) => x.id)} strategy={verticalListSortingStrategy}>
        <div className="flex-1 min-h-0 space-y-4 pr-1 overflow-y-auto custom-scrollbar">
          {cards.map((item) => (
            <SortableCard key={item.id} item={item} onClick={() => onCardClick(item.id)} />
          ))}
          {cards.length === 0 && (
            <div
              className={[
                "flex-1 min-h-[150px] border-2 border-dashed rounded-xl transition-colors",
                isDragOver ? "border-blue-200 bg-blue-50/40" : "border-slate-50",
              ].join(" ")}
            />
          )}
        </div>
      </SortableContext>
    </div>
  );
}

// --- 4. 確認移動彈窗 ---
function ConfirmModal({
  show,
  onConfirm,
  onCancel,
  stageId,
  cardTitle,
}: {
  show: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  stageId: EventStageId | null;
  cardTitle: string;
}) {
  if (!show || !stageId) return null;
  const stageInfo = STAGES.find((s) => s.id === stageId);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm font-sans">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95">
        <div className="p-8">
          <h3 className="text-2xl font-black text-slate-800">進度移動確認</h3>
          <p className="text-base text-slate-500 mt-3">
            將{" "}
            <span className="text-slate-900 font-bold underline decoration-purple-500 underline-offset-4">
              {cardTitle}
            </span>{" "}
            移至{" "}
            <span className="ml-2 px-3 py-1 bg-slate-100 rounded-lg text-slate-900 font-bold">
              {stageInfo?.title}
            </span>
            ？
          </p>
        </div>
        <div className="bg-slate-50 p-6 flex gap-4 border-t">
          <button
            onClick={onConfirm}
            className="flex-1 bg-purple-900 text-white py-4 rounded-2xl font-black shadow-lg hover:bg-purple-950"
          >
            確認移動
          </button>
          <button
            onClick={onCancel}
            className="flex-1 bg-white border border-slate-200 text-slate-600 py-4 rounded-2xl font-bold hover:bg-slate-100"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
}

// --- 5. 詳情側邊欄 ---
function DetailDrawer({
  item,
  isCreate,
  onClose,
  onSave,
}: {
  item: EventCard | null;
  isCreate: boolean;
  onClose: () => void;
  onSave: (data: EventCard) => void;
}) {
  const [formData, setFormData] = useState<Partial<EventCard>>({});

  useEffect(() => {
    if (isCreate) {
      setFormData({
        id: `E-${Date.now()}`,
        stage: "S1",
        eventType: "行銷活動",
        stageStartedAt: new Date().toISOString().split("T")[0],
        createdAt: new Date().toISOString().split("T")[0],
        updatedAt: "",
        budget: 0,
        title: "",
        customer: "",
        owner: "未定",
        eventDate: "",
      });
    } else if (item) {
      setFormData(item);
    }
  }, [item, isCreate]);

  if (!item && !isCreate) return null;

  return (
    <div className="fixed inset-0 z-[100] flex justify-end font-sans">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
        <header className="p-6 border-b flex justify-between items-center bg-white">
          <h2 className="text-xl font-bold text-slate-800">{isCreate ? "🆕 新增活動案件" : "📝 編輯活動詳情"}</h2>
          <button onClick={onClose} className="text-slate-400 text-2xl hover:text-slate-600 transition-colors">
            ✕
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-8 space-y-10 custom-scrollbar">
          <section className="space-y-4">
            <h3 className="text-sm font-bold border-l-4 border-purple-600 pl-3 text-slate-800 uppercase tracking-widest">
              基本資訊
            </h3>
            <div className="grid grid-cols-2 gap-6">
              <div className="col-span-2 space-y-2">
                <label className="text-xs font-bold text-slate-500">活動類型</label>
                <div className="flex flex-wrap gap-2">
                  {EVENT_TYPES.map((t) => (
                    <button
                      key={t}
                      onClick={() => setFormData({ ...formData, eventType: t })}
                      className={`px-4 py-2 text-xs font-bold rounded-xl border transition-all ${
                        formData.eventType === t
                          ? "bg-purple-800 text-white border-purple-800"
                          : "bg-white text-slate-500 border-slate-200"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div className="col-span-2">
                <label className="text-xs font-bold text-slate-500">活動名稱</label>
                <input
                  placeholder="例如：2026 夏季音樂祭"
                  value={formData.title || ""}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full border-b py-2 text-sm outline-none focus:border-purple-600 font-medium"
                />
              </div>
            </div>
          </section>
        </div>

        <footer className="p-6 border-t bg-slate-50">
          <button
            onClick={() => onSave(formData as EventCard)}
            className="w-full bg-purple-900 text-white py-4 rounded-2xl font-bold shadow-lg active:scale-[0.98]"
          >
            儲存活動內容
          </button>
        </footer>
      </div>
    </div>
  );
}

// --- 6. 主頁面（✅加入：拖曳到哪個 stage 的狀態，讓 StageColumn 顯示深色粗框）---
export default function EventsManagementPage() {
  const [hasMounted, setHasMounted] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const [searchQuery, setSearchQuery] = useState("");
  const [cards, setCards] = useState<EventCard[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [pendingMove, setPendingMove] = useState<{ activeId: string; toStage: EventStageId } | null>(null);

  const [dragOverStageId, setDragOverStageId] = useState<EventStageId | null>(null);

  useEffect(() => {
    setHasMounted(true);

    const q = query(collection(db, "events"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const casesData = snapshot.docs.map((d) => ({ ...(d.data() as any), id: d.id })) as EventCard[];
      setCards(casesData);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const filteredCards = useMemo(() => {
    return cards.filter(
      (c) =>
        (c.title || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.customer || "").toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [cards, searchQuery]);

  const byStage = useMemo(() => {
    const map = new Map<EventStageId, EventCard[]>();
    STAGES.forEach((s) => map.set(s.id, []));
    filteredCards.forEach((c) => map.get(c.stage)!.push(c));
    return map;
  }, [filteredCards]);

  const handleSave = async (data: EventCard) => {
    try {
      if (isCreating) {
        await addDoc(collection(db, "events"), {
          ...data,
          createdAt: new Date().toISOString().split("T")[0],
          updatedAt: serverTimestamp(),
          stageStartedAt: new Date().toISOString().split("T")[0],
        });
      } else {
        const docRef = doc(db, "events", data.id);
        const { id, ...updateData } = data;
        await updateDoc(docRef, { ...updateData, updatedAt: serverTimestamp() });
      }
    } catch (e) {
      console.error(e);
    }
    setIsCreating(false);
    setSelectedId(null);
  };

  const handleConfirmMove = async () => {
    if (!pendingMove) return;
    const docRef = doc(db, "events", pendingMove.activeId);
    await updateDoc(docRef, {
      stage: pendingMove.toStage,
      stageStartedAt: new Date().toISOString().split("T")[0],
      updatedAt: serverTimestamp(),
    });
    setPendingMove(null);
  };

  const activeCard = useMemo(() => cards.find((c) => c.id === activeId), [activeId, cards]);

  if (!hasMounted || loading) {
    return (
      <div className="flex-1 h-full min-h-0 flex items-center justify-center bg-slate-50 font-bold text-slate-400 animate-pulse font-sans">
        載入中...
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 flex flex-col bg-slate-50/50 overflow-hidden font-sans">
      <header className="p-8 shrink-0 bg-white border-b shadow-sm z-10">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-slate-800 italic decoration-purple-500 underline">活動管理看板</h1>
          <button
            onClick={() => setIsCreating(true)}
            className="bg-purple-600 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg hover:bg-purple-700 transition-all"
          >
            + 新增活動
          </button>
        </div>

        <input
          type="text"
          placeholder="搜尋活動名稱或單位..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-4 pr-10 py-2 border border-slate-200 rounded-xl text-sm w-72 outline-none focus:ring-4 focus:ring-purple-500/10 bg-slate-50/50 transition-all"
        />
      </header>

      <main className="flex-1 min-h-0 overflow-hidden px-8 pt-6">
        <div className="h-full min-h-0 overflow-x-auto overflow-y-hidden custom-scrollbar">
          <DndContext
            sensors={sensors}
            onDragStart={(e) => setActiveId(String(e.active.id))}
            onDragOver={(e) => {
              const overId = e.over?.id ? String(e.over.id) : null;

              if (overId && STAGES.some((s) => s.id === overId)) {
                setDragOverStageId(overId as EventStageId);
                return;
              }

              if (overId) {
                const stage = cards.find((c) => c.id === overId)?.stage as EventStageId | undefined;
                setDragOverStageId(stage ?? null);
                return;
              }

              setDragOverStageId(null);
            }}
            onDragCancel={() => {
              setActiveId(null);
              setDragOverStageId(null);
            }}
            onDragEnd={(e) => {
              const { active, over } = e;
              setActiveId(null);
              setDragOverStageId(null);
              if (!over) return;

              const aId = String(active.id);
              const oId = String(over.id);

              let toStage = oId as EventStageId;
              if (!STAGES.some((s) => s.id === oId)) {
                toStage = cards.find((c) => c.id === oId)?.stage as EventStageId;
              }

              if (toStage && cards.find((c) => c.id === aId)?.stage !== toStage) {
                setPendingMove({ activeId: aId, toStage });
              }
            }}
          >
            <div className="inline-flex gap-8 items-stretch pr-8 h-[calc(100%-18px)]">
              {STAGES.map((s) => (
                <StageColumn
                  key={s.id}
                  stage={s}
                  cards={byStage.get(s.id) || []}
                  onCardClick={setSelectedId}
                  isDragOver={dragOverStageId === s.id}
                />
              ))}
            </div>

            {typeof document !== "undefined" &&
              createPortal(
                <DragOverlay dropAnimation={{ duration: 250, easing: "cubic-bezier(0.18, 0.67, 0.6, 1.22)" }}>
                  {activeCard ? <CardBase item={activeCard} isOverlay /> : null}
                </DragOverlay>,
                document.body
              )}
          </DndContext>
        </div>
      </main>

      <DetailDrawer
        item={cards.find((c) => c.id === selectedId) || null}
        isCreate={isCreating}
        onClose={() => {
          setSelectedId(null);
          setIsCreating(false);
        }}
        onSave={handleSave}
      />

      <ConfirmModal
        show={!!pendingMove}
        onConfirm={handleConfirmMove}
        onCancel={() => setPendingMove(null)}
        stageId={pendingMove?.toStage || null}
        cardTitle={cards.find((c) => c.id === pendingMove?.activeId)?.title || "活動"}
      />

      <style
        dangerouslySetInnerHTML={{
          __html: `
          .custom-scrollbar::-webkit-scrollbar { height: 10px; }
          .custom-scrollbar::-webkit-scrollbar-track { background: #f1f5f9; }
          .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
        `,
        }}
      />
    </div>
  );
}
