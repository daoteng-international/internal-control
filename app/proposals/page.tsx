"use client";

// app/proposals/page.tsx
// 帶看提案：提案列表 + 提案編輯（區塊一 客戶資料 / 區塊二 比價大表）

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { useSidebar } from "@/lib/sidebar-context";
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
  currency,
  withTax,
  calcValidUntil,
  todayStr,
  emptyProposal,
} from "@/lib/types/proposal";

const MAX_ROOMS = 4;

const inputClass =
  "w-full border-b border-slate-200 py-2 text-sm outline-none focus:border-blue-600 text-slate-800 bg-transparent";

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
      className={`bg-white rounded-xl border p-4 transition-all ${
        checked ? "border-slate-300" : "border-slate-100"
      } ${fullWidth ? "" : "flex items-center justify-between gap-6"}`}
    >
      <label className="flex items-center gap-3 cursor-pointer shrink-0">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onToggle(e.target.checked)}
          className="w-5 h-5 accent-purple-600"
        />
        <span
          className={`text-sm font-bold ${checked ? "text-slate-800" : "text-slate-400"}`}
        >
          {label}
        </span>
        {badge && (
          <span className="text-[9px] font-black bg-amber-100 text-amber-700 px-2 py-0.5 rounded">
            {badge}
          </span>
        )}
      </label>
      <div className={`${checked ? "" : "opacity-40"} ${fullWidth ? "mt-3" : ""}`}>
        {children}
      </div>
    </div>
  );
}

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="text-xs font-bold text-slate-500 flex items-center gap-0.5 mb-1">
      {children}
      {required && <span className="text-red-500">*</span>}
    </label>
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
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[80vh] flex flex-col overflow-hidden">
        <header className="p-6 border-b flex justify-between items-center shrink-0">
          <div>
            <h3 className="text-lg font-bold text-slate-800">選擇帶看房型</h3>
            <p className="text-xs text-slate-400 mt-1">
              最多選 {MAX_ROOMS} 間，目前已選 {selectedIds.length} 間
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 text-2xl hover:text-slate-600">
            ✕
          </button>
        </header>

        <div className="px-6 py-4 border-b flex items-center gap-3 bg-slate-50 shrink-0">
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜尋房號"
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs w-36 outline-none focus:border-blue-400"
          />
          <select
            value={floorFilter}
            onChange={(e) => setFloorFilter(e.target.value)}
            className="px-2 py-1.5 border border-slate-200 rounded-lg text-xs font-bold text-slate-600 w-40"
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
              className="w-4 h-4 accent-emerald-500"
            />
            <span className="text-xs font-bold text-slate-600">只顯示可出租</span>
          </label>
          <span className="ml-auto text-[11px] font-bold text-slate-400">{visible.length} 間</span>
        </div>

        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          <div className="grid grid-cols-3 gap-4">
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
                  className={`text-left p-4 rounded-xl border-2 transition-all ${
                    picked
                      ? "border-blue-500 bg-blue-50"
                      : full
                      ? "border-slate-100 bg-slate-50 opacity-40 cursor-not-allowed"
                      : "border-slate-200 bg-white hover:border-blue-300"
                  }`}
                >
                  {r.photoUrls && r.photoUrls.length > 0 ? (
                    <img
                      src={r.photoUrls[0]}
                      alt={r.roomNo}
                      className="w-full h-24 object-cover rounded-lg mb-3 bg-slate-100"
                    />
                  ) : (
                    <div className="w-full h-24 rounded-lg mb-3 bg-slate-100 flex items-center justify-center">
                      <span className="text-[10px] font-bold text-slate-300">尚無照片</span>
                    </div>
                  )}
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-base font-black text-slate-800">{r.roomNo}</span>
                    {picked && <span className="text-blue-600 font-black text-sm">✓</span>}
                  </div>
                  <div className="text-[10px] text-slate-400 mb-2">{f?.floorName || "—"}</div>
                  <div className="text-[11px] text-slate-500 mb-2">
                    {r.areaPing} 坪 · {r.capacityMax} 人
                  </div>
                  <div className="text-xs font-bold text-emerald-700">{currency(r.priceBase)}</div>
                  {r.status !== "AVAILABLE" && (
                    <div className="mt-2 text-[9px] font-black text-amber-600 bg-amber-50 px-2 py-0.5 rounded w-fit">
                      {ROOM_STATUS_LABEL[r.status]}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          {visible.length === 0 && (
            <div className="py-20 text-center text-xs font-bold text-slate-400 italic">
              沒有符合條件的房型
            </div>
          )}
        </div>

        <footer className="p-6 border-t bg-slate-50 shrink-0">
          <button
            onClick={onClose}
            className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold hover:bg-black"
          >
            完成選擇
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
}: {
  proposal: Proposal | null;
  isCreate: boolean;
  rooms: Room[];
  floors: Floor[];
  currentUser: string;
  onClose: () => void;
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
      areaPing: room.areaPing,
      capacityMax: room.capacityMax,
      featureDesc: room.featureDesc,
      priceBase: room.priceBase,
      priceHalfYear: room.priceHalfYear,
      priceYearly: room.priceYearly,
      acTemplate: f?.acTemplate || "",
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
    <div className="fixed inset-0 z-[300] flex justify-end font-sans text-slate-800">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-5xl bg-white h-full shadow-2xl flex flex-col overflow-hidden">
        <header className="p-6 border-b flex justify-between items-center shrink-0">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-bold">{isCreate ? "🆕 新增帶看提案" : "📋 編輯提案"}</h2>
            {!isCreate && (
              <>
                <span className="text-xs font-mono text-slate-400">{form.proposalNo}</span>
                <span className="text-[10px] font-black bg-slate-800 text-white px-2 py-1 rounded">
                  {form.version}
                </span>
              </>
            )}
          </div>
          <button onClick={onClose} className="text-slate-400 text-2xl hover:text-slate-600">
            ✕
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-8 space-y-12 custom-scrollbar">
          {/* ---------- 區塊一：客戶與帶看紀錄 ---------- */}
          <section className="space-y-4">
            <h3 className="text-sm font-bold border-l-4 border-blue-600 pl-3 uppercase tracking-widest">
              帶看紀錄與客戶資料
            </h3>
            <div className="grid grid-cols-3 gap-6">
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
                <div className="flex flex-wrap gap-2">
                  {SPACE_TYPE_OPTIONS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => toggleSpaceType(t)}
                      className={`px-4 py-2 text-xs font-bold rounded-xl border transition-all ${
                        form.spaceTypes.includes(t)
                          ? "bg-slate-800 text-white border-slate-800"
                          : "bg-white text-slate-500 border-slate-200"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div className="col-span-3">
                <FieldLabel>目前辦公現況</FieldLabel>
                <div className="flex flex-wrap gap-2">
                  {OFFICE_STATUS_OPTIONS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() =>
                        setForm({ ...form, officeStatus: form.officeStatus === t ? "" : t })
                      }
                      className={`px-4 py-2 text-xs font-bold rounded-xl border transition-all ${
                        form.officeStatus === t
                          ? "bg-blue-600 text-white border-blue-600"
                          : "bg-white text-slate-500 border-slate-200"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div className="col-span-3">
                <FieldLabel>報價有效期限</FieldLabel>
                <div className="flex items-center gap-3">
                  {VALID_DAY_OPTIONS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => applyValidDays(d)}
                      className={`px-4 py-2 text-xs font-bold rounded-xl border transition-all ${
                        form.validDays === d
                          ? "bg-amber-500 text-white border-amber-500"
                          : "bg-white text-slate-500 border-slate-200"
                      }`}
                    >
                      {d} 天
                    </button>
                  ))}
                  <span className="text-xs text-slate-400 font-bold">截止日</span>
                  <input
                    type="date"
                    value={form.validUntil}
                    onChange={(e) => setForm({ ...form, validUntil: e.target.value })}
                    className="border-b border-slate-200 py-1.5 px-2 text-sm outline-none focus:border-amber-500"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* ---------- 區塊二：比價大表 ---------- */}
          <section className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold border-l-4 border-emerald-500 pl-3 uppercase tracking-widest">
                專屬空間比價表
              </h3>
              <div className="flex items-center gap-3">
                <div className="flex items-center bg-slate-100 rounded-xl p-1">
                  {[
                    { v: false, label: "未稅" },
                    { v: true, label: "含稅" },
                  ].map((o) => (
                    <button
                      key={o.label}
                      type="button"
                      onClick={() => setForm({ ...form, taxIncluded: o.v })}
                      className={`px-4 py-1.5 text-[11px] font-black rounded-lg transition-all ${
                        form.taxIncluded === o.v ? "bg-white text-slate-800 shadow-sm" : "text-slate-400"
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setPicking(true)}
                  className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-emerald-700"
                >
                  + 選擇房型（{form.rooms.length}/{MAX_ROOMS}）
                </button>
              </div>
            </div>

            {form.rooms.length === 0 ? (
              <div className="py-20 text-center border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/40">
                <p className="text-sm font-bold text-slate-500">還沒有選擇房型</p>
                <p className="text-xs text-slate-400 mt-2">選 1～4 間帶看過的房型，系統會自動排出比價表</p>
                <button
                  type="button"
                  onClick={() => setPicking(true)}
                  className="mt-6 bg-slate-900 text-white px-6 py-2.5 rounded-xl text-xs font-bold"
                >
                  選擇房型
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto border border-slate-200 rounded-2xl bg-white custom-scrollbar">
                <table className="w-full text-sm min-w-[720px]">
                  <thead>
                    <tr>
                      <th className="text-left px-5 py-4 bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest w-40 sticky left-0 z-10">
                        比較項目
                      </th>
                      {form.rooms.map((r) => (
                        <th
                          key={r.roomId}
                          className={`px-5 py-4 text-left border-l border-slate-100 ${
                            r.isRecommended ? "bg-amber-50" : "bg-slate-50"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <div className="text-base font-black text-slate-800">{r.roomNo}</div>
                              <div className="text-[10px] font-medium text-slate-400 mt-0.5">
                                {r.floorName}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                setForm({
                                  ...form,
                                  rooms: form.rooms.filter((x) => x.roomId !== r.roomId),
                                })
                              }
                              className="text-slate-300 hover:text-red-500 text-sm"
                            >
                              ✕
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => setRecommended(r.roomId)}
                            className={`mt-3 w-full px-2 py-1.5 rounded-lg text-[10px] font-black transition-all ${
                              r.isRecommended
                                ? "bg-amber-500 text-white"
                                : "bg-white text-slate-400 border border-slate-200 hover:border-amber-300"
                            }`}
                          >
                            {r.isRecommended ? "★ 主推方案" : "設為主推"}
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="text-xs">
                    <tr className="border-t border-slate-100">
                      <td className="px-5 py-3 font-bold text-slate-400 bg-slate-50/60 sticky left-0 align-top">
                        空間照片
                      </td>
                      {form.rooms.map((r) => (
                        <td
                          key={r.roomId}
                          className={`px-5 py-3 border-l border-slate-100 align-top ${
                            r.isRecommended ? "bg-amber-50/40" : ""
                          }`}
                        >
                          {r.photoUrls && r.photoUrls.length > 0 ? (
                            <div className="space-y-2">
                              <img
                                src={r.photoUrls[0]}
                                alt={`${r.roomNo} 封面`}
                                onClick={() => setLightbox(r.photoUrls)}
                                className="w-full h-28 object-cover rounded-lg bg-slate-100 cursor-zoom-in hover:opacity-90 transition-opacity"
                              />
                              {r.photoUrls.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => setLightbox(r.photoUrls)}
                                  className="text-[10px] font-bold text-blue-600 hover:underline"
                                >
                                  檢視全部 {r.photoUrls.length} 張
                                </button>
                              )}
                            </div>
                          ) : (
                            <div className="w-full h-28 rounded-lg bg-slate-100 flex items-center justify-center">
                              <span className="text-[10px] font-bold text-slate-300">尚無照片</span>
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
                      <tr key={row.label} className="border-t border-slate-100">
                        <td className="px-5 py-3 font-bold text-slate-400 bg-slate-50/60 sticky left-0">
                          {row.label}
                        </td>
                        {form.rooms.map((r) => (
                          <td
                            key={r.roomId}
                            className={`px-5 py-3 border-l border-slate-100 font-bold text-slate-700 ${
                              r.isRecommended ? "bg-amber-50/40" : ""
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
                      <tr key={row.label} className="border-t border-slate-100">
                        <td className="px-5 py-3 font-bold text-slate-400 bg-slate-50/60 sticky left-0">
                          {row.label}
                        </td>
                        {form.rooms.map((r) => (
                          <td
                            key={r.roomId}
                            className={`px-5 py-3 border-l border-slate-100 ${
                              r.isRecommended ? "bg-amber-50/40" : ""
                            } ${row.strong ? "text-emerald-700 font-black text-sm" : "text-slate-700 font-bold"}`}
                          >
                            {currency(withTax(r[row.key], form.taxIncluded))}
                          </td>
                        ))}
                      </tr>
                    ))}

                    <tr className="border-t border-slate-100">
                      <td className="px-5 py-3 font-bold text-slate-400 bg-slate-50/60 sticky left-0 align-top">
                        空調與用電
                      </td>
                      {form.rooms.map((r) => (
                        <td
                          key={r.roomId}
                          className={`px-5 py-3 border-l border-slate-100 align-top ${
                            r.isRecommended ? "bg-amber-50/40" : ""
                          }`}
                        >
                          <pre className="text-[11px] text-slate-500 whitespace-pre-wrap leading-relaxed font-sans">
                            {r.acTemplate || "—"}
                          </pre>
                        </td>
                      ))}
                    </tr>

                    <tr className="border-t border-slate-100">
                      <td className="px-5 py-3 font-bold text-slate-400 bg-slate-50/60 sticky left-0 align-top">
                        業務補充說明
                      </td>
                      {form.rooms.map((r) => (
                        <td
                          key={r.roomId}
                          className={`px-5 py-3 border-l border-slate-100 ${
                            r.isRecommended ? "bg-amber-50/40" : ""
                          }`}
                        >
                          <textarea
                            rows={3}
                            value={r.customNote}
                            onChange={(e) => updateRoomItem(r.roomId, { customNote: e.target.value })}
                            placeholder="例如：可保留至月底"
                            className="w-full border border-slate-200 rounded-lg p-2 text-[11px] outline-none focus:border-blue-400 text-slate-700"
                          />
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {form.taxIncluded && (
              <p className="text-[11px] text-slate-400 italic">
                * 目前以含稅金額顯示（原價 × 1.05），切換回未稅不會影響已儲存的原始數字
              </p>
            )}
          </section>

          {/* ---------- 區塊三：加值服務與營運細則 ---------- */}
          <section className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold border-l-4 border-purple-600 pl-3 uppercase tracking-widest">
                加值服務與營運細則
              </h3>
              <span className="text-[11px] font-bold text-slate-400">
                只有勾選的項目會出現在提案上
              </span>
            </div>

            {/* 免費贈送區 */}
            <div className="bg-purple-50/30 p-6 rounded-2xl border border-purple-100 space-y-4">
              <div className="text-xs font-black text-purple-700 uppercase tracking-widest">
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
                <textarea
                  rows={2}
                  value={form.freeBenefits.businessRegistration.note}
                  onChange={(e) =>
                    updateFreeBenefit("businessRegistration", { note: e.target.value })
                  }
                  className="w-full border border-purple-200 rounded-lg p-3 text-[11px] leading-relaxed outline-none focus:border-purple-400 bg-white text-slate-700"
                />
              </ServiceRow>

              <ServiceRow
                checked={form.freeBenefits.custom.enabled}
                onToggle={(v) => updateFreeBenefit("custom", { enabled: v })}
                label="自訂贈送項目"
                fullWidth
              >
                <input
                  value={form.freeBenefits.custom.text}
                  onChange={(e) => updateFreeBenefit("custom", { text: e.target.value })}
                  placeholder="例如：贈送前三個月飲品吧無限暢飲"
                  className="w-full border-b border-purple-200 py-2 text-sm bg-transparent outline-none text-slate-800"
                />
              </ServiceRow>
            </div>

            {/* 加購區 */}
            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 space-y-4">
              <div className="text-xs font-black text-slate-600 uppercase tracking-widest">
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
                <textarea
                  rows={2}
                  value={form.paidAddOns.phoneService.note}
                  onChange={(e) => updatePaidAddOn("phoneService", { note: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg p-3 text-[11px] leading-relaxed outline-none focus:border-slate-400 bg-white text-slate-700"
                />
              </ServiceRow>
            </div>
          </section>

          {/* ---------- 區塊四：營運痛點對策卡 ---------- */}
          <section className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold border-l-4 border-rose-500 pl-3 uppercase tracking-widest">
                營運痛點對策卡
              </h3>
              <span className="text-[11px] font-bold text-slate-400">
                已勾選 {countPainPoints(form.painPoints)} 項
              </span>
            </div>
            <p className="text-[11px] text-slate-400 italic">
              現場觀察到客戶提及的困擾就勾起來，提案會針對這些項目附上道騰的資源說明
            </p>

            <div className="space-y-3">
              {PAIN_POINT_GROUPS.map((g) => {
                const state = form.painPoints[g.key];
                const active = !!state && (state.items.length > 0 || !!state.otherText?.trim());
                return (
                  <div
                    key={g.key}
                    className={`rounded-2xl border p-5 transition-all ${
                      active ? "border-rose-200 bg-rose-50/40" : "border-slate-200 bg-white"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span
                        className={`text-sm font-black ${
                          active ? "text-rose-700" : "text-slate-600"
                        }`}
                      >
                        {g.label}
                      </span>
                      {active && (
                        <button
                          type="button"
                          onClick={() => clearPainGroup(g.key)}
                          className="text-[10px] font-bold text-slate-400 hover:text-rose-600"
                        >
                          清除
                        </button>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {g.options.map((opt) => {
                        const picked = state?.items?.includes(opt);
                        return (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => togglePainItem(g.key, opt)}
                            className={`px-4 py-2 text-xs font-bold rounded-xl border transition-all ${
                              picked
                                ? "bg-rose-500 text-white border-rose-500"
                                : "bg-white text-slate-500 border-slate-200 hover:border-rose-300"
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
                        className="w-full border-b border-slate-200 py-2 mt-3 text-sm outline-none focus:border-rose-400 bg-transparent text-slate-800"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        <footer className="p-6 border-t bg-slate-50 flex gap-4 shrink-0">
          {!isCreate && (
            <>
              <button
                type="button"
                onClick={handleDelete}
                className="px-6 py-4 rounded-2xl font-bold border border-red-200 text-red-500 hover:bg-red-50"
              >
                刪除
              </button>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as ProposalStatus })}
                className="px-4 py-4 rounded-2xl font-bold border border-slate-200 text-sm bg-white"
              >
                {(Object.keys(PROPOSAL_STATUS_LABEL) as ProposalStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {PROPOSAL_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </>
          )}
          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="flex-1 bg-slate-900 text-white py-4 rounded-2xl font-bold hover:bg-black transition-all disabled:opacity-50"
          >
            {saving ? "儲存中…" : "儲存提案"}
          </button>
        </footer>
      </div>

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
          className="fixed inset-0 z-[500] flex items-center justify-center p-10 bg-slate-900/80 backdrop-blur-sm"
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
                className="w-full rounded-xl bg-slate-800"
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   主頁面：提案列表
   ============================================================ */
export default function ProposalsPage() {
  const router = useRouter();
  const { width: sidebarWidth } = useSidebar();

  const [hasMounted, setHasMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState("");

  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [floors, setFloors] = useState<Floor[]>([]);

  const [editing, setEditing] = useState<Proposal | null>(null);
  const [creating, setCreating] = useState(false);

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
      <div className="h-screen flex items-center justify-center font-bold text-slate-400">
        正在與雲端資料庫同步…
      </div>
    );
  }

  const noMasterData = rooms.length === 0 || floors.length === 0;

  return (
    <div
      style={{ left: sidebarWidth, transition: "left 200ms" }}
      className="fixed inset-0 flex flex-col bg-slate-50/50 font-sans overflow-hidden text-slate-800"
    >
      <header className="p-8 shrink-0 bg-white border-b shadow-sm z-10">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold underline decoration-blue-500/30">帶看提案</h1>
            <p className="text-xs text-slate-400 mt-2">
              帶看結束後建立提案，勾選房型自動排出專屬比價表
            </p>
          </div>
          <button
            onClick={() => setCreating(true)}
            disabled={noMasterData}
            className="bg-slate-900 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg hover:bg-black transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            + 新增提案
          </button>
        </div>

        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: "提案總數", value: stats.total, color: "text-slate-800" },
            { label: "草稿", value: stats.draft, color: "text-slate-400" },
            { label: "已送出", value: stats.sent, color: "text-blue-600" },
            { label: "3 天內到期", value: stats.expiring, color: "text-red-500" },
          ].map((s) => (
            <div key={s.label} className="bg-slate-50 rounded-xl border border-slate-200 px-4 py-3">
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                {s.label}
              </div>
              <div className={`text-2xl font-black mt-1 ${s.color}`}>{s.value}</div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black text-slate-400 uppercase">搜尋</span>
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="公司 / 貴賓 / 提案編號"
              className="px-2 py-1.5 border border-slate-200 rounded-lg text-xs w-48 outline-none focus:border-blue-400 bg-white"
            />
          </div>
          <div className="h-4 w-px bg-slate-200" />
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black text-slate-400 uppercase">狀態</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-2 py-1 border border-slate-200 rounded-lg text-xs font-bold text-slate-600 w-28 bg-white"
            >
              <option value="全部">全部狀態</option>
              {(Object.keys(PROPOSAL_STATUS_LABEL) as ProposalStatus[]).map((s) => (
                <option key={s} value={s}>
                  {PROPOSAL_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          <span className="ml-auto text-[11px] font-bold text-slate-400">
            顯示 {filtered.length} / {proposals.length} 筆
          </span>
        </div>
      </header>

      <main className="flex-1 min-h-0 overflow-auto custom-scrollbar p-8">
        {noMasterData ? (
          <div className="py-24 text-center border-2 border-dashed border-slate-200 rounded-2xl bg-white">
            <p className="text-sm font-bold text-slate-500">房型母表還沒有資料</p>
            <p className="text-xs text-slate-400 mt-2">
              請先到「房型資料維護」建立樓層與房型，提案的比價表才有資料可帶入
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  <th className="text-left px-6 py-4">提案編號</th>
                  <th className="text-left px-4 py-4">公司</th>
                  <th className="text-left px-4 py-4">貴賓</th>
                  <th className="text-left px-4 py-4">帶看房型</th>
                  <th className="text-center px-4 py-4">版本</th>
                  <th className="text-left px-4 py-4">有效至</th>
                  <th className="text-left px-4 py-4">業務</th>
                  <th className="text-center px-4 py-4">狀態</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const expired = p.validUntil && p.validUntil < todayStr();
                  return (
                    <tr
                      key={p.id}
                      onClick={() => setEditing(p)}
                      className="border-t border-slate-100 hover:bg-blue-50/40 cursor-pointer transition-colors"
                    >
                      <td className="px-6 py-4 font-mono text-xs font-bold text-slate-700">
                        {p.proposalNo}
                      </td>
                      <td className="px-4 py-4 font-bold text-slate-800">{p.companyName}</td>
                      <td className="px-4 py-4 text-xs text-slate-500">
                        {p.guestName}
                        {p.guestTitle && ` / ${p.guestTitle}`}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex gap-1 flex-wrap">
                          {(p.rooms || []).map((r) => (
                            <span
                              key={r.roomId}
                              className={`text-[10px] font-black px-2 py-0.5 rounded ${
                                r.isRecommended
                                  ? "bg-amber-500 text-white"
                                  : "bg-slate-100 text-slate-600"
                              }`}
                            >
                              {r.roomNo}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className="text-[10px] font-black bg-slate-800 text-white px-2 py-1 rounded">
                          {p.version}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-xs">
                        <span className={expired ? "text-red-500 font-bold" : "text-slate-500"}>
                          {p.validUntil || "—"}
                          {expired && " 已過期"}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-xs text-slate-500">{p.salesName}</td>
                      <td className="px-4 py-4 text-center">
                        <span
                          className={`text-[10px] font-black px-2 py-1 rounded ${
                            PROPOSAL_STATUS_STYLE[p.status]
                          }`}
                        >
                          {PROPOSAL_STATUS_LABEL[p.status]}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="py-20 text-center">
                <p className="text-xs font-bold text-slate-400 italic">還沒有提案紀錄</p>
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
        />
      )}

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          height: 12px;
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f1f5f9;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 999px;
          border: 3px solid #f1f5f9;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }
      `}</style>
    </div>
  );
}
