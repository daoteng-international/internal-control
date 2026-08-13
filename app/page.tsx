"use client";

import { useState, useEffect, useMemo } from "react";
import { collection, onSnapshot, doc, setDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ComposedChart, Line, Legend,
} from "recharts";

/* ============================================================
   配色：沿用各看板的低彩度建材色，避免儀表板自成一套視覺
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
  "活動": C.event,
};

// --- 三條產品線的階段定義（跟各自看板的 STAGES 保持一致） ---
const STAGE_DEFS: Record<string, { id: string; title: string }[]> = {
  "辦公室": [
    { id: "S1", title: "S1 待處理" },
    { id: "S2", title: "S2 需求訪談" },
    { id: "S3", title: "S3 口頭報價" },
    { id: "S4", title: "S4 現場場勘" },
    { id: "S5", title: "S5 需求確認(議價)" },
    { id: "S6", title: "S6 擬定合約" },
    { id: "S7", title: "S7 成交" },
    { id: "S8", title: "S8 暫停" },
  ],
  "質晑所課程": [
    { id: "S1", title: "S1 需求確認" },
    { id: "S2", title: "S2 提供方案與報價" },
    { id: "S3", title: "S3 內容討論與議價" },
    { id: "S4", title: "S4 內容/報價更新提交待確認" },
    { id: "S5", title: "S5 待回簽/付訂處理流程中" },
    { id: "S6", title: "S6 完成付訂" },
    { id: "S7", title: "S7 執行" },
    { id: "S8", title: "S8 標記暫停原因/後續跟進計畫" },
    { id: "S9", title: "S9 結案" },
  ],
  "活動": [
    { id: "S1", title: "S1 初步諮詢" },
    { id: "S2", title: "S2 對齊需求" },
    { id: "S3", title: "S3 初步報價" },
    { id: "S4", title: "S4 設備測試/參觀" },
    { id: "S5", title: "S5 正式報價" },
    { id: "S6", title: "S6 議價協商" },
    { id: "S7", title: "S7 簽約/訂金確認" },
    { id: "S8", title: "S8 成交" },
    { id: "S9", title: "S9 活動前提醒" },
    { id: "S10", title: "S10 活動前中後" },
    { id: "S11", title: "S11 暫停" },
  ],
};

// 每條產品線視為「成交/結案」的階段（用於轉換率、業績統計）
const SUCCESS_STAGES: Record<string, string[]> = {
  "辦公室": ["S7"],
  "質晑所課程": ["S9"],
  "活動": ["S8", "S9", "S10"],
};

// 每條產品線視為「暫停」的階段
const PAUSE_STAGES: Record<string, string[]> = {
  "辦公室": ["S8"],
  "質晑所課程": ["S8"],
  "活動": ["S11"],
};

// 每條產品線所有「最終階段」（成交+暫停），瓶頸分析跟高風險清單要排除這些
const FINAL_STAGES: Record<string, string[]> = {
  "辦公室": ["S7", "S8"],
  "質晑所課程": ["S8", "S9"],
  "活動": ["S8", "S9", "S10", "S11"],
};

// 業績要算在哪一天：以「真正成交那個階段」的進入日期為準，不是後續執行階段
const CLOSE_STAGE: Record<string, string> = {
  "辦公室": "S7",
  "質晑所課程": "S9",
  "活動": "S8",
};

/**
 * 判斷一筆 members 文件屬於哪條產品線。
 *
 * members 裡除了課程與活動的案件，還混著辦公室出租同步過去的客戶資料，
 * 以及客戶資料管理直接建立的主檔。若用「不是課程就是活動」來分類，
 * 辦公室的業績會在活動那邊被重複計算一次，活動的所有指標都會失真。
 * 因此改為明確比對標籤，兩者都不符合就排除。
 */
function classifyMember(m: any): "質晑所課程" | "活動" | null {
  const tags = [
    ...(Array.isArray(m.productLines) ? m.productLines : []),
    ...(Array.isArray(m.tags) ? m.tags : []),
  ];
  if (tags.includes("質晑所課程")) return "質晑所課程";
  if (tags.includes("活動管理")) return "活動";
  return null;
}

function daysBetween(a: number, b: number) {
  return Math.max(0, Math.floor((b - a) / (1000 * 60 * 60 * 24)));
}

/**
 * 取得該日期所屬那一週的星期一 00:00。
 * 每週營運報表也是以星期一為起始日，兩份報表的「本週」必須是同一個區間，
 * 否則同一筆案件在兩邊會被算進不同的週次。
 */
function startOfMonday(date: Date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay(); // 0 = 星期日
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  d.setHours(0, 0, 0, 0);
  return d;
}

// 計算某張卡片在某個階段的停留天數：一般階段算到下一次轉換(或現在)；最終階段凍結成 S1~該階段的總天數
function computeStageDuration(item: any, stageId: string, finalStages: string[]): number | null {
  const entryDateRaw = item.stageHistory?.[stageId];
  const entryDate = toJsDate(entryDateRaw);
  if (!entryDate) return null;
  const entryTime = entryDate.getTime();

  if (finalStages.includes(stageId)) {
    const startDate = toJsDate(item.stageHistory?.["S1"]) || toJsDate(item.createdAt);
    if (!startDate) return null;
    return daysBetween(startDate.getTime(), entryTime);
  }

  const laterEntries = Object.entries(item.stageHistory || {})
    .filter(([key]) => key !== stageId)
    .map(([, val]) => toJsDate(val))
    .filter((d): d is Date => d !== null && d.getTime() > entryTime)
    .map(d => d.getTime());

  let endTime: number;
  if (laterEntries.length > 0) endTime = Math.min(...laterEntries);
  else if (item.stage === stageId) endTime = Date.now();
  else endTime = entryTime;

  return daysBetween(entryTime, endTime);
}

// 統計一批案件的待辦清單完成率（依 text 分組，因為每個產品線的固定清單文字不同）
function computeTodoCompletion(items: any[]) {
  const map = new Map<string, { total: number; completed: number }>();
  items.forEach((item) => {
    (item.todos || []).forEach((t: any) => {
      const entry = map.get(t.text) || { total: 0, completed: 0 };
      entry.total += 1;
      if (t.completed) entry.completed += 1;
      map.set(t.text, entry);
    });
  });
  return Array.from(map.entries())
    .map(([text, v]) => ({ text, ...v, rate: v.total > 0 ? (v.completed / v.total) * 100 : 0 }))
    .sort((a, b) => a.rate - b.rate); // 完成率低的（最常被漏掉的）排前面
}

// 安全地把 Firestore 欄位轉成 JS Date：相容字串、Date 物件、Firestore Timestamp
function toJsDate(dateVal?: any): Date | null {
  if (!dateVal) return null;
  let d: Date;
  if (typeof dateVal === "string") {
    d = new Date(dateVal);
  } else if (typeof dateVal?.toDate === "function") {
    d = dateVal.toDate();
  } else if (dateVal instanceof Date) {
    d = dateVal;
  } else {
    return null;
  }
  return isNaN(d.getTime()) ? null : d;
}

function monthKey(dateVal?: any): string {
  const d = toJsDate(dateVal);
  if (!d) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function last6Months() {
  const arr: string[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    arr.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return arr;
}

// --- 工具函數：格式化金額 ---
function formatCurrency(n: number) {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(n);
}

/* ============================================================
   共用視覺元件
   ============================================================ */

function StatCard({ title, value, subValue, hint, trend, trendType = "up", tone = "default", active, onClick }: any) {
  const clickable = !!onClick;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!clickable}
      title={hint}
      className={`text-left w-full bg-white rounded-lg border px-5 py-4 transition-all ${
        active
          ? "border-[#B0ADA6] ring-1 ring-[#E0DDD6]"
          : "border-[#E8E6E1] " + (clickable ? "hover:border-[#D5D2CB]" : "")
      } ${clickable ? "cursor-pointer" : "cursor-default"}`}
    >
      <div className="flex justify-between items-baseline gap-2">
        <span className="text-[11px] font-medium text-[#8A8780] tracking-wide truncate">{title}</span>
        {trend && (
          <span
            className="text-[11px] font-medium tabular-nums shrink-0"
            style={{ color: trendType === "up" ? C.success : C.danger }}
          >
            {trend}
          </span>
        )}
      </div>
      <div className="mt-2.5 flex items-baseline gap-2">
        <span
          className="text-[28px] font-semibold tracking-tight tabular-nums leading-none"
          style={{ color: tone === "danger" ? C.danger : C.ink }}
        >
          {value}
        </span>
        {subValue && <span className="text-[12px] text-[#A5A29B]">{subValue}</span>}
      </div>
    </button>
  );
}

function SectionHead({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-4">
      <h3 className="text-[11px] font-semibold text-[#8A8780] tracking-[0.12em] uppercase shrink-0">
        {children}
      </h3>
      <div className="h-px bg-[#E8E6E1] flex-1" />
      {action}
    </div>
  );
}

/** 說明文字改成可展開，預設收起，不佔用固定高度 */
function Panel({ title, description, children }: any) {
  const [showHint, setShowHint] = useState(false);
  return (
    <section className="bg-white rounded-lg border border-[#E8E6E1] px-5 py-4">
      <SectionHead
        action={
          description ? (
            <button
              type="button"
              onClick={() => setShowHint(v => !v)}
              className="shrink-0 w-4 h-4 rounded-full border border-[#E0DDD6] text-[9px] text-[#B0ADA6] hover:text-[#3A3833] hover:border-[#B0ADA6] transition-colors leading-none flex items-center justify-center"
              title="說明"
            >
              ?
            </button>
          ) : undefined
        }
      >
        {title}
      </SectionHead>
      {showHint && description && (
        <p className="mb-4 -mt-1 text-[11px] text-[#A5A29B] leading-relaxed bg-[#FAFAF8] border border-[#F0EEE9] rounded-md px-3 py-2">
          {description}
        </p>
      )}
      {children}
    </section>
  );
}

function TabRow({ tabs, value, onChange }: { tabs: { key: string; label: string }[]; value: string; onChange: (k: any) => void }) {
  return (
    <div className="flex gap-1 mb-4">
      {tabs.map(t => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`px-3 py-1.5 rounded-md text-[11px] font-medium transition-all border ${
            value === t.key
              ? "bg-[#1A1A18] text-white border-[#1A1A18]"
              : "bg-white text-[#8A8780] border-[#E0DDD6] hover:border-[#B0ADA6]"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// --- 通用詳情清單組件 ---
function DetailList({ title, list }: { title: string; list: any[] }) {
  if (list.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-[#E8E6E1] py-16 text-center">
        <p className="text-[12px] text-[#A5A29B]">此區間沒有符合的案件</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-[#E8E6E1] overflow-hidden">
      <div className="px-6 py-4 border-b border-[#E8E6E1] flex items-center gap-2">
        <h3 className="text-[13px] font-semibold text-[#1A1A18]">{title}</h3>
        <span className="text-[11px] text-[#A5A29B] tabular-nums">{list.length}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-[#F0EEE9]">
              <th className="px-6 py-3 text-[10px] font-semibold text-[#A5A29B] tracking-[0.1em] uppercase">產品線</th>
              <th className="px-4 py-3 text-[10px] font-semibold text-[#A5A29B] tracking-[0.1em] uppercase">案件名稱</th>
              <th className="px-4 py-3 text-[10px] font-semibold text-[#A5A29B] tracking-[0.1em] uppercase">窗口</th>
              <th className="px-4 py-3 text-[10px] font-semibold text-[#A5A29B] tracking-[0.1em] uppercase">建立日期</th>
              <th className="px-4 py-3 text-[10px] font-semibold text-[#A5A29B] tracking-[0.1em] uppercase text-right">金額</th>
              <th className="px-6 py-3 text-[10px] font-semibold text-[#A5A29B] tracking-[0.1em] uppercase">狀態</th>
            </tr>
          </thead>
          <tbody>
            {list.map((item, i) => (
              <tr 
                key={i} 
                className="border-t border-[#F0EEE9] hover:bg-[#FAFAF8] transition-colors cursor-pointer"
                onClick={() => {
                  const path = item.source === '辦公室' ? '/cases' : 
                               item.source === '質晑所課程' ? '/registrations' : '/events';
                  window.location.href = `${path}?id=${item.id}`;
                }}
              >
                <td className="px-6 py-3.5">
                  <span
                    className="text-[10px] font-medium px-2 py-1 rounded"
                    style={{
                      backgroundColor: `${SOURCE_COLOR[item.source] || C.muted}14`,
                      color: SOURCE_COLOR[item.source] || C.muted,
                    }}
                  >
                    {item.source}
                  </span>
                </td>
                <td className="px-4 py-3.5 text-[13px] text-[#1A1A18]">{item.title || item.name || item.companyName}</td>
                <td className="px-4 py-3.5 text-[12px] text-[#5F5E5A]">{item.customer || item.contactPerson}</td>
                <td className="px-4 py-3.5 text-[12px] text-[#8A8780] tabular-nums">
                  {(() => {
                    const d = toJsDate(item.createdAt);
                    if (!d) return "—";
                    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                  })()}
                </td>
                <td className="px-4 py-3.5 text-[13px] text-[#1A1A18] tabular-nums text-right">{formatCurrency(item.amount || 0)}</td>
                <td className="px-6 py-3.5 text-[12px]">
                  {item.isOverdue
                    ? <span style={{ color: C.danger }}>逾期 {item.overdueDays} 天</span>
                    : <span className="text-[#8A8780]">{item.stage || "進行中"}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --- 可重複使用的「設定目標金額」輸入列 ---
function TargetInput({ period, value, onChange, onSave, saving }: { period: string; value: string; onChange: (v: string) => void; onSave: () => void; saving: boolean }) {
  return (
    <div className="flex items-center gap-2.5 mb-4">
      <span className="text-[11px] text-[#8A8780] shrink-0">{period}目標</span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") onSave(); }}
        placeholder="輸入金額"
        className="bg-[#FAFAF8] border border-[#E8E6E1] rounded-lg px-3 py-1.5 text-[13px] w-32 outline-none focus:bg-white focus:border-[#B0ADA6] transition-colors tabular-nums text-[#1A1A18] placeholder:text-[#C4C1B9]"
      />
      <button
        onClick={onSave}
        disabled={saving}
        className="px-3 py-1.5 text-[12px] font-medium text-[#3A3833] bg-white border border-[#E0DDD6] rounded-lg hover:border-[#B0ADA6] transition-colors disabled:opacity-50"
      >
        {saving ? "儲存中…" : "儲存"}
      </button>
    </div>
  );
}

function MetricProgress({ label, value, percentage, color }: any) {
  const pct = Math.min(100, Math.max(0, percentage));
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-[12px] text-[#3A3833]">{label}</span>
        <div className="flex items-baseline gap-1.5">
          <span className="text-[12px] font-medium text-[#1A1A18] tabular-nums">{value}</span>
          <span className="text-[10px] text-[#B0ADA6] tabular-nums w-8 text-right">{Math.round(percentage)}%</span>
        </div>
      </div>
      <div className="h-1 w-full bg-[#F0EEE9] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

// --- 橫向排行長條圖（瓶頸分析、暫停原因、待辦完成率共用） ---
function HorizontalBarChart({ data, color, unit = "", tickStep = 5 }: { data: { label: string; value: number }[]; color: string; unit?: string; tickStep?: number }) {
  if (data.length === 0) return <p className="text-[12px] text-[#A5A29B] py-8 text-center">目前沒有足夠資料</p>;
  const height = Math.max(200, data.length * 44) + 30;
  const maxValue = Math.max(...data.map(d => d.value), 0);
  const minTicks = 4;
  const axisMax = Math.max(tickStep * minTicks, Math.ceil(maxValue / tickStep) * tickStep);
  const ticks: number[] = [];
  for (let v = 0; v <= axisMax; v += tickStep) ticks.push(v);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 20 }}>
        <CartesianGrid strokeDasharray="2 4" stroke={C.hairline} horizontal={false} />
        <XAxis
          type="number"
          domain={[0, axisMax]}
          ticks={ticks}
          allowDecimals={false}
          tick={{ fontSize: 11, fill: C.faint }}
          axisLine={{ stroke: C.hairline }}
          tickLine={false}
        />
        <YAxis type="category" dataKey="label" width={180} tick={{ fontSize: 11, fill: C.body }} axisLine={false} tickLine={false} />
        <Tooltip
          cursor={{ fill: C.surface }}
          contentStyle={{ borderRadius: 8, border: `1px solid ${C.hairline}`, fontSize: 12, boxShadow: "none" }}
          formatter={(v: any) => [`${v}${unit}`, ""]}
        />
        <Bar dataKey="value" fill={color} radius={[0, 3, 3, 0]} barSize={14} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// --- 近6個月趨勢（長條=新增案件、折線=業績，雙軸合併呈現） ---
function TrendComboChart({ data }: { data: { month: string; newCount: number; revenue: number }[] }) {
  const chartData = data.map(d => ({ month: `${d.month.substring(5)}月`, 新增案件: d.newCount, 成交業績萬元: Math.round(d.revenue / 10000) }));
  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
        <CartesianGrid strokeDasharray="2 4" stroke={C.hairline} vertical={false} />
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: C.faint }} axisLine={{ stroke: C.hairline }} tickLine={false} />
        <YAxis yAxisId="left" tick={{ fontSize: 11, fill: C.faint }} axisLine={false} tickLine={false} allowDecimals={false} />
        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: C.faint }} axisLine={false} tickLine={false} />
        <Tooltip
          cursor={{ fill: C.surface }}
          contentStyle={{ borderRadius: 8, border: `1px solid ${C.hairline}`, fontSize: 12, boxShadow: "none" }}
        />
        <Legend wrapperStyle={{ fontSize: 11, color: C.muted }} verticalAlign="top" height={28} iconType="circle" iconSize={7} />
        <Bar yAxisId="left" dataKey="新增案件" fill={C.office} radius={[3, 3, 0, 0]} barSize={22} />
        <Line yAxisId="right" type="monotone" dataKey="成交業績萬元" stroke={C.success} strokeWidth={2} dot={{ r: 3, fill: C.success }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export default function ProfessionalDashboard() {
  const [hasMounted, setHasMounted] = useState(false);
  const [cases, setCases] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [activeView, setActiveView] = useState<string | null>(null);
  const [timeFilter, setTimeFilter] = useState("本月");
  const [trendTab, setTrendTab] = useState<"overall" | "辦公室" | "質晑所課程" | "活動">("overall");
  const [bottleneckTab, setBottleneckTab] = useState<"辦公室" | "質晑所課程" | "活動">("辦公室");
  const [pauseReasonTab, setPauseReasonTab] = useState<"overall" | "辦公室" | "質晑所課程" | "活動">("overall");
  const [todoTab, setTodoTab] = useState<"辦公室" | "質晑所課程" | "活動">("辦公室");
  type TargetKey = "overall" | "office" | "registration" | "event";

  /**
   * 目標依時間區間各自獨立設定，不從月目標換算。
   *
   * 業績目標本來就不是線性的（招商月的目標會比淡季高），
   * 用月目標除以 30 得到的日目標沒有業務意義。
   * 今日不提供目標設定，那個區間看絕對金額即可。
   */
  const TARGET_PERIODS = ["本週", "本月", "本季", "今年"] as const;
  const hasTarget = (TARGET_PERIODS as readonly string[]).includes(timeFilter);

  // Firestore 欄位命名：{項目}_{區間}，例如 office_本月。
  // overall_本月 沿用舊的 monthlyTarget，之前設定過的數字不會消失。
  const targetField = (key: TargetKey, period: string) =>
    key === "overall" && period === "本月" ? "monthlyTarget" : `${key}_${period}`;

  const [targetData, setTargetData] = useState<Record<string, number>>({});
  const [targetInputs, setTargetInputs] = useState<Record<TargetKey, string>>({ overall: "", office: "", registration: "", event: "" });
  const [targetSaving, setTargetSaving] = useState<TargetKey | null>(null);

  // 取得目前時間區間對應的目標金額
  const targetOf = (key: TargetKey) => targetData[targetField(key, timeFilter)] || 0;

  // 目標金額存在 Firestore 的共用設定文件，所有人打開都會看到同一組數字
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "settings", "targets"), (snap) => {
      setTargetData(snap.exists() ? (snap.data() as Record<string, number>) : {});
    });
    return () => unsub();
  }, []);

  // 切換時間區間時，輸入框要跟著顯示該區間已存的數字
  useEffect(() => {
    const keys: TargetKey[] = ["overall", "office", "registration", "event"];
    const next = {} as Record<TargetKey, string>;
    keys.forEach(k => {
      const v = targetData[targetField(k, timeFilter)] || 0;
      next[k] = v ? String(v) : "";
    });
    setTargetInputs(next);
  }, [targetData, timeFilter]);

  const saveTarget = async (key: TargetKey) => {
    if (!hasTarget) return;
    const v = Number(targetInputs[key]) || 0;
    setTargetSaving(key);
    try {
      await setDoc(doc(db, "settings", "targets"), { [targetField(key, timeFilter)]: v }, { merge: true });
    } finally {
      setTargetSaving(null);
    }
  };

  useEffect(() => {
    setHasMounted(true);
    const unsubCases = onSnapshot(collection(db, "cases"), (s) => setCases(s.docs.map(d => ({ ...d.data(), id: d.id, source: '辦公室' }))));
    const unsubMembers = onSnapshot(collection(db, "members"), (s) => setMembers(s.docs.map(d => ({ ...d.data(), id: d.id }))));
    return () => { unsubCases(); unsubMembers(); };
  }, []);

  const {
    analytics, overdueList, revenueList, activeList, officeStats, regStats, eventStats, conversionRate,
    stageBottleneckBySource, conversionStats, pauseReasonStatsBySource, todoStatsBySource, monthlyTrendBySource, revenueBySource, growthStats, growthLabels
  } = useMemo(() => {
    const now = new Date();
    const nowTime = now.getTime();
    
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = startOfMonday(now);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfQuarter = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    const checkTime = (createdAt: any) => {
      const date = toJsDate(createdAt);
      if (!date) return false;
      if (timeFilter === "今日") return date >= startOfDay;
      if (timeFilter === "本週") return date >= startOfWeek;
      if (timeFilter === "本月") return date >= startOfMonth;
      if (timeFilter === "本季") return date >= startOfQuarter;
      if (timeFilter === "今年") return date >= startOfYear;
      return true;
    };

    // 只納入真正屬於課程或活動的 members，排除辦公室同步過去的客戶主檔，
    // 否則辦公室業績會在活動那邊被重複計算一次
    const courseItems = members.filter(m => classifyMember(m) === "質晑所課程");
    const eventItems = members.filter(m => classifyMember(m) === "活動");

    const allProcessed = [
      ...cases.map(c => ({ ...c, source: '辦公室' })),
      ...courseItems.map(m => ({ ...m, source: '質晑所課程' })),
      ...eventItems.map(m => ({ ...m, source: '活動' })),
    ].map(item => ({
      ...item,
      amount: item.totalContractAmount || 0
    }));

    const isSuccessStage = (item: any) => (SUCCESS_STAGES[item.source] || []).includes(item.stage);
    const isFinalStage = (item: any) => (FINAL_STAGES[item.source] || []).includes(item.stage);

    // 高風險清單：非最終階段停留 >=10天（跟看板紅燈門檻一致）
    const fullOverdue = allProcessed.filter(item => {
      if (isFinalStage(item)) return false;
      const stageDate = toJsDate(item.stageStartedAt);
      if (!stageDate) return false;
      return daysBetween(stageDate.getTime(), nowTime) >= 10;
    }).map(item => ({ ...item, isOverdue: true, overdueDays: daysBetween((toJsDate(item.stageStartedAt) as Date).getTime(), nowTime) }));

    // 取得一張案件「真正成交」的日期（用於業績計算，不是建立日期）
    const closeDateOf = (item: any) => item.stageHistory?.[CLOSE_STAGE[item.source]] || item.stageEndedAt || item.createdAt;

    // 「新增在辦案件」跟「轉換率」看的是：本期間建立的案件
    const timeFilteredData = allProcessed.filter(item => checkTime(item.createdAt));
    const activeByTime = timeFilteredData.filter(item => !isFinalStage(item));

    // 業績、成交清單、館別營收看的是「真正成交的日期」在不在本期間，
    // 不看建立日期，否則上個月建立、這個月才成交的案件會被漏算
    const finishedByTime = allProcessed.filter(item => isSuccessStage(item) && checkTime(closeDateOf(item)));

    const totalRev = finishedByTime.reduce((acc, curr) => acc + curr.amount, 0);

    const bldStats = ["四維館", "民權20樓", "民權21樓", "民權27樓", "民權28樓"].map(name => {
      const amt = finishedByTime.filter(i => i.source === '辦公室' && i.building === name).reduce((a, c) => a + c.amount, 0);
      return { name, amt };
    });

    const getProductStats = (tag: string) => {
      const cohortItems = timeFilteredData.filter(i => i.source === tag);
      const cohortFinished = cohortItems.filter(isSuccessStage);
      const rate = cohortItems.length > 0 ? (cohortFinished.length / cohortItems.length) * 100 : 0;

      const finished = finishedByTime.filter(i => i.source === tag);
      const rev = finished.reduce((a, c) => a + c.amount, 0);
      return { rev, rate, count: finished.length };
    };

    const currentRate = timeFilteredData.length > 0 ? (timeFilteredData.filter(isSuccessStage).length / timeFilteredData.length) * 100 : 0;

    // 上一期的轉換率：每個時間篩選都要有對應的完整區間，
    // 原本本季與今年會落到「上個月」的分支，導致比較基準錯誤
    const getPrevRate = () => {
      let ps: Date, pe: Date;
      if (timeFilter === "今日") {
        pe = startOfDay;
        ps = new Date(startOfDay.getTime() - 24 * 60 * 60 * 1000);
      } else if (timeFilter === "本週") {
        pe = startOfWeek;
        ps = new Date(startOfWeek.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else if (timeFilter === "本季") {
        const q = Math.floor(now.getMonth() / 3) * 3;
        pe = startOfQuarter;
        ps = new Date(now.getFullYear(), q - 3, 1);
      } else if (timeFilter === "今年") {
        pe = startOfYear;
        ps = new Date(now.getFullYear() - 1, 0, 1);
      } else {
        pe = startOfMonth;
        ps = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      }
      const prevData = allProcessed.filter(item => {
        const d = toJsDate(item.createdAt);
        return !!d && d >= ps && d < pe;
      });
      const prevFinished = prevData.filter(isSuccessStage);
      return prevData.length > 0 ? (prevFinished.length / prevData.length) * 100 : 0;
    };

    const prevRate = getPrevRate();
    const rateDiff = currentRate - prevRate; 

    // --- 流程瓶頸分析（各產品線各自一份完整排行） ---
    const stageBottleneckBySourceRaw = Object.fromEntries(
      Object.entries(STAGE_DEFS).map(([source, stages]) => {
        const arr = stages
          .filter(s => !(FINAL_STAGES[source] || []).includes(s.id))
          .map(s => {
            const durations = allProcessed
              .filter(i => i.source === source)
              .map(i => computeStageDuration(i, s.id, FINAL_STAGES[source] || []))
              .filter((d): d is number => d !== null);
            const avg = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
            return { stageId: s.id, title: s.title, avg: Math.round(avg * 10) / 10, count: durations.length };
          })
          .filter(s => s.count > 0)
          .sort((a, b) => b.avg - a.avg);
        return [source, arr];
      })
    ) as Record<string, { stageId: string; title: string; avg: number; count: number }[]>;

    // --- 轉換率分析 ---
    const conversionStatsRaw = Object.keys(STAGE_DEFS).map(source => {
      const items = allProcessed.filter(i => i.source === source);
      const success = items.filter(i => (SUCCESS_STAGES[source] || []).includes(i.stage)).length;
      const paused = items.filter(i => (PAUSE_STAGES[source] || []).includes(i.stage)).length;
      const active = Math.max(0, items.length - success - paused);
      const total = items.length;
      return {
        source, total, success, paused, active,
        successRate: total > 0 ? (success / total) * 100 : 0,
        pausedRate: total > 0 ? (paused / total) * 100 : 0,
        activeRate: total > 0 ? (active / total) * 100 : 0,
      };
    });

    // --- 暫停原因分析 ---
    const buildPauseReasonStats = (source?: string) => {
      const map = new Map<string, number>();
      allProcessed.forEach(i => {
        if (i.pauseReason && (!source || i.source === source)) map.set(i.pauseReason, (map.get(i.pauseReason) || 0) + 1);
      });
      const total = Array.from(map.values()).reduce((a, b) => a + b, 0);
      return Array.from(map.entries())
        .map(([reason, count]) => ({ reason, count, percentage: total > 0 ? (count / total) * 100 : 0 }))
        .sort((a, b) => b.count - a.count);
    };
    const pauseReasonStatsBySourceRaw = {
      overall: buildPauseReasonStats(),
      "辦公室": buildPauseReasonStats("辦公室"),
      "質晑所課程": buildPauseReasonStats("質晑所課程"),
      "活動": buildPauseReasonStats("活動"),
    };

    // --- 待辦清單完成率（用正確分類的案件，不再把辦公室客戶算進活動） ---
    const todoStatsBySourceRaw = {
      "辦公室": computeTodoCompletion(cases),
      "質晑所課程": computeTodoCompletion(courseItems),
      "活動": computeTodoCompletion(eventItems),
    };

    // --- 近6個月案件建立趨勢 + 成交業績趨勢 ---
    const months = last6Months();
    const buildMonthlyTrend = (source?: string) => months.map(m => {
      const newCount = allProcessed.filter(i => (!source || i.source === source) && monthKey(i.createdAt) === m).length;
      const revenue = allProcessed
        .filter(i => (!source || i.source === source) && isSuccessStage(i) && monthKey(closeDateOf(i)) === m)
        .reduce((a, c) => a + (c.amount || 0), 0);
      return { month: m, newCount, revenue };
    });
    const monthlyTrendBySourceRaw = {
      overall: buildMonthlyTrend(),
      "辦公室": buildMonthlyTrend("辦公室"),
      "質晑所課程": buildMonthlyTrend("質晑所課程"),
      "活動": buildMonthlyTrend("活動"),
    };

    // --- 本期業績依產品線分類 ---
    const revenueBySourceRaw = Object.keys(STAGE_DEFS).map(source => {
      const rev = finishedByTime.filter(i => i.source === source).reduce((a, c) => a + c.amount, 0);
      return { source, rev, percentage: totalRev > 0 ? (rev / totalRev) * 100 : 0 };
    });

    // --- 業績成長比較 ---
    const revenueInRange = (start: Date, end: Date, source?: string) =>
      allProcessed
        .filter(i => (!source || i.source === source) && isSuccessStage(i))
        .reduce((sum, i) => {
          const d = toJsDate(closeDateOf(i));
          if (d && d >= start && d < end) return sum + (i.amount || 0);
          return sum;
        }, 0);

    let curStart: Date, curEnd: Date, prevStart: Date, prevEnd: Date, yoyStart: Date, yoyEnd: Date;
    let prevLabel = "與上期比", yoyLabel = "與去年同期比";

    if (timeFilter === "今日") {
      curStart = startOfDay; curEnd = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
      prevStart = new Date(startOfDay.getTime() - 24 * 60 * 60 * 1000); prevEnd = startOfDay;
      yoyStart = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
      yoyEnd = new Date(yoyStart.getTime() + 24 * 60 * 60 * 1000);
      prevLabel = "與昨日比"; yoyLabel = "與去年同日比";
    } else if (timeFilter === "本週") {
      curStart = startOfWeek; curEnd = new Date(startOfWeek.getTime() + 7 * 24 * 60 * 60 * 1000);
      prevStart = new Date(startOfWeek.getTime() - 7 * 24 * 60 * 60 * 1000); prevEnd = startOfWeek;
      yoyStart = startOfMonday(new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()));
      yoyEnd = new Date(yoyStart.getTime() + 7 * 24 * 60 * 60 * 1000);
      prevLabel = "與上週比"; yoyLabel = "與去年同週比";
    } else if (timeFilter === "本季") {
      const qStartMonth = Math.floor(now.getMonth() / 3) * 3;
      curStart = startOfQuarter; curEnd = new Date(now.getFullYear(), qStartMonth + 3, 1);
      prevStart = new Date(now.getFullYear(), qStartMonth - 3, 1); prevEnd = curStart;
      yoyStart = new Date(now.getFullYear() - 1, qStartMonth, 1); yoyEnd = new Date(now.getFullYear() - 1, qStartMonth + 3, 1);
      prevLabel = "與上季比"; yoyLabel = "與去年同季比";
    } else if (timeFilter === "今年") {
      curStart = startOfYear; curEnd = new Date(now.getFullYear() + 1, 0, 1);
      prevStart = new Date(now.getFullYear() - 1, 0, 1); prevEnd = curStart;
      yoyStart = prevStart; yoyEnd = prevEnd;
      prevLabel = "與去年比"; yoyLabel = "與去年比";
    } else { // 本月（預設）
      curStart = startOfMonth; curEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1); prevEnd = curStart;
      yoyStart = new Date(now.getFullYear() - 1, now.getMonth(), 1); yoyEnd = new Date(now.getFullYear() - 1, now.getMonth() + 1, 1);
      prevLabel = "與上月比"; yoyLabel = "與去年同月比";
    }

    const buildGrowth = (source?: string) => {
      const currentRevenue = revenueInRange(curStart, curEnd, source);
      const prevRevenue = revenueInRange(prevStart, prevEnd, source);
      const yoyRevenue = revenueInRange(yoyStart, yoyEnd, source);
      const prevGrowth = prevRevenue > 0 ? ((currentRevenue - prevRevenue) / prevRevenue) * 100 : (currentRevenue > 0 ? 100 : 0);
      const yoyGrowth = yoyRevenue > 0 ? ((currentRevenue - yoyRevenue) / yoyRevenue) * 100 : (currentRevenue > 0 ? 100 : 0);
      return { currentRevenue, prevRevenue, yoyRevenue, prevGrowth, yoyGrowth };
    };

    const growthStatsRaw = {
      overall: buildGrowth(),
      "辦公室": buildGrowth("辦公室"),
      "質晑所課程": buildGrowth("質晑所課程"),
      "活動": buildGrowth("活動"),
    };
    const growthLabelsRaw = { prevLabel, yoyLabel };

    return {
      analytics: { 
        totalRevenue: totalRev, 
        overdueCount: fullOverdue.length, 
        totalActive: timeFilteredData.length,
        trendText: `${rateDiff >= 0 ? "↑" : "↓"} ${Math.abs(rateDiff).toFixed(1)}%`,
        trendType: rateDiff >= 0 ? "up" : "down"
      },
      overdueList: fullOverdue, revenueList: finishedByTime, activeList: activeByTime,
      officeStats: bldStats,
      regStats: getProductStats('質晑所課程'),
      eventStats: getProductStats('活動'),
      conversionRate: currentRate,
      stageBottleneckBySource: stageBottleneckBySourceRaw,
      conversionStats: conversionStatsRaw,
      pauseReasonStatsBySource: pauseReasonStatsBySourceRaw,
      todoStatsBySource: todoStatsBySourceRaw,
      monthlyTrendBySource: monthlyTrendBySourceRaw,
      revenueBySource: revenueBySourceRaw,
      growthStats: growthStatsRaw,
      growthLabels: growthLabelsRaw,
    };
  }, [cases, members, timeFilter]);

  if (!hasMounted) return <div className="flex-1 h-screen" style={{ backgroundColor: C.page }} />;
  const toggleView = (view: string) => setActiveView(activeView === view ? null : view);

  const officeTotal = officeStats.reduce((a: number, c: any) => a + c.amt, 0);

  return (
    <div className="flex-1 h-screen overflow-y-auto font-sans custom-scrollbar" style={{ backgroundColor: C.page }}>
      <div className="max-w-[1280px] mx-auto px-6 py-6 space-y-4">
        <header className="flex items-center justify-between gap-4 pb-4 border-b border-[#E0DDD6]">
          <h1 className="text-[18px] font-semibold text-[#1A1A18] tracking-tight">營運總覽</h1>
          <div className="flex gap-0.5 bg-white p-0.5 rounded-lg border border-[#E8E6E1]">
            {["今日", "本週", "本月", "本季", "今年"].map(t => (
              <button
                key={t}
                onClick={() => setTimeFilter(t)}
                className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-all ${
                  timeFilter === t ? "bg-[#1A1A18] text-white" : "text-[#8A8780] hover:text-[#1A1A18]"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </header>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            title={`成交業績 · ${timeFilter}`}
            value={formatCurrency(analytics.totalRevenue)}
            subValue={`${revenueList.length} 件`}
            hint="點擊查看成交清單"
            onClick={() => toggleView('revenue')}
            active={activeView === 'revenue'}
          />
          <StatCard
            title="逾期風險"
            value={analytics.overdueCount}
            hint="單一階段停留滿 10 天，點擊查看清單"
            tone={analytics.overdueCount > 0 ? "danger" : "default"}
            onClick={() => toggleView('overdue')}
            active={activeView === 'overdue'}
          />
          <StatCard
            title={`新增案件 · ${timeFilter}`}
            value={analytics.totalActive}
            hint="點擊查看本期新進案件"
            onClick={() => toggleView('active')}
            active={activeView === 'active'}
          />
          <StatCard
            title="平均轉換率"
            value={`${Math.round(conversionRate)}%`}
            hint="本期建立案件的成交比率"
            trend={analytics.trendText}
            trendType={analytics.trendType}
          />
        </div>

        {activeView === 'overdue' && <DetailList title="高風險案件" list={overdueList} />}
        {activeView === 'revenue' && <DetailList title={`成交案件明細 · ${timeFilter}`} list={revenueList} />}
        {activeView === 'active' && <DetailList title={`新進案件 · ${timeFilter}`} list={activeList} />}

        {/* 業績分類與總目標並排，兩者都是短內容，各佔一整列太浪費 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Panel
            title={`業績依產品線 · ${timeFilter}`}
            description="同一份成交業績拆成三條產品線各自的貢獻，避免把全公司總額誤當成單一產品線的表現。"
          >
            <div className="space-y-3">
              {revenueBySource.map((r: any) => (
                <MetricProgress
                  key={r.source}
                  label={r.source}
                  value={formatCurrency(r.rev)}
                  percentage={r.percentage}
                  color={SOURCE_COLOR[r.source]}
                />
              ))}
            </div>
          </Panel>

          <Panel
            title={`目標達成率 · ${timeFilter}`}
            description="週、月、季、年各自設定獨立的目標金額，不做比例換算。切換上方時間區間時，輸入框會顯示該區間已存的數字。這組設定全體共用。"
          >
            {hasTarget ? (
              <>
                <TargetInput
                  period={timeFilter}
                  value={targetInputs.overall}
                  onChange={(v) => setTargetInputs(prev => ({ ...prev, overall: v }))}
                  onSave={() => saveTarget("overall")}
                  saving={targetSaving === "overall"}
                />
                <MetricProgress
                  label={`全公司實際業績 / ${timeFilter}目標`}
                  value={`${formatCurrency(analytics.totalRevenue)} / ${formatCurrency(targetOf("overall"))}`}
                  percentage={targetOf("overall") > 0 ? (analytics.totalRevenue / targetOf("overall")) * 100 : 0}
                  color={C.ink}
                />
              </>
            ) : (
              <p className="text-[12px] text-[#A5A29B] py-3">
                「今日」不設定目標，請切換到週、月、季或年檢視達成率。
              </p>
            )}
          </Panel>
        </div>

        <Panel
          title={`業績成長比較 · ${timeFilter}`}
          description="跟著上方時間篩選走：切到本月比較上月與去年同月，切到本季就比較上季與去年同季。四組數字各自獨立計算。"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[520px]">
              <thead>
                <tr className="border-b border-[#F0EEE9]">
                  <th className="pb-2 text-[10px] font-semibold text-[#A5A29B] tracking-[0.1em] uppercase">產品線</th>
                  <th className="pb-2 text-[10px] font-semibold text-[#A5A29B] tracking-[0.1em] uppercase text-right">本期</th>
                  <th className="pb-2 pl-4 text-[10px] font-semibold text-[#A5A29B] tracking-[0.1em] uppercase text-right">{growthLabels.prevLabel}</th>
                  <th className="pb-2 pl-4 text-[10px] font-semibold text-[#A5A29B] tracking-[0.1em] uppercase text-right">{growthLabels.yoyLabel}</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { key: "overall", label: "全公司總計" },
                  { key: "辦公室", label: "辦公室" },
                  { key: "質晑所課程", label: "質晑所課程" },
                  { key: "活動", label: "活動" },
                ].map(({ key, label }) => {
                  const g = (growthStats as any)[key];
                  return (
                    <tr key={key} className="border-t border-[#F0EEE9]">
                      <td className="py-2.5 text-[12px] text-[#3A3833]">{label}</td>
                      <td className="py-2.5 text-[13px] text-[#1A1A18] tabular-nums text-right">
                        {formatCurrency(g.currentRevenue)}
                      </td>
                      <td className="py-2.5 pl-4 text-right">
                        <div className="text-[12px] tabular-nums" style={{ color: g.prevGrowth >= 0 ? C.success : C.danger }}>
                          {g.prevGrowth >= 0 ? "↑" : "↓"} {Math.abs(g.prevGrowth).toFixed(1)}%
                        </div>
                        <div className="text-[10px] text-[#B0ADA6] tabular-nums">{formatCurrency(g.prevRevenue)}</div>
                      </td>
                      <td className="py-2.5 pl-4 text-right">
                        <div className="text-[12px] tabular-nums" style={{ color: g.yoyGrowth >= 0 ? C.success : C.danger }}>
                          {g.yoyGrowth >= 0 ? "↑" : "↓"} {Math.abs(g.yoyGrowth).toFixed(1)}%
                        </div>
                        <div className="text-[10px] text-[#B0ADA6] tabular-nums">{formatCurrency(g.yoyRevenue)}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel
          title={`辦公室館別營收 · ${timeFilter}`}
          description="看各館別對辦公室產品線的營收貢獻比重，決定招租資源投放的優先順序。"
        >
          {hasTarget && (
            <>
              <TargetInput
                period={timeFilter}
                value={targetInputs.office}
                onChange={(v) => setTargetInputs(prev => ({ ...prev, office: v }))}
                onSave={() => saveTarget("office")}
                saving={targetSaving === "office"}
              />
              <div className="mb-4 pb-4 border-b border-[#F0EEE9]">
                <MetricProgress
                  label={`辦公室業績 / ${timeFilter}目標`}
                  value={`${formatCurrency(officeTotal)} / ${formatCurrency(targetOf("office"))}`}
                  percentage={targetOf("office") > 0 ? (officeTotal / targetOf("office")) * 100 : 0}
                  color={C.office}
                />
              </div>
            </>
          )}
          {/* 館別的百分比以目標為分母，五條加總即為總達成率；
              「佔辦公室業績的比重」上方的產品線區塊已經呈現過，這裡不重複 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3">
            {officeStats.map((s: any) => {
              const denominator = hasTarget && targetOf("office") > 0 ? targetOf("office") : officeTotal;
              return (
                <MetricProgress
                  key={s.name}
                  label={s.name}
                  value={formatCurrency(s.amt)}
                  percentage={denominator > 0 ? (s.amt / denominator) * 100 : 0}
                  color={C.office}
                />
              );
            })}
          </div>
        </Panel>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Panel title="質晑所課程" description="追蹤課程產品線的業績與成交轉換率。">
            {hasTarget && (
              <TargetInput
                period={timeFilter}
                value={targetInputs.registration}
                onChange={(v) => setTargetInputs(prev => ({ ...prev, registration: v }))}
                onSave={() => saveTarget("registration")}
                saving={targetSaving === "registration"}
              />
            )}
            <div className="space-y-3">
              {hasTarget && (
                <MetricProgress
                  label={`業績 / ${timeFilter}目標`}
                  value={`${formatCurrency(regStats.rev)} / ${formatCurrency(targetOf("registration"))}`}
                  percentage={targetOf("registration") > 0 ? (regStats.rev / targetOf("registration")) * 100 : 0}
                  color={C.course}
                />
              )}
              <MetricProgress
                label="成交轉換率"
                value={`${Math.round(regStats.rate)}%`}
                percentage={regStats.rate}
                color={C.course}
              />
              <div className="pt-2.5 border-t border-[#F0EEE9] flex items-baseline justify-between">
                <span className="text-[12px] text-[#8A8780]">成交件數</span>
                <span className="text-[16px] font-semibold tabular-nums" style={{ color: C.course }}>
                  {regStats.count}
                </span>
              </div>
            </div>
          </Panel>

          <Panel title="活動管理" description="追蹤活動產品線的業績與成交轉換率。">
            {hasTarget && (
              <TargetInput
                period={timeFilter}
                value={targetInputs.event}
                onChange={(v) => setTargetInputs(prev => ({ ...prev, event: v }))}
                onSave={() => saveTarget("event")}
                saving={targetSaving === "event"}
              />
            )}
            <div className="space-y-3">
              {hasTarget && (
                <MetricProgress
                  label={`業績 / ${timeFilter}目標`}
                  value={`${formatCurrency(eventStats.rev)} / ${formatCurrency(targetOf("event"))}`}
                  percentage={targetOf("event") > 0 ? (eventStats.rev / targetOf("event")) * 100 : 0}
                  color={C.event}
                />
              )}
              <MetricProgress
                label="成交轉換率"
                value={`${Math.round(eventStats.rate)}%`}
                percentage={eventStats.rate}
                color={C.event}
              />
              <div className="pt-2.5 border-t border-[#F0EEE9] flex items-baseline justify-between">
                <span className="text-[12px] text-[#8A8780]">成交件數</span>
                <span className="text-[16px] font-semibold tabular-nums" style={{ color: C.event }}>
                  {eventStats.count}
                </span>
              </div>
            </div>
          </Panel>
        </div>

        <Panel
          title="近 6 個月趨勢"
          description="觀察案件量與業績的長期走勢，判斷業務動能是成長還是衰退。切換頁籤可分別檢視各產品線，避免不同量級互相干擾。"
        >
          <TabRow
            tabs={[
              { key: "overall", label: "總覽" },
              { key: "辦公室", label: "辦公室" },
              { key: "質晑所課程", label: "質晑所課程" },
              { key: "活動", label: "活動" },
            ]}
            value={trendTab}
            onChange={setTrendTab}
          />
          <TrendComboChart data={monthlyTrendBySource[trendTab]} />
        </Panel>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Panel
            title="流程瓶頸 · 平均停留天數"
            description="找出平均停留天數最長的階段，優先檢討這些卡關步驟。每條產品線的階段與天數量級不同，分開檢視才不會互相干擾。"
          >
            <TabRow
              tabs={[
                { key: "辦公室", label: "辦公室" },
                { key: "質晑所課程", label: "課程" },
                { key: "活動", label: "活動" },
              ]}
              value={bottleneckTab}
              onChange={setBottleneckTab}
            />
            <HorizontalBarChart
              data={stageBottleneckBySource[bottleneckTab].map(s => ({
                label: s.title.length > 14 ? s.title.slice(0, 14) + "…" : s.title,
                value: s.avg,
              }))}
              color={C.warn}
              unit=" 天"
            />
          </Panel>

          <Panel
            title="待辦完成率"
            description="檢視 SOP 執行狀況，完成率最低的排在最上面。長條顯示的是完成百分比，滑鼠移上去可看到數值。"
          >
            <TabRow
              tabs={[
                { key: "辦公室", label: "辦公室" },
                { key: "質晑所課程", label: "課程" },
                { key: "活動", label: "活動" },
              ]}
              value={todoTab}
              onChange={setTodoTab}
            />
            {/* 改用完成率而非完成件數：排序依據是完成率，若長條畫的是件數，
                2/2（100%）會比 3/10（30%）看起來更短，與標題的判讀方向相反 */}
            <HorizontalBarChart
              data={todoStatsBySource[todoTab].map(t => ({
                label: t.text.length > 14 ? t.text.slice(0, 14) + "…" : t.text,
                value: Math.round(t.rate),
              }))}
              color={SOURCE_COLOR[todoTab]}
              unit=" %"
              tickStep={20}
            />
          </Panel>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Panel
            title="轉換率 · 成交與暫停"
            description="比較各產品線的成交率與暫停率，評估哪條產品線的業務健康度較高、哪條需要關注。"
          >
            <div className="space-y-3">
              {conversionStats.map((c: any) => (
                <div key={c.source} className="flex items-center gap-3">
                  <span className="text-[12px] text-[#3A3833] w-20 shrink-0">{c.source}</span>
                  <div className="flex-1 h-2 rounded-full overflow-hidden flex bg-[#F0EEE9]">
                    {c.total > 0 && (
                      <>
                        <div style={{ width: `${c.successRate}%`, backgroundColor: C.success }} />
                        <div style={{ width: `${c.pausedRate}%`, backgroundColor: C.danger }} />
                      </>
                    )}
                  </div>
                  <span className="text-[11px] tabular-nums text-[#8A8780] w-28 text-right shrink-0">
                    成交 {c.successRate.toFixed(0)}% · {c.total} 件
                  </span>
                </div>
              ))}
              <div className="pt-2.5 border-t border-[#F0EEE9] flex gap-4 text-[10px]">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: C.success }} />
                  <span className="text-[#8A8780]">成交</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: C.danger }} />
                  <span className="text-[#8A8780]">暫停</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#F0EEE9]" />
                  <span className="text-[#8A8780]">進行中</span>
                </span>
              </div>
            </div>
          </Panel>

          <Panel
            title="暫停原因"
            description="統計案件暫停的真正原因，找出重複出現的業務痛點，作為改善銷售策略或報價機制的依據。"
          >
            <TabRow
              tabs={[
                { key: "overall", label: "總覽" },
                { key: "辦公室", label: "辦公室" },
                { key: "質晑所課程", label: "課程" },
                { key: "活動", label: "活動" },
              ]}
              value={pauseReasonTab}
              onChange={setPauseReasonTab}
            />
            <HorizontalBarChart
              data={pauseReasonStatsBySource[pauseReasonTab].map(p => ({ label: p.reason, value: p.count }))}
              color={C.danger}
              unit=" 件"
              tickStep={1}
            />
          </Panel>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `.custom-scrollbar::-webkit-scrollbar { width: 6px; height: 10px; } .custom-scrollbar::-webkit-scrollbar-track { background: transparent; } .custom-scrollbar::-webkit-scrollbar-thumb { background: #D5D2CB; border-radius: 999px; } .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #B0ADA6; }` }} />
    </div>
  );
}
