"use client";

// app/rooms/page.tsx
// 房型資料維護：樓層環境母表 + 辦公室房型母表

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
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
  AC_TEMPLATE_PRESET_EN,
  ROOM_STATUS_LABEL,
  ROOM_STATUS_STYLE,
  daysUntilLeaseEnd,
  leaseAlertLevel,
  currency,
  pricePerPing,
  suggestDiscountPrices,
  emptyFloor,
  emptyRoom,
} from "@/lib/types/room";

type TabId = "floors" | "rooms";

/* ============================================================
   共用樣式：與看板、儀表板、週報使用同一套視覺語言
   ============================================================ */
const C = {
  ink: "#1A1A18",
  body: "#3A3833",
  muted: "#8A8780",
  faint: "#B0ADA6",
  hairline: "#E8E6E1",
  surface: "#FAFAF8",
  page: "#F5F4F1",
  accent: "#4E6A74",
  success: "#4F7A52",
  warn: "#A97B22",
  danger: "#B4483C",
};

function RequiredLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[11px] font-medium text-[#8A8780] mb-1.5">
      {children}
      <span className="text-[#B4483C] ml-0.5">*</span>
    </label>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-[11px] font-medium text-[#8A8780] mb-1.5">{children}</label>;
}

/** 區塊標題：小字 eyebrow + 延伸細線，取代原本的彩色粗左邊框 */
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

// 欄位加淡底色讓邊界清楚，取代原本一整片浮動底線
const inputClass =
  "w-full bg-[#FAFAF8] border border-[#E8E6E1] rounded-lg px-3 py-2.5 text-[13px] text-[#1A1A18] outline-none transition-colors focus:bg-white focus:border-[#B0ADA6] placeholder:text-[#C4C1B9]";

const readonlyClass =
  "w-full bg-[#F0EEE9] border border-[#E8E6E1] rounded-lg px-3 py-2.5 text-[13px] text-[#8A8780] tabular-nums";

/** 選項按鈕：館別、空調型式、語言等共用 */
function ChoiceButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3.5 py-2 text-[12px] font-medium rounded-lg border transition-all ${
        active
          ? "bg-[#1A1A18] text-white border-[#1A1A18]"
          : "bg-white text-[#8A8780] border-[#E0DDD6] hover:border-[#B0ADA6]"
      }`}
    >
      {children}
    </button>
  );
}

/** 抽屜外框：標題列 + 內容 + 底部操作，兩個抽屜共用 */
function DrawerShell({
  eyebrow,
  title,
  onClose,
  children,
  footer,
  maxWidth = "max-w-2xl",
}: {
  eyebrow: string;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
  maxWidth?: string;
}) {
  return (
    <div className="fixed inset-0 z-[300] flex justify-end font-sans">
      <div className="absolute inset-0 bg-[#1A1A18]/30 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className={`relative w-full ${maxWidth} bg-white h-full shadow-[0_0_40px_rgba(0,0,0,0.12)] flex flex-col overflow-hidden`}
      >
        <header className="px-8 pt-7 pb-5 shrink-0 bg-white border-b border-[#E8E6E1]">
          <div className="flex justify-between items-start">
            <div className="min-w-0 pr-4">
              <div className="text-[10px] font-semibold text-[#B0ADA6] tracking-[0.16em] uppercase mb-1.5">
                {eyebrow}
              </div>
              <h2 className="text-[19px] font-semibold text-[#1A1A18] tracking-tight truncate">
                {title}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-[#A5A29B] hover:bg-[#F5F4F1] hover:text-[#1A1A18] transition-colors"
            >
              ✕
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-8 py-8 space-y-10 custom-scrollbar bg-white">
          {children}
        </div>

        <footer className="px-8 py-5 border-t border-[#E8E6E1] bg-white flex items-center gap-4 shrink-0">
          {footer}
        </footer>
      </div>
    </div>
  );
}

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
      acTemplateEn: AC_TEMPLATE_PRESET_EN[acType],
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
        floorNameEn: (form.floorNameEn || "").trim(),
        building: form.building,
        acType: form.acType,
        acTemplate: form.acTemplate,
        acTemplateEn: form.acTemplateEn || "",
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
    <DrawerShell
      eyebrow={isCreate ? "New floor" : "Floor detail"}
      title={isCreate ? "新增樓層" : form.floorName || "未命名樓層"}
      onClose={onClose}
      maxWidth="max-w-xl"
      footer={
        <>
          {/* 刪除是不可逆操作，降級成文字連結，不與儲存爭奪視覺重量 */}
          {!isCreate && (
            <button
              type="button"
              onClick={handleDelete}
              className="text-[12px] text-[#A5A29B] hover:text-[#B4483C] transition-colors shrink-0"
            >
              刪除樓層
            </button>
          )}
          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="ml-auto bg-[#1A1A18] text-white px-8 py-3 rounded-lg text-[13px] font-medium hover:bg-black transition-colors disabled:opacity-50"
          >
            {saving ? "儲存中…" : "儲存"}
          </button>
        </>
      }
    >
      {/* ---------- 基本資料 ---------- */}
      <section>
        <SectionHead>樓層基本資料</SectionHead>
        <div className="grid grid-cols-2 gap-x-5 gap-y-5">
          <div>
            <RequiredLabel>樓層代碼</RequiredLabel>
            <input
              value={form.floorCode}
              disabled={!isCreate}
              onChange={(e) => setForm({ ...form, floorCode: e.target.value.toUpperCase() })}
              className={isCreate ? inputClass : `${readonlyClass} cursor-not-allowed`}
              placeholder="FL-21"
            />
            <p className="text-[11px] text-[#B0ADA6] mt-1.5">
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
            <FieldLabel>樓層名稱（英文）</FieldLabel>
            <input
              value={form.floorNameEn || ""}
              onChange={(e) => setForm({ ...form, floorNameEn: e.target.value })}
              className={inputClass}
              placeholder="Minquan 21F　留空則英文提案沿用中文"
            />
          </div>
          <div className="col-span-2">
            <RequiredLabel>所屬館別</RequiredLabel>
            <div className="flex flex-wrap gap-1.5">
              {BUILDING_OPTIONS.map((b) => (
                <ChoiceButton
                  key={b}
                  active={form.building === b}
                  onClick={() => setForm({ ...form, building: b })}
                >
                  {b}
                </ChoiceButton>
              ))}
            </div>
          </div>
          <div>
            <FieldLabel>排序</FieldLabel>
            <input
              type="number"
              value={form.sortOrder}
              onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })}
              className={`${inputClass} tabular-nums`}
            />
          </div>
          <div className="flex items-end pb-2.5">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
                className="w-[18px] h-[18px] accent-[#1A1A18] cursor-pointer"
              />
              <span className="text-[13px] text-[#3A3833]">啟用中</span>
            </label>
          </div>
        </div>
      </section>

      {/* ---------- 空調與用電 ---------- */}
      <section>
        <SectionHead>空調與用電規則</SectionHead>
        <div className="space-y-5">
          <div>
            <RequiredLabel>空調型式</RequiredLabel>
            <div className="flex gap-1.5">
              {(Object.keys(AC_TYPE_LABEL) as AcType[]).map((t) => (
                <ChoiceButton key={t} active={form.acType === t} onClick={() => applyAcPreset(t)}>
                  {AC_TYPE_LABEL[t]}
                </ChoiceButton>
              ))}
            </div>
            <p className="text-[11px] text-[#B0ADA6] mt-2">
              切換型式會重新帶入預設說明，下方文字仍可自行調整
            </p>
          </div>

          <div>
            <FieldLabel>私電單價（每度）</FieldLabel>
            <input
              type="number"
              step="0.1"
              value={form.privateElectricRate}
              onChange={(e) => setForm({ ...form, privateElectricRate: Number(e.target.value) })}
              className={`${inputClass} tabular-nums`}
            />
          </div>

          <div>
            <FieldLabel>提案文件顯示說明</FieldLabel>
            <textarea
              rows={6}
              value={form.acTemplate}
              onChange={(e) => setForm({ ...form, acTemplate: e.target.value })}
              className={`${inputClass} leading-relaxed`}
            />
            <p className="text-[11px] text-[#B0ADA6] mt-1.5">
              一行一項，生成提案時會直接渲染到「空調與用電收費規則」欄位
            </p>
          </div>

          <div>
            <FieldLabel>提案文件顯示說明（英文）</FieldLabel>
            <textarea
              rows={5}
              value={form.acTemplateEn || ""}
              onChange={(e) => setForm({ ...form, acTemplateEn: e.target.value })}
              placeholder="留空則英文提案沿用中文內容"
              className={`${inputClass} leading-relaxed`}
            />
          </div>
        </div>
      </section>

      {!isCreate && (
        <p className="text-[12px] text-[#8A8780] bg-[#FAFAF8] border border-[#E8E6E1] rounded-lg px-4 py-3">
          目前有 <span className="font-semibold text-[#1A1A18] tabular-nums">{roomCount}</span> 間房型掛在此樓層
        </p>
      )}
    </DrawerShell>
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
  onDuplicate,
}: {
  room: Room | null;
  isCreate: boolean;
  floors: Floor[];
  onClose: () => void;
  onDuplicate?: (room: Room) => void;
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

  // 封面決定比價表上顯示哪一張，把選中的照片移到第一順位即可
  const handleSetCover = (url: string) => {
    setPhotos((prev) => [url, ...prev.filter((u) => u !== url)]);
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
        featureDescEn: form.featureDescEn || "",
        priceBase: Number(form.priceBase) || 0,
        priceHalfYear: Number(form.priceHalfYear) || 0,
        priceYearly: Number(form.priceYearly) || 0,
        photoUrls: photos,
        status: form.status,
        availableFrom: form.availableFrom || "",
        tenantName: form.tenantName || "",
        leaseStartDate: form.leaseStartDate || "",
        leaseEndDate: form.leaseEndDate || "",
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
    <DrawerShell
      eyebrow={isCreate ? "New room" : "Room detail"}
      title={isCreate ? "新增房型" : form.roomNo || "未命名房型"}
      onClose={onClose}
      footer={
        <>
          {/* 刪除是不可逆操作，降級成文字連結，不與儲存爭奪視覺重量 */}
          {!isCreate && (
            <>
              <button
                type="button"
                onClick={handleDelete}
                className="text-[12px] text-[#A5A29B] hover:text-[#B4483C] transition-colors shrink-0"
              >
                刪除房型
              </button>
              {/* 同層房間規格相近，複製後只要改房號與坪數，建檔會快很多 */}
              <button
                type="button"
                onClick={() => onDuplicate?.(form)}
                className="text-[12px] text-[#A5A29B] hover:text-[#1A1A18] transition-colors shrink-0"
              >
                複製此房型
              </button>
            </>
          )}
          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="ml-auto bg-[#1A1A18] text-white px-8 py-3 rounded-lg text-[13px] font-medium hover:bg-black transition-colors disabled:opacity-50"
          >
            {saving ? "儲存中…" : "儲存"}
          </button>
        </>
      }
    >
      {/* ---------- 基本資料 ---------- */}
      <section>
        <SectionHead>房型基本資料</SectionHead>
        <div className="grid grid-cols-2 gap-x-5 gap-y-5">
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
              className={`${inputClass} tabular-nums`}
              placeholder="6.0"
            />
          </div>
          <div>
            <FieldLabel>建議可容納人數</FieldLabel>
            <input
              type="number"
              value={form.capacityMax || ""}
              onChange={(e) => setForm({ ...form, capacityMax: Number(e.target.value) })}
              className={`${inputClass} tabular-nums`}
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
          <div className="col-span-2">
            <FieldLabel>空間特色（英文）</FieldLabel>
            <input
              value={form.featureDescEn || ""}
              onChange={(e) => setForm({ ...form, featureDescEn: e.target.value })}
              className={inputClass}
              placeholder="Long layout with pillar　留空則英文提案沿用中文"
            />
          </div>
        </div>

        {linkedFloor && (
          <div className="mt-5 bg-[#FAFAF8] border border-[#E8E6E1] rounded-lg px-4 py-3">
            <div className="text-[11px] font-medium text-[#8A8780] mb-2">
              自動帶入的空調與用電規則（來自 {linkedFloor.floorName}）
            </div>
            <pre className="text-[11px] text-[#5F5E5A] whitespace-pre-wrap leading-relaxed font-sans">
              {linkedFloor.acTemplate}
            </pre>
          </div>
        )}
      </section>

      {/* ---------- 三段報價 ---------- */}
      <section>
        <SectionHead
          action={
            <button
              type="button"
              onClick={handleSuggest}
              className="shrink-0 text-[11px] font-medium px-3 py-1.5 rounded-lg border border-[#E0DDD6] text-[#3A3833] bg-white hover:border-[#B0ADA6] transition-colors"
            >
              依原價試算優惠
            </button>
          }
        >
          三段報價
        </SectionHead>

        <div className="grid grid-cols-3 gap-x-5 gap-y-5">
          <div>
            <FieldLabel>統一原價</FieldLabel>
            <input
              type="number"
              value={form.priceBase || ""}
              onChange={(e) => setForm({ ...form, priceBase: Number(e.target.value) })}
              className={`${inputClass} tabular-nums`}
              placeholder="19000"
            />
          </div>
          <div>
            <FieldLabel>半年繳月租</FieldLabel>
            <input
              type="number"
              value={form.priceHalfYear || ""}
              onChange={(e) => setForm({ ...form, priceHalfYear: Number(e.target.value) })}
              className={`${inputClass} tabular-nums`}
              placeholder="17500"
            />
          </div>
          <div>
            <FieldLabel>年繳月租</FieldLabel>
            <input
              type="number"
              value={form.priceYearly || ""}
              onChange={(e) => setForm({ ...form, priceYearly: Number(e.target.value) })}
              className={`${inputClass} tabular-nums`}
              placeholder="16500"
            />
          </div>
        </div>

        <div className="mt-5 bg-[#FAFAF8] border border-[#E8E6E1] rounded-lg px-5 py-4 grid grid-cols-2 gap-4">
          <div className="flex items-baseline justify-between">
            <span className="text-[12px] text-[#8A8780]">每坪單價</span>
            <span className="text-[13px] font-semibold text-[#1A1A18] tabular-nums">
              {currency(pricePerPing(form.priceBase, form.areaPing))} / 坪
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-[12px] text-[#8A8780]">年繳共省</span>
            <span className="text-[13px] font-semibold tabular-nums" style={{ color: C.success }}>
              {currency((form.priceBase - form.priceYearly) * 12)}
            </span>
          </div>
        </div>
      </section>

      {/* ---------- 出租狀態 ---------- */}
      <section>
        <SectionHead>出租狀態</SectionHead>
        <div className="grid grid-cols-2 gap-x-5 gap-y-5">
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
        </div>

        {/* 承租資訊：成交時由案件自動帶入，仍保留手動調整的空間 */}
        <div className="mt-5 bg-[#FAFAF8] border border-[#E8E6E1] rounded-lg px-5 py-4">
          <div className="flex justify-between items-center mb-4">
            <span className="text-[11px] font-semibold text-[#8A8780] tracking-[0.12em] uppercase">
              承租資訊
            </span>
            {form.tenantSyncedAt && (
              <span className="text-[11px] text-[#B0ADA6]">由案件自動同步</span>
            )}
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <FieldLabel>承租公司</FieldLabel>
              <input
                value={form.tenantName || ""}
                onChange={(e) => setForm({ ...form, tenantName: e.target.value })}
                placeholder="成交時自動帶入"
                className="w-full bg-white border border-[#E8E6E1] rounded-lg px-3 py-2 text-[13px] text-[#1A1A18] outline-none focus:border-[#B0ADA6] transition-colors placeholder:text-[#C4C1B9]"
              />
            </div>
            <div>
              <FieldLabel>租約起日</FieldLabel>
              <input
                type="date"
                value={form.leaseStartDate || ""}
                onChange={(e) => setForm({ ...form, leaseStartDate: e.target.value })}
                className="w-full bg-white border border-[#E8E6E1] rounded-lg px-3 py-2 text-[13px] text-[#1A1A18] outline-none focus:border-[#B0ADA6] transition-colors"
              />
            </div>
            <div>
              <FieldLabel>租約迄日</FieldLabel>
              <input
                type="date"
                value={form.leaseEndDate || ""}
                onChange={(e) => setForm({ ...form, leaseEndDate: e.target.value })}
                className="w-full bg-white border border-[#E8E6E1] rounded-lg px-3 py-2 text-[13px] text-[#1A1A18] outline-none focus:border-[#B0ADA6] transition-colors"
              />
            </div>
          </div>

          {form.leaseEndDate &&
            (() => {
              const days = daysUntilLeaseEnd(form.leaseEndDate);
              const level = leaseAlertLevel(form.leaseEndDate);
              if (days === null) return null;
              const tone =
                level === "expired" ? C.danger : level === "expiring" ? C.warn : C.success;
              return (
                <div className="mt-3 text-[12px] font-medium" style={{ color: tone }}>
                  {level === "expired"
                    ? `租約已於 ${Math.abs(days)} 天前到期`
                    : `距離租約到期還有 ${days} 天`}
                </div>
              );
            })()}

          {form.currentCaseId && (
            <button
              type="button"
              onClick={() => window.open(`/cases?id=${form.currentCaseId}`, "_blank")}
              className="mt-3 text-[12px] text-[#4E6A74] hover:underline"
            >
              查看關聯案件 →
            </button>
          )}
        </div>
      </section>

      {/* ---------- 照片 ---------- */}
      <section>
        <SectionHead
          action={
            <span className="shrink-0 text-[11px] text-[#B0ADA6]">
              {photos.length} 張・自動壓縮至長邊 1600px
            </span>
          }
        >
          房型照片
        </SectionHead>

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
          className="w-full py-6 rounded-lg border border-dashed border-[#E0DDD6] hover:border-[#B0ADA6] hover:bg-[#FAFAF8] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {uploading ? (
            <div className="px-8">
              <div className="text-[12px] text-[#3A3833] mb-2 tabular-nums">上傳中 {progress}%</div>
              <div className="h-1 bg-[#F0EEE9] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#1A1A18] transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          ) : (
            <>
              <div className="text-[13px] font-medium text-[#3A3833]">選擇照片上傳</div>
              <div className="text-[11px] text-[#B0ADA6] mt-1">可一次選多張，單張上限 5MB</div>
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
                  onClick={() => handleSetCover(url)}
                  className={`h-24 w-full object-cover rounded-lg bg-[#F0EEE9] transition-all ${
                    i === 0
                      ? "ring-2 ring-[#1A1A18]"
                      : "border border-[#E8E6E1] cursor-pointer hover:ring-2 hover:ring-[#B0ADA6]"
                  }`}
                />
                {i === 0 ? (
                  <span className="absolute top-1.5 left-1.5 text-[10px] font-medium bg-[#1A1A18] text-white px-2 py-0.5 rounded">
                    封面
                  </span>
                ) : (
                  <span className="absolute inset-x-1.5 bottom-1.5 text-[10px] text-white bg-[#1A1A18]/70 py-1 rounded text-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    設為封面
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => handleRemovePhoto(url)}
                  className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-white/90 text-[#B4483C] text-xs shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
        <p className="text-[11px] text-[#B0ADA6] mt-2.5">
          封面會出現在提案的比價表，其餘照片會集中放在提案的空間實景區塊
        </p>
      </section>

      {/* ---------- 內部設定 ---------- */}
      <section>
        <SectionHead>內部設定</SectionHead>
        <div className="space-y-5">
          <div>
            <FieldLabel>內部備註（不會出現在客戶提案）</FieldLabel>
            <input
              value={form.note || ""}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              className={inputClass}
            />
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
              className="w-[18px] h-[18px] accent-[#1A1A18] cursor-pointer"
            />
            <span className="text-[13px] text-[#3A3833]">
              啟用中
              <span className="text-[#B0ADA6] ml-2">停用後不會出現在提案的房號選單</span>
            </span>
          </label>
        </div>
      </section>
    </DrawerShell>
  );
}

/* ============================================================
   主頁面
   ============================================================ */
export default function RoomMasterPage() {
  const router = useRouter();

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

      // 「資料未填齊」與「即將到期」不是房間狀態而是計算出來的條件，
      // 但業務找資料時想的是同一件事，所以放在同一個篩選裡
      if (statusFilter === "INCOMPLETE") {
        if (r.priceBase && r.areaPing) return false;
      } else if (statusFilter === "EXPIRING") {
        if (leaseAlertLevel(r.leaseEndDate) !== "expiring") return false;
      } else if (statusFilter !== "全部" && r.status !== statusFilter) {
        return false;
      }
      return true;
    });
  }, [rooms, keyword, floorFilter, statusFilter]);

  const stats = useMemo(() => {
    const available = rooms.filter((r) => r.status === "AVAILABLE" && r.active).length;
    const occupied = rooms.filter((r) => r.status === "OCCUPIED").length;
    const incomplete = rooms.filter((r) => !r.priceBase || !r.areaPing).length;
    const expiring = rooms.filter((r) => leaseAlertLevel(r.leaseEndDate) === "expiring").length;
    return { total: rooms.length, available, occupied, incomplete, expiring };
  }, [rooms]);

  // 複製一筆房型作為新增草稿，同層房間規格相近，建檔會快很多。
  // 從編輯抽屜按下時要一併清掉編輯狀態，否則兩個狀態並存會渲染錯的內容
  const handleDuplicate = (r: Room) => {
    setDraftRoom({
      ...r,
      id: "",
      roomNo: "",
      status: "AVAILABLE",
      currentCaseId: "",
      tenantName: "",
      leaseStartDate: "",
      leaseEndDate: "",
    });
    setEditingRoom(null);
    setCreatingRoom(true);
  };

  if (!hasMounted || loading) {
    return (
      <div
        className="h-screen flex items-center justify-center text-[13px] text-[#A5A29B]"
        style={{ backgroundColor: C.page }}
      >
        正在與雲端資料庫同步…
      </div>
    );
  }

  const STAT_CARDS = [
    { label: "房型總數", value: stats.total, color: C.ink, filter: "全部" },
    { label: "可出租", value: stats.available, color: C.success, filter: "AVAILABLE" },
    { label: "已出租", value: stats.occupied, color: C.faint, filter: "OCCUPIED" },
    { label: "3個月內到期", value: stats.expiring, color: C.warn, filter: "EXPIRING" },
    { label: "資料未填齊", value: stats.incomplete, color: C.danger, filter: "INCOMPLETE" },
  ];

  const hasFilter = !!keyword || floorFilter !== "全部" || statusFilter !== "全部";

  return (
    <div
      style={{ backgroundColor: C.page }}
      className="flex-1 h-screen overflow-y-auto custom-scrollbar font-sans text-slate-800"
    >
      <header className="px-8 pt-8 bg-white border-b border-[#E8E6E1]">
        <div className="flex justify-between items-start mb-5">
          <div>
            <h1 className="text-[22px] font-semibold text-[#1A1A18] tracking-tight">房型資料維護</h1>
            <p className="text-[11px] text-[#A5A29B] mt-1">
              帶看提案的比價表會直接讀取這裡的資料，價格與坪數請務必填寫正確
            </p>
          </div>
          <button
            onClick={() => (tab === "rooms" ? setCreatingRoom(true) : setCreatingFloor(true))}
            className="bg-[#1A1A18] text-white px-5 py-2.5 rounded-lg text-[13px] font-medium hover:bg-black transition-colors whitespace-nowrap"
          >
            {tab === "rooms" ? "新增房型" : "新增樓層"}
          </button>
        </div>

        {/* 統計卡同時是篩選按鈕，點了直接看那批房間 */}
        <div className="grid grid-cols-5 gap-3 mb-5">
          {STAT_CARDS.map((s) => {
            const isActive = statusFilter === s.filter;
            return (
              <button
                key={s.label}
                type="button"
                onClick={() => {
                  // 點總數等同清除，點同一張再按一次也回到全部
                  setStatusFilter(isActive ? "全部" : s.filter);
                  if (s.filter === "全部") {
                    setKeyword("");
                    setFloorFilter("全部");
                  }
                  setTab("rooms");
                }}
                className={`text-left rounded-lg border px-4 py-3 transition-all ${
                  isActive
                    ? "bg-white border-[#B0ADA6] ring-1 ring-[#E0DDD6]"
                    : "bg-[#FAFAF8] border-[#E8E6E1] hover:border-[#D5D2CB] hover:bg-white"
                }`}
              >
                <div className="text-[11px] text-[#8A8780] whitespace-nowrap">{s.label}</div>
                <div
                  className="text-[22px] font-semibold tabular-nums leading-none mt-2 tracking-tight"
                  style={{ color: s.color }}
                >
                  {s.value}
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex gap-1 -mb-px">
          {([
            { id: "rooms", label: `辦公室房型（${rooms.length}）` },
            { id: "floors", label: `樓層環境（${floors.length}）` },
          ] as { id: TabId; label: string }[]).map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-3.5 py-2.5 text-[13px] font-medium transition-colors relative ${
                  active ? "text-[#1A1A18]" : "text-[#A5A29B] hover:text-[#3A3833]"
                }`}
              >
                {t.label}
                {active && (
                  <span className="absolute left-3 right-3 -bottom-px h-[2px] bg-[#1A1A18] rounded-full" />
                )}
              </button>
            );
          })}
        </div>
      </header>

      <main className="px-8 py-6">
        {/* ---------- 房型清單 ---------- */}
        {tab === "rooms" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 bg-white p-2 rounded-lg border border-[#E8E6E1]">
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="搜尋房號或空間特色"
                className="px-3 py-1.5 bg-[#FAFAF8] border border-[#E8E6E1] rounded-md text-[12px] w-52 outline-none focus:bg-white focus:border-[#B0ADA6] transition-colors text-[#1A1A18] placeholder:text-[#C4C1B9]"
              />
              <select
                value={floorFilter}
                onChange={(e) => setFloorFilter(e.target.value)}
                className="px-2.5 py-1.5 bg-white border border-[#E8E6E1] rounded-md text-[12px] font-medium text-[#3A3833] w-40 outline-none"
              >
                <option value="全部">全部樓層</option>
                {floors.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.floorName}
                  </option>
                ))}
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-2.5 py-1.5 bg-white border border-[#E8E6E1] rounded-md text-[12px] font-medium text-[#3A3833] w-36 outline-none"
              >
                <option value="全部">全部狀態</option>
                {(Object.keys(ROOM_STATUS_LABEL) as RoomStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {ROOM_STATUS_LABEL[s]}
                  </option>
                ))}
                <option value="EXPIRING">3個月內到期</option>
                <option value="INCOMPLETE">資料未填齊</option>
              </select>
              {hasFilter && (
                <button
                  type="button"
                  onClick={() => {
                    setKeyword("");
                    setFloorFilter("全部");
                    setStatusFilter("全部");
                  }}
                  className="text-[11px] text-[#A5A29B] hover:text-[#1A1A18] px-2 transition-colors"
                >
                  清除篩選
                </button>
              )}
              <span className="ml-auto text-[11px] text-[#B0ADA6] tabular-nums">
                {filteredRooms.length} / {rooms.length} 間
              </span>
            </div>

            {floors.length === 0 ? (
              <div className="py-20 text-center border border-dashed border-[#E0DDD6] rounded-lg bg-white">
                <p className="text-[13px] font-medium text-[#3A3833]">請先建立樓層</p>
                <p className="text-[12px] text-[#A5A29B] mt-2">
                  房型必須掛在樓層底下，才能帶出空調與電費規則
                </p>
                <button
                  onClick={() => setTab("floors")}
                  className="mt-5 bg-[#1A1A18] text-white px-5 py-2.5 rounded-lg text-[12px] font-medium"
                >
                  前往樓層環境
                </button>
              </div>
            ) : (
              <div className="bg-white rounded-lg border border-[#E8E6E1] overflow-hidden">
                <table className="w-full text-sm table-fixed">
                  <thead>
                    <tr className="border-b border-[#E8E6E1] text-xs font-medium text-[#8A8780] whitespace-nowrap">
                      <th className="text-left px-5 py-3 w-[11%]">房號</th>
                      <th className="text-left px-4 py-3 w-[14%]">樓層</th>
                      <th className="text-right px-4 py-3 w-[12%]">坪數／人數</th>
                      <th className="text-left px-4 py-3 w-[25%]">空間特色</th>
                      <th className="text-right px-4 py-3 w-[16%]">報價</th>
                      <th className="text-left px-5 py-3 w-[22%]">狀態與承租</th>
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
                          className={`border-t border-[#F0EEE9] hover:bg-[#FAFAF8] cursor-pointer transition-colors ${
                            !r.active ? "opacity-40" : ""
                          }`}
                        >
                          <td className="px-5 py-4 align-top">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-[#1A1A18] whitespace-nowrap">
                                {r.roomNo}
                              </span>
                              {incomplete && (
                                <span
                                  className="text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0"
                                  style={{ backgroundColor: "#FBF2F0", color: C.danger }}
                                >
                                  待補
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-4 text-[13px] text-[#8A8780] align-top">
                            {f?.floorName || (
                              <span style={{ color: C.danger }}>樓層已刪除</span>
                            )}
                          </td>
                          {/* 坪數與人數合併，兩者都是空間規格且數字都很短 */}
                          <td className="px-4 py-4 text-right align-top whitespace-nowrap">
                            <div className="text-[13px] font-medium text-[#3A3833] tabular-nums">
                              {r.areaPing ? `${r.areaPing} 坪` : "—"}
                            </div>
                            <div className="text-[11px] text-[#B0ADA6] mt-0.5 tabular-nums">
                              {r.capacityMax ? `${r.capacityMax} 人` : "—"}
                            </div>
                          </td>
                          <td className="px-4 py-4 text-[13px] text-[#8A8780] align-top">
                            <div className="line-clamp-2">{r.featureDesc || "—"}</div>
                          </td>
                          {/* 三段價格垂直排列：年繳最醒目、原價刪除線，省下兩個欄位的寬度 */}
                          <td className="px-4 py-4 text-right align-top whitespace-nowrap">
                            {r.priceYearly || r.priceBase ? (
                              <>
                                <div
                                  className="text-[14px] font-semibold tabular-nums"
                                  style={{ color: C.success }}
                                >
                                  {r.priceYearly ? currency(r.priceYearly) : "—"}
                                </div>
                                <div className="text-[11px] text-[#B0ADA6] mt-0.5 tabular-nums">
                                  {r.priceHalfYear ? currency(r.priceHalfYear) : "—"}
                                </div>
                                {r.priceBase > 0 && r.priceBase !== r.priceYearly && (
                                  <div className="text-[11px] text-[#C4C1B9] line-through tabular-nums">
                                    {currency(r.priceBase)}
                                  </div>
                                )}
                              </>
                            ) : (
                              <span className="text-[13px] text-[#C4C1B9]">—</span>
                            )}
                          </td>
                          {/* 狀態與承租資訊合併：兩者講的是同一件事，分兩欄反而要左右對照 */}
                          <td className="px-5 py-4 align-top">
                            <span
                              className={`inline-block text-[11px] font-medium px-2.5 py-1 rounded ${
                                ROOM_STATUS_STYLE[r.status]
                              }`}
                            >
                              {ROOM_STATUS_LABEL[r.status]}
                            </span>
                            {r.tenantName && (
                              <div className="text-xs text-[#3A3833] truncate mt-1.5">
                                {r.tenantName}
                              </div>
                            )}
                            {r.leaseEndDate &&
                              (() => {
                                const level = leaseAlertLevel(r.leaseEndDate);
                                const days = daysUntilLeaseEnd(r.leaseEndDate);
                                const tone =
                                  level === "expired"
                                    ? C.danger
                                    : level === "expiring"
                                    ? C.warn
                                    : C.faint;
                                return (
                                  <div
                                    className="text-[11px] mt-0.5 whitespace-nowrap tabular-nums"
                                    style={{ color: tone }}
                                  >
                                    {r.leaseEndDate} 到期
                                    {level === "expiring" && ` · 剩 ${days} 天`}
                                    {level === "expired" && " · 已逾期"}
                                  </div>
                                );
                              })()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {filteredRooms.length === 0 && (
                  <div className="py-16 text-center">
                    <p className="text-[12px] text-[#A5A29B]">沒有符合條件的房型</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ---------- 樓層清單 ---------- */}
        {tab === "floors" && (
          <div className="grid grid-cols-2 gap-4">
            {floors.map((f) => (
              <div
                key={f.id}
                onClick={() => setEditingFloor(f)}
                className={`bg-white rounded-lg border border-[#E8E6E1] px-5 py-4 cursor-pointer hover:border-[#D5D2CB] transition-colors ${
                  !f.active ? "opacity-40" : ""
                }`}
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="min-w-0">
                    <div className="text-[15px] font-semibold text-[#1A1A18] truncate">
                      {f.floorName}
                    </div>
                    <div className="text-[11px] font-mono text-[#B0ADA6] mt-0.5">{f.floorCode}</div>
                  </div>
                  <span
                    className="text-[11px] font-medium px-2 py-1 rounded shrink-0"
                    style={{
                      backgroundColor: f.acType === "INDEPENDENT" ? "#EDF1F2" : "#F0EEE9",
                      color: f.acType === "INDEPENDENT" ? C.accent : C.muted,
                    }}
                  >
                    {AC_TYPE_LABEL[f.acType]}
                  </span>
                </div>

                <div className="flex items-center gap-3 mb-3 text-[11px] text-[#8A8780]">
                  <span>{f.building}</span>
                  <span className="text-[#D5D2CB]">·</span>
                  <span className="tabular-nums">{roomCountByFloor.get(f.id) || 0} 間房型</span>
                  {f.privateElectricRate > 0 && (
                    <>
                      <span className="text-[#D5D2CB]">·</span>
                      <span className="tabular-nums">私電 ${f.privateElectricRate}/度</span>
                    </>
                  )}
                </div>

                <pre className="text-[11px] text-[#8A8780] whitespace-pre-wrap leading-relaxed font-sans bg-[#FAFAF8] border border-[#F0EEE9] rounded-md px-3 py-2.5 line-clamp-4">
                  {f.acTemplate}
                </pre>
              </div>
            ))}

            {floors.length === 0 && (
              <div className="col-span-2 py-20 text-center border border-dashed border-[#E0DDD6] rounded-lg bg-white">
                <p className="text-[13px] font-medium text-[#3A3833]">還沒有任何樓層</p>
                <p className="text-[12px] text-[#A5A29B] mt-2">
                  先建立樓層與空調規則，再回到房型分頁建立房間
                </p>
                <button
                  onClick={() => setCreatingFloor(true)}
                  className="mt-5 bg-[#1A1A18] text-white px-5 py-2.5 rounded-lg text-[12px] font-medium"
                >
                  新增第一個樓層
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
          onDuplicate={handleDuplicate}
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
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #D5D2CB;
          border-radius: 999px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #B0ADA6;
        }
      `}</style>
    </div>
  );
}
