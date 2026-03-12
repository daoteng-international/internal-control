"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";

// --- 工具函數：格式化金額 ---
function formatCurrency(n: number) {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(n);
}

// --- 專業數據統計卡片 ---
function AnalyticCard({ title, value, hint, trend, trendType = "up", type = "default" }: any) {
  const styles = {
    default: "bg-white border-slate-100",
    danger: "bg-red-50/20 border-red-100",
    success: "bg-emerald-50/20 border-emerald-100",
  };

  return (
    <div className={`rounded-3xl border p-7 shadow-sm transition-all hover:shadow-md ${styles[type as keyof typeof styles]}`}>
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
        <div className="text-3xl font-black text-slate-800 tracking-tight">{value}</div>
      </div>
      <p className="mt-3 text-[11px] font-bold text-slate-400/80 italic">{hint}</p>
    </div>
  );
}

// --- 圖表組件：LineChartCard ---
function LineChartCard({ title, subtitle, xLabels, series, yFormatter = (n: number) => String(n), hintRight }: any) {
  const chartWidth = 760; const chartHeight = 220; const paddingLeft = 70; const paddingRight = 20;
  const paddingTop = 20; const paddingBottom = 45;
  const allValues = series.flatMap((s: any) => s.values);
  const max = Math.max(1, ...allValues) * 1.2;
  const innerW = chartWidth - paddingLeft - paddingRight;
  const innerH = chartHeight - paddingTop - paddingBottom;
  const xStep = innerW / (xLabels.length - 1 || 1);

  return (
    <div className="h-full bg-white rounded-[40px] border border-slate-100 p-10 shadow-sm flex flex-col font-sans">
      <div className="flex justify-between items-start mb-8">
        <div><h3 className="text-lg font-black text-slate-900">{title}</h3>{subtitle && <p className="text-xs font-bold text-slate-400 mt-1">{subtitle}</p>}</div>
        {hintRight && <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-3 py-1 rounded-full uppercase">{hintRight}</span>}
      </div>
      <div className="relative flex-1">
        <div className="absolute left-0 h-[155px] flex flex-col justify-between text-[9px] font-bold text-slate-300 w-[60px] text-right pr-4">
          <span>{yFormatter(max)}</span><span>{yFormatter(max/2)}</span><span>$0</span>
        </div>
        <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-[250px] overflow-visible">
          {[0, 0.5, 1].map(p => <line key={p} x1={paddingLeft} y1={paddingTop + innerH*p} x2={chartWidth-paddingRight} y2={paddingTop + innerH*p} stroke="#f1f5f9" strokeDasharray="4" />)}
          {series.map((s: any, si: number) => (
            <g key={s.key}>
              <polyline points={s.values.map((v: number, i: number) => `${paddingLeft + i*xStep},${paddingTop + innerH - (v/max*innerH)}`).join(" ")} fill="none" stroke={["#3b82f6", "#10b981"][si % 2]} strokeWidth="3" />
              {s.values.map((v: number, i: number) => <circle key={i} cx={paddingLeft + i*xStep} cy={paddingTop + innerH - (v/max*innerH)} r="4" fill="white" stroke={["#3b82f6", "#10b981"][si % 2]} strokeWidth="2" />)}
            </g>
          ))}
          {xLabels.map((lab: string, i: number) => <text key={i} x={paddingLeft + i*xStep} y={paddingTop + innerH + 30} textAnchor="middle" className="fill-slate-400 text-[10px] font-bold">{lab}</text>)}
        </svg>
      </div>
    </div>
  );
}

// --- ✅ 對話機器人組件 (已優化為淺色樣式) ---
function DecisionChatbot({ cases, totalARPU }: any) {
  const [messages, setMessages] = useState([{ role: "ai", content: "您好，我是您的內控決策助理。請問今天需要為您生成每週報表、每月報表，或是提供經營建議？" }]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages]);

  const handleSend = () => {
    if (!inputValue.trim()) return;
    const userMsg = inputValue;
    setMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setInputValue("");
    setIsTyping(true);

    setTimeout(() => {
      let aiResponse = "";
      if (userMsg.includes("每周") || userMsg.includes("每週")) {
        aiResponse = `分析完畢！本週全系統進行中總額已達 ${formatCurrency(totalARPU)}。其中「四維館」貢獻度最高，但民權 20 樓開發案件量較上週略微下滑 4.2%。`;
      } else if (userMsg.includes("建議")) {
        aiResponse = "🚨 經營建議：系統偵測到有 3 筆高價值合約在 S2 階段停滯超過 7 天。建議立即針對民權館發起狀態追蹤，並調派工商部門專員協辦需求媒合。";
      } else if (userMsg.includes("每月")) {
        aiResponse = `本月報表摘要：目前營收已達成目標的 85%，較去年同期增長 12.8%。活動潛在預算轉化效率提升 2.1%，整體健康指標評定為「穩定」。`;
      } else {
        aiResponse = "收到指令。我正從 Firestore 雲端資料庫掃描案件、工商登記與活動開發的所有進度數據...";
      }
      setMessages(prev => [...prev, { role: "ai", content: aiResponse }]);
      setIsTyping(false);
    }, 1200);
  };

  return (
    <div className="bg-white rounded-[40px] border border-slate-100 p-10 shadow-sm flex flex-col h-[520px]">
      <div className="flex items-center gap-3 mb-8 border-b border-slate-50 pb-6">
        <div className="h-3 w-3 rounded-full bg-blue-500 animate-pulse shadow-[0_0_10px_rgba(59,130,246,0.3)]" />
        <h3 className="text-xl font-black italic tracking-tight text-slate-800">🤖 AI 指揮決策系統</h3>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-5 mb-8 pr-2 custom-scrollbar">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] p-5 rounded-3xl text-sm font-bold leading-relaxed ${
              m.role === "user" 
                ? "bg-blue-600 text-white shadow-md" 
                : "bg-slate-50 text-slate-700 border border-slate-100"
            }`}>
              {m.content}
            </div>
          </div>
        ))}
        {isTyping && <div className="text-[10px] font-black text-slate-400 animate-bounce tracking-widest pl-2 uppercase">System computing...</div>}
      </div>
      <div className="relative">
        <input 
          type="text" 
          placeholder="輸入指令，例如：生成每週報表..." 
          value={inputValue} 
          onChange={(e) => setInputValue(e.target.value)} 
          onKeyDown={(e) => e.key === "Enter" && handleSend()} 
          className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-5 pl-8 pr-24 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500/20 transition-all text-slate-800" 
        />
        <button 
          onClick={handleSend} 
          className="absolute right-3 top-1/2 -translate-y-1/2 bg-slate-900 px-6 py-2.5 rounded-xl text-xs font-black text-white hover:bg-blue-600 active:scale-95 transition-all shadow-sm"
        >
          發送
        </button>
      </div>
    </div>
  );
}

// --- 業務佔比圓餅圖 ---
function RevenuePieChart({ cases, regs, evts }: any) {
  const total = (cases + regs + evts) || 1;
  const p1 = (cases / total) * 100; const p2 = (regs / total) * 100;
  return (
    <div className="h-full bg-slate-900 rounded-[40px] p-10 text-white shadow-xl flex flex-col items-center">
      <h3 className="text-sm font-black text-slate-400 mb-10 uppercase tracking-widest self-start">業務類別分佈</h3>
      <div className="relative w-48 h-48 mb-10">
        <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
          <circle cx="18" cy="18" r="15.9" fill="transparent" stroke="white" strokeOpacity="0.05" strokeWidth="3" />
          <circle cx="18" cy="18" r="15.9" fill="transparent" stroke="#3b82f6" strokeWidth="3" strokeDasharray={`${p1} ${100-p1}`} />
          <circle cx="18" cy="18" r="15.9" fill="transparent" stroke="#10b981" strokeWidth="3" strokeDasharray={`${p2} ${100-p2}`} strokeDashoffset={-p1} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center"><span className="text-2xl font-black">{cases+regs+evts}</span><span className="text-[9px] font-bold text-slate-500 uppercase">Projects</span></div>
      </div>
      <div className="w-full space-y-4">
        {[{l:"租賃案件",c:"bg-blue-500",p:p1},{l:"工商登記",c:"bg-emerald-500",p:p2},{l:"活動開發",c:"bg-amber-500",p:100-p1-p2}].map(x=>(
          <div key={x.l} className="flex justify-between items-center"><div className="flex items-center gap-3"><div className={`w-2 h-2 rounded-full ${x.c}`} /><span className="text-xs font-bold text-slate-300">{x.l}</span></div><span className="text-xs font-black">{Math.round(x.p)}%</span></div>
        ))}
      </div>
    </div>
  );
}

export default function ProfessionalDashboard() {
  const [hasMounted, setHasMounted] = useState(false);
  const [cases, setCases] = useState<any[]>([]);
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);

  useEffect(() => {
    setHasMounted(true);
    onSnapshot(collection(db, "cases"), (s) => setCases(s.docs.map(d => d.data())));
    onSnapshot(collection(db, "registrations"), (s) => setRegistrations(s.docs.map(d => d.data())));
    onSnapshot(collection(db, "events"), (s) => setEvents(s.docs.map(d => d.data())));
  }, []);

  const analytics = useMemo(() => {
    const caseTotal = cases.reduce((acc, curr) => acc + (curr.totalContractAmount || 0), 0);
    const regTotal = registrations.reduce((acc, curr) => acc + (curr.monthlyRent || 0), 0);
    const overdue = cases.filter(c => {
      const diff = Math.floor((new Date().getTime() - new Date(c.stageStartedAt).getTime()) / (1000 * 60 * 60 * 24));
      return diff >= 7;
    }).length;
    return { totalARPU: caseTotal + regTotal, overdue, totalActive: cases.length + registrations.length + events.length };
  }, [cases, registrations]);

  if (!hasMounted) return <div className="flex-1 h-screen bg-slate-50/30" />;

  return (
    <div className="flex-1 h-screen overflow-y-auto bg-[#F8FAFC] font-sans custom-scrollbar p-12">
      <div className="max-w-[1400px] mx-auto">
        <header className="mb-14 flex flex-col lg:flex-row lg:items-center justify-between gap-8">
          <div className="space-y-3">
            <div className="flex items-center gap-3"><div className="h-2 w-2 rounded-full bg-blue-600 animate-pulse" /><span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Executive Decision Support</span></div>
            <h1 className="text-4xl font-black text-slate-900 tracking-tighter italic underline decoration-blue-500/20">內控指揮中心</h1>
          </div>
          <div className="flex bg-white p-2 rounded-2xl shadow-sm border">{["今日", "本週", "本月"].map(t => <button key={t} className={`px-6 py-2.5 rounded-xl text-xs font-black transition-all ${t === "本月" ? "bg-slate-900 text-white shadow-lg" : "text-slate-400 hover:bg-slate-50"}`}>{t}</button>)}</div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-12">
          <AnalyticCard title="當前預計營收" value={formatCurrency(analytics.totalARPU)} hint="實時串接 Firestore" trend="↑ 12.5%" />
          <AnalyticCard title="全系統警示數" value={analytics.overdue} hint="逾期 7 天未更動案" type={analytics.overdue > 0 ? "danger" : "default"} trend={analytics.overdue > 0 ? "⚠ 需注意" : "✔ 正常"} trendType={analytics.overdue > 0 ? "down" : "up"} />
          <AnalyticCard title="總活躍案件量" value={analytics.totalActive} hint="跨模組整合統計" trend="↑ 5" />
          <AnalyticCard title="業務轉換率" value="82.4%" hint="Demo：結案效率評比" type="success" trend="↑ 2.1%" />
        </div>

        <div className="space-y-12">
          {/* ✅ 更新點：DecisionChatbot 現在是淺色背景 */}
          <DecisionChatbot cases={cases} totalARPU={analytics.totalARPU} />
          
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
            <div className="lg:col-span-8">
              <LineChartCard title="📈 成長趨勢透視" subtitle="營收波動分析 (結合模擬趨勢)" xLabels={["9月", "10月", "11月", "12月", "1月", "2月"]} series={[{ key: "r", values: [analytics.totalARPU*0.85, analytics.totalARPU*0.92, analytics.totalARPU*1.05, analytics.totalARPU*0.98, analytics.totalARPU*1.1, analytics.totalARPU] }]} yFormatter={formatCurrency} hintRight="Trend Analysis" />
            </div>
            <div className="lg:col-span-4"><RevenuePieChart cases={cases.length} regs={registrations.length} evts={events.length} /></div>
          </div>

          <div className="bg-white rounded-[40px] border p-12 shadow-sm">
            <h3 className="text-lg font-black text-slate-900 mb-10 flex justify-between items-center">🏢 各館別業績貢獻分配 <span className="text-[10px] font-black bg-blue-50 text-blue-500 px-3 py-1 rounded-full">REAL-TIME DATA</span></h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-24 gap-y-10">
              {["四維館", "民權20樓", "民權21樓", "民權27樓", "民權28樓"].map((name, i) => {
                const amount = cases.filter(c => c.building === name).reduce((acc, curr) => acc + (curr.totalContractAmount || 0), 0);
                return (
                  <div key={name} className="group">
                    <div className="flex justify-between items-center mb-4"><span className="text-xs font-black text-slate-500 uppercase tracking-tighter">{name}</span><span className="text-sm font-black text-slate-800">{formatCurrency(amount)}</span></div>
                    <div className="h-2.5 w-full bg-slate-50 rounded-full overflow-hidden border">
                      <div className={`h-full transition-all duration-[1500ms] ${["bg-blue-600","bg-indigo-500","bg-emerald-500","bg-amber-500","bg-rose-500"][i]}`} style={{ width: `${analytics.totalARPU > 0 ? (amount/analytics.totalARPU)*100 : 0}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      <style dangerouslySetInnerHTML={{ __html: `.custom-scrollbar::-webkit-scrollbar { width: 8px; height: 8px; } .custom-scrollbar::-webkit-scrollbar-track { background: transparent; } .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }` }} />
    </div>
  );
}