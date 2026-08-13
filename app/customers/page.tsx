"use client";

import { useState, useMemo, useEffect } from "react";
// --- 引入 Firebase 功能 ---
import { db } from "@/lib/firebase";
import { 
  collection, 
  onSnapshot, 
  query, 
  addDoc,
  deleteDoc,
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

/** 產品線色帶，與各看板的設計語言一致 */
const LINE_ACCENT: Record<string, string> = {
  "辦公室出租": "#4E6A74",
  "質晑所課程": "#A8845C",
  "活動管理": "#87687A",
};

// --- 工具函數 ---
function currency(n: number) {
  return new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 }).format(n || 0);
}

const fieldClass =
  "w-full bg-[#FAFAF8] border border-[#E8E6E1] rounded-lg px-3 py-2.5 text-[13px] text-[#1A1A18] outline-none transition-colors focus:bg-white focus:border-[#B0ADA6] placeholder:text-[#C4C1B9]";

// --- 子組件：表單標籤 ---
function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-[11px] font-medium text-[#8A8780] mb-1.5">
      {children}
      {required && <span className="text-[#B4483C] ml-0.5">*</span>}
    </label>
  );
}

/** 區塊標題：小字 eyebrow + 延伸細線 */
function SectionHead({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 mb-5">
      <h3 className="text-[11px] font-semibold text-[#8A8780] tracking-[0.12em] uppercase shrink-0">
        {children}
      </h3>
      <div className="h-px bg-[#E8E6E1] flex-1" />
      {action}
    </div>
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
  onClose: (action?: any, id?: string) => void;
  onSave: (data: Customer) => void;
}) {
  const [formData, setFormData] = useState<any>({});
  const [activeTab, setActiveTab] = useState<"profile" | "requirements">("profile");
  const PRODUCT_TAGS = ["辦公室出租", "質晑所課程", "活動管理"];

  useEffect(() => {
    if (isCreate) {
      setFormData({
        companyName: "", contactPerson: "", phone: "", email: "", bestContactTime: "",
        tags: [], productLines: [], paymentCycle: "月繳", note: "", status: "洽談中",
        taxId: "", actualRentExclTax: 0, actualRentInclTax: 0, totalContractAmount: 0,
        specialRequirements: [] // 初始化特殊需求
      });
      setActiveTab("profile");
    } else if (item) {
      setFormData({
        ...item,
        specialRequirements: item.specialRequirements || [] // 讀取現有紀錄
      });
      setActiveTab("profile");
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

  const reqCount = (formData.specialRequirements || []).length;

  return (
    <div className="fixed inset-0 z-[100] flex justify-end font-sans">
      <div className="absolute inset-0 bg-[#1A1A18]/30 backdrop-blur-[2px]" onClick={() => onClose()} />
      <div className="relative w-full max-w-2xl bg-white h-full shadow-[0_0_40px_rgba(0,0,0,0.12)] flex flex-col overflow-hidden">
        <header className="px-8 pt-7 shrink-0 bg-white">
          <div className="flex justify-between items-start mb-6">
            <div className="min-w-0 pr-4">
              <div className="text-[10px] font-semibold text-[#B0ADA6] tracking-[0.16em] uppercase mb-1.5">
                {isCreate ? "New customer" : "Customer profile"}
              </div>
              <h2 className="text-[19px] font-semibold text-[#1A1A18] tracking-tight truncate">
                {isCreate ? "新增客戶主檔" : (formData.companyName || "未命名客戶")}
              </h2>
            </div>
            <button
              onClick={() => onClose()}
              className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-[#A5A29B] hover:bg-[#F5F4F1] hover:text-[#1A1A18] transition-colors"
            >
              ✕
            </button>
          </div>

          <div className="flex gap-1 -mb-px">
            {([
              { id: "profile", label: "基本資料" },
              { id: "requirements", label: "特殊需求" },
            ] as const).map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3.5 py-2.5 text-[13px] font-medium transition-colors relative ${
                    active ? "text-[#1A1A18]" : "text-[#A5A29B] hover:text-[#3A3833]"
                  }`}
                >
                  {tab.label}
                  {tab.id === "requirements" && reqCount > 0 && (
                    <span className="ml-1.5 text-[10px] tabular-nums text-[#B0ADA6]">{reqCount}</span>
                  )}
                  {active && (
                    <span className="absolute left-3 right-3 -bottom-px h-[2px] bg-[#1A1A18] rounded-full" />
                  )}
                </button>
              );
            })}
          </div>
          <div className="h-px bg-[#E8E6E1]" />
        </header>

        <div className="flex-1 overflow-y-auto px-8 py-8 custom-scrollbar bg-white">
          {activeTab === "profile" ? (
            <div className="space-y-10">
              <section>
                <SectionHead>產品線分群</SectionHead>
                <div className="flex flex-wrap gap-1.5">
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
                        className={`px-3.5 py-2 text-[12px] font-medium rounded-lg border transition-all ${
                          isActive 
                            ? "text-white border-transparent" 
                            : "bg-white text-[#8A8780] border-[#E0DDD6] hover:border-[#B0ADA6]"
                        }`}
                        style={isActive ? { backgroundColor: LINE_ACCENT[tag] } : undefined}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </section>

              <section>
                <SectionHead>聯絡資料</SectionHead>
                <div className="grid grid-cols-2 gap-x-5 gap-y-5">
                  <div className="col-span-2">
                    <FieldLabel required>公司全銜／案件名稱</FieldLabel>
                    <input
                      value={formData.companyName || ""}
                      onChange={e => setFormData({...formData, companyName: e.target.value})}
                      className={fieldClass}
                      placeholder="輸入公司全銜"
                    />
                  </div>
                  <div>
                    <FieldLabel required>主要窗口姓名</FieldLabel>
                    <input
                      value={formData.contactPerson || ""}
                      onChange={e => setFormData({...formData, contactPerson: e.target.value})}
                      className={fieldClass}
                    />
                  </div>
                  <div>
                    <FieldLabel required>統一編號</FieldLabel>
                    <input
                      value={formData.taxId || ""}
                      onChange={e => setFormData({...formData, taxId: e.target.value})}
                      className={`${fieldClass} tabular-nums`}
                      placeholder="8 碼數字"
                    />
                  </div>
                  <div>
                    <FieldLabel>聯絡電話</FieldLabel>
                    <input
                      value={formData.phone || ""}
                      onChange={e => setFormData({...formData, phone: e.target.value})}
                      className={fieldClass}
                    />
                  </div>
                  <div>
                    <FieldLabel>聯絡信箱</FieldLabel>
                    <input
                      value={formData.email || ""}
                      onChange={e => setFormData({...formData, email: e.target.value})}
                      className={fieldClass}
                    />
                  </div>
                  <div className="col-span-2">
                    <FieldLabel>方便聯繫時間</FieldLabel>
                    <input
                      value={formData.bestContactTime || ""}
                      onChange={e => setFormData({...formData, bestContactTime: e.target.value})}
                      className={fieldClass}
                      placeholder="例如：平日下午"
                    />
                  </div>
                </div>
              </section>
            </div>
          ) : (
            <div>
              <SectionHead
                action={
                  <button
                    onClick={addRequirement}
                    className="shrink-0 text-[11px] font-medium px-3 py-1.5 rounded-lg border border-[#E0DDD6] text-[#3A3833] bg-white hover:border-[#B0ADA6] transition-colors"
                  >
                    新增紀錄
                  </button>
                }
              >
                歷史需求紀錄
              </SectionHead>
              
              <div className="space-y-3">
                {formData.specialRequirements?.length > 0 ? (
                  formData.specialRequirements.map((req: SpecialRequirement, idx: number) => (
                    <div key={idx} className="bg-[#FAFAF8] p-4 rounded-lg border border-[#E8E6E1] space-y-3">
                      <div className="flex gap-2 items-center">
                        <input 
                          type="date" 
                          value={req.date} 
                          onChange={e => {
                            const newList = [...formData.specialRequirements];
                            newList[idx].date = e.target.value;
                            setFormData({ ...formData, specialRequirements: newList });
                          }}
                          className="bg-white border border-[#E8E6E1] rounded-md px-2.5 py-1.5 text-[11px] text-[#3A3833] outline-none tabular-nums"
                        />
                        <select 
                          value={req.category}
                          onChange={e => {
                            const newList = [...formData.specialRequirements];
                            newList[idx].category = e.target.value as any;
                            setFormData({ ...formData, specialRequirements: newList });
                          }}
                          className="bg-white border border-[#E8E6E1] rounded-md px-2.5 py-1.5 text-[11px] text-[#3A3833] outline-none"
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
                          className="ml-auto text-[#B0ADA6] hover:text-[#B4483C] transition-colors text-[13px] px-1"
                        >✕</button>
                      </div>
                      <textarea 
                        placeholder="輸入詳細需求內容"
                        value={req.content}
                        onChange={e => {
                          const newList = [...formData.specialRequirements];
                          newList[idx].content = e.target.value;
                          setFormData({ ...formData, specialRequirements: newList });
                        }}
                        className="w-full bg-white border border-[#E8E6E1] rounded-lg p-3 text-[13px] outline-none min-h-[88px] text-[#1A1A18] placeholder:text-[#C4C1B9] focus:border-[#B0ADA6] transition-colors leading-relaxed"
                      />
                    </div>
                  ))
                ) : (
                  <div className="py-16 text-center border border-dashed border-[#E0DDD6] rounded-lg">
                    <p className="text-[12px] text-[#A5A29B]">尚無需求紀錄</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <footer className="px-8 py-5 border-t border-[#E8E6E1] bg-white flex items-center gap-4 shrink-0">
          {/* 刪除是不可逆操作，降級成文字連結，不與儲存爭奪視覺重量 */}
          {!isCreate && (
            <button 
              type="button"
              onClick={() => {
                if (window.confirm(`確定要永久刪除「${formData.companyName}」這筆客戶主檔嗎？\n\n刪除後各看板的資料連結會失效，此動作無法復原。`)) {
                  (onClose as any)('DELETE', item?.id); 
                }
              }}
              className="text-[12px] text-[#A5A29B] hover:text-[#B4483C] transition-colors shrink-0"
            >
              刪除客戶
            </button>
          )}
          <div className="ml-auto flex gap-2">
            <button
              onClick={() => onClose()}
              className="px-5 py-3 rounded-lg text-[13px] font-medium text-[#3A3833] border border-[#E0DDD6] hover:border-[#B0ADA6] transition-colors"
            >
              取消
            </button>
            <button
              onClick={() => onSave(formData as Customer)}
              className="bg-[#1A1A18] text-white px-8 py-3 rounded-lg text-[13px] font-medium hover:bg-black transition-colors"
            >
              儲存
            </button>
          </div>
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

  const PRODUCT_TAGS = ["辦公室出租", "質晑所課程", "活動管理"];

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
            ["辦公室出租", "辦公室管理", "辦公室案件", "質晑所課程", "活動管理"].includes(t)
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
    if (!d.companyName) return alert("請填寫公司名稱");
    if (!d.taxId) {
      const ok = confirm("⚠️ 未填寫統編\n\n系統將無法比對現有客戶，會直接建立一筆新資料。\n\n確定不填統編直接儲存嗎？");
      if (!ok) return;
    }
    try {
      const synchronizedData = {
        companyName: d.companyName, 
        title: d.companyName,      
        name: d.companyName,       
        contactPerson: d.contactPerson, 
        customer: d.contactPerson, 
        phone: d.phone,
        contactPhone: d.phone,
        taxId: d.taxId || "",
        email: d.email || "",
        tags: d.tags || [],
        productLines: d.tags || [],
        specialRequirements: d.specialRequirements || [],
        updatedAt: serverTimestamp()
      };

      if (isCreating) {
        await addDoc(collection(db, "members"), {
          ...synchronizedData,
          createdAt: new Date().toISOString()
        });
      } else if (selectedCustomer) {
        const docRef = doc(db, "members", selectedCustomer.id);
        await updateDoc(docRef, synchronizedData);
      }
      
      setSelectedCustomer(null);
      setIsCreating(false);
      
    } catch (error) {
      console.error("儲存失敗:", error);
      alert("儲存失敗，請檢查網路連線或權限設定。");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, "members", id));
      setSelectedCustomer(null);
      setIsCreating(false);
    } catch (error) {
      console.error("刪除失敗:", error);
      alert("刪除失敗，請檢查網路連線或權限設定。");
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

  // 統編重複的筆數，作為資料品質的提示
  const duplicateTaxIds = useMemo(() => {
    const seen = new Map<string, number>();
    customers.forEach(c => {
      if (!c.taxId || c.taxId === "無統編") return;
      seen.set(c.taxId, (seen.get(c.taxId) || 0) + 1);
    });
    return new Set([...seen.entries()].filter(([, n]) => n > 1).map(([id]) => id));
  }, [customers]);

  if (!hasMounted || loading) {
    return (
      <div className="flex-1 h-screen flex items-center justify-center text-[#A5A29B] text-[13px]" style={{ backgroundColor: "#F5F4F1" }}>
        載入中…
      </div>
    );
  }

  return (
    <div className="flex-1 h-screen overflow-y-auto font-sans" style={{ backgroundColor: "#F5F4F1" }}>
      <div className="max-w-6xl mx-auto px-8 py-10">
        <header className="mb-8 flex justify-between items-start">
          <div>
            <h1 className="text-[22px] font-semibold text-[#1A1A18] tracking-tight">客戶資料管理</h1>
            <p className="text-[11px] text-[#A5A29B] mt-1">集中管理跨產品線的客戶全銜與聯絡窗口</p>
          </div>
          <button
            onClick={() => setIsCreating(true)}
            className="bg-[#1A1A18] text-white px-5 py-2.5 rounded-lg text-[13px] font-medium hover:bg-black transition-colors"
          >
            新增客戶
          </button>
        </header>

        {duplicateTaxIds.size > 0 && (
          <div className="mb-5 bg-white border-l-[3px] border-[#A97B22] ring-1 ring-[#E8E6E1] px-4 py-2.5 rounded-r-lg">
            <p className="text-[12px] text-[#A97B22]">
              有 {duplicateTaxIds.size} 組統編重複出現，同一家公司可能被建立成多筆資料
            </p>
          </div>
        )}

        <div className="mb-5 flex flex-col md:flex-row gap-3 md:items-center">
          <input
            type="text"
            placeholder="搜尋公司名稱或統編"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 max-w-sm bg-white border border-[#E8E6E1] rounded-lg px-4 py-2.5 text-[13px] outline-none transition-colors focus:border-[#B0ADA6] text-[#1A1A18] placeholder:text-[#C4C1B9]"
          />

          <div className="flex gap-1.5 items-center md:ml-auto">
            {PRODUCT_TAGS.map(tag => {
              const active = selectedTag === tag;
              return (
                <button 
                  key={tag} 
                  onClick={() => setSelectedTag(active ? null : tag)} 
                  className={`px-3.5 py-2 rounded-lg text-[12px] font-medium border transition-all ${
                    active
                      ? "text-white border-transparent"
                      : "bg-white text-[#8A8780] border-[#E0DDD6] hover:border-[#B0ADA6]"
                  }`}
                  style={active ? { backgroundColor: LINE_ACCENT[tag] } : undefined}
                >
                  {tag}
                </button>
              );
            })}
            {selectedTag && (
              <button
                onClick={() => setSelectedTag(null)}
                className="text-[11px] text-[#A5A29B] hover:text-[#1A1A18] px-2 transition-colors"
              >
                清除
              </button>
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg border border-[#E8E6E1] overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-[#E8E6E1]">
                <th className="px-6 py-3.5 text-[10px] font-semibold text-[#A5A29B] tracking-[0.12em] uppercase">公司</th>
                <th className="px-4 py-3.5 text-[10px] font-semibold text-[#A5A29B] tracking-[0.12em] uppercase">統編</th>
                <th className="px-4 py-3.5 text-[10px] font-semibold text-[#A5A29B] tracking-[0.12em] uppercase">窗口</th>
                <th className="px-4 py-3.5 text-[10px] font-semibold text-[#A5A29B] tracking-[0.12em] uppercase">產品線</th>
                <th className="px-4 py-3.5" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => {
                const isDup = duplicateTaxIds.has(item.taxId);
                const lines = Array.from(new Set(item.tags.map(t => 
                  ["辦公室出租", "辦公室管理", "辦公室案件"].includes(t) ? "辦公室出租" : t
                ))).filter(t => PRODUCT_TAGS.includes(t));

                return (
                  <tr
                    key={item.id}
                    onClick={() => setSelectedCustomer(item)}
                    className="border-t border-[#F0EEE9] hover:bg-[#FAFAF8] transition-colors cursor-pointer group"
                  >
                    <td className="px-6 py-4">
                      <div className="text-[14px] font-medium text-[#1A1A18]">{item.companyName}</div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="text-[12px] text-[#8A8780] tabular-nums flex items-center gap-2">
                        {item.taxId}
                        {isDup && (
                          <span className="text-[10px] text-[#A97B22] bg-[#FAF3E5] px-1.5 py-0.5 rounded">
                            重複
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="text-[13px] text-[#3A3833]">{item.contactPerson}</div>
                      <div className="text-[11px] text-[#B0ADA6] mt-0.5">{item.phone}</div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex gap-1.5 flex-wrap">
                        {lines.length > 0 ? (
                          lines.map(t => (
                            <span
                              key={t}
                              className="text-[10px] font-medium px-2 py-1 rounded"
                              style={{
                                backgroundColor: `${LINE_ACCENT[t]}14`,
                                color: LINE_ACCENT[t],
                              }}
                            >
                              {t}
                            </span>
                          ))
                        ) : (
                          <span className="text-[11px] text-[#C4C1B9]">未分類</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <span className="text-[11px] text-[#C4C1B9] group-hover:text-[#8A8780] transition-colors">
                        查看 →
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="py-20 text-center">
              <p className="text-[12px] text-[#A5A29B]">找不到符合條件的客戶</p>
            </div>
          )}
        </div>

        <p className="mt-4 text-[11px] text-[#B0ADA6]">
          共 {filtered.length} 筆{selectedTag || searchQuery ? `（全部 ${customers.length} 筆）` : ""}
        </p>
      </div>

      <CustomerFormDrawer 
        item={selectedCustomer} 
        isCreate={isCreating} 
        onSave={handleSave} 
        onClose={(action?: any, id?: string) => { 
          if (action === 'DELETE' && id) {
            handleDelete(id); 
          } else {
            setSelectedCustomer(null); 
            setIsCreating(false); 
          }
        }} 
      />

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 10px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #D5D2CB; border-radius: 999px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #B0ADA6; }
      `}</style>
    </div>
  );
}
