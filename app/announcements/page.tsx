"use client";

import { useState, useEffect } from "react";
import { db } from "../../lib/firebase";
import { useAuth } from "@/lib/auth-context"; // 💡 引入 Auth 以判斷人員所屬部門
import { 
  collection, 
  query, 
  onSnapshot, 
  orderBy, 
  addDoc, 
  serverTimestamp,
  doc,
  deleteDoc,
  updateDoc
} from "firebase/firestore";

// --- 類型定義 ---
type Category = "重要" | "通知" | "更新";
type Status = "published" | "draft";
type TargetDept = "全部" | "營運部" | "財務部" | "工務" | "遠端";

interface Announcement {
  id: string;
  category: Category;
  status: Status;
  targetDepartment: TargetDept; // 💡 新增：發送對象部門
  title: string;
  content: string;
  author: string;
  date: any;
  isPinned: boolean;
}

// --- 1. 發佈/編輯公告彈窗 ---
function AnnouncementModal({ 
  show, 
  onClose, 
  onSave, 
  initialData 
}: { 
  show: boolean; 
  onClose: () => void; 
  onSave: (data: any, status: Status) => void;
  initialData: Announcement | null;
}) {
  const [formData, setFormData] = useState({
    title: "",
    category: "通知" as Category,
    targetDepartment: "全部" as TargetDept, // 💡 預設發送給全部
    content: "",
    isPinned: false
  });

  useEffect(() => {
    if (initialData) {
      setFormData({
        title: initialData.title,
        category: initialData.category,
        targetDepartment: initialData.targetDepartment || "全部",
        content: initialData.content,
        isPinned: initialData.isPinned
      });
    } else {
      setFormData({ title: "", category: "通知", targetDepartment: "全部", content: "", isPinned: false });
    }
  }, [initialData, show]);

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-slate-900/20 backdrop-blur-sm">
      <div className="bg-white rounded-[2rem] shadow-xl w-full max-w-2xl overflow-hidden border border-slate-100 animate-in fade-in zoom-in-95 duration-200 font-sans">
        <header className="px-8 py-5 border-b border-slate-50 flex justify-between items-center bg-white">
          <h3 className="font-bold text-lg text-slate-700">{initialData ? "編輯公告" : "建立系統公告"}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">✕</button>
        </header>

        <div className="p-8 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">公告類型</label>
              <select 
                className="w-full border border-slate-100 rounded-xl p-2.5 text-sm outline-none focus:border-blue-500/50 bg-slate-50 font-bold cursor-pointer text-slate-700"
                value={formData.category}
                onChange={e => setFormData({...formData, category: e.target.value as Category})}
              >
                <option value="重要">🔴 重要事項</option>
                <option value="通知">🔵 一般通知</option>
                <option value="更新">⚪ 系統更新</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">發送對象 (部門)</label>
              <select 
                className="w-full border border-slate-100 rounded-xl p-2.5 text-sm outline-none focus:border-blue-500/50 bg-slate-50 font-bold cursor-pointer text-slate-700"
                value={formData.targetDepartment}
                onChange={e => setFormData({...formData, targetDepartment: e.target.value as TargetDept})}
              >
                <option value="全部">📢 全部群組</option>
                <option value="營運部">🏢 營運部</option>
                <option value="財務部">💰 財務部</option>
                <option value="工務">🛠️ 工務</option>
                <option value="遠端">🏠 遠端</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input 
                type="checkbox" 
                className="w-4 h-4 rounded border-slate-200 text-amber-500 focus:ring-amber-500" 
                checked={formData.isPinned} 
                onChange={e => setFormData({...formData, isPinned: e.target.checked})} 
              />
              <span className="text-xs font-bold text-slate-500">置頂顯示</span>
            </label>
          </div>

          <input 
            placeholder="請輸入標題..."
            className="w-full border border-slate-100 rounded-xl p-3.5 text-sm outline-none focus:border-blue-500 font-bold bg-slate-50 transition-all text-slate-700"
            value={formData.title}
            onChange={e => setFormData({...formData, title: e.target.value})}
          />

          <textarea 
            className="w-full border border-slate-100 rounded-xl p-4 text-sm h-40 outline-none focus:border-blue-500 resize-none bg-slate-50 font-medium leading-relaxed text-slate-600"
            placeholder="詳細說明事項內容..."
            value={formData.content}
            onChange={e => setFormData({...formData, content: e.target.value})}
          />
        </div>

        <footer className="p-6 border-t border-slate-50 bg-slate-50/50 flex gap-3">
          <button onClick={onClose} className="px-6 py-3 text-slate-400 font-bold text-sm hover:text-slate-600 transition-colors">取消</button>
          <div className="flex-1 flex gap-2">
            <button 
              onClick={() => onSave(formData, "draft")} 
              className="flex-1 bg-white border border-slate-200 text-slate-600 py-3 rounded-xl font-bold hover:bg-slate-100 transition-all text-sm shadow-sm"
            >
              儲存草稿
            </button>
            <button 
              onClick={() => onSave(formData, "published")} 
              className="flex-1 bg-slate-800 text-white py-3 rounded-xl font-bold shadow-md hover:bg-slate-700 transition-all text-sm active:scale-[0.98]"
            >
              立即發佈
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

// --- 2. 主頁面 ---
export default function AnnouncementsPage() {
  const { profile } = useAuth(); // 💡 獲取目前登入者的部門資訊
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<Announcement | null>(null);
  const [loading, setLoading] = useState(true);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  
  const isAdmin = profile?.role === "admin"; 

  useEffect(() => { 
    const q = query(collection(db, "announcements"), orderBy("isPinned", "desc"), orderBy("date", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setAnnouncements(snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        category: doc.data().type || doc.data().category || "通知",
        date: doc.data().date?.toDate ? doc.data().date.toDate().toLocaleDateString('zh-TW') : doc.data().date
      })) as Announcement[]);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleSave = async (data: any, status: Status) => {
    try {
      if (editingItem) {
        await updateDoc(doc(db, "announcements", editingItem.id), { ...data, status, updatedAt: serverTimestamp() });
      } else {
        await addDoc(collection(db, "announcements"), {
          ...data,
          status,
          author: profile?.displayName || "管理員",
          date: serverTimestamp(),
        });
      }
      setEditingItem(null);
      setShowModal(false);
    } catch (e) { console.error("儲存失敗:", e); }
  };

  const togglePublish = async (id: string, currentStatus: Status) => {
    const newStatus = currentStatus === "published" ? "draft" : "published";
    await updateDoc(doc(db, "announcements", id), { status: newStatus });
  };

  if (loading) return <div className="h-screen flex items-center justify-center text-slate-300 font-bold italic text-sm tracking-widest">資料同步中...</div>;

  return (
    <div className="flex-1 h-screen overflow-y-auto bg-slate-50/50 p-8 lg:p-12 font-sans">
      <div className="max-w-4xl mx-auto">
        <header className="mb-12 flex justify-between items-center">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-1.5 h-6 bg-blue-500 rounded-full shadow-sm"></div>
              <h1 className="text-2xl font-bold text-slate-700 tracking-tight">系統公告</h1>
            </div>
            <p className="text-[10px] text-slate-400 mt-1 font-semibold uppercase tracking-widest ml-4">Announcement Management</p>
          </div>
          
          {isAdmin && (
            <button 
              onClick={() => { setEditingItem(null); setShowModal(true); }}
              className="px-8 py-3 bg-slate-800 text-white rounded-2xl text-xs font-bold shadow-lg hover:bg-slate-700 transition-all active:scale-95"
            >
              + 建立新公告
            </button>
          )}
        </header>

        <div className="space-y-6 pb-20">
          {announcements
            .filter(item => {
              // 💡 權限過濾邏輯
              if (isAdmin) return true; // 管理員看全部
              if (item.status !== "published") return false; // 員工不看草稿
              
              // 💡 部門過濾：顯示「全部」或是「所屬部門」的公告
              const userDept = profile?.department || "未分配";
              return item.targetDepartment === "全部" || item.targetDepartment === userDept;
            }) 
            .map((item) => (
              <div 
                key={item.id} 
                className={`bg-white rounded-[2rem] p-8 border ${
                  item.status === 'draft' ? 'border-dashed border-slate-200 opacity-80' : 'border-slate-50'
                } shadow-sm relative transition-all duration-300 hover:shadow-md`}
              >
                <div className="flex flex-wrap items-center gap-3 mb-5">
                  {item.status === 'published' ? (
                    <span className="flex items-center gap-1.5 text-[9px] font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-100">
                      <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                      發佈中
                    </span>
                  ) : (
                    <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-lg uppercase tracking-tighter">
                      草稿
                    </span>
                  )}
                  
                  {item.isPinned && <span className="text-[9px] font-bold text-amber-500 bg-amber-50 px-2.5 py-1 rounded-lg">置頂</span>}
                  
                  <span className={`text-[9px] font-bold px-2.5 py-1 rounded-lg uppercase ${
                    item.category === "重要" ? "text-red-500 bg-red-50" : "text-blue-500 bg-blue-50"
                  }`}>
                    {item.category}
                  </span>

                  {/* 💡 顯示公告對象部門標籤 (僅管理員可見) */}
                  {isAdmin && (
                    <span className="text-[9px] font-bold text-indigo-500 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-100 uppercase">
                      收件人: {item.targetDepartment}
                    </span>
                  )}
                  
                  <h2 className="font-bold text-slate-700 text-lg tracking-tight ml-1">{item.title}</h2>
                  <span className="ml-auto text-[10px] text-slate-300 font-medium font-mono">{item.date}</span>
                </div>
                
                <p className="text-sm text-slate-500 leading-relaxed font-medium mb-8 pl-1">{item.content}</p>
                
                <div className="flex justify-between items-center text-[10px] text-slate-300 font-bold border-t border-slate-50 pt-5">
                  <div className="flex items-center gap-4">
                    <span className="flex items-center gap-1">👤 來源：<span className="text-slate-400">{item.author}</span></span>
                    {isAdmin && (
                      <div className="flex items-center gap-4">
                        <button 
                          onClick={() => { setEditingItem(item); setShowModal(true); }}
                          className="text-blue-400 hover:text-blue-600 transition-colors"
                        >
                          編輯內容
                        </button>
                        <button 
                          onClick={() => togglePublish(item.id, item.status)}
                          className="text-slate-400 hover:text-slate-600 transition-colors"
                        >
                          {item.status === 'published' ? '下架回草稿' : '正式發佈'}
                        </button>
                      </div>
                    )}
                  </div>
                  {isAdmin && (
                    <button 
                      onClick={() => { if(confirm("確定刪除此公告？")) deleteDoc(doc(db, "announcements", item.id)) }} 
                      className="text-slate-200 hover:text-red-400 transition-colors"
                    >
                      移除
                    </button>
                  )}
                </div>
              </div>
            ))}
            
          {announcements.length === 0 && (
            <div className="text-center py-20 text-slate-300 font-bold italic text-sm uppercase tracking-[0.2em] opacity-60">
              目前尚無系統公告
            </div>
          )}
        </div>
      </div>

      <AnnouncementModal 
        show={showModal} 
        initialData={editingItem} 
        onClose={() => { setShowModal(false); setEditingItem(null); }} 
        onSave={handleSave} 
      />
    </div>
  );
}