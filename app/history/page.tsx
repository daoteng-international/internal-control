"use client";

import { useState } from "react";

interface HistoryLog {
  id: string;
  caseId: string;
  caseTitle: string;
  user: string;
  action: string;
  details: string;
  timestamp: string;
}

const MOCK_HISTORY: HistoryLog[] = [
  { id: "H-001", caseId: "L-003", caseTitle: "50P 擴編搬遷案", user: "陳XX", action: "階段變更", details: "從 S1 進入 S2", timestamp: "2026-01-07 15:30" },
  { id: "H-002", caseId: "L-001", caseTitle: "30-40P 辦公室需求", user: "王小明", action: "資料更新", details: "修改報價金額為 $190,000", timestamp: "2026-01-07 14:20" },
  { id: "H-003", caseId: "L-003", caseTitle: "50P 擴編搬遷案", user: "系統監控", action: "逾期警示", details: "停留超過 7 天，自動發送通知", timestamp: "2026-01-07 09:00" },
];

export default function HistoryPage() {
  return (
    <div className="p-8">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800">📜 全域歷程記錄</h1>
        <p className="text-sm text-slate-500 mt-2">
          管理員專用：監控系統內所有案件的異動軌跡與內控節點。
        </p>
      </header>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-6 py-4 font-bold text-slate-700">時間</th>
              <th className="px-6 py-4 font-bold text-slate-700">執行者</th>
              <th className="px-6 py-4 font-bold text-slate-700">案件名稱</th>
              <th className="px-6 py-4 font-bold text-slate-700">類型</th>
              <th className="px-6 py-4 font-bold text-slate-700">變動詳情</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {MOCK_HISTORY.map((log) => (
              <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-6 py-4 text-slate-500 font-mono">{log.timestamp}</td>
                <td className="px-6 py-4 font-medium text-slate-700">{log.user}</td>
                <td className="px-6 py-4 text-slate-600">
                  <span className="text-xs bg-slate-100 px-2 py-0.5 rounded mr-2">{log.caseId}</span>
                  {log.caseTitle}
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${
                    log.action === "逾期警示" ? "bg-red-100 text-red-600" : "bg-blue-100 text-blue-600"
                  }`}>
                    {log.action}
                  </span>
                </td>
                <td className="px-6 py-4 text-slate-500">{log.details}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}