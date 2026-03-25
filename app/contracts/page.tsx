"use client";

import { useState, useMemo, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";

type ContractCategory = "辦公室出租" | "工商登記" | "活動管理";

interface Contract {
  id: string;
  category: ContractCategory;
  contractNo: string;
  customer: string;
  taxId: string;
  actualRentInclTax: number; 
  totalContractAmount: number; 
  startDate: string;
  endDate: string;
  fileAttached: boolean;
  fileUrl: string; 
}

function currency(n: number) {
  return new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 }).format(n || 0);
}

export default function ContractPage() {
  const [hasMounted, setHasMounted] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState<ContractCategory | "全部">("全部");
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    setHasMounted(true);
    // 💡 監聽 members 集合
    const q = query(collection(db, "members"), orderBy("updatedAt", "desc"));
    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((doc) => {
        const d = doc.data();
        
        // 💡 修正類別判斷邏輯：如果不是工商或活動，就歸類為辦公室出租
        let category: ContractCategory = "辦公室出租";
        if (d.productLines?.includes("工商登記")) category = "工商登記";
        else if (d.productLines?.includes("活動管理")) category = "活動管理";

        // 💡 修正檔案讀取邏輯：優先讀取 attachments 陣列中的第一個檔案
        const hasAttachments = Array.isArray(d.attachments) && d.attachments.length > 0;
        const fileUrl = hasAttachments ? d.attachments[0].url : (d.fileUrl || "");

        return {
          id: doc.id,
          category,
          contractNo: d.contractNo || d.taxId || "無編號",
          customer: d.companyName || d.customer || "未知客戶",
          taxId: d.taxId || "-",
          actualRentInclTax: d.actualRentInclTax || 0,
          totalContractAmount: d.totalContractAmount || 0,
          startDate: d.contractStartDate || d.startDate || "-",
          endDate: d.contractEndDate || d.endDate || "-",
          fileAttached: hasAttachments || !!d.fileUrl,
          fileUrl: fileUrl
        } as Contract;
      });
      setContracts(data);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const filteredData = useMemo(() => {
    return contracts.filter(c => {
      const matchSearch = c.customer.includes(searchQuery) || c.taxId.includes(searchQuery);
      const matchCat = filterCategory === "全部" || c.category === filterCategory;
      return matchSearch && matchCat;
    });
  }, [contracts, searchQuery, filterCategory]);

  if (!hasMounted) return null;

  return (
    <div className="flex-1 h-screen overflow-y-auto bg-[#F8FAFC] p-12 text-slate-900">
      <div className="max-w-7xl mx-auto space-y-10">
        <header className="flex justify-between items-end pb-8 border-b border-slate-200">
          <div>
            <h1 className="text-4xl font-black tracking-tighter italic text-slate-900">CONTRACTS <span className="text-indigo-600">HUB</span></h1>
            <p className="text-slate-400 font text-xs mt-2 uppercase tracking-widest">全系統合約與附件管理中心</p>
          </div>
          <div className="flex gap-4">
            <input 
              type="text" 
              placeholder="搜尋公司名稱或統編..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-white border border-slate-200 rounded-2xl px-6 py-3 text-sm focus:ring-2 ring-indigo-500/20 outline-none w-80 shadow-sm transition-all"
            />
          </div>
        </header>

        <div className="flex gap-2">
          {["全部", "辦公室出租", "工商登記", "活動管理"].map((cat) => (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat as any)}
              className={`px-6 py-2.5 rounded-xl text-xs font-black transition-all ${
                filterCategory === cat 
                ? "bg-slate-900 text-white shadow-lg shadow-slate-200" 
                : "bg-white text-slate-400 hover:bg-slate-50 border border-slate-100"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="bg-white rounded-[40px] border border-slate-100 shadow-xl shadow-slate-200/50 overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">類別</th>
                <th className="px-6 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">客戶名稱 / 統編</th>
                <th className="px-6 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">合約期間</th>
                <th className="px-6 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">總產值</th>
                <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">實體附件</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredData.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-8 py-8">
                    <span className={`px-3 py-1.5 rounded-lg text-[10px] font-black ${
                      item.category === '辦公室出租' ? 'bg-blue-50 text-blue-600' :
                      item.category === '工商登記' ? 'bg-emerald-50 text-emerald-600' : 'bg-purple-50 text-purple-600'
                    }`}>
                      {item.category}
                    </span>
                  </td>
                  <td className="px-6 py-8">
                    <div className="font-black text-slate-900 text-sm group-hover:text-indigo-600 transition-colors">{item.customer}</div>
                    <div className="text-[10px] font text-slate-400 mt-1 uppercase tracking-tighter">TAX ID: {item.taxId}</div>
                  </td>
                  <td className="px-6 py-8">
                    <div className="text-xs font text-slate-600">{item.startDate}</div>
                    <div className="text-[10px] font-medium text-slate-400 italic">至 {item.endDate}</div>
                  </td>
                  <td className="px-6 py-8 text-right font-black text-slate-900">{currency(item.totalContractAmount)}</td>
                  <td className="px-8 py-8 text-center">
                    {item.fileAttached ? (
                      <button 
                        onClick={() => setPreviewUrl(item.fileUrl)} 
                        className="inline-flex items-center gap-2 text-indigo-600 font-black text-xs hover:bg-indigo-600 hover:text-white px-5 py-2 rounded-xl transition-all border border-indigo-100"
                      >
                        📄 查看掃描檔
                      </button>
                    ) : (
                      <span className="text-rose-400 text-[10px] font italic bg-rose-50 px-3 py-1.5 rounded-lg border border-rose-100">⚠️ 尚未上傳</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredData.length === 0 && !loading && (
            <div className="p-20 text-center text-slate-300 font italic">目前尚無符合條件的合約資料</div>
          )}
        </div>
      </div>

      {previewUrl && (
        <div className="fixed inset-0 z-[200] bg-slate-900/90 backdrop-blur-md flex flex-col p-10 animate-in fade-in duration-300">
          <div className="flex justify-between items-center mb-6 text-white max-w-6xl mx-auto w-full">
            <h3 className="text-2xl font-black italic">合約原件預覽</h3>
            <button onClick={() => setPreviewUrl(null)} className="w-12 h-12 flex items-center justify-center rounded-full bg-white/10 hover:bg-rose-500 transition-all text-2xl">✕</button>
          </div>
          <div className="flex-1 max-w-6xl mx-auto w-full bg-white rounded-[32px] overflow-hidden shadow-2xl border-8 border-white/10">
            <iframe src={previewUrl} className="w-full h-full border-none" title="Contract Preview" />
          </div>
        </div>
      )}
    </div>
  );
}