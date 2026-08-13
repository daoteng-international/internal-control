// lib/types/room.ts
// 樓層環境母表 + 辦公室房型母表 的型別定義與共用常數

// ---------- 館別 ----------
// 目前 cases/page.tsx 內的 BUILDINGS 常數，之後改由 floors 集合推導，
// 這裡先集中管理，避免兩邊各自維護一份而不同步。
export const BUILDING_OPTIONS = [
  "四維館",
  "民權20樓",
  "民權21樓",
  "民權27樓",
  "民權28樓",
] as const;

export type BuildingId = (typeof BUILDING_OPTIONS)[number];

// ---------- 空調類型 ----------
export type AcType = "INDEPENDENT" | "CENTRAL";

export const AC_TYPE_LABEL: Record<AcType, string> = {
  INDEPENDENT: "獨立空調",
  CENTRAL: "中央空調",
};

// 選擇空調類型時自動帶入的說明模板（業務可再手動覆寫）
export const AC_TEMPLATE_PRESET: Record<AcType, string> = {
  INDEPENDENT: [
    "空調時段：24 小時皆可使用",
    "私人電費：每度 $6.5，依獨立電表實際用量計費",
    "公共電費：由道騰包辦，不另計費",
  ].join("\n"),
  CENTRAL: [
    "空調時段：平日 08:00–18:00",
    "公共電費：依承租坪數分攤",
    "非上班時段如需用電，請提前向櫃檯申請",
  ].join("\n"),
};

// ---------- 房間狀態 ----------
export type RoomStatus = "AVAILABLE" | "RESERVED" | "OCCUPIED" | "MAINTENANCE";

export const ROOM_STATUS_LABEL: Record<RoomStatus, string> = {
  AVAILABLE: "可出租",
  RESERVED: "已保留",
  OCCUPIED: "已出租",
  MAINTENANCE: "整修中",
};

export const ROOM_STATUS_LABEL_EN: Record<RoomStatus, string> = {
  AVAILABLE: "Available",
  RESERVED: "Reserved",
  OCCUPIED: "Occupied",
  MAINTENANCE: "Under maintenance",
};

export const AC_TYPE_LABEL_EN: Record<AcType, string> = {
  INDEPENDENT: "Independent AC",
  CENTRAL: "Central AC",
};

/** 英文版空調說明的預設範本，建檔時可直接套用再微調 */
export const AC_TEMPLATE_PRESET_EN: Record<AcType, string> = {
  INDEPENDENT: [
    "Air conditioning: independent unit, available 24 hours",
    "Private electricity: NT$6.5 per kWh, metered separately",
    "Public area electricity: included in the rent",
  ].join("\n"),
  CENTRAL: [
    "Air conditioning: central system, 08:00–18:00 on weekdays",
    "Public area electricity: shared based on leased floor area",
    "Please notify the front desk in advance for after-hours usage",
  ].join("\n"),
};

/**
 * 取英文內容，沒填就回退到中文。
 * 英文欄位是後補的，69 間房不可能一次填完，
 * 回退機制讓提案在資料還沒補齊時仍然印得出來。
 */
export function pickLang(zh: string | undefined, en: string | undefined, isEn: boolean) {
  if (!isEn) return zh || "";
  return (en && en.trim()) || zh || "";
}

export const ROOM_STATUS_STYLE: Record<RoomStatus, string> = {
  AVAILABLE: "bg-emerald-500 text-white",
  RESERVED: "bg-amber-400 text-white",
  OCCUPIED: "bg-slate-400 text-white",
  MAINTENANCE: "bg-red-500 text-white",
};

// ---------- 樓層環境母表 ----------
export interface Floor {
  id: string; // 文件 ID，直接使用 floorCode，例如 FL-21
  floorCode: string; // FL-21
  floorName: string; // 民權館 21 樓
  floorNameEn?: string; // Minquan 21F，提案輸出英文版時使用
  building: string; // 對應 BUILDING_OPTIONS
  acType: AcType;
  acTemplate: string; // 渲染到提案 PDF 的空調與用電說明
  acTemplateEn?: string; // 英文版說明，未填則沿用中文
  privateElectricRate: number; // 私電單價，中央空調可填 0
  sortOrder: number;
  active: boolean;
  createdAt?: any;
  updatedAt?: any;
}

// ---------- 辦公室房型母表 ----------
export interface Room {
  id: string; // Firestore 自動 ID
  roomNo: string; // 2118、B3、202
  floorId: string; // 關聯 Floor.id
  areaPing: number; // 坪數
  capacityMax: number; // 建議可容納人數
  featureDesc: string; // 長型（有圓柱）
  featureDescEn?: string; // Long layout with pillar，提案輸出英文版時使用
  priceBase: number; // 對外報價（新價格優先，無新價格則為統一報價）
  priceHalfYear: number; // 半年繳優惠月租
  priceYearly: number; // 年繳優惠月租
  priceOriginal?: number; // 調價前的統一報價，保留供內部對照
  photoUrls: string[]; // 房型實境照片
  status: RoomStatus;

  // --- 承租資訊：S7 成交時自動寫入，之後仍可手動調整 ---
  tenantName?: string; // 目前承租公司
  leaseStartDate?: string; // 租約起日 YYYY-MM-DD
  leaseEndDate?: string; // 租約迄日 YYYY-MM-DD
  currentCaseId?: string; // 關聯的案件卡片
  tenantSyncedAt?: any; // 最近一次由案件同步的時間

  availableFrom?: string; // 預計可進駐日 YYYY-MM-DD
  note?: string; // 內部備註，不渲染到客戶提案
  active: boolean; // 停用後不出現在提案選單
  createdAt?: any;
  updatedAt?: any;
}

// ---------- 工具函式 ----------
export function currency(n: number) {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(n || 0);
}

// 從原價推算優惠價的建議值，方便建檔時快速填寫
export function suggestDiscountPrices(priceBase: number) {
  return {
    priceHalfYear: Math.round((priceBase * 0.92) / 100) * 100,
    priceYearly: Math.round((priceBase * 0.87) / 100) * 100,
  };
}

// 每坪單價，用於比較不同房型的性價比
export function pricePerPing(priceBase: number, areaPing: number) {
  if (!areaPing) return 0;
  return Math.round(priceBase / areaPing);
}

export function emptyFloor(): Floor {
  return {
    id: "",
    floorCode: "",
    floorName: "",
    floorNameEn: "",
    building: BUILDING_OPTIONS[0],
    acType: "INDEPENDENT",
    acTemplate: AC_TEMPLATE_PRESET.INDEPENDENT,
    acTemplateEn: AC_TEMPLATE_PRESET_EN.INDEPENDENT,
    privateElectricRate: 6.5,
    sortOrder: 0,
    active: true,
  };
}

export function emptyRoom(floorId = ""): Room {
  return {
    id: "",
    roomNo: "",
    floorId,
    areaPing: 0,
    capacityMax: 0,
    featureDesc: "",
    featureDescEn: "",
    priceBase: 0,
    priceHalfYear: 0,
    priceYearly: 0,
    photoUrls: [],
    status: "AVAILABLE",
    tenantName: "",
    leaseStartDate: "",
    leaseEndDate: "",
    availableFrom: "",
    note: "",
    active: true,
  };
}

/** 距離租約到期還有幾天，沒有到期日回傳 null */
export function daysUntilLeaseEnd(leaseEndDate?: string): number | null {
  if (!leaseEndDate) return null;
  const end = new Date(leaseEndDate).getTime();
  if (Number.isNaN(end)) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.floor((end - today.getTime()) / (1000 * 60 * 60 * 24));
}

/** 租約狀態，用於列表上的顏色提示 */
export function leaseAlertLevel(leaseEndDate?: string): "none" | "expiring" | "expired" {
  const days = daysUntilLeaseEnd(leaseEndDate);
  if (days === null) return "none";
  if (days < 0) return "expired";
  // 三個月內到期就提前提醒，續約或重新招租都需要準備時間
  if (days <= 90) return "expiring";
  return "none";
}
