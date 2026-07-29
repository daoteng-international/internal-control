"use client";

// app/rooms/page.tsx
// 房型資料維護：樓層環境母表 + 辦公室房型母表

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { useSidebar } from "@/lib/sidebar-context";
import {
  uploadRoomPhoto,
  deleteByUrl,
  deleteManyByUrl,
} from "@/lib/storage-upload";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";

import {
  Floor,
  Room,
  AcType,
  RoomStatus,
  BUILDING_OPTIONS,
  AC_TYPE_LABEL,
  AC_TEMPLATE_PRESET,
  ROOM_STATUS_LABEL,
  ROOM_STATUS_STYLE,
  currency,
  pricePerPing,
  suggestDiscountPrices,
  emptyFloor,
  emptyRoom,
} from "@/lib/types/room";

type TabId = "floors" | "rooms";

function RequiredLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-xs font-bold text-slate-500 flex items-center gap-0.5 mb-1">
      {children} <span className="text-red-500">*</span>
    </label>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-xs font-bold text-slate-500 block mb-1">{children}</label>;
}

const inputClass =
  "w-full border-b border-slate-200 py-2 text-sm outline-none focus:border-blue-600 text-slate-800 bg-transparent";

/* ============================================================
   樓層編輯抽屜
   ============================================================ */
function FloorDrawer({
  floor,
  isCreate,
  roomCount,
  onClose,
  onSaved,
}: {
  floor: Floor | null;
  isCreate: boolean;
  roomCount: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<Floor>(emptyFloor());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isCreate) setForm(emptyFloor());
    else if (floor) setForm(floor);
  }, [floor?.id, isCreate]);

  if (!floor && !isCreate) return null;

  const applyAcPreset = (acType: AcType) => {
    setForm((prev) => ({
      ...prev,
      acType,
      acTemplate: AC_TEMPLATE_PRESET[acType],
      privateElectricRate: acType === "CENTRAL" ? 0 : 6.5,
    }));
  };

  const handleSave = async () => {
    const code = form.floorCode.trim();
    if (!code || !form.floorName.trim()) {
      alert("⚠️ 樓層代碼與樓層名稱為必填");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        floorCode: code,
        floorName: form.floorName.trim(),
        building: form.building,
        acType: form.acType,
        acTemplate: form.acTemplate,
        privateElectricRate: Number(form.privateElectricRate) || 0,
        sortOrder: Number(form.sortOrder) || 0,
        active: form.active,
        updatedAt: serverTimestamp(),
      };

      if (isCreate) {
        // 以 floorCode 當文件 ID，房型母表才能用穩定可讀的 key 關聯
        await setDoc(doc(db, "floors", code), { ...payload, createdAt: serverTimestamp() });
      } else {
        await updateDoc(doc(db, "floors", form.id), payload);
      }
      onSaved();
      onClose();
    } catch (e) {
      console.error(e);
      alert("儲存失敗，請確認樓層代碼是否重複");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (roomCount > 0) {
      alert(`此樓層底下還有 ${roomCount} 間房型，請先移除或改掛其他樓層後再刪除。`);
      return;
    }
    if (!confirm(`確定刪除樓層「${form.floorName}」？`)) return;
    await deleteDoc(doc(db, "floors", form.id));
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[300] flex justify-end font-sans text-slate-800">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-white h-full shadow-2xl flex flex-col overflow-hidden">
        <header className="p-6 border-b flex justify-between items-center shrink-0">
          <h2 className="text-xl font-bold">{isCreate ? "🆕 新增樓層" : "🏢 編輯樓層"}</h2>
          <button onClick={onClose} className="text-slate-400 text-2xl hover:text-slate-600">
            ✕
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-8 space-y-10 custom-scrollbar">
          <section className="space-y-4">
            <h3 className="text-sm font-bold border-l-4 border-blue-600 pl-3 uppercase tracking-widest">
              樓層基本資料
            </h3>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <RequiredLabel>樓層代碼</RequiredLabel>
                <input
                  value={form.floorCode}
                  disabled={!isCreate}
                  onChange={(e) => setForm({ ...form, floorCode: e.target.value.toUpperCase() })}
                  className={`${inputClass} ${!isCreate ? "bg-slate-100 text-slate-400 cursor-not-allowed" : ""}`}
                  placeholder="FL-21"
                />
                <p className="text-[10px] text-slate-400 mt-1 italic">
                  {isCreate ? "建立後無法修改，房型會用它關聯" : "已被房型關聯，不可修改"}
                </p>
              </div>
              <div>
                <RequiredLabel>樓層名稱</RequiredLabel>
                <input
                  value={form.floorName}
                  onChange={(e) => setForm({ ...form, floorName: e.target.value })}
                  className={inputClass}
                  placeholder="民權館 21 樓"
                />
              </div>
              <div className="col-span-2">
                <RequiredLabel>所屬館別</RequiredLabel>
                <div className="flex flex-wrap gap-2">
                  {BUILDING_OPTIONS.map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => setForm({ ...form, building: b })}
                      className={`px-4 py-2 text-xs font-bold rounded-xl border transition-all ${
                        form.building === b
                          ? "bg-slate-800 text-white border-slate-800"
                          : "bg-white text-slate-500 border-slate-200"
                      }`}
                    >
                      {b}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <FieldLabel>排序</FieldLabel>
                <input
                  type="number"
                  value={form.sortOrder}
                  onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })}
                  className={inputClass}
                />
              </div>
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(e) => setForm({ ...form, active: e.target.checked })}
                    className="w-5 h-5 accent-emerald-500"
                  />
                  <span className="text-xs font-bold text-slate-600">啟用中</span>
                </label>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="text-sm font-bold border-l-4 border-amber-500 pl-3 uppercase tracking-widest">
              空調與用電規則
            </h3>
            <div className="bg-amber-50/30 p-6 rounded-2xl border border-amber-100 space-y-6">
              <div>
                <RequiredLabel>空調型式</RequiredLabel>
                <div className="flex gap-2">
                  {(Object.keys(AC_TYPE_LABEL) as AcType[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => applyAcPreset(t)}
                      className={`px-4 py-2 text-xs font-bold rounded-xl border transition-all ${
                        form.acType === t
                          ? "bg-amber-500 text-white border-amber-500"
                          : "bg-white text-slate-500 border-slate-200"
                      }`}
                    >
                      {AC_TYPE_LABEL[t]}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-slate-400 mt-2 italic">
                  切換型式會重新帶入預設說明，下方文字仍可自行調整
                </p>
              </div>

              <div>
                <FieldLabel>私電單價（每度）</FieldLabel>
                <input
                  type="number"
                  step="0.1"
                  value={form.privateElectricRate}
                  onChange={(e) =>
                    setForm({ ...form, privateElectricRate: Number(e.target.value) })
                  }
                  className="w-full border-b border-amber-200 py-2 text-sm font-bold bg-transparent outline-none"
                />
              </div>

              <div>
                <FieldLabel>提案文件顯示說明</FieldLabel>
                <textarea
                  rows={6}
                  value={form.acTemplate}
                  onChange={(e) => setForm({ ...form, acTemplate: e.target.value })}
                  className="w-full border border-amber-200 rounded-xl p-4 text-sm leading-relaxed outline-none focus:border-amber-400 bg-white text-slate-700"
                />
                <p className="text-[10px] text-slate-400 mt-2 italic">
                  一行一項，生成提案時會直接渲染到「空調與用電收費規則」欄位
                </p>
              </div>
            </div>
          </section>

          {!isCreate && (
            <div className="text-xs text-slate-400 bg-slate-50 p-4 rounded-xl border border-slate-100">
              目前有 <span className="font-black text-slate-600">{roomCount}</span> 間房型掛在此樓層
            </div>
          )}
        </div>

        <footer className="p-6 border-t bg-slate-50 flex gap-4 shrink-0">
          {!isCreate && (
            <button
              type="button"
              onClick={handleDelete}
              className="px-6 py-4 rounded-2xl font-bold border border-red-200 text-red-500 hover:bg-red-50"
            >
              刪除樓層
            </button>
          )}
          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="flex-1 bg-slate-900 text-white py-4 rounded-2xl font-bold hover:bg-black transition-all disabled:opacity-50"
          >
            {saving ? "儲存中…" : "儲存樓層"}
          </button>
        </footer>
      </div>
    </div>
  );
}

/* ============================================================
   房型編輯抽屜
   ============================================================ */
function RoomDrawer({
  room,
  isCreate,
  floors,
  onClose,
}: {
  room: Room | null;
  isCreate: boolean;
  floors: Floor[];
  onClose: () => void;
}) {
  const [form, setForm] = useState<Room>(emptyRoom());
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // 新增房型時還沒有文件 ID，先給一個暫用資料夾名稱讓照片有地方放
  const draftScope = useRef(`draft-${Date.now()}`);

  useEffect(() => {
    const base = isCreate ? room ?? emptyRoom(floors[0]?.id || "") : room;
    if (base) {
      setForm(base);
      setPhotos(base.photoUrls || []);
    }
  }, [room?.id, isCreate]);

  if (!room && !isCreate) return null;

  const linkedFloor = floors.find((f) => f.id === form.floorId);

  const handleSuggest = () => {
    if (!form.priceBase) {
      alert("請先填寫統一原價");
      return;
    }
    setForm({ ...form, ...suggestDiscountPrices(form.priceBase) });
  };

  const handlePickPhotos = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const scope = form.id || draftScope.current;

    setUploading(true);
    const added: string[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        setProgress(0);
        const url = await uploadRoomPhoto(scope, files[i], setProgress);
        added.push(url);
        setPhotos((prev) => [...prev, url]);
      }
    } catch (e) {
      console.error(e);
      alert(`上傳失敗：${e instanceof Error ? e.message : "未知錯誤"}`);
    } finally {
      setUploading(false);
      setProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemovePhoto = async (url: string) => {
    if (!confirm("確定移除這張照片？檔案會一併從雲端刪除。")) return;
    try {
      await deleteByUrl(url);
    } catch (e) {
      console.error(e);
    }
    // 即使雲端刪除失敗也要從清單移除，避免畫面卡住無法編輯
    setPhotos((prev) => prev.filter((u) => u !== url));
  };

  const handleSave = async () => {
    if (!form.roomNo.trim() || !form.floorId) {
      alert("⚠️ 房號與所屬樓層為必填");
      return;
    }
    if (uploading) {
      alert("照片還在上傳中，請稍候再儲存");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        roomNo: form.roomNo.trim(),
        floorId: form.floorId,
        areaPing: Number(form.areaPing) || 0,
        capacityMax: Number(form.capacityMax) || 0,
        featureDesc: form.featureDesc || "",
        priceBase: Number(form.priceBase) || 0,
        priceHalfYear: Number(form.priceHalfYear) || 0,
        priceYearly: Number(form.priceYearly) || 0,
        photoUrls: photos,
        status: form.status,
        availableFrom: form.availableFrom || "",
        note: form.note || "",
        active: form.active,
        updatedAt: serverTimestamp(),
      };

      if (isCreate) {
        await addDoc(collection(db, "rooms"), { ...payload, createdAt: serverTimestamp() });
      } else {
        await updateDoc(doc(db, "rooms", form.id), payload);
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
    if (!confirm(`確定刪除房號「${form.roomNo}」？\n\n此動作無法復原，照片也會一併刪除。`)) return;
    // 先清掉雲端檔案，避免刪了文件之後照片變成找不到來源的孤兒檔
    await deleteManyByUrl(photos);
    await deleteDoc(doc(db, "rooms", form.id));
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[300] flex justify-end font-sans text-slate-800">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col overflow-hidden">
        <header className="p-6 border-b flex justify-between items-center shrink-0">
          <h2 className="text-xl font-bold">{isCreate ? "🆕 新增房型" : "🚪 編輯房型"}</h2>
          <button onClick={onClose} className="text-slate-400 text-2xl hover:text-slate-600">
            ✕
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-8 space-y-10 custom-scrollbar">
          {/* 基本資料 */}
          <section className="space-y-4">
            <h3 className="text-sm font-bold border-l-4 border-blue-600 pl-3 uppercase tracking-widest">
              房型基本資料
            </h3>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <RequiredLabel>房號</RequiredLabel>
                <input
                  value={form.roomNo}
                  onChange={(e) => setForm({ ...form, roomNo: e.target.value })}
                  className={inputClass}
                  placeholder="2118"
                />
              </div>
              <div>
                <RequiredLabel>所屬樓層</RequiredLabel>
                <select
                  value={form.floorId}
                  onChange={(e) => setForm({ ...form, floorId: e.target.value })}
                  className={inputClass}
                >
                  <option value="">請選擇樓層</option>
                  {floors.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.floorName}（{f.floorCode}）
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <FieldLabel>坪數</FieldLabel>
                <input
                  type="number"
                  step="0.1"
                  value={form.areaPing || ""}
                  onChange={(e) => setForm({ ...form, areaPing: Number(e.target.value) })}
                  className={inputClass}
                  placeholder="6.0"
                />
              </div>
              <div>
                <FieldLabel>建議可容納人數</FieldLabel>
                <input
                  type="number"
                  value={form.capacityMax || ""}
                  onChange={(e) => setForm({ ...form, capacityMax: Number(e.target.value) })}
                  className={inputClass}
                  placeholder="8"
                />
              </div>
              <div className="col-span-2">
                <FieldLabel>空間特色</FieldLabel>
                <input
                  value={form.featureDesc}
                  onChange={(e) => setForm({ ...form, featureDesc: e.target.value })}
                  className={inputClass}
                  placeholder="長型（有圓柱）、雙面採光"
                />
              </div>
            </div>

            {linkedFloor && (
              <div className="bg-amber-50/40 p-4 rounded-xl border border-amber-100">
                <div className="text-[11px] font-bold text-amber-700 mb-2">
                  自動帶入的空調與用電規則（來自 {linkedFloor.floorName}）
                </div>
                <pre className="text-[11px] text-slate-600 whitespace-pre-wrap leading-relaxed font-sans">
                  {linkedFloor.acTemplate}
                </pre>
              </div>
            )}
          </section>

          {/* 價格 */}
          <section className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold border-l-4 border-emerald-500 pl-3 uppercase tracking-widest">
                三段報價
              </h3>
              <button
                type="button"
                onClick={handleSuggest}
                className="text-[10px] font-black bg-emerald-500 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-600"
              >
                依原價試算優惠
              </button>
            </div>
            <div className="bg-emerald-50/30 p-6 rounded-2xl border border-emerald-100 space-y-6">
              <div className="grid grid-cols-3 gap-6">
                <div>
                  <FieldLabel>統一原價</FieldLabel>
                  <input
                    type="number"
                    value={form.priceBase || ""}
                    onChange={(e) => setForm({ ...form, priceBase: Number(e.target.value) })}
                    className="w-full border-b border-emerald-200 py-2 text-sm font-bold bg-transparent outline-none"
                    placeholder="19000"
                  />
                </div>
                <div>
                  <FieldLabel>半年繳月租</FieldLabel>
                  <input
                    type="number"
                    value={form.priceHalfYear || ""}
                    onChange={(e) => setForm({ ...form, priceHalfYear: Number(e.target.value) })}
                    className="w-full border-b border-emerald-200 py-2 text-sm font-bold bg-transparent outline-none"
                    placeholder="17500"
                  />
                </div>
                <div>
                  <FieldLabel>年繳月租</FieldLabel>
                  <input
                    type="number"
                    value={form.priceYearly || ""}
                    onChange={(e) => setForm({ ...form, priceYearly: Number(e.target.value) })}
                    className="w-full border-b border-emerald-200 py-2 text-sm font-bold bg-transparent outline-none"
                    placeholder="16500"
                  />
                </div>
              </div>
              <div className="pt-4 border-t border-emerald-100 grid grid-cols-2 gap-4 text-xs">
                <div className="flex justify-between">
                  <span className="font-bold text-slate-400">每坪單價</span>
                  <span className="font-black text-emerald-700">
                    {currency(pricePerPing(form.priceBase, form.areaPing))} / 坪
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="font-bold text-slate-400">年繳共省</span>
                  <span className="font-black text-emerald-700">
                    {currency((form.priceBase - form.priceYearly) * 12)}
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* 狀態與照片 */}
          <section className="space-y-4">
            <h3 className="text-sm font-bold border-l-4 border-slate-400 pl-3 uppercase tracking-widest">
              出租狀態與圖片
            </h3>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <FieldLabel>目前狀態</FieldLabel>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as RoomStatus })}
                  className={inputClass}
                >
                  {(Object.keys(ROOM_STATUS_LABEL) as RoomStatus[]).map((s) => (
                    <option key={s} value={s}>
                      {ROOM_STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <FieldLabel>預計可進駐日</FieldLabel>
                <input
                  type="date"
                  value={form.availableFrom || ""}
                  onChange={(e) => setForm({ ...form, availableFrom: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div className="col-span-2">
                <div className="flex justify-between items-center mb-2">
                  <FieldLabel>房型照片</FieldLabel>
                  <span className="text-[10px] font-bold text-slate-400">
                    {photos.length} 張・自動壓縮至長邊 1600px
                  </span>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => handlePickPhotos(e.target.files)}
                />

                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-6 rounded-2xl border-2 border-dashed border-slate-200 hover:border-blue-400 hover:bg-blue-50/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {uploading ? (
                    <div className="px-8">
                      <div className="text-xs font-bold text-blue-600 mb-2">
                        上傳中 {progress}%
                      </div>
                      <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 transition-all"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="text-sm font-bold text-slate-600">＋ 選擇照片上傳</div>
                      <div className="text-[10px] text-slate-400 mt-1">
                        可一次選多張，單張上限 5MB
                      </div>
                    </>
                  )}
                </button>

                {photos.length > 0 && (
                  <div className="grid grid-cols-4 gap-3 mt-4">
                    {photos.map((url, i) => (
                      <div key={url} className="relative group">
                        <img
                          src={url}
                          alt={`${form.roomNo} 照片 ${i + 1}`}
                          className="h-24 w-full object-cover rounded-xl border border-slate-200 bg-slate-100"
                        />
                        {i === 0 && (
                          <span className="absolute top-1.5 left-1.5 text-[9px] font-black bg-blue-600 text-white px-1.5 py-0.5 rounded">
                            封面
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemovePhoto(url)}
                          className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-white/90 text-red-500 text-xs font-black shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-[10px] text-slate-400 mt-2 italic">
                  第一張會作為提案文件上的封面圖
                </p>
              </div>
              <div className="col-span-2">
                <FieldLabel>內部備註（不會出現在客戶提案）</FieldLabel>
                <input
                  value={form.note || ""}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div className="col-span-2">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(e) => setForm({ ...form, active: e.target.checked })}
                    className="w-5 h-5 accent-emerald-500"
                  />
                  <span className="text-xs font-bold text-slate-600">
                    啟用中（停用後不會出現在提案的房號選單）
                  </span>
                </label>
              </div>
            </div>
          </section>
        </div>

        <footer className="p-6 border-t bg-slate-50 flex gap-4 shrink-0">
          {!isCreate && (
            <button
              type="button"
              onClick={handleDelete}
              className="px-6 py-4 rounded-2xl font-bold border border-red-200 text-red-500 hover:bg-red-50"
            >
              刪除房型
            </button>
          )}
          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="flex-1 bg-slate-900 text-white py-4 rounded-2xl font-bold hover:bg-black transition-all disabled:opacity-50"
          >
            {saving ? "儲存中…" : "儲存房型"}
          </button>
        </footer>
      </div>
    </div>
  );
}

/* ============================================================
   主頁面
   ============================================================ */
export default function RoomMasterPage() {
  const router = useRouter();
  const { width: sidebarWidth } = useSidebar();

  const [hasMounted, setHasMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabId>("rooms");

  const [floors, setFloors] = useState<Floor[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);

  const [editingFloor, setEditingFloor] = useState<Floor | null>(null);
  const [creatingFloor, setCreatingFloor] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [draftRoom, setDraftRoom] = useState<Room | null>(null);

  const [keyword, setKeyword] = useState("");
  const [floorFilter, setFloorFilter] = useState("全部");
  const [statusFilter, setStatusFilter] = useState("全部");

  useEffect(() => {
    setHasMounted(true);
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (!user) router.push("/login");
    });

    const unsubFloors = onSnapshot(
      query(collection(db, "floors"), orderBy("sortOrder", "asc")),
      (snap) => setFloors(snap.docs.map((d) => ({ ...(d.data() as Floor), id: d.id })))
    );

    const unsubRooms = onSnapshot(
      query(collection(db, "rooms"), orderBy("roomNo", "asc")),
      (snap) => {
        setRooms(snap.docs.map((d) => ({ ...(d.data() as Room), id: d.id })));
        setLoading(false);
      }
    );

    return () => {
      unsubAuth();
      unsubFloors();
      unsubRooms();
    };
  }, [router]);

  const floorMap = useMemo(() => new Map(floors.map((f) => [f.id, f])), [floors]);

  const roomCountByFloor = useMemo(() => {
    const m = new Map<string, number>();
    rooms.forEach((r) => m.set(r.floorId, (m.get(r.floorId) || 0) + 1));
    return m;
  }, [rooms]);

  const filteredRooms = useMemo(() => {
    const k = keyword.trim().toLowerCase();
    return rooms.filter((r) => {
      if (k && !(
        r.roomNo.toLowerCase().includes(k) ||
        (r.featureDesc || "").toLowerCase().includes(k)
      )) return false;
      if (floorFilter !== "全部" && r.floorId !== floorFilter) return false;
      if (statusFilter !== "全部" && r.status !== statusFilter) return false;
      return true;
    });
  }, [rooms, keyword, floorFilter, statusFilter]);

  const stats = useMemo(() => {
    const available = rooms.filter((r) => r.status === "AVAILABLE" && r.active).length;
    const occupied = rooms.filter((r) => r.status === "OCCUPIED").length;
    const incomplete = rooms.filter((r) => !r.priceBase || !r.areaPing).length;
    return { total: rooms.length, available, occupied, incomplete };
  }, [rooms]);

  // 複製一筆房型作為新增草稿，同層房間規格相近，建檔會快很多
  const handleDuplicate = (r: Room) => {
    setDraftRoom({ ...r, id: "", roomNo: "", status: "AVAILABLE", currentCaseId: "" });
    setCreatingRoom(true);
  };

  if (!hasMounted || loading) {
    return (
      <div className="h-screen flex items-center justify-center font-bold text-slate-400">
        正在與雲端資料庫同步…
      </div>
    );
  }

  return (
    <div
      style={{ left: sidebarWidth, transition: "left 200ms" }}
      className="fixed inset-0 flex flex-col bg-slate-50/50 font-sans overflow-hidden text-slate-800"
    >
      <header className="p-8 pb-0 shrink-0 bg-white border-b shadow-sm z-10">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold underline decoration-blue-500/30">房型資料維護</h1>
            <p className="text-xs text-slate-400 mt-2">
              帶看提案的比價表會直接讀取這裡的資料，價格與坪數請務必填寫正確
            </p>
          </div>
          <button
            onClick={() => (tab === "rooms" ? setCreatingRoom(true) : setCreatingFloor(true))}
            className="bg-slate-900 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg hover:bg-black transition-all"
          >
            {tab === "rooms" ? "+ 新增房型" : "+ 新增樓層"}
          </button>
        </div>

        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: "房型總數", value: stats.total, color: "text-slate-800" },
            { label: "可出租", value: stats.available, color: "text-emerald-600" },
            { label: "已出租", value: stats.occupied, color: "text-slate-400" },
            { label: "資料未填齊", value: stats.incomplete, color: "text-red-500" },
          ].map((s) => (
            <div key={s.label} className="bg-slate-50 rounded-xl border border-slate-200 px-4 py-3">
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                {s.label}
              </div>
              <div className={`text-2xl font-black mt-1 ${s.color}`}>{s.value}</div>
            </div>
          ))}
        </div>

        <div className="flex gap-6 border-b border-slate-100">
          {([
            { id: "rooms", label: `辦公室房型（${rooms.length}）` },
            { id: "floors", label: `樓層環境（${floors.length}）` },
          ] as { id: TabId; label: string }[]).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`pb-3 px-1 text-sm font-bold transition-all ${
                tab === t.id
                  ? "text-blue-600 border-b-2 border-blue-600"
                  : "text-slate-400 hover:text-slate-600"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <main className="flex-1 min-h-0 overflow-auto custom-scrollbar p-8">
        {/* ---------- 房型清單 ---------- */}
        {tab === "rooms" && (
          <div className="space-y-6">
            <div className="flex items-center gap-3 bg-white p-2.5 rounded-xl border border-slate-200">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black text-slate-400 uppercase">搜尋</span>
                <input
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="房號 / 空間特色"
                  className="px-2 py-1.5 border border-slate-200 rounded-lg text-xs w-44 outline-none focus:border-blue-400"
                />
              </div>
              <div className="h-4 w-px bg-slate-200" />
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black text-slate-400 uppercase">樓層</span>
                <select
                  value={floorFilter}
                  onChange={(e) => setFloorFilter(e.target.value)}
                  className="px-2 py-1 border border-slate-200 rounded-lg text-xs font-bold text-slate-600 w-40"
                >
                  <option value="全部">全部樓層</option>
                  {floors.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.floorName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="h-4 w-px bg-slate-200" />
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black text-slate-400 uppercase">狀態</span>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-2 py-1 border border-slate-200 rounded-lg text-xs font-bold text-slate-600 w-28"
                >
                  <option value="全部">全部狀態</option>
                  {(Object.keys(ROOM_STATUS_LABEL) as RoomStatus[]).map((s) => (
                    <option key={s} value={s}>
                      {ROOM_STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </div>
              <span className="ml-auto text-[11px] font-bold text-slate-400">
                顯示 {filteredRooms.length} / {rooms.length} 間
              </span>
            </div>

            {floors.length === 0 ? (
              <div className="py-24 text-center border-2 border-dashed border-slate-200 rounded-2xl bg-white">
                <p className="text-sm font-bold text-slate-500">請先建立樓層</p>
                <p className="text-xs text-slate-400 mt-2">
                  房型必須掛在樓層底下，才能帶出空調與電費規則
                </p>
                <button
                  onClick={() => setTab("floors")}
                  className="mt-6 bg-slate-900 text-white px-6 py-2.5 rounded-xl text-xs font-bold"
                >
                  前往樓層環境
                </button>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      <th className="text-left px-6 py-4">房號</th>
                      <th className="text-left px-4 py-4">樓層</th>
                      <th className="text-right px-4 py-4">坪數</th>
                      <th className="text-right px-4 py-4">人數</th>
                      <th className="text-left px-4 py-4">空間特色</th>
                      <th className="text-right px-4 py-4">原價</th>
                      <th className="text-right px-4 py-4">半年繳</th>
                      <th className="text-right px-4 py-4">年繳</th>
                      <th className="text-center px-4 py-4">狀態</th>
                      <th className="px-4 py-4" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRooms.map((r) => {
                      const f = floorMap.get(r.floorId);
                      const incomplete = !r.priceBase || !r.areaPing;
                      return (
                        <tr
                          key={r.id}
                          onClick={() => setEditingRoom(r)}
                          className={`border-t border-slate-100 hover:bg-blue-50/40 cursor-pointer transition-colors ${
                            !r.active ? "opacity-40" : ""
                          }`}
                        >
                          <td className="px-6 py-4 font-black text-slate-800">
                            {r.roomNo}
                            {incomplete && (
                              <span className="ml-2 text-[9px] font-black text-red-500 bg-red-50 px-1.5 py-0.5 rounded">
                                待補
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-4 text-xs text-slate-500">
                            {f?.floorName || (
                              <span className="text-red-400 italic">樓層已刪除</span>
                            )}
                          </td>
                          <td className="px-4 py-4 text-right text-xs font-bold">
                            {r.areaPing || "-"}
                          </td>
                          <td className="px-4 py-4 text-right text-xs font-bold">
                            {r.capacityMax || "-"}
                          </td>
                          <td className="px-4 py-4 text-xs text-slate-500 max-w-[180px] truncate">
                            {r.featureDesc || "-"}
                          </td>
                          <td className="px-4 py-4 text-right text-xs font-bold text-slate-700">
                            {r.priceBase ? currency(r.priceBase) : "-"}
                          </td>
                          <td className="px-4 py-4 text-right text-xs text-emerald-600 font-bold">
                            {r.priceHalfYear ? currency(r.priceHalfYear) : "-"}
                          </td>
                          <td className="px-4 py-4 text-right text-xs text-emerald-700 font-black">
                            {r.priceYearly ? currency(r.priceYearly) : "-"}
                          </td>
                          <td className="px-4 py-4 text-center">
                            <span
                              className={`text-[10px] font-black px-2 py-1 rounded ${
                                ROOM_STATUS_STYLE[r.status]
                              }`}
                            >
                              {ROOM_STATUS_LABEL[r.status]}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-right">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDuplicate(r);
                              }}
                              className="text-[10px] font-black text-slate-400 hover:text-blue-600 px-2 py-1 rounded hover:bg-white"
                            >
                              複製
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {filteredRooms.length === 0 && (
                  <div className="py-20 text-center">
                    <p className="text-xs font-bold text-slate-400 italic">
                      沒有符合條件的房型
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ---------- 樓層清單 ---------- */}
        {tab === "floors" && (
          <div className="grid grid-cols-2 gap-6">
            {floors.map((f) => (
              <div
                key={f.id}
                onClick={() => setEditingFloor(f)}
                className={`bg-white rounded-2xl border border-slate-200 p-6 cursor-pointer hover:ring-2 hover:ring-blue-400 transition-all ${
                  !f.active ? "opacity-40" : ""
                }`}
              >
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <div className="text-base font-black text-slate-800">{f.floorName}</div>
                    <div className="text-[10px] font-mono text-slate-400 mt-1">{f.floorCode}</div>
                  </div>
                  <span
                    className={`text-[10px] font-black px-2 py-1 rounded ${
                      f.acType === "INDEPENDENT"
                        ? "bg-blue-500 text-white"
                        : "bg-slate-400 text-white"
                    }`}
                  >
                    {AC_TYPE_LABEL[f.acType]}
                  </span>
                </div>

                <div className="flex items-center gap-2 mb-4">
                  <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-1 rounded border border-slate-200">
                    {f.building}
                  </span>
                  <span className="text-[10px] font-bold text-slate-400">
                    {roomCountByFloor.get(f.id) || 0} 間房型
                  </span>
                  {f.privateElectricRate > 0 && (
                    <span className="text-[10px] font-bold text-amber-600">
                      私電 ${f.privateElectricRate}/度
                    </span>
                  )}
                </div>

                <pre className="text-[11px] text-slate-500 whitespace-pre-wrap leading-relaxed font-sans bg-slate-50 p-3 rounded-lg border border-slate-100 line-clamp-4">
                  {f.acTemplate}
                </pre>
              </div>
            ))}

            {floors.length === 0 && (
              <div className="col-span-2 py-24 text-center border-2 border-dashed border-slate-200 rounded-2xl bg-white">
                <p className="text-sm font-bold text-slate-500">還沒有任何樓層</p>
                <p className="text-xs text-slate-400 mt-2">
                  先建立樓層與空調規則，再回到房型分頁建立房間
                </p>
                <button
                  onClick={() => setCreatingFloor(true)}
                  className="mt-6 bg-slate-900 text-white px-6 py-2.5 rounded-xl text-xs font-bold"
                >
                  + 新增第一個樓層
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      {(editingFloor || creatingFloor) && (
        <FloorDrawer
          floor={editingFloor}
          isCreate={creatingFloor}
          roomCount={editingFloor ? roomCountByFloor.get(editingFloor.id) || 0 : 0}
          onClose={() => {
            setEditingFloor(null);
            setCreatingFloor(false);
          }}
          onSaved={() => {}}
        />
      )}

      {(editingRoom || creatingRoom) && (
        <RoomDrawer
          room={creatingRoom ? draftRoom : editingRoom}
          isCreate={creatingRoom}
          floors={floors}
          onClose={() => {
            setEditingRoom(null);
            setCreatingRoom(false);
            setDraftRoom(null);
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
