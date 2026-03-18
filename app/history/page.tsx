"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, query, onSnapshot, orderBy, limit } from "firebase/firestore";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";

interface HistoryLog {
  id: string;
  user: string;
  action: string;
  details: string;
  timestamp: string;
  type: "system" | "user" | "security";
}

export default function HistoryPage() {
  const [logs, setLogs] = useState<HistoryLog[]>([]);
  const [loading, setLoading] = useState(true);
  const { profile } = useAuth();
  const router = useRouter();

  // 💡 安全重定向：非管理員直接踢回首頁
  useEffect(() => {
    if (!loading && profile?.role !== "admin") {
      router.push("/");
    }
  }, [profile, loading, router]);

  useEffect(() => {
    // 💡 串接 Firebase 中的 logs 集合
    const q = query(collection(db, "logs"), orderBy("timestamp", "desc"), limit(50));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setLogs(snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate ? doc.data().timestamp.toDate().toLocaleString('zh-TW') : doc.data().timestamp
      })) as HistoryLog[]);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) return <div className="h-screen flex items-center justify-center font-bold text-slate-300">同步監控數據...</div>;

  return (
    <div className="flex-1 min-h-screen bg-slate-50/50 p-8 lg:p-12 font-sans">
      <div className="max-w-6xl mx-auto">
        <header className="mb-10 flex justify-between items-end">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-1.5 h-6 bg-slate-400 rounded-full shadow-sm"></div>
              <h1 className="text-2xl font-bold text-slate-700 tracking-tight">全域歷程記錄</h1>
            </div>
            <p className="text-[10px] text-slate-400 mt-1 font-semibold uppercase tracking-widest ml-4">System Activity & Audit Log</p>
          </div>
          <div className="bg-white px-4 py-2 rounded-xl border border-slate-100 shadow-sm text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
            🟢 實時監控中
          </div>
        </header>

        <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              <tr>
                <th className="px-8 py-5">執行時間</th>
                <th className="px-6 py-5">操作人員</th>
                <th className="px-6 py-5">動作類型</th>
                <th className="px-8 py-5">變動詳情</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-8 py-6 text-[11px] font-mono text-slate-400">{log.timestamp}</td>
                  <td className="px-6 py-6">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-400">👤</div>
                      <span className="font-bold text-slate-700 text-sm">{log.user}</span>
                    </div>
                  </td>
                  <td className="px-6 py-6">
                    <span className={`text-[9px] font-bold px-2 py-1 rounded uppercase ${
                      log.type === "security" ? "bg-red-50 text-red-500" : 
                      log.type === "user" ? "bg-blue-50 text-blue-500" : "bg-slate-100 text-slate-400"
                    }`}>
                      {log.action}
                    </span>
                  </td>
                  <td className="px-8 py-6 text-sm text-slate-500 font-medium">{log.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
          
          {logs.length === 0 && (
            <div className="text-center py-24">
              <p className="text-slate-300 font-bold text-xs uppercase tracking-widest">目前暫無任何操作記錄</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}