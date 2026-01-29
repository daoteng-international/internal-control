"use client";

import { useState, useMemo, useEffect } from "react";

// --- 類型定義 ---
type BuildingId = "四維館" | "民權20樓" | "民權21樓" | "民權27樓" | "民權28樓";
type ContractStatus = "生效中" | "即將到期" | "已結案";
type TaxType = "應稅(5%)" | "免稅/未稅";

interface Contract {
  id: string;
  contractNo: string;
  customer: string;
  taxId: string;
  building: BuildingId;
  taxType: TaxType;         // 新增：稅別
  actualRentExclTax: number; // 新增：實際月租(未稅)
  actualRentInclTax: number; // 新增：實際月租(含稅)
  totalContractAmount: number; // 新增：合約總產值
  startDate: string;
  endDate: string;
  status: ContractStatus;
  fileAttached: boolean;
}

// --- 工具函數 ---
function currency(n: number) {
  return new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 }).format(n);
}

// 計算月數邏輯
function calculateMonths(start: string, end: string) {
  const s = new Date(start);
  const e = new Date(end);
  const diff = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
  return Math.max(0, diff + 1);
}

// --- 子組件：新增契約側邊欄 ---
function ContractDrawer({ isOpen, onClose, onSave }: { isOpen: boolean; onClose: () => void; onSave: (c: Contract) => void }) {
  const [form, setForm] = useState<Partial<Contract>>({
    building: "四維館",
    taxType: "應稅(5%)",
    status: "生效中",
    fileAttached: false,
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    actualRentExclTax: 0
  });

  // 自動計算含稅與總額
  const computedData = useMemo(() => {
    const excl = form.actualRentExclTax || 0;
    const multiplier = form.taxType === "應稅(5%)" ? 1.05 : 1;
    const incl = Math.round(excl * multiplier);
    const months = calculateMonths(form.startDate || "", form.endDate || "");
    return { incl, total: incl * months, months };
  }, [form.actualRentExclTax, form.taxType, form.startDate, form.endDate]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex justify-end">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-white h-full shadow-2xl flex flex-col">
        <header className="p-6 border-b flex justify-between items-center">
          <h2 className="text-xl font-bold text-slate-800 uppercase tracking-tight">新增契約存檔</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl">✕</button>
        </header>

        <div className="flex-1 overflow-y-auto p-8 space-y-8">
          <section className="space-y-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b pb-2">Contract Info / 契約資訊</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="text-xs font-bold text-slate-500">公司全銜</label>
                <input className="w-full border-b py-2 outline-none focus:border-blue-500" placeholder="完整公司名稱" onChange={e => setForm({...form, customer: e.target.value})} />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500">統一編號</label>
                <input className="w-full border-b py-2 outline-none focus:border-blue-500 font-mono" placeholder="8 位數統編" onChange={e => setForm({...form, taxId: e.target.value})} />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500">稅別設定</label>
                <select className="w-full border-b py-2 outline-none bg-transparent" value={form.taxType} onChange={e => setForm({...form, taxType: e.target.value as TaxType})}>
                  <option value="應稅(5%)">應稅(5%)</option>
                  <option value="免稅/未稅">免稅/未稅</option>
                </select>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b pb-2">Finance / 財務條件</h3>
            <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl">
              <div>
                <label className="text-xs font-bold text-slate-500">實際月租 (未稅)</label>
                <input type="number" className="w-full border-b py-2 outline-none bg-transparent font-bold" onChange={e => setForm({...form, actualRentExclTax: Number(e.target.value)})} />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-400">含稅結果</label>
                <div className="py-2 text-sm font-bold text-blue-600">{currency(computedData.incl)}</div>
              </div>
              <div className="col-span-2 pt-2 border-t border-slate-200 flex justify-between items-center">
                <span className="text-xs text-slate-500 font-bold">預估總合約價值 ({computedData.months}個月):</span>
                <span className="text-base font-black text-slate-800">{currency(computedData.total)}</span>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b pb-2">Timeline / 租期設定</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-500">起始日期</label>
                <input type="date" value={form.startDate} className="w-full border-b py-2 outline-none" onChange={e => setForm({...form, startDate: e.target.value})} />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500">結束日期</label>
                <input type="date" value={form.endDate} className="w-full border-b py-2 outline-none" onChange={e => setForm({...form, endDate: e.target.value})} />
              </div>
            </div>
          </section>
        </div>

        <footer className="p-6 border-t bg-slate-50">
          <button 
            onClick={() => onSave({
              ...form, 
              id: String(Date.now()), 
              actualRentInclTax: computedData.incl, 
              totalContractAmount: computedData.total 
            } as Contract)}
            className="w-full bg-slate-900 text-white py-4 rounded-xl font-bold shadow-lg hover:bg-slate-800 transition-all uppercase tracking-widest"
          >
            完成契約存檔
          </button>
        </footer>
      </div>
    </div>
  );
}

// --- 主頁面 ---
export default function ContractPage() {
  const [hasMounted, setHasMounted] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterBuilding, setFilterBuilding] = useState<BuildingId | "全部">("全部");
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const [contracts, setContracts] = useState<Contract[]>([
    { id: "C1", contractNo: "CNT-2026-001", customer: "科技創新股份有限公司", taxId: "12345678", building: "四維館", taxType: "應稅(5%)", actualRentExclTax: 150000, actualRentInclTax: 157500, totalContractAmount: 1890000, startDate: "2026-01-01", endDate: "2026-12-31", status: "生效中", fileAttached: true },
    { id: "C2", contractNo: "CNT-2026-002", customer: "全球貿易集團", taxId: "55667788", building: "民權21樓", taxType: "免稅/未稅", actualRentExclTax: 280000, actualRentInclTax: 280000, totalContractAmount: 1680000, startDate: "2025-06-01", endDate: "2026-05-31", status: "即將到期", fileAttached: true },
  ]);

  useEffect(() => { setHasMounted(true); }, []);

  const filteredData = useMemo(() => {
    return contracts.filter(c => {
      const matchSearch = c.customer.includes(searchQuery) || c.contractNo.includes(searchQuery) || c.taxId.includes(searchQuery);
      const matchBuilding = filterBuilding === "全部" || c.building === filterBuilding;
      return matchSearch && matchBuilding;
    });
  }, [searchQuery, filterBuilding, contracts]);

  if (!hasMounted) return <div className="flex-1 h-screen bg-slate-50/30" />;

  return (
    <div className="flex-1 h-screen overflow-y-auto bg-slate-50/30 p-8 font-sans">
      <div className="max-w-7xl mx-auto">
        <header className="mb-10">
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight uppercase italic underline decoration-blue-500/30">辦公室契約管理</h1>
          <p className="text-sm text-slate-400 mt-2 font-medium">正式合約資產庫：管理稅別、月租金實值及合約總產值。</p>
        </header>

        <div className="flex flex-wrap items-center justify-between gap-4 mb-8 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-6">
            <input type="text" placeholder="搜尋客戶或統編..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-4 pr-10 py-2.5 border border-slate-200 rounded-xl text-xs w-80 outline-none focus:ring-4 focus:ring-blue-500/10 transition-all bg-slate-50/50" />
            <div className="flex gap-2 bg-slate-100 p-1 rounded-xl">
              {["全部", "四維館", "民權20樓", "民權21樓", "民權27樓", "民權28樓"].map((b) => (
                <button key={b} onClick={() => setFilterBuilding(b as any)} className={`px-4 py-1.5 rounded-lg text-[10px] font-bold transition-all ${filterBuilding === b ? "bg-white text-slate-900 shadow-sm" : "text-slate-400"}`}>{b}</button>
              ))}
            </div>
          </div>
          <button onClick={() => setIsDrawerOpen(true)} className="bg-slate-900 text-white px-6 py-2.5 rounded-xl text-xs font-bold hover:bg-blue-600 transition-all shadow-lg">+ 新增契約存檔</button>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 font-bold text-slate-500 uppercase text-[10px]">客戶全銜 / 稅別</th>
                <th className="px-6 py-4 font-bold text-slate-500 uppercase text-[10px]">月租金(含稅)</th>
                <th className="px-6 py-4 font-bold text-slate-500 uppercase text-[10px]">合約總產值</th>
                <th className="px-6 py-4 font-bold text-slate-500 uppercase text-[10px]">租期起迄</th>
                <th className="px-6 py-4 font-bold text-slate-500 uppercase text-[10px]">狀態</th>
                <th className="px-6 py-4 font-bold text-slate-500 uppercase text-[10px]">掃描檔</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredData.map(item => (
                <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-5">
                    <div className="font-bold text-slate-800">{item.customer}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-slate-400 font-mono">ID: {item.taxId}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${item.taxType === "應稅(5%)" ? "bg-blue-50 text-blue-500 border-blue-100" : "bg-slate-50 text-slate-400"}`}>{item.taxType}</span>
                    </div>
                  </td>
                  <td className="px-6 py-5 font-bold text-slate-700">{currency(item.actualRentInclTax)}</td>
                  <td className="px-6 py-5 font-black text-slate-900">{currency(item.totalContractAmount)}</td>
                  <td className="px-6 py-5 text-[11px] text-slate-500 font-mono leading-relaxed">
                    {item.startDate} <br/> <span className="text-slate-300">to</span> {item.endDate}
                  </td>
                  <td className="px-6 py-5">
                    <span className={`px-2.5 py-1 rounded-lg font-bold text-[10px] ${item.status === "生效中" ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}`}>{item.status}</span>
                  </td>
                  <td className="px-6 py-5">
                    {item.fileAttached ? <button className="text-blue-500 text-xs font-bold hover:underline">查看 PDF</button> : <span className="text-red-400 text-[10px] italic">尚未上傳</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ContractDrawer 
        isOpen={isDrawerOpen} 
        onClose={() => setIsDrawerOpen(false)} 
        onSave={(newContract) => {
          setContracts([newContract, ...contracts]);
          setIsDrawerOpen(false);
        }}
      />
    </div>
  );
}