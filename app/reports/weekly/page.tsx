"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";

/* ============================================================
   配色：沿用各看板的低彩度建材色
   ============================================================ */
const C = {
  ink: "#1A1A18",
  body: "#3A3833",
  muted: "#8A8780",
  faint: "#B0ADA6",
  hairline: "#E8E6E1",
  surface: "#FAFAF8",
  page: "#F5F4F1",
  office: "#4E6A74",
  course: "#A8845C",
  event: "#87687A",
  success: "#4F7A52",
  warn: "#A97B22",
  danger: "#B4483C",
};

const SOURCE_COLOR: Record<string, string> = {
  "辦公室": C.office,
  "質晑所課程": C.course,
  "活動管理": C.event,
};

// 停滯天數門檻，與各看板卡片的紅燈標準一致
const STALE_DAYS = 10;

// 各產品線視為最終階段（成交或暫停），停滯提醒要排除
const FINAL_STAGES: Record<string, string[]> = {
  "辦公室": ["S7", "S8"],
  "質晑所課程": ["S8", "S9"],
  "活動管理": ["S8", "S9", "S10", "S11"],
};

// 各產品線的暫停階段
const PAUSE_STAGE: Record<string, string> = {
  "辦公室": "S8",
  "質晑所課程": "S8",
  "活動管理": "S11",
};

function toJsDate(value: any): Date | null {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value?.toDate === "function") {
    const date = value.toDate();
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}

function getStartOfWeek(date: Date) {
  const result = new Date(date);
  const day = result.getDay();

  // 星期一作為每週第一天
  const diff = day === 0 ? -6 : 1 - day;

  result.setDate(result.getDate() + diff);
  result.setHours(0, 0, 0, 0);

  return result;
}

function addWeeks(date: Date, n: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + n * 7);
  return d;
}

function getStartOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, n: number) {
  return new Date(date.getFullYear(), date.getMonth() + n, 1);
}

type Period = "week" | "month";

/**
 * 依報表模式算出「本期」「上一期」的區間。
 * 週以星期一為起始（與儀表板一致），月以每月一號為起始。
 */
function resolveRange(period: Period, offset: number, today: Date) {
  if (period === "week") {
    const start = addWeeks(getStartOfWeek(today), offset);
    const end = addWeeks(start, 1);
    return { start, end, prevStart: addWeeks(start, -1) };
  }
  const start = addMonths(getStartOfMonth(today), offset);
  const end = addMonths(start, 1);
  return { start, end, prevStart: addMonths(start, -1) };
}

function periodLabel(period: Period, offset: number) {
  const unit = period === "week" ? "週" : "月";
  if (offset === 0) return `本${unit}`;
  if (offset === -1) return `上${unit}`;
  return `${Math.abs(offset)} ${unit}前`;
}

/**
 * 產生報表摘要信件。
 *
 * 只放數字摘要與一個回到系統的連結，不內嵌完整表格：
 * Outlook 以 Word 引擎渲染 HTML，複雜排版容易走樣，
 * 而收件人在手機上點連結看完整報表也比信件內表格好讀。
 */
function buildMailDraft(opts: {
  unitLabel: string;
  rangeText: string;
  data: any;
  url: string;
}) {
  const { unitLabel, rangeText, data, url } = opts;
  const sign = (n: number) => (n > 0 ? `+${n}` : `${n}`);

  const lines = [
    `以下為 ${rangeText} 的營運摘要。`,
    "",
    `【本${unitLabel}成果】`,
    `成交業績　${formatCurrency(data.totalRevenue)}（上一期 ${formatCurrency(data.prevRevenue)}）`,
    `成交件數　${data.closedCount} 件（${sign(data.closedCount - data.prevClosedCount)}）`,
    `新增案件　${data.newCount} 件（${sign(data.newCount - data.prevNewCount)}）`,
    "",
    `【業績分布】`,
    `辦公室　　${formatCurrency(data.officeRevenue)}`,
    `質晑所課程${formatCurrency(data.courseRevenue)}`,
    `活動管理　${formatCurrency(data.eventRevenue)}`,
    "",
  ];

  if (data.pausedCount > 0) {
    lines.push(
      `【需要留意】`,
      `本${unitLabel}有 ${data.pausedCount} 件案件轉為暫停`,
      ...data.pausedItems.slice(0, 5).map(
        (i: any) => `　・${getCaseTitle(i)}（${i.pauseReason || "未註明原因"}）`
      ),
      ""
    );
  }

  if (data.staleItems.length > 0) {
    lines.push(
      `目前有 ${data.staleItems.length} 件案件在同一階段停留超過 ${STALE_DAYS} 天，其中停留最久的是：`,
      ...data.staleItems.slice(0, 3).map(
        (i: any) => `　・${getCaseTitle(i)}　${i.stayDays} 天　${getStageLabel(i.source, i.stage)}`
      ),
      ""
    );
  }

  lines.push(`完整報表：${url}`);

  return {
    subject: `【道騰】${rangeText} 營運報表`,
    body: lines.join("\n"),
  };
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatShortDate(value: any) {
  const date = toJsDate(value);
  if (!date) return "—";
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function isDateInRange(value: any, startDate: Date, endDate: Date) {
  const date = toJsDate(value);
  return date !== null && date >= startDate && date < endDate;
}

function daysSince(value: any) {
  const d = toJsDate(value);
  if (!d) return 0;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24)));
}

function getAmount(item: any) {
  const amount = Number(item.totalContractAmount);
  return Number.isFinite(amount) ? amount : 0;
}

function getEstimatedAmount(item: any) {
  const estimatedAmount = Number(item.preDealEstimatedAmount);
  if (Number.isFinite(estimatedAmount) && estimatedAmount > 0) {
    return estimatedAmount;
  }
  return getAmount(item);
}

function getCaseTitle(item: any) {
  return item.title || item.name || item.companyName || "未命名案件";
}

function getContactName(item: any) {
  return item.customer || item.contactPerson || "—";
}

function getStageLabel(source: string, stage: string) {
  const stageMap: Record<string, Record<string, string>> = {
    辦公室: {
      S1: "S1 待處理",
      S2: "S2 需求訪談",
      S3: "S3 口頭報價",
      S4: "S4 現場場勘",
      S5: "S5 需求確認（議價）",
      S6: "S6 擬定合約",
      S7: "S7 成交",
      S8: "S8 暫停",
    },
    質晑所課程: {
      S1: "S1 需求確認",
      S2: "S2 提供方案與報價",
      S3: "S3 內容討論與議價",
      S4: "S4 內容／報價更新待確認",
      S5: "S5 待回簽／付訂",
      S6: "S6 完成付訂",
      S7: "S7 執行",
      S8: "S8 暫停",
      S9: "S9 結案",
    },
    活動管理: {
      S1: "S1 初步諮詢",
      S2: "S2 對齊需求",
      S3: "S3 初步報價",
      S4: "S4 設備測試／參觀",
      S5: "S5 正式報價",
      S6: "S6 議價協商",
      S7: "S7 簽約／訂金確認",
      S8: "S8 成交",
      S9: "S9 活動前提醒",
      S10: "S10 活動前中後",
      S11: "S11 暫停",
    },
  };

  return stageMap[source]?.[stage] || stage || "—";
}

/* ============================================================
   視覺元件
   ============================================================ */

function SourceBadge({ source }: { source: string }) {
  const color = SOURCE_COLOR[source] || C.muted;
  return (
    <span
      className="inline-flex rounded px-2 py-0.5 text-[10px] font-medium whitespace-nowrap"
      style={{ backgroundColor: `${color}14`, color }}
    >
      {source}
    </span>
  );
}

function SectionHead({ title, note, action }: { title: string; note?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[14px] font-semibold text-[#1A1A18] tracking-tight shrink-0">{title}</h2>
        <div className="h-px bg-[#E8E6E1] flex-1" />
        {action}
      </div>
      {note && <p className="mt-1 text-[11px] text-[#A5A29B]">{note}</p>}
    </div>
  );
}

/** 統計卡：主要數字 + 與上週的差異 */
function StatCard({ label, value, sub, delta, color }: {
  label: string;
  value: string | number;
  sub?: string;
  delta?: number | null;
  color?: string;
}) {
  return (
    <div className="bg-white rounded-lg border border-[#E8E6E1] px-4 py-3.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] text-[#8A8780]">{label}</span>
        {delta !== null && delta !== undefined && delta !== 0 && (
          <span
            className="text-[11px] tabular-nums shrink-0"
            style={{ color: delta > 0 ? C.success : C.danger }}
          >
            {delta > 0 ? "↑" : "↓"} {Math.abs(delta)}
          </span>
        )}
      </div>
      <div className="mt-2 text-[24px] font-semibold tabular-nums leading-none tracking-tight" style={{ color: color || C.ink }}>
        {value}
      </div>
      {sub && <div className="mt-1.5 text-[11px] text-[#B0ADA6]">{sub}</div>}
    </div>
  );
}

function DataTable({
  columns,
  rows,
  empty,
}: {
  columns: { key: string; label: string; align?: "left" | "right"; width?: string }[];
  rows: React.ReactNode[][];
  empty: string;
}) {
  return (
    <div className="bg-white rounded-lg border border-[#E8E6E1] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left min-w-[720px]">
          <thead>
            <tr className="border-b border-[#E8E6E1]">
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={`px-4 py-2.5 text-[10px] font-semibold text-[#A5A29B] tracking-[0.1em] uppercase ${
                    c.align === "right" ? "text-right" : ""
                  }`}
                  style={c.width ? { width: c.width } : undefined}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((cells, i) => (
              <tr key={i} className="border-t border-[#F0EEE9] hover:bg-[#FAFAF8] transition-colors">
                {cells.map((cell, j) => (
                  <td
                    key={j}
                    className={`px-4 py-3 text-[13px] text-[#3A3833] ${
                      columns[j]?.align === "right" ? "text-right tabular-nums" : ""
                    }`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center text-[12px] text-[#A5A29B]">
                  {empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function WeeklyReportPage() {
  const [cases, setCases] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // week / month 兩種報表區間，offset 0 = 本期，-1 = 上一期
  const [period, setPeriod] = useState<Period>("week");
  const [offset, setOffset] = useState(0);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<string>("");

  useEffect(() => {
    let casesLoaded = false;
    let membersLoaded = false;

    const checkLoading = () => {
      if (casesLoaded && membersLoaded) {
        setLoading(false);
      }
    };

    const unsubscribeCases = onSnapshot(
      collection(db, "cases"),
      (snapshot) => {
        setCases(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
        casesLoaded = true;
        checkLoading();
      },
      (error) => {
        console.error("讀取 cases 失敗：", error);
        casesLoaded = true;
        checkLoading();
      }
    );

    const unsubscribeMembers = onSnapshot(
      collection(db, "members"),
      (snapshot) => {
        setMembers(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
        membersLoaded = true;
        checkLoading();
      },
      (error) => {
        console.error("讀取 members 失敗：", error);
        membersLoaded = true;
        checkLoading();
      }
    );

    return () => {
      unsubscribeCases();
      unsubscribeMembers();
    };
  }, []);

  const today = new Date();
  const { start: rangeStart, end: rangeEnd, prevStart } = resolveRange(period, offset, today);
  const reportEndDate = new Date(rangeEnd);
  reportEndDate.setDate(reportEndDate.getDate() - 1);
  const unitLabel = period === "week" ? "週" : "月";
  const currentLabel = periodLabel(period, offset);

  const reportData = useMemo(() => {
    const registrations = members.filter((item) => item.productLines?.includes("質晑所課程"));
    const events = members.filter((item) => item.productLines?.includes("活動管理"));

    const allItems = [
      ...cases.map((i) => ({ ...i, source: "辦公室" })),
      ...registrations.map((i) => ({ ...i, source: "質晑所課程" })),
      ...events.map((i) => ({ ...i, source: "活動管理" })),
    ];

    // 各產品線成交日期的取法不同，統一由此處理
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

    // --- 指定區間的統計 ---
    const buildRange = (start: Date, end: Date) => {
      const newItems = allItems.filter((i) => isDateInRange(i.createdAt, start, end));
      const closedItems = allItems.filter((i) => isClosed(i) && isDateInRange(closeDateOf(i), start, end));
      const pausedItems = allItems.filter(
        (i) => i.stage === PAUSE_STAGE[i.source] && isDateInRange(i.stageHistory?.[PAUSE_STAGE[i.source]] || i.stageEndedAt, start, end)
      );
      return { newItems, closedItems, pausedItems };
    };

    const current = buildRange(rangeStart, rangeEnd);
    const previous = buildRange(prevStart, rangeStart);

    const bySource = (list: any[], source: string) => list.filter((i) => i.source === source);
    const sumAmount = (list: any[]) => list.reduce((total, i) => total + getAmount(i), 0);

    // --- 停滯案件：非最終階段且停留超過門檻 ---
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
  }, [cases, members, rangeStart.getTime(), rangeEnd.getTime()]);

  const revenueDelta = reportData.totalRevenue - reportData.prevRevenue;

  // 摘要信件：複製到剪貼簿並開啟郵件軟體，內容只放數字與連結
  const handleSendMail = () => {
    setSending(true);
    setSendResult("");
    try {
      const rangeText = `${formatDate(rangeStart)} — ${formatDate(reportEndDate)}`;
      const url = typeof window !== "undefined" ? window.location.href : "";
      const draft = buildMailDraft({ unitLabel, rangeText, data: reportData, url });

      navigator.clipboard?.writeText(draft.body).catch(() => {});
      const params = new URLSearchParams({ subject: draft.subject, body: draft.body });
      window.open(`mailto:?${params.toString()}`, "_blank");
      setSendResult("信件內容已複製到剪貼簿，並嘗試開啟郵件軟體。若沒有跳出，直接貼上即可。");
    } catch (e) {
      console.error(e);
      setSendResult("產生信件失敗，請稍後再試。");
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="min-h-screen print:bg-white" style={{ backgroundColor: C.page }}>
      <div className="mx-auto max-w-6xl px-6 py-8 print:px-0 print:py-0">
        {/* --- 頁首 --- */}
        <header className="pb-5 border-b border-[#E0DDD6]">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-[20px] font-semibold text-[#1A1A18] tracking-tight">
                {period === "week" ? "每週" : "每月"}營運報表
              </h1>
              <p className="mt-1 text-[12px] text-[#8A8780] tabular-nums">
                {formatDate(rangeStart)} — {formatDate(reportEndDate)}
                <span className="ml-2 text-[#B0ADA6]">{currentLabel}</span>
              </p>
            </div>

            <div className="flex items-center gap-2 no-print">
              {/* 週／月切換 */}
              <div className="flex items-center gap-0.5 bg-white rounded-lg border border-[#E8E6E1] p-0.5">
                {([
                  { key: "week" as Period, label: "週報" },
                  { key: "month" as Period, label: "月報" },
                ]).map((p) => (
                  <button
                    key={p.key}
                    onClick={() => { setPeriod(p.key); setOffset(0); }}
                    className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors ${
                      period === p.key ? "bg-[#1A1A18] text-white" : "text-[#8A8780] hover:text-[#1A1A18] hover:bg-[#F5F4F1]"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {/* 期間前後翻閱 */}
              <div className="flex items-center gap-0.5 bg-white rounded-lg border border-[#E8E6E1] p-0.5">
                <button
                  onClick={() => setOffset((v) => v - 1)}
                  className="px-2.5 py-1.5 rounded-md text-[12px] text-[#8A8780] hover:text-[#1A1A18] hover:bg-[#F5F4F1] transition-colors"
                  title={`上一${unitLabel}`}
                >
                  ←
                </button>
                <button
                  onClick={() => setOffset(0)}
                  disabled={offset === 0}
                  className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors ${
                    offset === 0 ? "bg-[#F5F4F1] text-[#1A1A18]" : "text-[#8A8780] hover:text-[#1A1A18] hover:bg-[#F5F4F1]"
                  }`}
                >
                  本{unitLabel}
                </button>
                <button
                  onClick={() => setOffset((v) => Math.min(0, v + 1))}
                  disabled={offset >= 0}
                  className="px-2.5 py-1.5 rounded-md text-[12px] text-[#8A8780] hover:text-[#1A1A18] hover:bg-[#F5F4F1] transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                  title={`下一${unitLabel}`}
                >
                  →
                </button>
              </div>

              <button
                onClick={handleSendMail}
                disabled={sending || loading}
                className="px-4 py-2 rounded-lg text-[12px] font-medium text-[#3A3833] bg-white border border-[#E0DDD6] hover:border-[#B0ADA6] transition-colors disabled:opacity-50"
              >
                寄送摘要
              </button>
              <button
                onClick={() => window.print()}
                className="px-4 py-2 rounded-lg text-[12px] font-medium text-white bg-[#1A1A18] hover:bg-black transition-colors"
              >
                列印
              </button>
            </div>
          </div>

          {sendResult && (
            <p className="mt-3 text-[11px] text-[#8A8780] no-print">{sendResult}</p>
          )}
        </header>

        {loading ? (
          <div className="mt-8 rounded-lg border border-[#E8E6E1] bg-white py-16 text-center">
            <p className="text-[13px] text-[#A5A29B]">資料讀取中…</p>
          </div>
        ) : (
          <div className="mt-6 space-y-8">
            {/* --- 本期摘要 --- */}
            <section>
              <SectionHead title={`本${unitLabel}摘要`} note={`括號內為與上一${unitLabel}的差異`} />
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard
                  label="新增案件"
                  value={reportData.newCount}
                  sub={`辦公室 ${reportData.officeNew} · 課程 ${reportData.courseNew} · 活動 ${reportData.eventNew}`}
                  delta={reportData.newCount - reportData.prevNewCount}
                />
                <StatCard
                  label="成交件數"
                  value={reportData.closedCount}
                  sub={`上一${unitLabel} ${reportData.prevClosedCount} 件`}
                  delta={reportData.closedCount - reportData.prevClosedCount}
                  color={C.success}
                />
                <StatCard
                  label="成交業績"
                  value={formatCurrency(reportData.totalRevenue)}
                  sub={`上一${unitLabel} ${formatCurrency(reportData.prevRevenue)}`}
                />
                <StatCard
                  label={`本${unitLabel}暫停`}
                  value={reportData.pausedCount}
                  sub={`上一${unitLabel} ${reportData.prevPausedCount} 件`}
                  delta={reportData.pausedCount - reportData.prevPausedCount}
                  color={reportData.pausedCount > 0 ? C.danger : undefined}
                />
              </div>

              {revenueDelta !== 0 && (
                <p className="mt-3 text-[12px] text-[#8A8780]">
                  {`業績較上一${unitLabel}`}
                  <span
                    className="mx-1 font-medium tabular-nums"
                    style={{ color: revenueDelta > 0 ? C.success : C.danger }}
                  >
                    {revenueDelta > 0 ? "增加" : "減少"} {formatCurrency(Math.abs(revenueDelta))}
                  </span>
                </p>
              )}
            </section>

            {/* --- 業績分布 --- */}
            <section>
              <SectionHead title="業績分布" note="依案件進入成交階段的日期統計" />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {[
                  { label: "辦公室", rev: reportData.officeRevenue, color: C.office, key: "辦公室" },
                  { label: "質晑所課程", rev: reportData.courseRevenue, color: C.course, key: "質晑所課程" },
                  { label: "活動管理", rev: reportData.eventRevenue, color: C.event, key: "活動管理" },
                ].map((s) => {
                  const count = reportData.closedItems.filter((i: any) => i.source === s.key).length;
                  const pct = reportData.totalRevenue > 0 ? (s.rev / reportData.totalRevenue) * 100 : 0;
                  return (
                    <div key={s.key} className="bg-white rounded-lg border border-[#E8E6E1] px-4 py-3.5">
                      <div className="flex items-baseline justify-between">
                        <span className="text-[12px] text-[#3A3833]">{s.label}</span>
                        <span className="text-[11px] text-[#B0ADA6] tabular-nums">{count} 件</span>
                      </div>
                      <div className="mt-2 text-[18px] font-semibold tabular-nums tracking-tight" style={{ color: s.color }}>
                        {formatCurrency(s.rev)}
                      </div>
                      <div className="mt-2.5 h-1 w-full bg-[#F0EEE9] rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: s.color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* --- 成交明細 --- */}
            <section className="break-inside-avoid">
              <SectionHead title="成交案件" note="本週進入成交或結案階段的案件" />
              <DataTable
                columns={[
                  { key: "src", label: "產品線" },
                  { key: "title", label: "案件名稱" },
                  { key: "contact", label: "窗口" },
                  { key: "date", label: "成交日" },
                  { key: "stage", label: "階段" },
                  { key: "amount", label: "金額", align: "right" },
                ]}
                rows={reportData.closedItems.map((item: any) => [
                  <SourceBadge key="s" source={item.source} />,
                  <span key="t" className="text-[#1A1A18]">{getCaseTitle(item)}</span>,
                  <span key="c" className="text-[#8A8780]">{getContactName(item)}</span>,
                  <span key="d" className="text-[#8A8780] tabular-nums">{formatShortDate(item.closeDate)}</span>,
                  <span key="g" className="text-[#8A8780]">{getStageLabel(item.source, item.stage)}</span>,
                  <span key="a" className="text-[#1A1A18]">{formatCurrency(getAmount(item))}</span>,
                ])}
                empty={`本${unitLabel}沒有成交案件`}
              />
            </section>

            {/* --- 新增明細 --- */}
            <section className="break-inside-avoid">
              <SectionHead title="新增案件" note="依案件建立日期統計" />
              <DataTable
                columns={[
                  { key: "src", label: "產品線" },
                  { key: "title", label: "案件名稱" },
                  { key: "contact", label: "窗口" },
                  { key: "date", label: "建立日" },
                  { key: "stage", label: "目前階段" },
                  { key: "amount", label: "預估金額", align: "right" },
                ]}
                rows={reportData.newItems.map((item: any) => [
                  <SourceBadge key="s" source={item.source} />,
                  <span key="t" className="text-[#1A1A18]">{getCaseTitle(item)}</span>,
                  <span key="c" className="text-[#8A8780]">{getContactName(item)}</span>,
                  <span key="d" className="text-[#8A8780] tabular-nums">{formatShortDate(item.createdAt)}</span>,
                  <span key="g" className="text-[#8A8780]">{getStageLabel(item.source, item.stage)}</span>,
                  <span key="a" className="text-[#1A1A18]">{formatCurrency(getEstimatedAmount(item))}</span>,
                ])}
                empty={`本${unitLabel}沒有新增案件`}
              />
            </section>

            {/* --- 本期暫停：會議上最該檢討的部分 --- */}
            {reportData.pausedItems.length > 0 && (
              <section className="break-inside-avoid">
                <SectionHead title={`本${unitLabel}暫停案件`} note="需要在會議中檢討流失原因" />
                <DataTable
                  columns={[
                    { key: "src", label: "產品線" },
                    { key: "title", label: "案件名稱" },
                    { key: "contact", label: "窗口" },
                    { key: "reason", label: "暫停原因" },
                    { key: "amount", label: "預估金額", align: "right" },
                  ]}
                  rows={reportData.pausedItems.map((item: any) => [
                    <SourceBadge key="s" source={item.source} />,
                    <span key="t" className="text-[#1A1A18]">{getCaseTitle(item)}</span>,
                    <span key="c" className="text-[#8A8780]">{getContactName(item)}</span>,
                    <span key="r" style={{ color: C.danger }}>{item.pauseReason || "未註明"}</span>,
                    <span key="a" className="text-[#8A8780]">{formatCurrency(getEstimatedAmount(item))}</span>,
                  ])}
                  empty={`本${unitLabel}沒有暫停案件`}
                />
              </section>
            )}

            {/* --- 停滯提醒 --- */}
            <section className="break-inside-avoid">
              <SectionHead
                title="停滯案件"
                note={`同一階段停留滿 ${STALE_DAYS} 天，需要主動推進`}
                action={
                  reportData.staleItems.length > 0 ? (
                    <span className="shrink-0 text-[11px] tabular-nums" style={{ color: C.danger }}>
                      {reportData.staleItems.length} 件
                    </span>
                  ) : undefined
                }
              />
              <DataTable
                columns={[
                  { key: "src", label: "產品線" },
                  { key: "title", label: "案件名稱" },
                  { key: "contact", label: "窗口" },
                  { key: "stage", label: "卡在哪個階段" },
                  { key: "days", label: "已停留", align: "right" },
                  { key: "amount", label: "預估金額", align: "right" },
                ]}
                rows={reportData.staleItems.slice(0, 20).map((item: any) => [
                  <SourceBadge key="s" source={item.source} />,
                  <span key="t" className="text-[#1A1A18]">{getCaseTitle(item)}</span>,
                  <span key="c" className="text-[#8A8780]">{getContactName(item)}</span>,
                  <span key="g" className="text-[#8A8780]">{getStageLabel(item.source, item.stage)}</span>,
                  <span key="d" style={{ color: item.stayDays >= 30 ? C.danger : C.warn }}>{item.stayDays} 天</span>,
                  <span key="a" className="text-[#8A8780]">{formatCurrency(getEstimatedAmount(item))}</span>,
                ])}
                empty="目前沒有停滯超過門檻的案件"
              />
              {reportData.staleItems.length > 20 && (
                <p className="mt-2 text-[11px] text-[#B0ADA6]">
                  僅顯示停留最久的 20 件，共 {reportData.staleItems.length} 件
                </p>
              )}
            </section>

            <p className="pt-4 text-[11px] text-[#B0ADA6] border-t border-[#E8E6E1]">
              報表產生時間 {formatDate(today)}　·　{period === "week" ? "每週以星期一為起始日" : "每月以一號為起始日"}
            </p>
          </div>
        )}
      </div>

      <style jsx global>{`
        @media print {
          @page {
            size: A4;
            margin: 12mm;
          }
          body {
            background: #fff !important;
          }
          aside,
          .no-print {
            display: none !important;
          }
          main {
            background: #fff !important;
          }
          table {
            break-inside: auto;
          }
          tr {
            break-inside: avoid;
          }
          .break-inside-avoid {
            break-inside: avoid;
          }
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>
    </main>
  );
}
