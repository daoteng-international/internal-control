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
  productLines?: string[];  
}

// --- 工具函數 ---
function currency(n: number) {
  return new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 }).format(n || 0);
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
  const [formData, setFormData] = useState<any>({});
  const [activeTab, setActiveTab] = useState<"profile" | "requirements">("profile");
  const PRODUCT_TAGS = ["辦公室出租", "工商登記", "活動管理"];

  useEffect(() => {
    if (isCreate) {
      setFormData({
        companyName: "", contactPerson: "", phone: "", email: "", bestContactTime: "",
        tags: [], productLines: [], paymentCycle: "月繳", note: "", status: "洽談中",
        taxId: "", actualRentExclTax: 0, actualRentInclTax: 0, totalContractAmount: 0,
        specialRequirements: [] // 初始化特殊需求
      });
    } else if (item) {
      setFormData({
        ...item,
        specialRequirements: item.specialRequirements || [] // 讀取現有紀錄
      });
    }
  }, [item, isCreate]);

  const toggleTag = (tag: string) => {
    const current = Array.isArray(formData.tags) ? formData.tags : [];
    const newTags = current.includes(tag) ? current.filter((t: string) => t !== tag) : [...current, tag];
    setFormData({ ...formData, tags: newTags, productLines: newTags });
  };

  // 新增特殊需求紀錄邏輯
  const addRequirement = () => {
    const newList = [
      { date: new Date().toISOString().split('T')[0], category: "行政", content: "" },
      ...(formData.specialRequirements || [])
    ];
    setFormData({ ...formData, specialRequirements: newList });
  };

  if (!item && !isCreate) return null;

  return (
    <div className="fixed inset-0 z-[100] flex justify-end font-sans text-slate-800">
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
          {/* 分頁切換按鈕區 */}
          <div className="flex gap-8">
            <button onClick={() => setActiveTab("profile")} className={`pb-4 text-sm font-bold border-b-2 transition-all ${activeTab === "profile" ? "border-blue-600 text-blue-600" : "border-transparent text-slate-400 hover:text-slate-600"}`}>基本與財務資訊</button>
            <button onClick={() => setActiveTab("requirements")} className={`pb-4 text-sm font-bold border-b-2 transition-all ${activeTab === "requirements" ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-400 hover:text-slate-600"}`}>特殊需求紀錄</button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8 bg-blue-50/30">
          {activeTab === "profile" ? (
            <div className="space-y-10">
              <section className="space-y-4">
                <label className="text-xs font-black text-indigo-600 uppercase tracking-widest flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-indigo-600 rounded-full"></span> 產品線分群 (多選)
                </label>
                <div className="flex flex-wrap gap-3">
                  {PRODUCT_TAGS.map(tag => {
                    const allTags = [
                      ...(Array.isArray(formData.tags) ? formData.tags : []),
                      ...(Array.isArray(formData.productLines) ? formData.productLines : [])
                    ];

                    const isActive = tag === "辦公室出租" 
                      ? allTags.some(t => ["辦公室出租", "辦公室管理", "辦公室案件"].includes(t))
                      : allTags.includes(tag);

                    return (
                      <button 
                        key={tag} 
                        onClick={() => toggleTag(tag)} 
                        className={`px-5 py-2.5 rounded-xl text-sm font-bold border-2 transition-all ${
                          isActive 
                            ? "bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-100" 
                            : "bg-white border-slate-200 text-slate-400 hover:border-indigo-200"
                        }`}
                      >
                        {tag}
                      </button>
                    );
                  })}
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
                  <div>
                    <label className="text-xs font-bold text-slate-500 mb-2 block uppercase tracking-widest">統一編號</label>
                    <input value={formData.taxId || ""} onChange={e => setFormData({...formData, taxId: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none" />
                  </div>
                </div>
              </section>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest italic">歷史需求紀錄</h3>
                <button onClick={addRequirement} className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-indigo-700 shadow-md transition-all">＋ 新增紀錄</button>
              </div>
              
              <div className="space-y-4">
                {formData.specialRequirements?.length > 0 ? (
                  formData.specialRequirements.map((req: SpecialRequirement, idx: number) => (
                    <div key={idx} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4 animate-in fade-in slide-in-from-top-2">
                      <div className="flex gap-3">
                        <input 
                          type="date" 
                          value={req.date} 
                          onChange={e => {
                            const newList = [...formData.specialRequirements];
                            newList[idx].date = e.target.value;
                            setFormData({ ...formData, specialRequirements: newList });
                          }}
                          className="bg-slate-50 border-none rounded-lg px-3 py-1.5 text-xs font-bold text-slate-600 outline-none"
                        />
                        <select 
                          value={req.category}
                          onChange={e => {
                            const newList = [...formData.specialRequirements];
                            newList[idx].category = e.target.value as any;
                            setFormData({ ...formData, specialRequirements: newList });
                          }}
                          className="bg-indigo-50 text-indigo-600 border-none rounded-lg px-3 py-1.5 text-xs font-black outline-none"
                        >
                          <option value="行政">行政需求</option>
                          <option value="硬體">硬體報修</option>
                          <option value="服務">客製服務</option>
                        </select>
                        <button 
                          onClick={() => {
                            const newList = formData.specialRequirements.filter((_: any, i: number) => i !== idx);
                            setFormData({ ...formData, specialRequirements: newList });
                          }}
                          className="ml-auto text-rose-300 hover:text-rose-500 transition-colors"
                        >✕</button>
                      </div>
                      <textarea 
                        placeholder="請輸入詳細需求內容..."
                        value={req.content}
                        onChange={e => {
                          const newList = [...formData.specialRequirements];
                          newList[idx].content = e.target.value;
                          setFormData({ ...formData, specialRequirements: newList });
                        }}
                        className="w-full bg-slate-50 border-none rounded-xl p-4 text-sm outline-none min-h-[100px] font-medium text-slate-700 placeholder:text-slate-300 focus:ring-2 focus:ring-indigo-100 transition-all"
                      />
                    </div>
                  ))
                ) : (
                  <div className="text-center py-20 bg-white/50 rounded-3xl border-2 border-dashed border-slate-200">
                    <p className="text-slate-400 text-sm font-bold italic">目前尚無紀錄</p>
                  </div>
                )}
              </div>
            </div>
          )}
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
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const PRODUCT_TAGS = ["辦公室出租", "工商登記", "活動管理"];

  useEffect(() => { 
    setHasMounted(true); 
    const q = query(collection(db, "members"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setCustomers(snapshot.docs.map(doc => {
        const data = doc.data();
        const combinedTags = [
            ...(Array.isArray(data.tags) ? data.tags : []),
            ...(Array.isArray(data.productLines) ? data.productLines : [])
        ];
        const isOurSystem = combinedTags.some(t => 
            ["辦公室出租", "辦公室管理", "辦公室案件", "工商登記", "活動管理"].includes(t)
        );
        if (!isOurSystem) return null;
        return {
          id: doc.id,
          companyName: data.companyName || data.title || data.name || "未定義名稱",
          contactPerson: data.contactPerson || data.customer || "未填寫",
          taxId: data.taxId || "無統編",
          phone: data.phone || data.contactPhone || "無電話",
          tags: combinedTags,
          email: data.email || "",
          bestContactTime: data.bestContactTime || "",
          status: data.status || "洽談中",
          note: data.note || data.specialNotes || "",
          specialRequirements: data.specialRequirements || [] // 讀取特殊需求
        } as Customer;
      }).filter(c => c !== null) as Customer[]);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleSave = async (d: Customer) => {
    try {
      const finalData = {
        ...d,
        tags: d.tags || [],
        productLines: d.tags || [],
        specialRequirements: d.specialRequirements || [] // 儲存特殊需求
      };

      if (isCreating) {
        await addDoc(collection(db, "members"), {
          ...finalData,
          createdAt: new Date().toISOString(),
          updatedAt: serverTimestamp()
        });
      } else if (selectedCustomer) {
        const docRef = doc(db, "members", selectedCustomer.id);
        await updateDoc(docRef, {
          ...finalData,
          updatedAt: serverTimestamp()
        });
      }
      setSelectedCustomer(null);
      setIsCreating(false);
    } catch (error) {
      console.error("儲存失敗:", error);
      alert("儲存失敗，請檢查權限或網路連線");
    }
  };

  const filtered = useMemo(() => {
    return customers.filter(c => {
      const matchesSearch = c.companyName.toLowerCase().includes(searchQuery.toLowerCase()) || c.taxId.includes(searchQuery);
      const matchesTag = !selectedTag || (
        c.tags.includes(selectedTag) || 
        (selectedTag === "辦公室出租" && (c.tags.includes("辦公室管理") || c.tags.includes("辦公室案件")))
      );
      return matchesSearch && matchesTag;
    });
  }, [searchQuery, selectedTag, customers]);

  if (!hasMounted || loading) return <div className="flex-1 h-screen flex items-center justify-center bg-slate-50 text-slate-400 font-bold text-slate-800">載入中...</div>;

  const getTagStyle = (tag: string, isActive: boolean = false) => {
    const isOffice = ["辦公室出租", "辦公室管理", "辦公室案件"].includes(tag);
    if (isOffice) {
      return isActive 
        ? "bg-blue-600 text-white border-blue-600 shadow-blue-100" 
        : "bg-blue-50 text-blue-600 border-blue-100 hover:bg-blue-100";
    }
    switch (tag) {
      case "活動管理":
        return isActive 
          ? "bg-purple-600 text-white border-purple-600 shadow-purple-100" 
          : "bg-purple-50 text-purple-600 border-purple-100 hover:bg-purple-100";
      case "工商登記":
        return isActive 
          ? "bg-amber-500 text-white border-amber-500 shadow-amber-100" 
          : "bg-amber-50 text-amber-600 border-amber-100 hover:bg-amber-100";
      default:
        return "bg-slate-50 text-slate-500 border-slate-100";
    }
  };

  return (
    <div className="flex-1 h-screen overflow-y-auto bg-slate-50/50 p-8 font-sans text-slate-800">
      <div className="max-w-7xl mx-auto">
        <header className="mb-10 flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-black text-slate-800 tracking-tight underline decoration-blue-500/30">客戶資料管理</h1>
            <p className="text-slate-400 mt-2 font-medium italic">集中管理跨產品線客戶全銜、窗口及財務主檔。</p>
          </div>
          <button onClick={() => setIsCreating(true)} className="bg-slate-900 text-white px-8 py-4 rounded-2xl font-black text-sm shadow-xl hover:bg-indigo-700 transition-all active:scale-95">＋ 新增客戶主檔</button>
        </header>

        <div className="mb-8 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex-1 w-full max-w-md relative">
            <input type="text" placeholder="搜尋公司名稱或統編..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-12 pr-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:ring-4 focus:ring-blue-500/10 outline-none transition-all font-medium text-slate-800" />
            <span className="absolute left-5 top-1/2 -translate-y-1/2 text-xl">🔍</span>
          </div>
          
          <div className="flex gap-3">
            {PRODUCT_TAGS.map(tag => (
              <button 
                key={tag} 
                onClick={() => setSelectedTag(selectedTag === tag ? null : tag)} 
                className={`px-6 py-3 rounded-2xl text-sm font-black transition-all border-2 shadow-sm active:scale-95 ${getTagStyle(tag, selectedTag === tag)}`}
              >
                {tag}
              </button>
            ))}
            {selectedTag && (
              <button onClick={() => setSelectedTag(null)} className="text-xs font-bold text-slate-400 hover:text-slate-600 px-2 transition-colors">清除篩選</button>
            )}
          </div>
        </div>

        <div className="bg-white rounded-[32px] border border-slate-200 overflow-hidden shadow-sm">
          <table className="w-full text-left">
            <thead className="bg-slate-50/80 border-b border-slate-100 text-slate-800">
              <tr>
                <th className="px-8 py-6 font-black text-slate-500 text-xs uppercase tracking-widest">公司主體 / 統編</th>
                <th className="px-8 py-6 font-black text-slate-500 text-xs uppercase tracking-widest">聯絡窗口</th>
                <th className="px-8 py-6 font-black text-slate-500 text-xs uppercase tracking-widest">標籤</th>
                <th className="px-8 py-6 font-black text-slate-500 text-xs uppercase tracking-widest text-center">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-slate-800">
              {filtered.map(item => (
                <tr key={item.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-8 py-8 text-slate-800">
                    <div className="font-black text-slate-800 text-lg group-hover:text-blue-600 transition-colors">{item.companyName}</div>
                    <div className="text-xs text-slate-400 font-mono mt-1 font-bold italic">TAX ID: {item.taxId}</div>
                  </td>
                  <td className="px-8 py-8 text-slate-800">
                    <div className="text-slate-700 font-bold">{item.contactPerson}</div>
                    <div className="text-xs text-slate-400 font-medium mt-1">{item.phone}</div>
                  </td>
                  <td className="px-8 py-8 text-slate-800">
                    <div className="flex gap-2">
                      {item.tags.length > 0 ? item.tags.map(t => {
                        const displayText = ["辦公室出租", "辦公室管理", "辦公室案件"].includes(t) ? "辦公室出租" : t;
                        return (
                          <span key={t} className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase ${getTagStyle(t)}`}>
                            {displayText}
                          </span>
                        );
                      }) : <span className="text-slate-300 text-xs italic">未分類</span>}
                    </div>
                  </td>
                  <td className="px-8 py-8 text-center text-slate-800">
                    <button onClick={() => setSelectedCustomer(item)} className="bg-white border border-slate-200 text-slate-600 px-5 py-2.5 rounded-xl text-xs font-black hover:bg-slate-900 hover:text-white transition-all shadow-sm">查看詳情</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="p-20 text-center text-slate-300 font-bold italic">找不到符合條件的客戶資料</div>
          )}
        </div>
      </div>
      <CustomerFormDrawer item={selectedCustomer} isCreate={isCreating} onClose={() => { setSelectedCustomer(null); setIsCreating(false); }} onSave={handleSave} />
    </div>
  );
}