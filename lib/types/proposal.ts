// lib/types/proposal.ts
// 帶看提案單的型別定義

export type ProposalVersion = "V1" | "V2";
export type ProposalStatus = "DRAFT" | "SENT" | "WON" | "LOST";

export const PROPOSAL_STATUS_LABEL: Record<ProposalStatus, string> = {
  DRAFT: "草稿",
  SENT: "已送出",
  WON: "已成交",
  LOST: "未成交",
};

export const PROPOSAL_STATUS_STYLE: Record<ProposalStatus, string> = {
  DRAFT: "bg-slate-300 text-slate-700",
  SENT: "bg-blue-500 text-white",
  WON: "bg-emerald-500 text-white",
  LOST: "bg-slate-400 text-white",
};

export const SPACE_TYPE_OPTIONS = ["獨立辦公室", "共享辦公室", "共享座位"];

export const OFFICE_STATUS_OPTIONS = ["目前無辦公室", "租約到期中", "擴編需求"];

export const VALID_DAY_OPTIONS = [3, 7, 14];

/* ============================================================
   區塊三：加值服務與營運細則
   ============================================================ */

/** 免費贈送區：勾選才會渲染到 PDF */
export interface FreeBenefits {
  meetingRoom: { enabled: boolean; hoursPerMonth: number };
  cleaning: { enabled: boolean; timesPerMonth: number };
  businessRegistration: { enabled: boolean; note: string };
  custom: { enabled: boolean; text: string };
}

/** 加購／庶務區：勾選並帶入參數 */
export interface PaidAddOns {
  printing: { enabled: boolean; bwPrice: number; colorPrice: number };
  parking: { enabled: boolean; type: "機械" | "平面"; monthlyFee: number };
  phoneService: { enabled: boolean; note: string };
}

export const BUSINESS_REG_DEFAULT_NOTE =
  "免費提供公司登記地址（原價 $2,500／月），可辦理公司設立、營業登記與相關文件收件。";

export const PHONE_SERVICE_DEFAULT_NOTE =
  "提供專屬電話號碼與總機代接服務，來電由櫃檯依貴公司指定方式應答並轉達。";

export function emptyFreeBenefits(): FreeBenefits {
  return {
    meetingRoom: { enabled: false, hoursPerMonth: 6 },
    cleaning: { enabled: false, timesPerMonth: 1 },
    businessRegistration: { enabled: false, note: BUSINESS_REG_DEFAULT_NOTE },
    custom: { enabled: false, text: "" },
  };
}

export function emptyPaidAddOns(): PaidAddOns {
  return {
    printing: { enabled: false, bwPrice: 1, colorPrice: 7 },
    parking: { enabled: false, type: "機械", monthlyFee: 0 },
    phoneService: { enabled: false, note: PHONE_SERVICE_DEFAULT_NOTE },
  };
}

/* ============================================================
   區塊四：營運痛點對策卡
   ============================================================ */

export interface PainPointGroup {
  key: string;
  label: string;
  options: string[];
  hasOther: boolean;
}

export const PAIN_POINT_GROUPS: PainPointGroup[] = [
  {
    key: "talent",
    label: "人才預算痛點",
    options: ["行銷", "系統管理", "企業顧問"],
    hasOther: true,
  },
  {
    key: "marketing",
    label: "行銷資源痛點",
    options: ["短影音製作", "廣告投放", "社群代運營"],
    hasOther: true,
  },
  {
    key: "it",
    label: "系統管理／IT 痛點",
    options: ["雲端架構", "數位轉型工具", "硬體維護"],
    hasOther: true,
  },
  {
    key: "esg",
    label: "企業顧問與 ESG 痛點",
    options: ["ESG 碳盤查", "經營戰略", "法務財稅", "政府補助"],
    hasOther: false,
  },
  {
    key: "wellness",
    label: "員工休閒健康（ESG-Social）",
    options: ["舒壓按摩", "職場健康講座", "運動健身"],
    hasOther: false,
  },
];

/** 只有被勾選的項目會存進來，未勾選的群組不會出現在物件裡 */
export type PainPointState = Record<string, { items: string[]; otherText: string }>;

/** 計算已勾選的痛點總數，用於在畫面上顯示摘要 */
export function countPainPoints(state: PainPointState) {
  return Object.values(state || {}).reduce(
    (sum, g) => sum + (g.items?.length || 0) + (g.otherText?.trim() ? 1 : 0),
    0
  );
}

/**
 * 提案中的單一房型。
 *
 * 這裡是「快照」而非參照：房型母表之後調價，已經送出去的提案不能跟著變，
 * 否則客戶手上的報價單跟系統顯示的對不起來。roomId 只留作追蹤來源用。
 */
export interface ProposalRoomItem {
  roomId: string;
  roomNo: string;
  floorId: string;
  floorName: string;
  areaPing: number;
  capacityMax: number;
  featureDesc: string;
  priceBase: number;
  priceHalfYear: number;
  priceYearly: number;
  acTemplate: string;
  privateElectricRate: number;
  photoUrls: string[]; // 快照當下的房型照片，第一張為封面
  isRecommended: boolean; // 主推方案，渲染時高亮
  customNote: string; // 業務針對此房間的補充說明
}

export interface Proposal {
  id: string;
  proposalNo: string; // DT-YYYYMMDD-XXX
  version: ProposalVersion;
  parentId?: string; // V2 指向 V1
  versionNote?: string; // V2 的調整說明

  // --- 區塊一：客戶與帶看紀錄 ---
  caseId?: string; // 關聯 cases 卡片
  companyName: string;
  guestName: string;
  guestTitle: string;
  lineName: string;
  headcount: number;
  moveInDate: string;
  spaceTypes: string[];
  officeStatus: string;
  validDays: number;
  validUntil: string;
  salesName: string;
  visitDate: string;

  // --- 區塊二：比價表 ---
  rooms: ProposalRoomItem[];
  taxIncluded: boolean; // 預設 false（未稅）

  // --- 區塊三：加值服務與營運細則 ---
  freeBenefits: FreeBenefits;
  paidAddOns: PaidAddOns;

  // --- 區塊四：營運痛點對策卡 ---
  painPoints: PainPointState;

  status: ProposalStatus;
  createdBy: string;
  createdAt?: any;
  updatedAt?: any;
}

export function currency(n: number) {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(n || 0);
}

/** 依含稅開關換算顯示金額 */
export function withTax(amount: number, taxIncluded: boolean) {
  return taxIncluded ? Math.round(amount * 1.05) : amount;
}

/** 從今天推算報價有效期限 */
export function calcValidUntil(days: number, from = new Date()) {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

export function todayStr() {
  return new Date().toISOString().split("T")[0];
}

export function emptyProposal(salesName: string): Proposal {
  return {
    id: "",
    proposalNo: "",
    version: "V1",
    companyName: "",
    guestName: "",
    guestTitle: "",
    lineName: "",
    headcount: 0,
    moveInDate: "",
    spaceTypes: [],
    officeStatus: "",
    validDays: 7,
    validUntil: calcValidUntil(7),
    salesName,
    visitDate: todayStr(),
    rooms: [],
    taxIncluded: false,
    freeBenefits: emptyFreeBenefits(),
    paidAddOns: emptyPaidAddOns(),
    painPoints: {},
    status: "DRAFT",
    createdBy: salesName,
  };
}
