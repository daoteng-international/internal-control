"use client";

import { useState, useEffect } from "react";
// --- 引入 Firebase 功能 ---
import { db } from "../../lib/firebase";
import { 
  collection, 
  query, 
  onSnapshot, 
  orderBy, 
  addDoc, 
  serverTimestamp 
} from "firebase/firestore";

// --- 類型定義 ---
type Category = "重要" | "通知" | "更新";
type TargetGroup = "全體同仁" | "營運" | "會計" | "遠端" | "數位部";

interface Announcement {
  id: string;
  category: Category;
  title: string;
  content: string;
  author: string;
  date: string;
  targets: TargetGroup[];
  isPinned: boolean;
}

// --- 1. 發佈公告彈窗 (連動 Firestore) ---
function CreateAnnouncementModal({ 
  show, 
  onClose, 
  onSave 
}: { 
  show: boolean; 
  onClose: () => void; 
  onSave: (data: any) => void 
}) {
  const [formData, setFormData] = useState({
    title: "",
    category: "通知" as Category,
    content: "",
    targets: [] as TargetGroup[],
    isPinned: false
  });

  const groups: TargetGroup[] = ["全體同仁", "營運", "會計", "遠端", "數位部"];

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95">
        <header className="p-6 border-b flex justify-between items-center bg-slate-50">
          <h3 className="font-bold text-slate-800 tracking-tight">建立新公告 (管理權限)</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors text-xl">✕</button>
        </header>

        <div className="p-8 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase">公告類型</label>
              <select 
                className="w-full border rounded-xl p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                value={formData.category}
                onChange={e => setFormData({...formData, category: e.target.value as Category})}
              >
                <option value="重要">重要 (紅色標籤)</option>
                <option value="通知">通知 (藍色標籤)</option>
                <option value="更新">更新 (灰色標籤)</option>
              </select>
            </div>
            <div className="space-y-1 text-right pt-6">
              <label className="inline-flex items-center gap-2 cursor-pointer group">
                <input 
                  type="checkbox" 
                  className="w-4 h-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                  checked={formData.isPinned}
                  onChange={e => setFormData({...formData, isPinned: e.target.checked})}
                />
                <span className="text-sm font-bold text-amber-600 group-hover:text-amber-700 transition-colors">置頂此公告</span>
              </label>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase">公告標題</label>
            <input 
              placeholder="請輸入清楚的標題..."
              className="w-full border rounded-xl p-3 text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium"
              value={formData.title}
              onChange={e => setFormData({...formData, title: e.target.value})}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase">發送群組 (可多選)</label>
            <div className="flex flex-wrap gap-2 pt-1">
              {groups.map(g => (
                <button
                  key={g}
                  type="button"
                  onClick={() => {
                    const newTargets = formData.targets.includes(g)
                      ? formData.targets.filter(t => t !== g)
                      : [...formData.targets, g];
                    setFormData({...formData, targets: newTargets});
                  }}
                  className={`px-4 py-2 rounded-full text-xs font-bold border transition-all ${
                    formData.targets.includes(g) 
                    ? "bg-slate-800 text-white border-slate-800 shadow-md scale-105" 
                    : "bg-white text-slate-500 border-slate-200 hover:border-slate-400"
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase">公告內容</label>
            <textarea 
              className="w-full border rounded-xl p-4 text-sm h-32 outline-none focus:ring-2 focus:ring-blue-500 resize-none bg-slate-50/50"
              placeholder="請詳細說明事項內容..."
              value={formData.content}
              onChange={e => setFormData({...formData, content: e.target.value})}
            />
          </div>
        </div>

        <footer className="p-6 border-t bg-slate-50 flex gap-3">
          <button 
            onClick={() => onSave(formData)}
            className="flex-1 bg-blue-600 text-white py-3.5 rounded-2xl font-bold shadow-lg hover:bg-blue-700 transition-all active:scale-[0.98]"
          >
            立即發佈公告
          </button>
          <button onClick={onClose} className="px-6 py-3.5 bg-white border text-slate-500 rounded-2xl font-bold hover:bg-slate-50 transition-colors">取消</button>
        </footer>
      </div>
    </div>
  );
}

// --- 2. 公告頁面主體 (實時連動版) ---
export default function AnnouncementsPage() {
  const [hasMounted, setHasMounted] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // 移除寫死的陣列，改為由 Firebase 驅動
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  useEffect(() => { 
    setHasMounted(true); 

    // 監聽 announcements 集合並按日期降序排列
    const q = query(collection(db, "announcements"), orderBy("date", "desc"));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => {
        const rawData = doc.data();
        return {
          id: doc.id,
          ...rawData,
          // 映射 Firebase 的 type 欄位到 UI 的 category 欄位
          category: rawData.type || rawData.category || "通知",
          // 處理日期顯示格式
          date: rawData.date?.toDate ? rawData.date.toDate().toLocaleDateString('zh-TW') : rawData.date
        };
      }) as Announcement[];
      
      setAnnouncements(data);
      setLoading(false);
    }, (error) => {
      console.error("Firestore 監聽失敗:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // 真正存入 Firebase 資料庫
  const handleSave = async (data: any) => {
    try {
      await addDoc(collection(db, "announcements"), {
        ...data,
        type: data.category, // 同步 Dashboard 使用的 type 欄位
        author: "管理員",
        date: serverTimestamp(), // 使用伺服器精確時間
      });
      setShowCreate(false);
    } catch (e) {
      console.error("公告發佈失敗:", e);
      alert("發佈失敗，請檢查權限設定");
    }
  };

  if (!hasMounted || loading) return <div className="flex-1 h-screen flex items-center justify-center bg-slate-50/30 font-bold">載入公告中...</div>;

  return (
    <div className="flex-1 h-screen overflow-y-auto bg-slate-50/30 p-8">
      <div className="max-w-5xl mx-auto">
        <header className="mb-10 flex justify-between items-end">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">📢 系統公告</h1>
            <p className="text-sm text-slate-500 mt-2">追蹤最新制度變更與系統更新說明</p>
          </div>
          <button 
            onClick={() => setShowCreate(true)}
            className="bg-slate-800 text-white px-6 py-3 rounded-2xl text-sm font-bold shadow-lg hover:bg-slate-700 transition-all flex items-center gap-2"
          >
            <span className="text-lg">+</span> 建立新公告
          </button>
        </header>

        <div className="space-y-4 pb-20">
          {announcements.map((item) => (
            <div
              key={item.id}
              className={`bg-white border rounded-2xl p-6 shadow-sm hover:shadow-md transition-all ${
                item.isPinned ? "border-amber-200 ring-1 ring-amber-50" : "border-slate-200"
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
                <div className="flex items-center gap-2">
                  {item.isPinned && (
                    <span className="bg-amber-400 text-white text-[10px] px-2 py-0.5 rounded font-bold shadow-sm">置頂</span>
                  )}
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                    item.category === "重要" ? "bg-red-50 text-red-600 border-red-100" :
                    item.category === "通知" ? "bg-blue-50 text-blue-600 border-blue-100" : "bg-slate-100 text-slate-600 border-slate-200"
                  }`}>
                    {item.category}
                  </span>
                  <h2 className="font-bold text-slate-800">{item.title}</h2>
                </div>
                <span className="sm:ml-auto text-xs text-slate-400 font-mono">{item.date}</span>
              </div>

              <p className="text-sm text-slate-600 leading-relaxed border-l-4 border-slate-100 pl-4">
                {item.content}
              </p>

              <div className="mt-6 pt-4 border-t border-slate-50 flex justify-between items-center text-[11px] text-slate-400">
                <div className="flex gap-4">
                  <span>發佈：{item.author}</span>
                  <span>對象：{item.targets?.join(", ") || "全體同仁"}</span>
                </div>
                <button className="text-blue-500 font-bold hover:text-blue-700">詳細內容 →</button>
              </div>
            </div>
          ))}
          {announcements.length === 0 && (
            <div className="text-center py-20 text-slate-400 italic">目前尚無公告資料</div>
          )}
        </div>
      </div>

      <CreateAnnouncementModal 
        show={showCreate} 
        onClose={() => setShowCreate(false)}
        onSave={handleSave}
      />
    </div>
  );
}