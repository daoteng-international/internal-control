"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { collection, query, onSnapshot, orderBy, limit } from "firebase/firestore";
import { db } from "../lib/firebase";

// --- 工具函數：格式化為台幣明確金額 ---
function formatCurrency(n: number) {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(n);
}

// --- 子組件：數據統計卡片 ---
function StatCard({ title, value, hint, trend, type = "default", href }: any) {
  const styles = {
    default: "border-slate-200 bg-white hover:border-blue-300",
    danger: "border-red-200 bg-red-50/30 hover:border-red-400 ring-red-100 hover:ring-4",
    warning: "border-amber-200 bg-amber-50/30 hover:border-amber-400 ring-amber-100 hover:ring-4",
  };

  const cardContent = (
    <div className={`h-full rounded-2xl border p-6 shadow-sm transition-all duration-300 ${styles[type as keyof typeof styles]} ${href ? 'cursor-pointer' : ''}`}>
      <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">{title}</div>
      <div className="mt-3 flex items-baseline gap-2">
        <div className={`text-2xl font-bold ${type === "danger" ? "text-red-600" : "text-slate-800"}`}>{value}</div>
        {trend && <span className={`text-xs font-medium ${trend.startsWith('↑') ? 'text-emerald-500' : 'text-red-500'}`}>{trend}</span>}
      </div>
      <div className="mt-2 text-[11px] text-slate-400 font-medium">{hint}</div>
      {href && (
        <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between text-[10px] font-bold text-blue-600">
          立即跳轉處理 →
        </div>
      )}
    </div>
  );

  return href ? <Link href={href}>{cardContent}</Link> : cardContent;
}

// --- 子組件：最新公告摘要 ---
function AnnouncementWidget() {
  const [announcements, setAnnouncements] = useState<any[]>([]);

  useEffect(() => {
    const q = query(collection(db, "announcements"), orderBy("date", "desc"), limit(3));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAnnouncements(data);
    });
    return () => unsubscribe();
  }, []);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex justify-between items-center mb-5">
        <h3 className="font-bold text-slate-800 flex items-center gap-2">📢 最新公告</h3>
        <Link href="/announcements" className="text-[11px] font-bold text-blue-600 hover:underline">查看全部</Link>
      </div>
      <div className="space-y-4">
        {announcements.map((item) => (
          <div key={item.id} className="flex items-center justify-between group cursor-pointer border-b border-slate-50 pb-3 last:border-0 last:pb-0">
            <div className="flex items-center gap-3">
              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${item.type === "重要" ? "bg-red-100 text-red-600" : "bg-slate-100 text-slate-500"}`}>
                {item.type || "通知"}
              </span>
              <p className="text-sm text-slate-600 group-hover:text-blue-600 transition-colors line-clamp-1 italic">{item.title}</p>
            </div>
            <span className="text-[10px] text-slate-400 font-mono">{item.date}</span>
          </div>
        ))}
        {announcements.length === 0 && <div className="text-xs text-slate-400 italic">目前尚無公告</div>}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [hasMounted, setHasMounted] = useState(false);
  const [timeRange, setTimeRange] = useState("本月"); 
  const [liveCases, setLiveCases] = useState<any[]>([]);

  useEffect(() => {
    setHasMounted(true);
    const q = query(collection(db, "cases"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const casesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setLiveCases(casesData);
    });
    return () => unsubscribe();
  }, []);

  // --- 計算各館數據 (明確金額版) ---
  const buildingData = useMemo(() => {
    const buildings = ["四維館", "民權20樓", "民權21樓", "民權27樓", "民權28樓"];
    const colors = ["bg-blue-500", "bg-emerald-500", "bg-indigo-500", "bg-amber-500", "bg-rose-500"];

    return buildings.map((name, index) => {
      const filtered = liveCases.filter(c => c.building === name);
      const totalInBuilding = filtered.reduce((acc, curr) => acc + (curr.totalContractAmount || 0), 0);
      return {
        name,
        amount: totalInBuilding, // 直接儲存完整金額
        color: colors[index % colors.length],
        cases: filtered.length
      };
    }).filter(b => b.cases > 0);
  }, [liveCases]);

  const totalAmount = useMemo(() => buildingData.reduce((acc, curr) => acc + curr.amount, 0), [buildingData]);

  const overdueCount = useMemo(() => {
    const today = new Date();
    return liveCases.filter(c => {
      const startedAt = new Date(c.stageStartedAt);
      const diff = Math.floor((today.getTime() - startedAt.getTime()) / (1000 * 60 * 60 * 24));
      return diff >= 7;
    }).length;
  }, [liveCases]);

  if (!hasMounted) return <div className="flex-1 h-screen bg-slate-50/50" />;

  return (
    <div className="flex-1 h-screen overflow-y-auto bg-slate-50/50">
      <div className="max-w-6xl p-8 pb-20">
        <header className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Dashboard</h2>
            <p className="mt-2 text-sm text-slate-500">即時監控內控數據，連動 Firestore 資料庫。</p>
          </div>
          <div className="flex bg-white p-1 rounded-xl border border-slate-200 shadow-sm w-fit">
            {["今日", "本週", "本月"].map((range) => (
              <button key={range} onClick={() => setTimeRange(range)} className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${timeRange === range ? "bg-slate-800 text-white shadow-md" : "text-slate-500 hover:bg-slate-50"}`}>{range}</button>
            ))}
          </div>
        </header>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3 mb-8">
          <StatCard
            title={`${timeRange} 進行中總額`}
            value={formatCurrency(totalAmount)}
            hint="S1 ~ S7 階段合約總產值"
          />
          <StatCard
            title="逾期警示案件"
            value={overdueCount.toString()}
            hint="停留超過 7 天未變動"
            type={overdueCount > 0 ? "danger" : "default"}
            href="/cases"
          />
          <StatCard
            title="總活躍案件"
            value={liveCases.length.toString()}
            hint="目前所有執行中的出租案"
            type="warning"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-bold text-slate-800 flex items-center gap-2">🏢 各館別業績佔比</h3>
                <span className="text-[10px] font-bold text-slate-400">即時同步 Firebase</span>
              </div>
              <div className="space-y-6">
                {buildingData.map((b) => (
                  <div key={b.name} className="space-y-2">
                    <div className="flex justify-between items-end">
                      <div className="text-xs font-bold text-slate-600">{b.name} <span className="font-normal text-slate-400 ml-1">({b.cases} 件)</span></div>
                      <div className="text-sm font-bold text-slate-800">{formatCurrency(b.amount)}</div>
                    </div>
                    <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div className={`${b.color} h-full rounded-full transition-all duration-1000`} style={{ width: `${totalAmount > 0 ? (b.amount / totalAmount) * 100 : 0}%` }}></div>
                    </div>
                  </div>
                ))}
                {buildingData.length === 0 && <div className="text-sm text-slate-400 text-center py-10">尚無案件數據</div>}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <AnnouncementWidget />
          </div>
        </div>
      </div>
    </div>
  );
}