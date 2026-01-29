"use client";

import { useState, useMemo, useEffect } from "react";
// --- 引入 Firebase 功能 ---
import { db } from "@/lib/firebase";
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy 
} from "firebase/firestore";

// --- 類型定義 ---
type BuildingId = "四維館" | "民權20樓" | "民權21樓" | "民權27樓" | "民權28樓";
type CustomerStatus = "承租中" | "洽談中" | "已退租";
type TaxType = "應稅(5%)" | "免稅/未稅";

interface SpecialRequirement {
  date: string;
  category: "行政" | "硬體" | "服務";
  content: string;
}

interface Customer {
  id: string;
  companyName: string; 
  taxId: string;       
  boss: string;         
  contactPerson: string;
  phone: string;       
  building: BuildingId;
  roomNo: string;      
  taxType: TaxType;
  actualRentExclTax: number; 
  actualRentInclTax: number; 
  contractMonths: number;    
  totalContractAmount: number; 
  status: CustomerStatus;
  contractStartDate?: string; 
  contractEndDate?: string;   
  specialRequirements: SpecialRequirement[];
  updatedAt: string;
}

// --- 工具函數 ---
function currency(n: number) {
  return new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 }).format(n);
}

// --- 子組件：客戶詳細資料側邊欄 ---
function CustomerDetailDrawer({ 
  item, 
  onClose 
}: { 
  item: Customer | null; 
  onClose: () => void 
}) {
  const [activeTab, setActiveTab] = useState<"profile" | "requirements">("profile");

  useEffect(() => {
    if (item) setActiveTab("profile");
  }, [item]);

  if (!item) return null;

  return (
    <div className="fixed inset-0 z-[100] flex justify-end">
      <div className="absolute inset-0 bg-slate-500/20 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-300">
        <header className="px-6 pt-6 border-b bg-white sticky top-0 z-10">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-3">
              <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                item.status === "承租中" ? "bg-emerald-100 text-emerald-600" : 
                item.status === "洽談中" ? "bg-blue-100 text-blue-600" : "bg-slate-100 text-slate-500"
              }`}>
                {item.status}
              </span>
              <h2 className="text-2xl font-black text-slate-800 tracking-tight">客戶檔案詳情</h2>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl transition-colors">✕</button>
          </div>
          <div className="flex gap-8">
            <button onClick={() => setActiveTab("profile")} className={`pb-4 text-[15px] font-bold transition-all border-b-2 ${activeTab === "profile" ? "text-blue-600 border-blue-600" : "text-slate-400 border-transparent hover:text-slate-600"}`}>基本檔案與財務</button>
            <button onClick={() => setActiveTab("requirements")} className={`pb-4 text-[15px] font-bold transition-all border-b-2 ${activeTab === "requirements" ? "text-blue-600 border-blue-600" : "text-slate-400 border-transparent hover:text-slate-600"}`}>特殊需求記事本 ({item.specialRequirements?.length || 0})</button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto p-8">
          {activeTab === "profile" ? (
            <div className="space-y-10">
              <section className="space-y-4">
                <h3 className="text-sm font-bold border-l-4 border-indigo-600 pl-3 text-slate-800 uppercase tracking-widest">Corporate Profile / 公司概況</h3>
                <div className="grid grid-cols-2 gap-6 bg-slate-50/50 p-6 rounded-2xl border border-slate-100 shadow-inner">
                  <div className="col-span-2">
                    <label className="text-xs font-bold text-slate-400 uppercase">公司全銜</label>
                    <div className="text-[17px] font-bold text-slate-800 mt-1">{item.companyName}</div>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase">統一編號</label>
                    <div className="text-base font-mono font-bold text-slate-700 mt-1">{item.taxId}</div>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase">稅別設定</label>
                    <div className="mt-1 font-bold text-base text-slate-600">{item.taxType}</div>
                  </div>
                </div>
              </section>
              <section className="space-y-4">
                <h3 className="text-sm font-bold border-l-4 border-blue-500 pl-3 text-slate-800 uppercase tracking-widest">Contact / 聯絡資訊</h3>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase">主要聯絡窗口</label>
                    <div className="text-base font-bold text-slate-700 mt-1 border-b py-2">{item.contactPerson}</div>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase">聯絡電話</label>
                    <div className="text-base font-mono font-bold text-slate-700 mt-1 border-b py-2">{item.phone}</div>
                  </div>
                </div>
              </section>
              <section className="space-y-4">
                <h3 className="text-sm font-bold border-l-4 border-emerald-500 pl-3 text-slate-800 uppercase tracking-widest">Leasing & Finance / 現行租賃財務</h3>
                <div className="bg-emerald-50/30 p-6 rounded-2xl border border-emerald-100 space-y-6">
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <label className="text-[11px] font-bold text-emerald-600 uppercase tracking-widest">承租房號</label>
                      <div className="text-base font-bold text-slate-800 mt-1">{item.roomNo} 房 ({item.building})</div>
                    </div>
                    <div className="md:block hidden"></div>
                    <div>
                      <label className="text-[11px] font-bold text-emerald-600 uppercase">合約起日</label>
                      <div className="text-base font-mono font-bold text-slate-800 mt-1">{item.contractStartDate || "-"}</div>
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-emerald-600 uppercase">合約迄日</label>
                      <div className="text-base font-mono font-bold text-slate-800 mt-1">{item.contractEndDate || "-"}</div>
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-emerald-600 uppercase">實際月租 (未稅)</label>
                      <div className="text-base font-bold text-emerald-700 mt-1">{currency(item.actualRentExclTax)}</div>
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-400 uppercase">實際月租 (含稅結果)</label>
                      <div className="text-base font-bold text-slate-500 mt-1">{currency(item.actualRentInclTax)}</div>
                    </div>
                  </div>
                  <div className="pt-4 grid grid-cols-2 gap-4 border-t border-emerald-100">
                    <div className="text-center p-4 bg-white rounded-xl shadow-sm">
                      <div className="text-xs font-bold text-slate-400 uppercase mb-1">總期數</div>
                      <div className="text-2xl font-black text-indigo-600">{item.contractMonths} <span className="text-sm">個月</span></div>
                    </div>
                    <div className="text-center p-4 bg-white rounded-xl shadow-sm">
                      <div className="text-xs font-bold text-slate-400 uppercase mb-1">合約總產值</div>
                      <div className="text-2xl font-black text-slate-800">{currency(item.totalContractAmount)}</div>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="text-base font-bold text-slate-800">特殊需求與備註記事</h3>
                <button className="text-xs bg-slate-900 text-white px-4 py-1.5 rounded-full font-bold shadow-md">+ 新增筆記</button>
              </div>
              <div className="space-y-4">
                {item.specialRequirements?.map((req, idx) => (
                  <div key={idx} className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
                    <div className="flex justify-between items-center mb-3">
                      <span className={`px-2.5 py-1 rounded text-[11px] font-bold ${req.category === "行政" ? "bg-blue-100 text-blue-600" : req.category === "硬體" ? "bg-orange-100 text-orange-600" : "bg-purple-100 text-purple-600"}`}>{req.category}</span>
                      <span className="text-xs text-slate-400 font-mono">{req.date}</span>
                    </div>
                    <p className="text-base text-slate-700 leading-relaxed font-medium">{req.content}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <footer className="p-6 border-t bg-slate-50 flex gap-4">
          <button onClick={onClose} className="flex-1 bg-white border border-slate-200 text-slate-600 py-4 rounded-xl font-bold hover:bg-slate-100 transition-all uppercase text-sm">關閉詳情</button>
          <button className="flex-1 bg-slate-900 text-white py-4 rounded-xl font-bold hover:bg-slate-800 transition-all uppercase text-sm tracking-widest shadow-lg">編輯客戶資料</button>
        </footer>
      </div>
    </div>
  );
}

// --- 主頁面 ---
export default function CustomerManagementPage() {
  const [hasMounted, setHasMounted] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { 
    setHasMounted(true); 
    const q = query(collection(db, "members"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const memberList = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          companyName: data.name || "未定義公司",
          taxId: data.id || "無統編",
          boss: data.boss || "未填寫",
          contactPerson: data.contactPerson || "未填寫",
          phone: data.phone || "無電話",
          building: data.building || "四維館",
          roomNo: data.roomNo || "未定",
          taxType: data.taxType || "應稅(5%)",
          actualRentExclTax: data.actualRentExclTax || 0,
          actualRentInclTax: data.actualRentInclTax || 0,
          contractMonths: data.contractMonths || 0,
          totalContractAmount: data.totalContractAmount || 0,
          status: data.status || "承租中",
          contractStartDate: data.contractStartDate || data.contractDate,
          contractEndDate: data.contractEndDate || "",
          specialRequirements: data.specialRequirements || [],
          updatedAt: data.updatedAt || ""
        } as Customer;
      });
      setCustomers(memberList);
      setLoading(false);
    }, (error) => {
      console.error("Firebase 監聽失敗:", error);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const filteredCustomers = useMemo(() => {
    return customers.filter(c => 
      c.companyName.toLowerCase().includes(searchQuery.toLowerCase()) || 
      c.taxId.includes(searchQuery)
    );
  }, [searchQuery, customers]);

  if (!hasMounted || loading) return <div className="flex-1 h-screen flex items-center justify-center bg-slate-50/30 font-bold text-slate-400 italic">載入客戶名單中...</div>;

  return (
    <div className="flex-1 h-screen overflow-y-auto bg-slate-50/30 p-8 font-sans">
      <div className="max-w-7xl mx-auto">
        <header className="mb-10 flex justify-between items-end">
          <div>
            <h1 className="text-[28px] font-black text-slate-800 tracking-tight flex items-center gap-3 italic underline decoration-blue-500/30">客戶資料管理</h1>
            <p className="text-sm text-slate-400 mt-2 font-medium">集中管理客戶全銜、稅別屬性及現行租約財務數據。</p>
          </div>
          <button className="bg-slate-900 text-white px-6 py-3 rounded-xl font-bold text-sm shadow-lg hover:bg-slate-800 active:scale-95 transition-all">+ 新增客戶</button>
        </header>

        <div className="mb-8 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex justify-end gap-4">
          <input 
            type="text" 
            placeholder="搜尋公司名稱或統編..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-5 pr-10 py-3 border border-slate-200 rounded-xl text-sm w-80 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition-all font-medium"
          />
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {/* 標題列字體調整：放大至 text-base (16px) 並移除 tracking-widest 以符合下方客戶名稱視覺 */}
                <th className="px-6 py-5 font-bold text-slate-700 text-base">公司名稱 / 統編</th>
                <th className="px-6 py-5 font-bold text-slate-700 text-base">稅別</th>
                <th className="px-6 py-5 font-bold text-slate-700 text-base">現行房號</th>
                <th className="px-6 py-5 font-bold text-slate-700 text-base">當前月租(含稅)</th>
                <th className="px-6 py-5 font-bold text-slate-700 text-base">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredCustomers.map(item => (
                <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-6">
                    <div className="text-base font-bold text-slate-800 mb-1">{item.companyName}</div>
                    <div className="text-xs text-slate-400 font-mono tracking-tighter italic">TAX ID: {item.taxId}</div>
                  </td>
                  <td className="px-6 py-6">
                    <span className={`px-3 py-1.5 rounded-lg font-bold text-[11px] border ${
                      item.taxType === "應稅(5%)" ? "bg-blue-50 text-blue-600 border-blue-100" : "bg-slate-50 text-slate-400 border-slate-200"
                    }`}>
                      {item.taxType}
                    </span>
                  </td>
                  <td className="px-6 py-6">
                    <div className="text-[15px] text-slate-700 font-bold">{item.roomNo} 房</div>
                    <div className="text-xs text-slate-400 mt-1 font-medium">{item.building}</div>
                  </td>
                  <td className="px-6 py-6 text-base text-slate-800 font-bold">
                    {currency(item.actualRentInclTax)}
                  </td>
                  <td className="px-6 py-6">
                    <button 
                      onClick={() => setSelectedCustomer(item)}
                      className="text-slate-500 border border-slate-200 px-4 py-2 rounded-xl text-xs font-bold hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-all shadow-sm"
                    >
                      查看詳情
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredCustomers.length === 0 && (
            <div className="py-24 text-center text-slate-400 italic text-sm font-medium">尚無符合搜尋條件的客戶資料</div>
          )}
        </div>
      </div>

      <CustomerDetailDrawer 
        item={selectedCustomer} 
        onClose={() => setSelectedCustomer(null)} 
      />
    </div>
  );
}