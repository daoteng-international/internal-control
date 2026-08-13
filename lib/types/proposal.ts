// lib/types/proposal.ts
// 帶看提案單的型別定義

export type ProposalVersion = "V1" | "V2";
export type ProposalStatus = "DRAFT" | "SENT" | "WON" | "LOST";

/**
 * 客戶文件的輸出語言。
 *
 * 只影響列印出來的提案與寄送的信件，後台操作介面一律維持中文——
 * 業務都是中文使用者，把整個系統做成雙語只會增加維護成本。
 */
export type ProposalLang = "zh" | "en";

/** 客戶文件上出現的所有固定文字。資料庫裡的內容另有英文欄位，不在此表。 */
export const DOC_TEXT = {
  zh: {
    brand: "道騰國際商務中心",
    docTitle: "專屬空間提案",
    addressee: "敬呈",
    proposalNo: "提案編號",
    version: "文件版本",
    visitDate: "參觀日期",
    validUntil: "報價有效至",
    versionNote: "本次調整說明",

    s1: "您的需求",
    headcount: "進駐人數",
    moveIn: "預計進駐",
    spaceType: "空間型態",
    officeStatus: "辦公現況",
    people: "人",

    s2: "空間方案比較",
    compareItem: "比較項目",
    recommended: "專屬推薦",
    photos: "空間實景",
    area: "坪數",
    capacity: "建議人數",
    feature: "空間特色",
    priceBase: "統一原價",
    priceHalf: "半年繳月租",
    priceYear: "年繳月租",
    saveYear: "年省",
    acRule: "空調與用電",
    note: "備註",
    taxIncluded: "含稅",
    taxExcluded: "未稅",
    priceFooter: (tax: string, date: string) =>
      `以上金額均為${tax}價格。報價有效期限至 ${date}，逾期請與承辦業務再次確認。`,

    s3: "加值服務",
    freeTitle: "專屬贈送",
    paidTitle: "選購服務",
    meetingRoom: "會議室免費額度",
    meetingRoomValue: (h: number) => `每月 ${h} 小時`,
    cleaning: "辦公室清潔服務",
    cleaningValue: (t: number) => `每月 ${t} 次`,
    businessReg: "免費工商登記",
    printing: "列印服務",
    printingValue: (bw: number, color: number) => `黑白 $${bw}／張　彩色 $${color}／張`,
    parking: "專屬車位",
    parkingValue: (type: string, fee: number) =>
      `${type}車位${fee > 0 ? `　特惠 ${fee.toLocaleString()} 元／月` : ""}`,
    phone: "電話總機服務",

    s4: "道騰能為您做的",
    painIntro: "除了辦公空間，針對您提及的營運需求，道騰生態圈可提供以下資源對接。",

    gallery: "主推空間實景",
    galleryOf: (roomNo: string) => `${roomNo} 空間照片`,

    sales: "承辦業務",
    confidential: "本提案為專屬報價，內容請勿轉載",
    printedOn: "列印日期",
  },
  en: {
    brand: "Daoteng Business Center",
    docTitle: "Workspace Proposal",
    addressee: "Prepared for",
    proposalNo: "Proposal No.",
    version: "Version",
    visitDate: "Visit date",
    validUntil: "Valid until",
    versionNote: "Revision notes",

    s1: "Your requirements",
    headcount: "Team size",
    moveIn: "Target move-in",
    spaceType: "Space type",
    officeStatus: "Current situation",
    people: "people",

    s2: "Workspace options",
    compareItem: "",
    recommended: "Recommended",
    photos: "Photos",
    area: "Area (ping)",
    capacity: "Suggested capacity",
    feature: "Features",
    priceBase: "Standard rate",
    priceHalf: "Semi-annual plan",
    priceYear: "Annual plan",
    saveYear: "Saves",
    acRule: "AC & utilities",
    note: "Notes",
    taxIncluded: "tax included",
    taxExcluded: "before tax",
    priceFooter: (tax: string, date: string) =>
      `All amounts are quoted ${tax}. This quotation is valid until ${date}; please contact your account manager to confirm after that date.`,

    s3: "Included & optional services",
    freeTitle: "Included",
    paidTitle: "Optional",
    meetingRoom: "Meeting room credit",
    meetingRoomValue: (h: number) => `${h} hours per month`,
    cleaning: "Office cleaning",
    cleaningValue: (t: number) => `${t} time(s) per month`,
    businessReg: "Company registration address",
    printing: "Printing",
    printingValue: (bw: number, color: number) =>
      `B&W NT$${bw} / page　Color NT$${color} / page`,
    parking: "Dedicated parking",
    parkingValue: (type: string, fee: number) =>
      `${type}${fee > 0 ? `　NT$${fee.toLocaleString()} per month` : ""}`,
    phone: "Reception & call handling",

    s4: "How Daoteng can support you",
    painIntro:
      "Beyond the workspace itself, our partner network can support the operational needs you mentioned.",

    gallery: "Recommended space",
    galleryOf: (roomNo: string) => `Photos of ${roomNo}`,

    sales: "Account manager",
    confidential: "This proposal is confidential and intended for the addressee only.",
    printedOn: "Printed on",
  },
} as const;

/** 空間型態、辦公現況、痛點項目的英文對照 */
export const OPTION_EN: Record<string, string> = {
  // 空間型態
  "獨立辦公室": "Private office",
  "共享辦公室": "Coworking space",
  "共享座位": "Hot desk",
  // 辦公現況
  "目前無辦公室": "No current office",
  "租約到期中": "Lease expiring",
  "擴編需求": "Team expansion",
  // 車位
  "機械": "Mechanical",
  "平面": "Surface",
  // 痛點群組
  "人才預算痛點": "Talent & budget",
  "行銷資源痛點": "Marketing resources",
  "系統管理／IT 痛點": "IT & systems",
  "企業顧問與 ESG 痛點": "Advisory & ESG",
  "員工休閒健康（ESG-Social）": "Employee wellbeing",
  // 痛點項目
  "行銷": "Marketing",
  "系統管理": "IT management",
  "企業顧問": "Business advisory",
  "短影音製作": "Short-form video",
  "廣告投放": "Ad campaigns",
  "社群代運營": "Social media management",
  "雲端架構": "Cloud infrastructure",
  "數位轉型工具": "Digital transformation",
  "硬體維護": "Hardware maintenance",
  "ESG 碳盤查": "ESG carbon accounting",
  "經營戰略": "Business strategy",
  "法務財稅": "Legal & tax",
  "政府補助": "Government grants",
  "舒壓按摩": "Massage & relaxation",
  "職場健康講座": "Wellness workshops",
  "運動健身": "Fitness programs",
};

/** 取選項的英文，查不到就原樣輸出，避免漏字 */
export function optionText(zh: string, isEn: boolean) {
  if (!isEn) return zh;
  return OPTION_EN[zh] || zh;
}

/** 日期在英文文件裡改用國際慣用寫法 */
export function formatDocDate(value: string | undefined, isEn: boolean) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  if (!isEn) return value;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

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
  businessRegistration: { enabled: boolean; note: string; noteEn?: string };
  custom: { enabled: boolean; text: string; textEn?: string };
}

/** 加購／庶務區：勾選並帶入參數 */
export interface PaidAddOns {
  printing: { enabled: boolean; bwPrice: number; colorPrice: number };
  parking: { enabled: boolean; type: "機械" | "平面"; monthlyFee: number };
  phoneService: { enabled: boolean; note: string; noteEn?: string };
}

export const BUSINESS_REG_DEFAULT_NOTE =
  "免費提供公司登記地址（原價 $2,500／月），可辦理公司設立、營業登記與相關文件收件。";

export const BUSINESS_REG_DEFAULT_NOTE_EN =
  "A registered company address is included (regular rate NT$2,500 per month), covering company incorporation, business registration and receipt of official documents.";

export const PHONE_SERVICE_DEFAULT_NOTE =
  "提供專屬電話號碼與總機代接服務，來電由櫃檯依貴公司指定方式應答並轉達。";

export const PHONE_SERVICE_DEFAULT_NOTE_EN =
  "A dedicated phone number with reception service. Our front desk answers calls in your company's name and forwards messages as instructed.";

export function emptyFreeBenefits(): FreeBenefits {
  return {
    meetingRoom: { enabled: false, hoursPerMonth: 6 },
    cleaning: { enabled: false, timesPerMonth: 1 },
    businessRegistration: {
      enabled: false,
      note: BUSINESS_REG_DEFAULT_NOTE,
      noteEn: BUSINESS_REG_DEFAULT_NOTE_EN,
    },
    custom: { enabled: false, text: "", textEn: "" },
  };
}

export function emptyPaidAddOns(): PaidAddOns {
  return {
    printing: { enabled: false, bwPrice: 1, colorPrice: 7 },
    parking: { enabled: false, type: "機械", monthlyFee: 0 },
    phoneService: {
      enabled: false,
      note: PHONE_SERVICE_DEFAULT_NOTE,
      noteEn: PHONE_SERVICE_DEFAULT_NOTE_EN,
    },
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

/* ============================================================
   信件範本
   ============================================================ */

export interface MailDraft {
  to: string;
  subject: string;
  body: string;
}

/**
 * 依提案內容產生信件草稿。
 * 內文刻意保留「附件」字樣的提醒，因為瀏覽器的 mailto 無法自動帶附件，
 * 需要業務自行把 PDF 附加上去。
 */
export function buildMailDraft(p: Proposal): MailDraft {
  const isEn = (p.lang || "en") === "en";
  const rooms = p.rooms || [];
  const recommended = rooms.find((r) => r.isRecommended);

  const roomLines = rooms.map((r) => {
    const star = r.isRecommended ? "★ " : "　";
    const floor = isEn ? (r.floorNameEn || r.floorName) : r.floorName;
    const price = currency(withTax(r.priceYearly, p.taxIncluded));
    return isEn
      ? `${star}${r.roomNo} (${floor})　${r.areaPing} ping / up to ${r.capacityMax} people　Annual plan ${price}/month`
      : `${star}${r.roomNo}（${floor}）　${r.areaPing} 坪／建議 ${r.capacityMax} 人　年繳月租 ${price}`;
  });

  if (isEn) {
    const greeting = p.guestName
      ? `Dear ${p.guestName}${p.guestTitle ? `, ${p.guestTitle}` : ""},`
      : `Dear ${p.companyName},`;
    const taxLabel = p.taxIncluded ? "tax included" : "before tax";

    const lines = [
      greeting,
      "",
      "Thank you for visiting Daoteng Business Center. Based on the requirements you shared, we have prepared the following options. The full proposal is attached.",
      "",
      `[Summary] (all amounts ${taxLabel})`,
      ...roomLines,
      "",
    ];

    if (recommended) {
      const feature = recommended.featureDescEn || recommended.featureDesc;
      lines.push(
        `Among these, ${recommended.roomNo} best matches your needs${feature ? ` — ${feature}` : ""}. We would suggest considering it first.`,
        ""
      );
    }

    lines.push(
      `This quotation is valid until ${formatDocDate(p.validUntil, true)}. Please feel free to reach out if you would like any adjustments, or to arrange another visit.`,
      "",
      "Best regards,",
      "",
      `${p.salesName}`,
      "Daoteng Business Center",
      `Proposal ${p.proposalNo}　${p.version}`
    );

    return {
      to: p.guestEmail || "",
      subject: `Daoteng Business Center — Workspace Proposal for ${p.companyName} (${p.proposalNo})`,
      body: lines.join("\n"),
    };
  }

  const taxLabel = p.taxIncluded ? "含稅" : "未稅";
  const greeting = p.guestName
    ? `${p.guestName}${p.guestTitle ? ` ${p.guestTitle}` : ""} 您好：`
    : `${p.companyName} 您好：`;

  const lines = [
    greeting,
    "",
    "感謝您撥空前來道騰商務中心參觀。針對您提出的空間需求，我們整理了以下方案供您參考，完整內容請見附件提案文件。",
    "",
    `【方案摘要】（金額均為${taxLabel}）`,
    ...roomLines,
    "",
  ];

  if (recommended) {
    lines.push(
      `其中 ${recommended.roomNo} 最貼近您的需求，${
        recommended.featureDesc ? `${recommended.featureDesc}，` : ""
      }建議可優先考慮。`,
      ""
    );
  }

  lines.push(
    `本次報價有效期限至 ${p.validUntil}，若有任何需要調整之處，或想再次前來確認空間，都歡迎隨時與我聯繫。`,
    "",
    "順頌　商祺",
    "",
    `道騰商務中心　${p.salesName}`,
    `提案編號：${p.proposalNo}　${p.version}`
  );

  return {
    to: p.guestEmail || "",
    subject: `【道騰商務中心】${p.companyName} 專屬空間提案（${p.proposalNo}）`,
    body: lines.join("\n"),
  };
}

/** 組出 mailto 連結。注意：mailto 規格不支援附件，附件需自行加入 */
export function buildMailtoUrl(draft: MailDraft) {
  const params = new URLSearchParams({
    subject: draft.subject,
    body: draft.body,
  });
  return `mailto:${encodeURIComponent(draft.to)}?${params.toString()}`;
}

/** Gmail 網頁版的撰寫連結，習慣用 Gmail 的人不必先設定預設郵件軟體 */
export function buildGmailUrl(draft: MailDraft) {
  const params = new URLSearchParams({
    view: "cm",
    fs: "1",
    to: draft.to,
    su: draft.subject,
    body: draft.body,
  });
  return `https://mail.google.com/mail/?${params.toString()}`;
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
  floorNameEn?: string;
  areaPing: number;
  capacityMax: number;
  featureDesc: string;
  featureDescEn?: string;
  priceBase: number;
  priceHalfYear: number;
  priceYearly: number;
  acTemplate: string;
  acTemplateEn?: string;
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
  lang?: ProposalLang; // 客戶文件的輸出語言，後台介面不受影響

  // --- 區塊一：客戶與帶看紀錄 ---
  caseId?: string; // 關聯 cases 卡片
  companyName: string;
  guestName: string;
  guestTitle: string;
  guestEmail: string;
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
  sentAt?: any; // 首次標記為已送出的時間
  sentCount?: number; // 寄送次數，重複寄送時累加
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
    // 客戶提案文件一律以英文輸出
    lang: "en",
    companyName: "",
    guestName: "",
    guestTitle: "",
    guestEmail: "",
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
