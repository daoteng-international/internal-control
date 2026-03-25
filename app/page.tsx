"use client";

import { useState, useEffect, useMemo } from "react";
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
function AnalyticCard({ title, value, hint, trend, trendType = "up", type = "default", onClick }: any) {
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
                                 item.source === '工商' ? '/registrations' : '/events';
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
                    {item.createdAt ? item.createdAt.substring(0, 10) : "-"}
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
        <div className={`h-full absolute left-0 top-0 rounded-full transition-all duration-[800ms] ease-out ${colorClass}`} style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

function DataSection({ title, tag, themeColor, children }: any) {
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
    </div>
  );
}

export default function ProfessionalDashboard() {
  const [hasMounted, setHasMounted] = useState(false);
  const [cases, setCases] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [activeView, setActiveView] = useState<string | null>(null);
  const [timeFilter, setTimeFilter] = useState("本月");

  useEffect(() => {
    setHasMounted(true);
    const unsubCases = onSnapshot(collection(db, "cases"), (s) => setCases(s.docs.map(d => ({ ...d.data(), id: d.id, source: '辦公室' }))));
    const unsubMembers = onSnapshot(collection(db, "members"), (s) => setMembers(s.docs.map(d => ({ ...d.data(), id: d.id }))));
    return () => { unsubCases(); unsubMembers(); };
  }, []);

  const { analytics, overdueList, revenueList, activeList, officeStats, regStats, eventStats, conversionRate } = useMemo(() => {
    const now = new Date();
    const nowTime = now.getTime();
    
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfQuarter = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    const checkTime = (createdAt: string) => {
      if (!createdAt) return false;
      const date = new Date(createdAt);
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
        source: m.productLines?.includes('工商登記') ? '工商' : '活動' 
      }))
    ].map(item => ({
      ...item,
      amount: item.totalContractAmount || 0
    }));

    const fullOverdue = allProcessed.filter(item => {
      const isFinished = ['S6', 'S8', 'S11', '已結案'].includes(item.stage);
      if (isFinished || !item.stageStartedAt) return false;

      const stageDate = new Date(item.stageStartedAt);
      if (isNaN(stageDate.getTime())) return false;

      const diffTime = nowTime - stageDate.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      
      const overdueThreshold = item.source === '辦公室' ? 7 : 3;
      return diffDays >= overdueThreshold;
    }).map(item => {
      const stageDate = new Date(item.stageStartedAt);
      const diffDays = Math.floor((nowTime - stageDate.getTime()) / (1000 * 60 * 60 * 24));
      return { ...item, isOverdue: true, overdueDays: diffDays };
    });

    const timeFilteredData = allProcessed.filter(item => checkTime(item.createdAt));
    const finishedByTime = timeFilteredData.filter(item => item.stage === 'S6' || item.stage === 'S8');
    const activeByTime = timeFilteredData.filter(item => !['S6', 'S8', 'S11'].includes(item.stage));

    const totalRev = finishedByTime.reduce((acc, curr) => acc + curr.amount, 0);

    const bldStats = ["四維館", "民權20樓", "民權21樓", "民權27樓", "民權28樓"].map(name => {
      const amt = finishedByTime.filter(i => i.source === '辦公室' && i.building === name).reduce((a, c) => a + c.amount, 0);
      return { name, amt };
    });

    const getProductStats = (tag: string) => {
      const items = timeFilteredData.filter(i => i.source === tag);
      const finished = items.filter(i => i.stage === 'S6' || i.stage === 'S8');
      const rev = finished.reduce((a, c) => a + c.amount, 0);
      const rate = items.length > 0 ? (finished.length / items.length) * 100 : 0;
      return { rev, rate, count: finished.length };
    };

    const currentRate = timeFilteredData.length > 0 ? (finishedByTime.length / timeFilteredData.length) * 100 : 0;

    const getPrevRate = () => {
      const prevData = allProcessed.filter(item => {
        const d = new Date(item.createdAt);
        if (timeFilter === "今日") return d >= new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1) && d < startOfDay;
        if (timeFilter === "本週") return d >= new Date(now.getFullYear(), now.getMonth(), now.getDate() - 14) && d < startOfWeek;
        return d >= new Date(now.getFullYear(), now.getMonth() - 1, 1) && d < startOfMonth;
      });
      const prevFinished = prevData.filter(i => i.stage === 'S6' || i.stage === 'S8');
      return prevData.length > 0 ? (prevFinished.length / prevData.length) * 100 : 0;
    };

    const prevRate = getPrevRate();
    const rateDiff = currentRate - prevRate; 

    return {
      // 💡 修正：將 trendText 與 trendType 包裝進 analytics 物件中
      analytics: { 
        totalRevenue: totalRev, 
        overdueCount: fullOverdue.length, 
        totalActive: timeFilteredData.length,
        trendText: `${rateDiff >= 0 ? "↑" : "↓"} ${Math.abs(rateDiff).toFixed(1)}%`,
        trendType: rateDiff >= 0 ? "up" : "down"
      },
      overdueList: fullOverdue, revenueList: finishedByTime, activeList: activeByTime,
      officeStats: bldStats,
      regStats: getProductStats('工商'),
      eventStats: getProductStats('活動'),
      conversionRate: currentRate
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
          <AnalyticCard title={`成交業績 (${timeFilter})`} value={formatCurrency(analytics.totalRevenue)} hint="點擊查看成交清單" onClick={() => toggleView('revenue')} type={activeView === 'revenue' ? 'success' : 'default'} trend="LIVE" />
          <AnalyticCard title="逾期風險監控" value={analytics.overdueCount} hint="顯示全系統未處理風險" type={analytics.overdueCount > 0 ? "danger" : "default"} trend={analytics.overdueCount > 0 ? "需核閱" : "正常"} trendType={analytics.overdueCount > 0 ? "down" : "up"} onClick={() => toggleView('overdue')} />
          <AnalyticCard title={`新增在辦案件 (${timeFilter})`} value={analytics.totalActive} hint="點擊查看本期新進案件" onClick={() => toggleView('active')} />
          <AnalyticCard 
            title="平均轉換率" 
            value={`${Math.round(conversionRate)}%`} 
            hint={`${timeFilter}期結案轉化指標`} 
            trend={analytics.trendText}  
            trendType={analytics.trendType} 
          />
        </div>

        {activeView === 'overdue' && <DetailList title="🚨 全系統逾期風險總覽" list={overdueList} themeColor="red" />}
        {activeView === 'revenue' && <DetailList title={`💰 本期成交案件明細 (${timeFilter})`} list={revenueList} themeColor="emerald" />}
        {activeView === 'active' && <DetailList title={`📁 本期新進活躍案件 (${timeFilter})`} list={activeList} themeColor="blue" />}

        <div className="space-y-12">
          <DataSection title={`辦公室租賃館別營收貢獻 (${timeFilter})`} tag="OFFICE LINE" themeColor="blue">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
              {officeStats.map((s, i) => (
                <MetricProgress key={s.name} label={s.name} value={formatCurrency(s.amt)} percentage={analytics.totalRevenue > 0 ? (s.amt/analytics.totalRevenue)*100 : 0} colorClass={["bg-blue-600","bg-indigo-500","bg-purple-500","bg-violet-500","bg-sky-500"][i]} />
              ))}
            </div>
          </DataSection>

          <DataSection title="工商登記績效指標" tag="REGISTRATION" themeColor="emerald">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
              <div className="space-y-8">
                <MetricProgress label={`${timeFilter}成交業績`} value={formatCurrency(regStats.rev)} percentage={analytics.totalRevenue > 0 ? (regStats.rev/analytics.totalRevenue)*100 : 0} colorClass="bg-emerald-600" />
                <MetricProgress label={`${timeFilter}成交轉換率`} value={`${Math.round(regStats.rate)}%`} percentage={regStats.rate} colorClass="bg-emerald-500" />
              </div>
              <div className="p-8 bg-emerald-50/50 rounded-3xl border border-emerald-100 shadow-inner flex flex-col items-center justify-center h-full min-h-[220px]">
                <p className="text-xs font-bold text-emerald-800/70 uppercase mb-3 tracking-wider">{timeFilter}成交件數</p>
                <div className="text-6xl font-black text-emerald-700">{regStats.count} <span className="text-base font-medium text-emerald-500/80">件</span></div>
              </div>
            </div>
          </DataSection>

          <DataSection title="活動管理績效指標" tag="EVENT SPACE" themeColor="amber">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
              <div className="space-y-8">
                <MetricProgress label={`${timeFilter}成交業績`} value={formatCurrency(eventStats.rev)} percentage={analytics.totalRevenue > 0 ? (eventStats.rev/analytics.totalRevenue)*100 : 0} colorClass="bg-amber-600" />
                <MetricProgress label={`${timeFilter}成交轉換率`} value={`${Math.round(eventStats.rate)}%`} percentage={eventStats.rate} colorClass="bg-amber-500" />
              </div>
              <div className="p-8 bg-amber-50/50 rounded-3xl border border-amber-100 shadow-inner flex flex-col items-center justify-center h-full min-h-[220px]">
                <p className="text-xs font-bold text-amber-800/70 uppercase mb-3 tracking-wider">{timeFilter}成交件數</p>
                <div className="text-6xl font-black text-amber-700">{eventStats.count} <span className="text-base font-medium text-amber-500/80">件</span></div>
              </div>
            </div>
          </DataSection>
        </div>
      </div>
      <style dangerouslySetInnerHTML={{ __html: `.custom-scrollbar::-webkit-scrollbar { width: 8px; height: 8px; } .custom-scrollbar::-webkit-scrollbar-track { background: transparent; } .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; } .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }` }} />
    </div>
  );
}