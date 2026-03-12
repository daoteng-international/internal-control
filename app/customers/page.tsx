"use client";

import { useState, useMemo, useEffect } from "react";
// --- 引入 Firebase 功能 ---
import { db } from "@/lib/firebase";
import { 
  collection, 
  onSnapshot, 
  query, 
  addDoc,
  updateDoc,
  doc,
  serverTimestamp 
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
  companyName: string;      // 公司全銜
  customer: string;         // 客戶對象名稱
  contactPerson: string;    // 主要窗口/聯絡人
  email: string;            // 聯絡人信箱
  phone: string;            // 聯絡人電話
  bestContactTime: string;  // 方便聯繫時間
  tags: string[];           // 標籤 (分群用)
  note: string;             // 備註
  contractStartDate: string; // 合約起日
  contractEndDate: string;   // 合約迄日
  paymentCycle: string;      // 繳費週期
  taxId: string;       
  boss: string;         
  building: BuildingId;
  roomNo: string;      
  taxType: TaxType;
  actualRentExclTax: number; 
  actualRentInclTax: number; 
  contractMonths: number;    
  totalContractAmount: number; 
  status: CustomerStatus;
  specialRequirements: SpecialRequirement[];
  updatedAt: any;
}

// --- 工具函數 ---
function currency(n: number) {
  return new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 }).format(n);
}

// --- 子組件：表單標籤 ---
function RequiredLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-1 mb-2">
      {children} <span className="text-rose-500 text-base">*</span>
    </label>
  );
}

// --- 子組件：客戶編輯與新增側邊欄 ---
function CustomerFormDrawer({ 
  item, 
  isCreate,
  onClose,
  onSave
}: { 
  item: Customer | null; 
  isCreate: boolean;
  onClose: () => void;
  onSave: (data: Customer) => void;
}) {
  const [formData, setFormData] = useState<Partial<Customer>>({});
  const [activeTab, setActiveTab] = useState<"profile" | "requirements">("profile");
  const PRODUCT_TAGS = ["辦公室案件", "工商登記", "活動管理"];

  useEffect(() => {
    if (isCreate) {
      setFormData({
        companyName: "", contactPerson: "", phone: "", email: "", bestContactTime: "",
        tags: [], paymentCycle: "月繳", note: "", status: "洽談中",
        taxId: "", actualRentExclTax: 0, actualRentInclTax: 0, totalContractAmount: 0
      });
    } else if (item) {
      setFormData(item);
    }
  }, [item, isCreate]);

  const toggleTag = (tag: string) => {
    const current = formData.tags || [];
    setFormData({ ...formData, tags: current.includes(tag) ? current.filter(t => t !== tag) : [...current, tag] });
  };

  if (!item && !isCreate) return null;

  return (
    <div className="fixed inset-0 z-[100] flex justify-end font-sans">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-300">
        <header className="px-8 pt-8 bg-white border-b border-slate-100">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 className="text-2xl font-black text-slate-800 tracking-tight tracking-tight">
                {isCreate ? "🆕 新增客戶資料" : "📝 編輯客戶檔案"}
              </h2>
              <p className="text-sm text-slate-400 mt-1 font-medium">請填寫標準化欄位以確保跨產品線資料同步</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400">✕</button>
          </div>
          <div className="flex gap-8">
            <button onClick={() => setActiveTab("profile")} className={`pb-4 text-sm font-bold border-b-2 ${activeTab === "profile" ? "border-blue-600 text-blue-600" : "border-transparent text-slate-400"}`}>基本與財務資訊</button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8 space-y-10 bg-slate-50/30">
          <section className="space-y-4">
            <label className="text-xs font-black text-indigo-600 uppercase tracking-widest flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-indigo-600 rounded-full"></span> 產品線分群 (多選)
            </label>
            <div className="flex flex-wrap gap-3">
              {PRODUCT_TAGS.map(tag => (
                <button key={tag} onClick={() => toggleTag(tag)} className={`px-5 py-2.5 rounded-xl text-sm font-bold border-2 transition-all ${formData.tags?.includes(tag) ? "bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-100" : "bg-white border-slate-200 text-slate-400 hover:border-indigo-200"}`}>{tag}</button>
              ))}
            </div>
          </section>

          <section className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
            <div className="grid grid-cols-2 gap-x-6 gap-y-5">
              <div className="col-span-2">
                <RequiredLabel>公司全銜 / 案件名稱</RequiredLabel>
                <input value={formData.companyName || ""} onChange={e => setFormData({...formData, companyName: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:border-blue-500 outline-none font-bold" />
              </div>
              <div>
                <RequiredLabel>主要窗口姓名</RequiredLabel>
                <input value={formData.contactPerson || ""} onChange={e => setFormData({...formData, contactPerson: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none" />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 mb-2 block uppercase tracking-widest">聯絡電話</label>
                <input value={formData.phone || ""} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none" />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 mb-2 block uppercase tracking-widest">聯絡信箱</label>
                <input value={formData.email || ""} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none" />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 mb-2 block uppercase tracking-widest">方便聯繫時間</label>
                <input value={formData.bestContactTime || ""} onChange={e => setFormData({...formData, bestContactTime: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none" />
              </div>
            </div>
          </section>
        </div>

        <footer className="p-8 bg-white border-t border-slate-100 flex gap-4">
          <button onClick={onClose} className="flex-1 px-6 py-4 rounded-2xl font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 transition-all">取消</button>
          <button onClick={() => onSave(formData as Customer)} className="flex-[2] px-6 py-4 rounded-2xl font-black text-white bg-slate-900 hover:bg-black shadow-xl transition-all">確認並儲存資料</button>
        </footer>
      </div>
    </div>
  );
}

// --- 主頁面 ---
export default function CustomerManagementPage() {
  const [hasMounted, setHasMounted] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => { 
    setHasMounted(true); 
    const unsubscribe = onSnapshot(query(collection(db, "members")), (snapshot) => {
      setCustomers(snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          companyName: data.companyName || data.name || "未定義公司",
          contactPerson: data.contactPerson || "未填寫",
          taxId: data.taxId || data.id || "無統編",
          phone: data.phone || "無電話",
          tags: data.tags || [],
          roomNo: data.roomNo || "未定",
          actualRentInclTax: data.actualRentInclTax || 0,
        } as Customer;
      }));
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const filtered = useMemo(() => customers.filter(c => c.companyName.toLowerCase().includes(searchQuery.toLowerCase()) || c.taxId.includes(searchQuery)), [searchQuery, customers]);

  if (!hasMounted || loading) return <div className="flex-1 h-screen flex items-center justify-center bg-slate-50 text-slate-400 font-bold">載入中...</div>;

  return (
    <div className="flex-1 h-screen overflow-y-auto bg-slate-50/50 p-8 font-sans">
      <div className="max-w-7xl mx-auto">
        <header className="mb-10 flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-black text-slate-800 tracking-tight italic underline decoration-blue-500/30">客戶資料管理</h1>
            <p className="text-slate-400 mt-2 font-medium italic">集中管理跨產品線客戶全銜、窗口及財務主檔。</p>
          </div>
          <button onClick={() => setIsCreating(true)} className="bg-slate-900 text-white px-8 py-4 rounded-2xl font-black text-sm shadow-xl hover:bg-indigo-700 transition-all active:scale-95">＋ 新增客戶主檔</button>
        </header>

        <div className="mb-8 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex justify-between items-center gap-6">
          <div className="flex-1 max-w-md relative">
            <input type="text" placeholder="搜尋公司名稱或統編..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-12 pr-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:ring-4 focus:ring-blue-500/10 outline-none transition-all font-medium" />
            <span className="absolute left-5 top-1/2 -translate-y-1/2 text-xl">🔍</span>
          </div>
        </div>

        <div className="bg-white rounded-[32px] border border-slate-200 overflow-hidden shadow-sm">
          <table className="w-full text-left">
            <thead className="bg-slate-50/80 border-b border-slate-100">
              <tr>
                <th className="px-8 py-6 font-black text-slate-500 text-xs uppercase tracking-widest">公司主體 / 統編</th>
                <th className="px-8 py-6 font-black text-slate-500 text-xs uppercase tracking-widest">聯絡窗口</th>
                <th className="px-8 py-6 font-black text-slate-500 text-xs uppercase tracking-widest">標籤</th>
                <th className="px-8 py-6 font-black text-slate-500 text-xs uppercase tracking-widest text-center">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map(item => (
                <tr key={item.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-8 py-8">
                    <div className="font-black text-slate-800 text-lg group-hover:text-blue-600 transition-colors">{item.companyName}</div>
                    <div className="text-xs text-slate-400 font-mono mt-1 font-bold">ID: {item.taxId}</div>
                  </td>
                  <td className="px-8 py-8">
                    <div className="text-slate-700 font-bold">{item.contactPerson}</div>
                    <div className="text-xs text-slate-400 font-medium mt-1">{item.phone}</div>
                  </td>
                  <td className="px-8 py-8">
                    <div className="flex gap-2">
                      {item.tags.length > 0 ? item.tags.map(t => <span key={t} className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-[10px] font-black border border-indigo-100 uppercase">{t}</span>) : <span className="text-slate-300 text-xs italic">未分類</span>}
                    </div>
                  </td>
                  <td className="px-8 py-8 text-center">
                    <button onClick={() => setSelectedCustomer(item)} className="bg-white border border-slate-200 text-slate-600 px-5 py-2.5 rounded-xl text-xs font-black hover:bg-slate-900 hover:text-white transition-all shadow-sm">查看詳情</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <CustomerFormDrawer item={selectedCustomer} isCreate={isCreating} onClose={() => { setSelectedCustomer(null); setIsCreating(false); }} onSave={(d) => console.log("Save:", d)} />
    </div>
  );
}