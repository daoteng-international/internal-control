// lib/report-mail.ts
// 報表資料組裝與信件內容產生。前端頁面與排程 API 共用同一份邏輯，
// 避免兩邊各算一次導致信裡的數字跟網頁上看到的對不起來。

export type Period = "week" | "month";

// 停滯天數門檻，與各看板卡片的紅燈標準一致
export const STALE_DAYS = 10;

// 各產品線視為最終階段（成交或暫停），停滯提醒要排除
export const FINAL_STAGES: Record<string, string[]> = {
  "辦公室": ["S7", "S8"],
  "質晑所課程": ["S8", "S9"],
  "活動管理": ["S8", "S9", "S10", "S11"],
};

// 各產品線的暫停階段
export const PAUSE_STAGE: Record<string, string> = {
  "辦公室": "S8",
  "質晑所課程": "S8",
  "活動管理": "S11",
};

export function toJsDate(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value?.toDate === "function") {
    const d = value.toDate();
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // Firestore Admin SDK 取回的 Timestamp 可能是純物件
  if (typeof value?._seconds === "number") return new Date(value._seconds * 1000);
  return null;
}

export function getStartOfWeek(date: Date) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = result.getDay();
  // 星期一作為每週第一天
  result.setDate(result.getDate() + (day === 0 ? -6 : 1 - day));
  result.setHours(0, 0, 0, 0);
  return result;
}

export function addWeeks(date: Date, n: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + n * 7);
  return d;
}

export function getStartOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function addMonths(date: Date, n: number) {
  return new Date(date.getFullYear(), date.getMonth() + n, 1);
}

/** 依報表模式算出「本期」「上一期」的區間 */
export function resolveRange(period: Period, offset: number, today: Date) {
  if (period === "week") {
    const start = addWeeks(getStartOfWeek(today), offset);
    return { start, end: addWeeks(start, 1), prevStart: addWeeks(start, -1) };
  }
  const start = addMonths(getStartOfMonth(today), offset);
  return { start, end: addMonths(start, 1), prevStart: addMonths(start, -1) };
}

export function formatDate(date: Date) {
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function isDateInRange(value: any, start: Date, end: Date) {
  const d = toJsDate(value);
  return d !== null && d >= start && d < end;
}

function daysSince(value: any) {
  const d = toJsDate(value);
  if (!d) return 0;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24)));
}

export function getAmount(item: any) {
  const n = Number(item.totalContractAmount);
  return Number.isFinite(n) ? n : 0;
}

export function getEstimatedAmount(item: any) {
  const n = Number(item.preDealEstimatedAmount);
  if (Number.isFinite(n) && n > 0) return n;
  return getAmount(item);
}

export function getCaseTitle(item: any) {
  return item.title || item.name || item.companyName || "未命名案件";
}

export function getContactName(item: any) {
  return item.customer || item.contactPerson || "—";
}

const STAGE_MAP: Record<string, Record<string, string>> = {
  辦公室: {
    S1: "S1 待處理", S2: "S2 需求訪談", S3: "S3 口頭報價", S4: "S4 現場場勘",
    S5: "S5 需求確認（議價）", S6: "S6 擬定合約", S7: "S7 成交", S8: "S8 暫停",
  },
  質晑所課程: {
    S1: "S1 需求確認", S2: "S2 提供方案與報價", S3: "S3 內容討論與議價",
    S4: "S4 內容／報價更新待確認", S5: "S5 待回簽／付訂", S6: "S6 完成付訂",
    S7: "S7 執行", S8: "S8 暫停", S9: "S9 結案",
  },
  活動管理: {
    S1: "S1 初步諮詢", S2: "S2 對齊需求", S3: "S3 初步報價", S4: "S4 設備測試／參觀",
    S5: "S5 正式報價", S6: "S6 議價協商", S7: "S7 簽約／訂金確認", S8: "S8 成交",
    S9: "S9 活動前提醒", S10: "S10 活動前中後", S11: "S11 暫停",
  },
};

export function getStageLabel(source: string, stage: string) {
  return STAGE_MAP[source]?.[stage] || stage || "—";
}

/* ============================================================
   統計
   ============================================================ */

export interface ReportData {
  newItems: any[];
  closedItems: any[];
  pausedItems: any[];
  staleItems: any[];
  newCount: number;
  prevNewCount: number;
  closedCount: number;
  prevClosedCount: number;
  pausedCount: number;
  prevPausedCount: number;
  officeNew: number;
  courseNew: number;
  eventNew: number;
  officeRevenue: number;
  courseRevenue: number;
  eventRevenue: number;
  totalRevenue: number;
  prevRevenue: number;
}

/**
 * 由 cases 與 members 兩份原始資料算出報表統計。
 * members 混著課程、活動案件與辦公室同步過去的客戶主檔，
 * 因此必須明確比對 productLines，否則辦公室業績會被重複計算。
 */
export function buildReportData(
  cases: any[],
  members: any[],
  rangeStart: Date,
  rangeEnd: Date,
  prevStart: Date
): ReportData {
  const registrations = members.filter((m) => m.productLines?.includes("質晑所課程"));
  const events = members.filter((m) => m.productLines?.includes("活動管理"));

  const allItems = [
    ...cases.map((i) => ({ ...i, source: "辦公室" })),
    ...registrations.map((i) => ({ ...i, source: "質晑所課程" })),
    ...events.map((i) => ({ ...i, source: "活動管理" })),
  ];

  const closeDateOf = (item: any) => {
    if (item.source === "辦公室") return item.stageHistory?.S7 || item.stageEndedAt;
    if (item.source === "質晑所課程") return item.stageHistory?.S9 || item.stageEndedAt;
    return item.stageHistory?.S8 || item.stageEndedAt;
  };

  const isClosed = (item: any) => {
    if (item.source === "辦公室") return item.stage === "S7";
    if (item.source === "質晑所課程") return item.stage === "S9";
    return ["S8", "S9", "S10"].includes(item.stage);
  };

  const buildRange = (start: Date, end: Date) => ({
    newItems: allItems.filter((i) => isDateInRange(i.createdAt, start, end)),
    closedItems: allItems.filter((i) => isClosed(i) && isDateInRange(closeDateOf(i), start, end)),
    pausedItems: allItems.filter(
      (i) =>
        i.stage === PAUSE_STAGE[i.source] &&
        isDateInRange(i.stageHistory?.[PAUSE_STAGE[i.source]] || i.stageEndedAt, start, end)
    ),
  });

  const current = buildRange(rangeStart, rangeEnd);
  const previous = buildRange(prevStart, rangeStart);

  const bySource = (list: any[], source: string) => list.filter((i) => i.source === source);
  const sumAmount = (list: any[]) => list.reduce((t, i) => t + getAmount(i), 0);

  const staleItems = allItems
    .filter((i) => {
      if ((FINAL_STAGES[i.source] || []).includes(i.stage)) return false;
      return daysSince(i.stageStartedAt) >= STALE_DAYS;
    })
    .map((i) => ({ ...i, stayDays: daysSince(i.stageStartedAt) }))
    .sort((a, b) => b.stayDays - a.stayDays);

  const sortByDateDesc = (list: any[], getDate: (i: any) => any) =>
    [...list].sort((a, b) => (toJsDate(getDate(b))?.getTime() || 0) - (toJsDate(getDate(a))?.getTime() || 0));

  return {
    newItems: sortByDateDesc(current.newItems, (i) => i.createdAt),
    closedItems: sortByDateDesc(current.closedItems, closeDateOf).map((i) => ({ ...i, closeDate: closeDateOf(i) })),
    pausedItems: current.pausedItems,
    staleItems,

    newCount: current.newItems.length,
    prevNewCount: previous.newItems.length,
    closedCount: current.closedItems.length,
    prevClosedCount: previous.closedItems.length,
    pausedCount: current.pausedItems.length,
    prevPausedCount: previous.pausedItems.length,

    officeNew: bySource(current.newItems, "辦公室").length,
    courseNew: bySource(current.newItems, "質晑所課程").length,
    eventNew: bySource(current.newItems, "活動管理").length,

    officeRevenue: sumAmount(bySource(current.closedItems, "辦公室")),
    courseRevenue: sumAmount(bySource(current.closedItems, "質晑所課程")),
    eventRevenue: sumAmount(bySource(current.closedItems, "活動管理")),
    totalRevenue: sumAmount(current.closedItems),
    prevRevenue: sumAmount(previous.closedItems),
  };
}

/* ============================================================
   信件內容
   ============================================================ */

/**
 * 產生報表摘要信件。
 *
 * 用純文字而非 HTML：Outlook 以 Word 引擎渲染，複雜排版容易走樣，
 * 而收件人在手機上點連結看完整報表也比信件內表格好讀。
 */
export function buildMailDraft(opts: {
  period: Period;
  rangeStart: Date;
  rangeEnd: Date;
  data: ReportData;
  url: string;
}) {
  const { period, rangeStart, rangeEnd, data, url } = opts;
  const unit = period === "week" ? "週" : "月";
  const endDate = new Date(rangeEnd);
  endDate.setDate(endDate.getDate() - 1);
  const rangeText = `${formatDate(rangeStart)} — ${formatDate(endDate)}`;
  const sign = (n: number) => (n > 0 ? `+${n}` : `${n}`);

  const lines = [
    `以下為 ${rangeText} 的營運摘要。`,
    "",
    `【本${unit}成果】`,
    `成交業績　${formatCurrency(data.totalRevenue)}（上一${unit} ${formatCurrency(data.prevRevenue)}）`,
    `成交件數　${data.closedCount} 件（${sign(data.closedCount - data.prevClosedCount)}）`,
    `新增案件　${data.newCount} 件（${sign(data.newCount - data.prevNewCount)}）`,
    "",
    "【業績分布】",
    `辦公室　　　${formatCurrency(data.officeRevenue)}`,
    `質晑所課程　${formatCurrency(data.courseRevenue)}`,
    `活動管理　　${formatCurrency(data.eventRevenue)}`,
    "",
  ];

  if (data.closedItems.length > 0) {
    lines.push(
      `【本${unit}成交案件】`,
      ...data.closedItems
        .slice(0, 10)
        .map((i: any) => `　・${getCaseTitle(i)}　${formatCurrency(getAmount(i))}`),
      ...(data.closedItems.length > 10 ? [`　（其餘 ${data.closedItems.length - 10} 件請見完整報表）`] : []),
      ""
    );
  }

  if (data.pausedCount > 0) {
    lines.push(
      "【需要留意】",
      `本${unit}有 ${data.pausedCount} 件案件轉為暫停`,
      ...data.pausedItems
        .slice(0, 5)
        .map((i: any) => `　・${getCaseTitle(i)}（${i.pauseReason || "未註明原因"}）`),
      ""
    );
  }

  if (data.staleItems.length > 0) {
    lines.push(
      `目前有 ${data.staleItems.length} 件案件在同一階段停留超過 ${STALE_DAYS} 天，停留最久的是：`,
      ...data.staleItems
        .slice(0, 3)
        .map((i: any) => `　・${getCaseTitle(i)}　${i.stayDays} 天　${getStageLabel(i.source, i.stage)}`),
      ""
    );
  }

  if (url) lines.push(`完整報表：${url}`);

  return {
    subject: `【道騰】${rangeText} 營運${unit}報`,
    body: lines.join("\n"),
  };
}
