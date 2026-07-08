"use client";

import { useState, useEffect, useMemo } from "react";
import { collection, onSnapshot, doc, setDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ComposedChart, Line, PieChart, Pie, Cell, Legend,
} from "recharts";

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

function daysBetween(a: number, b: number) {
  return Math.max(0, Math.floor((b - a) / (1000 * 60 * 60 * 24)));
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
    .filter(([key, val]) => key !== stageId)
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

// --- 專業數據統計卡片 ---
function AnalyticCard({ title, value, subValue, hint, trend, trendType = "up", type = "default", onClick }: any) {
  const styles = {
    default: "bg-white border-slate-100",
    danger: "bg-red-50 border-red-200 ring-2 ring-red-500/10",
    success: "bg-emerald-50/20 border-emerald-100 ring-2 ring-emerald-500/10",
  };

  return (
    <div 
      onClick={onClick}
      className={`rounded-3xl border p-7 shadow-sm transition-all duration-300 hover:shadow-lg hover:-translate-y-1 cursor-pointer group ${styles[type as keyof typeof styles]}`}
    >
      <div className="flex justify-between items-start">
        <span className="text-[11px] font-black text-slate-400 uppercase tracking-[0.15em]">{title}</span>
        {trend && (
          <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black ${
            trendType === "up" ? "bg-emerald-100 text-emerald-600" : "bg-red-100 text-red-600"
          }`}>
            {trend}
          </div>
        )}
      </div>
      <div className="mt-5 flex items-baseline gap-3">
        <div className={`text-3xl font-black tracking-tight ${type === 'danger' ? 'text-red-600' : 'text-slate-800'}`}>{value}</div>
        {subValue && <div className="text-xs font-bold text-slate-400">{subValue}</div>}
      </div>
      <p className="mt-3 text-[11px] font-bold text-slate-400/80 italic group-hover:text-slate-600 transition-colors">{hint}</p>
    </div>
  );
}

// --- 通用詳情清單組件 ---
function DetailList({ title, list, themeColor }: { title: string; list: any[]; themeColor: string }) {
  if (list.length === 0) return null;
  const themes: any = {
    red: "bg-red-500 border-red-100 text-red-600",
    blue: "bg-blue-600 border-blue-100 text-blue-600",
    emerald: "bg-emerald-600 border-emerald-100 text-emerald-600",
  };

  return (
    <div className="mt-8 animate-in slide-in-from-top-4 duration-500">
      <div className={`bg-white rounded-[32px] border ${themes[themeColor].split(' ')[1]} shadow-2xl overflow-hidden`}>
        <div className={`${themes[themeColor].split(' ')[0]} px-8 py-4 flex justify-between items-center`}>
          <h3 className="text-white font-black tracking-wider flex items-center gap-2">
            {title} <span className="bg-white px-2 py-0.5 rounded-full text-[10px] font-black" style={{ color: themes[themeColor].split(' ')[2] }}>{list.length}</span>
          </h3>
        </div>
        <div className="overflow-x-auto text-slate-800">
          <table className="w-full text-left table-auto">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-wider">產品線</th>
                <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-wider">公司/案件名稱</th>
                <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-wider">窗口/聯絡人</th>
                <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-wider">建立日期</th>
                <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-wider">金額</th>
                <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-wider">狀態</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.map((item, i) => (
                <tr 
                  key={i} 
                  className="hover:bg-slate-50/50 transition-colors cursor-pointer"
                  onClick={() => {
                    const path = item.source === '辦公室' ? '/cases' : 
                                 item.source === '質晑所課程' ? '/registrations' : '/events';
                    window.location.href = `${path}?id=${item.id}`;
                  }}
                >
                  <td className="px-8 py-5">
                    <span className={`text-[9px] font-black px-2.5 py-1.5 rounded uppercase tracking-tight ${
                      item.source === '辦公室' ? 'bg-blue-100 text-blue-700' : 
                      item.source === '工商' ? 'bg-emerald-100 text-emerald-700' : 'bg-purple-100 text-purple-700'
                    }`}>
                      {item.source}
                    </span>
                  </td>
                  <td className="px-4 py-5 font-bold text-slate-900 text-sm">{item.title || item.name || item.companyName}</td>
                  <td className="px-4 py-5 text-sm text-slate-600 font-medium">{item.customer || item.contactPerson}</td>
                  <td className="px-4 py-5 text-sm text-slate-500 font-mono tracking-tight">
                    {(() => {
                      const d = toJsDate(item.createdAt);
                      if (!d) return "-";
                      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                    })()}
                  </td>
                  <td className="px-4 py-5 text-sm font-bold text-slate-800">{formatCurrency(item.amount || 0)}</td>
                  <td className="px-8 py-5 text-xs text-slate-500 font-medium">
                    {item.isOverdue ? <span className="text-red-600 font-extrabold bg-red-100 px-2 py-1 rounded">逾期 {item.overdueDays} 天</span> : (item.stage || "進行中")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// --- 可重複使用的「設定目標金額」輸入列 ---
function TargetInput({ value, onChange, onSave, saving }: { value: string; onChange: (v: string) => void; onSave: () => void; saving: boolean }) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <span className="text-xs font-bold text-slate-500">設定月目標金額（其他區間自動換算）：</span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") onSave(); }}
        placeholder="輸入目標金額"
        className="px-3 py-2 border border-slate-200 rounded-lg text-sm w-40 outline-none focus:border-blue-400"
      />
      <button
        onClick={onSave}
        disabled={saving}
        className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm disabled:opacity-50"
      >
        {saving ? "儲存中..." : "儲存目標"}
      </button>
    </div>
  );
}

function MetricProgress({ label, value, percentage, colorClass }: any) {
  return (
    <div className="group border border-slate-100 rounded-2xl p-5 bg-white transition-all hover:border-blue-100 hover:shadow-sm">
      <div className="flex justify-between items-center mb-4">
        <span className="text-xs font-black text-slate-600 uppercase tracking-tighter">{label}</span>
        <div className="flex items-baseline gap-1.5">
          <span className="text-sm font-black text-slate-950">{value}</span>
          <span className="text-[11px] font-bold text-slate-400">({Math.round(percentage)}%)</span>
        </div>
      </div>
      <div className="h-3 w-full bg-slate-50 rounded-full overflow-hidden border border-slate-100 relative">
        <div className={`h-full absolute left-0 top-0 rounded-full transition-all duration-[800ms] ease-out ${colorClass}`} style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }} />
      </div>
    </div>
  );
}

// --- 精緻化圖表：橫向排行長條圖（瓶頸分析、暫停原因、待辦完成率共用） ---
function HorizontalBarChart({ data, color, unit = "", tickStep = 5 }: { data: { label: string; value: number }[]; color: string; unit?: string; tickStep?: number }) {
  if (data.length === 0) return <p className="text-xs text-slate-400 italic">目前沒有足夠資料</p>;
  const height = Math.max(200, data.length * 46) + 30;
  const maxValue = Math.max(...data.map(d => d.value), 0);
  const minTicks = 4; // 至少顯示 0、5、10、15、20 這樣的間距，不會因為資料量小就緊貼在最大值
  const axisMax = Math.max(tickStep * minTicks, Math.ceil(maxValue / tickStep) * tickStep);
  const ticks: number[] = [];
  for (let v = 0; v <= axisMax; v += tickStep) ticks.push(v);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 24 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
        <XAxis
          type="number"
          domain={[0, axisMax]}
          ticks={ticks}
          allowDecimals={false}
          tick={{ fontSize: 11, fill: "#94a3b8" }}
          axisLine={{ stroke: "#e2e8f0" }}
          label={{ value: unit ? `數值（${unit.trim()}）` : "數值", position: "insideBottom", offset: -16, fontSize: 12, fill: "#64748b", fontWeight: 700 }}
        />
        <YAxis type="category" dataKey="label" width={180} tick={{ fontSize: 11, fill: "#475569" }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }} formatter={(v: number) => [`${v}${unit}`, ""]} />
        <Bar dataKey="value" fill={color} radius={[0, 6, 6, 0]} barSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// --- 精緻化圖表：近6個月趨勢（長條=新增案件、折線=業績，雙軸合併呈現） ---
function TrendComboChart({ data }: { data: { month: string; newCount: number; revenue: number }[] }) {
  const chartData = data.map(d => ({ month: `${d.month.substring(5)}月`, 新增案件: d.newCount, 成交業績萬元: Math.round(d.revenue / 10000) }));
  return (
    <ResponsiveContainer width="100%" height={340}>
      <ComposedChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 24 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis
          dataKey="month"
          tick={{ fontSize: 11, fill: "#94a3b8" }}
          axisLine={{ stroke: "#e2e8f0" }}
          label={{ value: "月份", position: "insideBottom", offset: -16, fontSize: 12, fill: "#64748b", fontWeight: 700 }}
        />
        <YAxis
          yAxisId="left"
          tick={{ fontSize: 11, fill: "#94a3b8" }}
          axisLine={{ stroke: "#e2e8f0" }}
          allowDecimals={false}
          label={{ value: "新增案件數（件）", angle: -90, position: "insideLeft", offset: 10, fontSize: 12, fill: "#3b82f6", fontWeight: 700 }}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          tick={{ fontSize: 11, fill: "#94a3b8" }}
          axisLine={{ stroke: "#e2e8f0" }}
          label={{ value: "成交業績（萬元）", angle: 90, position: "insideRight", offset: 10, fontSize: 12, fill: "#10b981", fontWeight: 700 }}
        />
        <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }} />
        <Legend wrapperStyle={{ fontSize: 12 }} verticalAlign="top" height={32} />
        <Bar yAxisId="left" dataKey="新增案件" fill="#3b82f6" radius={[6, 6, 0, 0]} barSize={28} />
        <Line yAxisId="right" type="monotone" dataKey="成交業績萬元" stroke="#10b981" strokeWidth={3} dot={{ r: 4 }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// --- 精緻化圖表：轉換率甜甜圈圖（各產品線成交/暫停/進行中比例） ---
const DONUT_COLORS = ["#10b981", "#ef4444", "#94a3b8"];
function ConversionDonut({ success, paused, total }: { success: number; paused: number; total: number }) {
  const active = Math.max(0, total - success - paused);
  const data = [
    { name: "成交", value: success },
    { name: "暫停", value: paused },
    { name: "進行中", value: active },
  ].filter(d => d.value > 0);
  if (data.length === 0) return <p className="text-xs text-slate-400 italic text-center py-10">目前沒有案件</p>;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={3}>
          {data.map((_, i) => <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />)}
        </Pie>
        <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

function DataSection({ title, tag, themeColor, description, children }: any) {
  const themes: any = {
    blue: "border-blue-100 bg-blue-50 text-blue-600",
    emerald: "border-emerald-100 bg-emerald-50 text-emerald-600",
    amber: "border-amber-100 bg-amber-50 text-amber-600",
  };
  return (
    <div className="bg-white rounded-[40px] border border-slate-100 p-10 shadow-sm transition-all hover:border-slate-200 hover:shadow-md">
      <header className="mb-10 flex justify-between items-center pb-6 border-b border-slate-100">
        <h3 className="text-xl font-black text-slate-950 tracking-tight">{title}</h3>
        <span className={`text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest ${themes[themeColor]}`}>{tag}</span>
      </header>
      {children}
      {description && (
        <p className="mt-8 pt-6 border-t border-slate-50 text-[11px] text-slate-400 italic leading-relaxed">💡 {description}</p>
      )}
    </div>
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
  const TARGET_FIELD_MAP: Record<TargetKey, string> = {
    overall: "monthlyTarget", // 沿用舊欄位名稱，向下相容之前已存過的目標值
    office: "office",
    registration: "registration",
    event: "event",
  };

  // 目標金額固定用「月」為輸入單位，其他時間篩選按比例換算，比較基準才會一致
  const PERIOD_MULTIPLIER: Record<string, number> = {
    "今日": 1 / 30,
    "本週": 7 / 30,
    "本月": 1,
    "本季": 3,
    "今年": 12,
  };
  const scaleTarget = (monthlyValue: number) => monthlyValue * (PERIOD_MULTIPLIER[timeFilter] ?? 1);

  const [targets, setTargets] = useState<Record<TargetKey, number>>({ overall: 0, office: 0, registration: 0, event: 0 });
  const [targetInputs, setTargetInputs] = useState<Record<TargetKey, string>>({ overall: "", office: "", registration: "", event: "" });
  const [targetSaving, setTargetSaving] = useState<TargetKey | null>(null);

  // 目標金額存在 Firestore 的共用設定文件，所有人打開都會看到同一組數字
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "settings", "targets"), (snap) => {
      const data = snap.exists() ? snap.data() : {};
      const next: Record<TargetKey, number> = {
        overall: data.monthlyTarget || 0,
        office: data.office || 0,
        registration: data.registration || 0,
        event: data.event || 0,
      };
      setTargets(next);
      setTargetInputs({
        overall: next.overall ? String(next.overall) : "",
        office: next.office ? String(next.office) : "",
        registration: next.registration ? String(next.registration) : "",
        event: next.event ? String(next.event) : "",
      });
    });
    return () => unsub();
  }, []);

  const saveTarget = async (key: TargetKey) => {
    const v = Number(targetInputs[key]) || 0;
    setTargetSaving(key);
    try {
      await setDoc(doc(db, "settings", "targets"), { [TARGET_FIELD_MAP[key]]: v }, { merge: true });
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
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
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

    const allProcessed = [
      ...cases.map(c => ({ ...c, source: '辦公室' })), 
      ...members.map(m => ({ 
        ...m, 
        source: m.productLines?.includes('質晑所課程') ? '質晑所課程' : '活動' 
      }))
    ].map(item => ({
      ...item,
      amount: item.totalContractAmount || 0
    }));

    // 💡 修正：改用各產品線正確的「成交/暫停」階段對照表，不再用寫死的 S6/S8
    const isSuccessStage = (item: any) => (SUCCESS_STAGES[item.source] || []).includes(item.stage);
    const isFinalStage = (item: any) => (FINAL_STAGES[item.source] || []).includes(item.stage);

    // 高風險清單：非最終階段停留 >=10天（跟看板紅燈門檻一致，取代舊的 7/3天邏輯）
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

    // 💡 修正：業績、成交清單、館別營收，改成看「真正成交的日期」在不在本期間，
    // 不再看建立日期，不然上個月建立、這個月才成交的案件會被漏算成 $0
    const finishedByTime = allProcessed.filter(item => isSuccessStage(item) && checkTime(closeDateOf(item)));

    const totalRev = finishedByTime.reduce((acc, curr) => acc + curr.amount, 0);

    const bldStats = ["四維館", "民權20樓", "民權21樓", "民權27樓", "民權28樓"].map(name => {
      const amt = finishedByTime.filter(i => i.source === '辦公室' && i.building === name).reduce((a, c) => a + c.amount, 0);
      return { name, amt };
    });

    const getProductStats = (tag: string) => {
      // 轉換率：本期間建立的案件中，目前有多少已經成交
      const cohortItems = timeFilteredData.filter(i => i.source === tag);
      const cohortFinished = cohortItems.filter(isSuccessStage);
      const rate = cohortItems.length > 0 ? (cohortFinished.length / cohortItems.length) * 100 : 0;

      // 業績、成交件數：看真正成交日期在不在本期間
      const finished = finishedByTime.filter(i => i.source === tag);
      const rev = finished.reduce((a, c) => a + c.amount, 0);
      return { rev, rate, count: finished.length };
    };

    const currentRate = timeFilteredData.length > 0 ? (timeFilteredData.filter(isSuccessStage).length / timeFilteredData.length) * 100 : 0;

    const getPrevRate = () => {
      const prevData = allProcessed.filter(item => {
        const d = toJsDate(item.createdAt);
        if (!d) return false;
        if (timeFilter === "今日") return d >= new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1) && d < startOfDay;
        if (timeFilter === "本週") return d >= new Date(now.getFullYear(), now.getMonth(), now.getDate() - 14) && d < startOfWeek;
        return d >= new Date(now.getFullYear(), now.getMonth() - 1, 1) && d < startOfMonth;
      });
      const prevFinished = prevData.filter(isSuccessStage);
      return prevData.length > 0 ? (prevFinished.length / prevData.length) * 100 : 0;
    };

    const prevRate = getPrevRate();
    const rateDiff = currentRate - prevRate; 

    // --- 新增①：流程瓶頸分析（各產品線各自一份完整排行，不混在一起） ---
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

    // --- 新增②：轉換率分析（各產品線成交率 vs 暫停率 vs 進行中率） ---
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

    // --- 新增③：暫停原因分析（總覽 + 三條產品線各自一份） ---
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

    // --- 新增④：待辦清單完成率（三條產品線分開統計） ---
    const todoStatsBySourceRaw = {
      "辦公室": computeTodoCompletion(cases),
      "質晑所課程": computeTodoCompletion(members.filter(m => m.productLines?.includes('質晑所課程'))),
      "活動": computeTodoCompletion(members.filter(m => !m.productLines?.includes('質晑所課程'))),
    };

    // --- 新增⑤：近6個月案件建立趨勢 + 成交業績趨勢（總覽 + 三條產品線各自一份） ---
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

    // --- 新增⑥：本期業績依產品線分類（跟目前選的時間篩選連動） ---
    const revenueBySourceRaw = Object.keys(STAGE_DEFS).map(source => {
      const rev = finishedByTime.filter(i => i.source === source).reduce((a, c) => a + c.amount, 0);
      return { source, rev, percentage: totalRev > 0 ? (rev / totalRev) * 100 : 0 };
    });

    // --- 新增⑦：業績成長比較（跟著上方時間篩選走：本期 vs 上一期、本期 vs 去年同期；三條產品線各自獨立計算） ---
    const revenueInRange = (start: Date, end: Date, source?: string) =>
      allProcessed
        .filter(i => (!source || i.source === source) && isSuccessStage(i))
        .reduce((sum, i) => {
          const d = toJsDate(closeDateOf(i));
          if (d && d >= start && d < end) return sum + (i.amount || 0);
          return sum;
        }, 0);

    // 依目前選的時間篩選，算出「本期」「上一期」「去年同期」的完整日曆區間（不是滑動視窗）
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
      yoyStart = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate() - now.getDay());
      yoyEnd = new Date(yoyStart.getTime() + 7 * 24 * 60 * 60 * 1000);
      prevLabel = "與上週比"; yoyLabel = "與去年同週比";
    } else if (timeFilter === "本季") {
      const qStartMonth = Math.floor(now.getMonth() / 3) * 3;
      curStart = startOfQuarter; curEnd = new Date(now.getFullYear(), qStartMonth + 3, 1);
      prevStart = new Date(now.getFullYear(), qStartMonth - 3, 1); prevEnd = curStart;
      yoyStart = new Date(now.getFullYear() - 1, qStartMonth, 1); yoyEnd = new Date(now.getFullYear() - 1, qStartMonth + 3, 1);
      prevLabel = "與上季比（QoQ）"; yoyLabel = "與去年同季比（YoY）";
    } else if (timeFilter === "今年") {
      curStart = startOfYear; curEnd = new Date(now.getFullYear() + 1, 0, 1);
      prevStart = new Date(now.getFullYear() - 1, 0, 1); prevEnd = curStart;
      yoyStart = prevStart; yoyEnd = prevEnd;
      prevLabel = "與去年比（YoY）"; yoyLabel = "與去年比（YoY）";
    } else { // 本月（預設）
      curStart = startOfMonth; curEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1); prevEnd = curStart;
      yoyStart = new Date(now.getFullYear() - 1, now.getMonth(), 1); yoyEnd = new Date(now.getFullYear() - 1, now.getMonth() + 1, 1);
      prevLabel = "與上月比（MoM）"; yoyLabel = "與去年同月比（YoY）";
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

  if (!hasMounted) return <div className="flex-1 h-screen bg-slate-50/30" />;
  const toggleView = (view: string) => setActiveView(activeView === view ? null : view);

  return (
    <div className="flex-1 h-screen overflow-y-auto bg-[#F8FAFC] font-sans custom-scrollbar p-12 text-slate-900">
      <div className="max-w-[1400px] mx-auto space-y-12">
        <header className="mb-14 flex flex-col lg:flex-row lg:items-center justify-between gap-8 pb-8 border-b border-slate-100">
          <div className="space-y-3">
            <div className="flex items-center gap-3"><div className="h-2.5 w-2.5 rounded-full bg-blue-600 animate-pulse" /><span className="text-[11px] font-black text-blue-700 uppercase tracking-[0.2em]">Jade Internal Control System</span></div>
            <h1 className="text-4xl font-black tracking-tighter text-slate-950">內控指揮中心 Dashboard</h1>
          </div>
          <div className="flex bg-white p-2 rounded-2xl shadow-inner border border-slate-100">
            {["今日", "本週", "本月", "本季", "今年"].map(t => (
              <button key={t} onClick={() => setTimeFilter(t)} className={`px-6 py-2.5 rounded-xl text-xs font-black transition-all duration-300 ${timeFilter === t ? "bg-slate-950 text-white shadow-lg" : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"}`}>{t}</button>
            ))}
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          <AnalyticCard title={`成交業績 (${timeFilter})`} value={formatCurrency(analytics.totalRevenue)} subValue={`共 ${revenueList.length} 件`} hint="點擊查看成交清單" onClick={() => toggleView('revenue')} type={activeView === 'revenue' ? 'success' : 'default'} trend="LIVE" />
          <AnalyticCard title="逾期風險監控" value={analytics.overdueCount} hint="單一階段停留≥10天，全系統彙整" type={analytics.overdueCount > 0 ? "danger" : "default"} trend={analytics.overdueCount > 0 ? "需核閱" : "正常"} trendType={analytics.overdueCount > 0 ? "down" : "up"} onClick={() => toggleView('overdue')} />
          <AnalyticCard title={`新增在辦案件 (${timeFilter})`} value={analytics.totalActive} hint="點擊查看本期新進案件" onClick={() => toggleView('active')} />
          <AnalyticCard 
            title="平均轉換率" 
            value={`${Math.round(conversionRate)}%`} 
            hint={`${timeFilter}期結案轉化指標`} 
            trend={analytics.trendText}  
            trendType={analytics.trendType} 
          />
        </div>

        {activeView === 'overdue' && <DetailList title="🔥 全系統高風險案件（單一階段停留≥10天）" list={overdueList} themeColor="red" />}
        {activeView === 'revenue' && <DetailList title={`💰 本期成交案件明細 (${timeFilter})`} list={revenueList} themeColor="emerald" />}
        {activeView === 'active' && <DetailList title={`📁 本期新進活躍案件 (${timeFilter})`} list={activeList} themeColor="blue" />}

        <DataSection
          title={`成交業績依產品線分類 (${timeFilter})`}
          tag="BY SOURCE"
          themeColor="blue"
          description="同一份成交業績，拆成三條產品線各自的貢獻，避免誤把全公司總額當成單一產品線的業績。"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {revenueBySource.map((r: any, i: number) => (
              <MetricProgress
                key={r.source}
                label={r.source}
                value={formatCurrency(r.rev)}
                percentage={r.percentage}
                colorClass={["bg-blue-600", "bg-emerald-600", "bg-amber-600"][i]}
              />
            ))}
          </div>
        </DataSection>

        <DataSection
          title={`業績成長比較 (${timeFilter})`}
          tag="GROWTH"
          themeColor="emerald"
          description="跟著上方時間篩選走：切到本月比較上月/去年同月，切到本季就比較上季/去年同季，以此類推；四組數字各自獨立，不會互相混在一起。"
        >
          <div className="space-y-10">
            {[
              { key: "overall", label: "全公司總計" },
              { key: "辦公室", label: "辦公室" },
              { key: "質晑所課程", label: "質晑所課程" },
              { key: "活動", label: "活動" },
            ].map(({ key, label }) => {
              const g = (growthStats as any)[key];
              return (
                <div key={key}>
                  <p className="text-xs font-black text-slate-700 mb-3 pl-1">{label}</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="p-6 bg-slate-50/50 rounded-2xl border border-slate-100">
                      <p className="text-xs font-black text-slate-500 mb-3">{growthLabels.prevLabel}</p>
                      <div className="flex items-baseline gap-3 mb-2">
                        <span className="text-2xl font-black text-slate-900">{formatCurrency(g.currentRevenue)}</span>
                        <span className={`text-sm font-black ${g.prevGrowth >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                          {g.prevGrowth >= 0 ? "↑" : "↓"} {Math.abs(g.prevGrowth).toFixed(1)}%
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400">上一期：{formatCurrency(g.prevRevenue)}</p>
                    </div>
                    <div className="p-6 bg-slate-50/50 rounded-2xl border border-slate-100">
                      <p className="text-xs font-black text-slate-500 mb-3">{growthLabels.yoyLabel}</p>
                      <div className="flex items-baseline gap-3 mb-2">
                        <span className="text-2xl font-black text-slate-900">{formatCurrency(g.currentRevenue)}</span>
                        <span className={`text-sm font-black ${g.yoyGrowth >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                          {g.yoyGrowth >= 0 ? "↑" : "↓"} {Math.abs(g.yoyGrowth).toFixed(1)}%
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400">去年同期：{formatCurrency(g.yoyRevenue)}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </DataSection>

        <div className="space-y-12">
          <DataSection title={`辦公室租賃館別營收貢獻 (${timeFilter})`} tag="OFFICE LINE" themeColor="blue" description="看各館別對辦公室產品線總營收的貢獻比重，掌握哪個館別最賺錢，決定招租資源投放的優先順序；下方另可設定本月目標，檢視五個館別加總後是否達標。">
            <TargetInput
              value={targetInputs.office}
              onChange={(v) => setTargetInputs(prev => ({ ...prev, office: v }))}
              onSave={() => saveTarget("office")}
              saving={targetSaving === "office"}
            />
            <MetricProgress
              label={`辦公室${timeFilter}業績 / 目標`}
              value={`${formatCurrency(officeStats.reduce((a, c) => a + c.amt, 0))} / ${formatCurrency(scaleTarget(targets.office))}`}
              percentage={targets.office > 0 ? (officeStats.reduce((a, c) => a + c.amt, 0) / scaleTarget(targets.office)) * 100 : 0}
              colorClass="bg-blue-600"
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8 mt-8">
              {officeStats.map((s, i) => {
                const officeTotal = officeStats.reduce((a, c) => a + c.amt, 0);
                return (
                  <MetricProgress key={s.name} label={s.name} value={formatCurrency(s.amt)} percentage={officeTotal > 0 ? (s.amt / officeTotal) * 100 : 0} colorClass={["bg-blue-600","bg-indigo-500","bg-purple-500","bg-violet-500","bg-sky-500"][i]} />
                );
              })}
            </div>
          </DataSection>

          <DataSection title="質晑所課程績效指標" tag="REGISTRATION" themeColor="emerald" description="追蹤課程產品線的業績與成交轉換率，評估這條產品線目前的健康度與成長狀況；可設定本月目標檢視達成率。">
            <TargetInput
              value={targetInputs.registration}
              onChange={(v) => setTargetInputs(prev => ({ ...prev, registration: v }))}
              onSave={() => saveTarget("registration")}
              saving={targetSaving === "registration"}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
              <div className="space-y-8">
                <MetricProgress label={`${timeFilter}成交業績 / 目標`} value={`${formatCurrency(regStats.rev)} / ${formatCurrency(scaleTarget(targets.registration))}`} percentage={targets.registration > 0 ? (regStats.rev / scaleTarget(targets.registration)) * 100 : 0} colorClass="bg-emerald-600" />
                <MetricProgress label={`${timeFilter}成交轉換率`} value={`${Math.round(regStats.rate)}%`} percentage={regStats.rate} colorClass="bg-emerald-500" />
              </div>
              <div className="p-8 bg-emerald-50/50 rounded-3xl border border-emerald-100 shadow-inner flex flex-col items-center justify-center h-full min-h-[220px]">
                <p className="text-xs font-bold text-emerald-800/70 uppercase mb-3 tracking-wider">{timeFilter}成交件數</p>
                <div className="text-6xl font-black text-emerald-700">{regStats.count} <span className="text-base font-medium text-emerald-500/80">件</span></div>
              </div>
            </div>
          </DataSection>

          <DataSection title="活動管理績效指標" tag="EVENT SPACE" themeColor="amber" description="追蹤活動產品線的業績與成交轉換率，評估活動業務的表現與資源投入是否對等；可設定本月目標檢視達成率。">
            <TargetInput
              value={targetInputs.event}
              onChange={(v) => setTargetInputs(prev => ({ ...prev, event: v }))}
              onSave={() => saveTarget("event")}
              saving={targetSaving === "event"}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
              <div className="space-y-8">
                <MetricProgress label={`${timeFilter}成交業績 / 目標`} value={`${formatCurrency(eventStats.rev)} / ${formatCurrency(scaleTarget(targets.event))}`} percentage={targets.event > 0 ? (eventStats.rev / scaleTarget(targets.event)) * 100 : 0} colorClass="bg-amber-600" />
                <MetricProgress label={`${timeFilter}成交轉換率`} value={`${Math.round(eventStats.rate)}%`} percentage={eventStats.rate} colorClass="bg-amber-500" />
              </div>
              <div className="p-8 bg-amber-50/50 rounded-3xl border border-amber-100 shadow-inner flex flex-col items-center justify-center h-full min-h-[220px]">
                <p className="text-xs font-bold text-amber-800/70 uppercase mb-3 tracking-wider">{timeFilter}成交件數</p>
                <div className="text-6xl font-black text-amber-700">{eventStats.count} <span className="text-base font-medium text-amber-500/80">件</span></div>
              </div>
            </div>
          </DataSection>

          {/* 💡 新增①：業績目標達成率（全公司總計） */}
          <DataSection
            title={`${timeFilter}業績目標達成率（全公司總計）`}
            tag="TARGET"
            themeColor="blue"
            description="設定「每月」目標金額，切換上方時間篩選時，目標會依比例自動換算（例如本季＝月目標×3），跟實際業績維持同一個比較基準；這組數字全體同事共用同一份，任何人修改後大家看到的都會一致。"
          >
            <TargetInput
              value={targetInputs.overall}
              onChange={(v) => setTargetInputs(prev => ({ ...prev, overall: v }))}
              onSave={() => saveTarget("overall")}
              saving={targetSaving === "overall"}
            />
            <MetricProgress
              label={`${timeFilter}實際業績 / 目標`}
              value={`${formatCurrency(analytics.totalRevenue)} / ${formatCurrency(scaleTarget(targets.overall))}`}
              percentage={targets.overall > 0 ? (analytics.totalRevenue / scaleTarget(targets.overall)) * 100 : 0}
              colorClass="bg-blue-600"
            />
          </DataSection>

          {/* 💡 新增②：近6個月趨勢（總覽 + 三條產品線頁籤） */}
          <DataSection
            title="近6個月案件建立與業績趨勢"
            tag="TREND"
            themeColor="blue"
            description="觀察案件量與業績的長期走勢，判斷業務動能是成長還是衰退；可切換頁籤分別檢視各產品線，避免不同量級的數字互相干擾。"
          >
            <div className="flex gap-2 mb-6">
              {([
                { key: "overall", label: "總覽" },
                { key: "辦公室", label: "辦公室" },
                { key: "質晑所課程", label: "質晑所課程" },
                { key: "活動", label: "活動" },
              ] as const).map(t => (
                <button
                  key={t.key}
                  onClick={() => setTrendTab(t.key)}
                  className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${trendTab === t.key ? "bg-slate-950 text-white shadow-md" : "text-slate-400 bg-slate-50 hover:text-slate-600"}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <TrendComboChart data={monthlyTrendBySource[trendTab]} />
          </DataSection>

          {/* 💡 新增③：流程瓶頸分析（三個頁籤，各產品線各自完整排行） */}
          <DataSection
            title="流程瓶頸分析（各階段平均停留天數）"
            tag="BOTTLENECK"
            themeColor="amber"
            description="找出流程中平均停留天數最長的階段，優先檢討這些卡關步驟，加速整體成交速度；每條產品線的階段跟天數量級不同，分開看才不會互相干擾。"
          >
            <div className="flex gap-2 mb-6">
              {(["辦公室", "質晑所課程", "活動"] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setBottleneckTab(s)}
                  className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${bottleneckTab === s ? "bg-slate-950 text-white shadow-md" : "text-slate-400 bg-slate-50 hover:text-slate-600"}`}
                >
                  {s}
                </button>
              ))}
            </div>
            <HorizontalBarChart
              data={stageBottleneckBySource[bottleneckTab].map(s => ({ label: s.title, value: s.avg }))}
              color="#f59e0b"
              unit=" 天"
            />
          </DataSection>

          {/* 💡 新增④：轉換率分析 */}
          <DataSection
            title="轉換率分析（成交 vs 暫停）"
            tag="CONVERSION"
            themeColor="emerald"
            description="比較各產品線的成交率與暫停率，評估哪條產品線的業務健康度較高、哪條需要關注。"
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {conversionStats.map(c => (
                <div key={c.source} className="p-6 bg-slate-50/50 rounded-2xl border border-slate-100">
                  <p className="text-xs font-black text-slate-500 mb-2 text-center">{c.source}（共 {c.total} 件）</p>
                  <ConversionDonut success={c.success} paused={c.paused} total={c.total} />
                  <div className="mt-4 space-y-1.5 text-[11px] font-bold">
                    <div className="flex justify-between text-emerald-600"><span>成交率</span><span>{c.successRate.toFixed(1)}%（{c.success} 件）</span></div>
                    <div className="flex justify-between text-red-500"><span>暫停率</span><span>{c.pausedRate.toFixed(1)}%（{c.paused} 件）</span></div>
                    <div className="flex justify-between text-slate-400"><span>進行中</span><span>{c.activeRate.toFixed(1)}%（{c.active} 件）</span></div>
                  </div>
                </div>
              ))}
            </div>
          </DataSection>

          {/* 💡 新增⑤：暫停原因分析（總覽 + 三個頁籤） */}
          <DataSection
            title="暫停原因分析"
            tag="PAUSE REASON"
            themeColor="amber"
            description="統計案件暫停的真正原因，找出重複出現的業務痛點，作為改善銷售策略或報價機制的依據；可切換頁籤看跨產品線彙整或單一產品線細節。"
          >
            <div className="flex gap-2 mb-6">
              {([
                { key: "overall", label: "總覽" },
                { key: "辦公室", label: "辦公室" },
                { key: "質晑所課程", label: "質晑所課程" },
                { key: "活動", label: "活動" },
              ] as const).map(t => (
                <button
                  key={t.key}
                  onClick={() => setPauseReasonTab(t.key)}
                  className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${pauseReasonTab === t.key ? "bg-slate-950 text-white shadow-md" : "text-slate-400 bg-slate-50 hover:text-slate-600"}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <HorizontalBarChart
              data={pauseReasonStatsBySource[pauseReasonTab].map(p => ({ label: p.reason, value: p.count }))}
              color="#ef4444"
              unit=" 件"
            />
          </DataSection>

          {/* 💡 新增⑥：待辦清單完成率（三個頁籤） */}
          <DataSection
            title="待辦清單完成率（找出常被漏掉的步驟）"
            tag="TODO CHECK"
            themeColor="blue"
            description="檢視 SOP 執行狀況，找出最常被漏掉的步驟，補強教育訓練或流程設計，避免服務品質不一致。由低到高排序，完成率最低的排在最前面。"
          >
            <div className="flex gap-2 mb-6">
              {(["辦公室", "質晑所課程", "活動"] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setTodoTab(s)}
                  className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${todoTab === s ? "bg-slate-950 text-white shadow-md" : "text-slate-400 bg-slate-50 hover:text-slate-600"}`}
                >
                  {s}
                </button>
              ))}
            </div>
            <HorizontalBarChart
              data={todoStatsBySource[todoTab].map(t => ({ label: t.text, value: t.completed }))}
              color={todoTab === "辦公室" ? "#3b82f6" : todoTab === "質晑所課程" ? "#10b981" : "#f59e0b"}
              unit=" 件完成"
            />
          </DataSection>
        </div>
      </div>
      <style dangerouslySetInnerHTML={{ __html: `.custom-scrollbar::-webkit-scrollbar { width: 8px; height: 8px; } .custom-scrollbar::-webkit-scrollbar-track { background: transparent; } .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; } .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }` }} />
    </div>
  );
}