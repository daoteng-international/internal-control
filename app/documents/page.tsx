"use client";

import { useState, useMemo } from "react";

// --- 類型定義 ---
type DocCategory = "全部" | "館別手冊" | "作業規範" | "法務合約" | "系統教學";

interface DocumentItem {
  id: string;
  category: DocCategory;
  title: string;
  description: string;
  format: "PDF" | "DOCX" | "Video" | "Link";
  updatedAt: string;
  target: string; // 適用對象
}

const DOCS_DATA: DocumentItem[] = [
  { id: "D1", category: "作業規範", title: "S3 階段報價單上傳操作指引", description: "詳細說明如何製作符合內控規範的報價單並正確上傳至系統。", format: "PDF", updatedAt: "2026-01-05", target: "全體業務" },
  { id: "D2", category: "館別手冊", title: "四維館 - 帶看注意事項與設備清單", description: "包含公共空間使用規則、車位租賃權限及門禁卡設定流程。", format: "PDF", updatedAt: "2025-12-20", target: "營運/業務" },
  { id: "D3", category: "法務合約", title: "標準租賃合約範本 (2026 修訂版)", description: "法務部核核定之正式合約，包含特殊條款修改建議。", format: "DOCX", updatedAt: "2026-01-01", target: "業務/法務" },
  { id: "D4", category: "系統教學", title: "看板操作與多館別篩選教學影片", description: "兩分鐘快速上手新版看板操作與數據過濾功能。", format: "Video", updatedAt: "2026-01-06", target: "全體同仁" },
  { id: "D5", category: "作業規範", title: "財務開帳與押金入帳核對流程", description: "說明 S6 階段如何與財務部對接，確保帳款正確歸檔。", format: "PDF", updatedAt: "2025-11-15", target: "會計/營運" },
];

export default function DocumentPage() {
  const [activeTab, setActiveTab] = useState<DocCategory>("全部");
  const [isDownloading, setIsDownloading] = useState<string | null>(null);

  // 篩選邏輯
  const filteredDocs = useMemo(() => {
    return activeTab === "全部" 
      ? DOCS_DATA 
      : DOCS_DATA.filter(doc => doc.category === activeTab);
  }, [activeTab]);

  // 模擬下載功能
  const handleDownload = (id: string) => {
    setIsDownloading(id);
    setTimeout(() => {
      setIsDownloading(null);
      alert("文件已開始下載！(Demo 模擬)");
    }, 800);
  };

  return (
    <div className="flex-1 h-screen overflow-y-auto bg-slate-50/30 p-8">
      <div className="max-w-6xl mx-auto">
        
        {/* Header */}
        <header className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">📚 教育文件管理中心</h1>
            <p className="text-sm text-slate-500 mt-2">集中管理 SOP 作業規範、館別手冊與法務合約範本。</p>
          </div>
          
          <div className="flex bg-white p-1 rounded-2xl border border-slate-200 shadow-sm w-fit">
            {["全部", "館別手冊", "作業規範", "法務合約", "系統教學"].map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveTab(cat as DocCategory)}
                className={`px-4 py-2 text-xs font-bold rounded-xl transition-all ${
                  activeTab === cat ? "bg-slate-800 text-white shadow-md" : "text-slate-500 hover:bg-slate-50"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </header>

        {/* 文件網格 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredDocs.map((doc) => (
            <div 
              key={doc.id}
              className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col"
            >
              <div className="flex justify-between items-start mb-4">
                <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border ${
                  doc.format === "PDF" ? "bg-red-50 text-red-600 border-red-100" :
                  doc.format === "DOCX" ? "bg-blue-50 text-blue-600 border-blue-100" :
                  "bg-amber-50 text-amber-600 border-amber-100"
                }`}>
                  {doc.format}
                </span>
                <span className="text-[10px] text-slate-400 font-medium">更新於 {doc.updatedAt}</span>
              </div>

              <h3 className="font-bold text-slate-800 text-base mb-2 line-clamp-1">{doc.title}</h3>
              <p className="text-xs text-slate-500 leading-relaxed flex-1 line-clamp-2">
                {doc.description}
              </p>

              <div className="mt-6 pt-4 border-t border-slate-50 flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">適用對象</span>
                  <span className="text-xs font-bold text-slate-600">{doc.target}</span>
                </div>
                
                <button 
                  onClick={() => handleDownload(doc.id)}
                  disabled={isDownloading === doc.id}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                    isDownloading === doc.id 
                    ? "bg-slate-100 text-slate-400 cursor-wait" 
                    : "bg-slate-900 text-white hover:bg-blue-600 active:scale-95 shadow-md"
                  }`}
                >
                  {isDownloading === doc.id ? "處理中..." : (
                    <>
                      <span>{doc.format === "Video" ? "立即觀看" : "下載"}</span>
                      <span className="text-sm">↓</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* 底部內控提示 */}
        <div className="mt-12 bg-indigo-900 rounded-3xl p-8 text-white relative overflow-hidden shadow-2xl">
          <div className="relative z-10">
            <h4 className="text-lg font-bold mb-2">💡 內控稽核小提醒</h4>
            <p className="text-sm opacity-80 leading-relaxed max-w-2xl">
              所有文件均受企業版權保護。業務同仁在進行 S5 簽約用印前，請務必確認下載的版本為「2026 修訂版」，以符合最新公司治理與法務審閱規範。
            </p>
          </div>
          <div className="absolute top-[-50%] right-[-10%] w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>
        </div>

      </div>
    </div>
  );
}