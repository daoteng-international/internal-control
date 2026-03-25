"use client";

import { useState, useMemo, useEffect } from "react";
import { db, storage } from "@/lib/firebase"; 
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  deleteDoc, 
  doc, 
  query, 
  orderBy, 
  serverTimestamp 
} from "firebase/firestore";
import { 
  ref, 
  uploadBytes, 
  getDownloadURL 
} from "firebase/storage";

// --- 類型定義 ---
type DocCategory = "全部" | "館別手冊" | "作業規範" | "法務合約" | "系統教學";

interface DocumentItem {
  id: string;
  category: DocCategory;
  title: string;
  description: string;
  format: "PDF" | "DOCX" | "Video" | "Link";
  updatedAt: any;
  target: string; 
  url: string; // 雲端儲存後的下載網址
}

export default function DocumentPage() {
  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [activeTab, setActiveTab] = useState<DocCategory>("全部");
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  
  // 新文件表單狀態
  const [newDoc, setNewDoc] = useState({
    title: "",
    category: "館別手冊" as DocCategory,
    description: "",
    format: "PDF" as const,
    target: "全體同仁",
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // 1. 監聽雲端資料庫
  useEffect(() => {
    const q = query(collection(db, "documents"), orderBy("updatedAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setDocs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as DocumentItem[]);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // 2. 實作本機上傳與儲存
  const handleUploadAndSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDoc.title || !selectedFile) return alert("請填寫標題並選擇本機檔案");

    setUploading(true);
    try {
      // Step A: 將檔案上傳至 Firebase Storage
      const fileRef = ref(storage, `education_docs/${Date.now()}_${selectedFile.name}`);
      const uploadResult = await uploadBytes(fileRef, selectedFile);
      const downloadURL = await getDownloadURL(uploadResult.ref);

      // Step B: 將檔案資訊與下載連結寫入 Firestore
      await addDoc(collection(db, "documents"), {
        ...newDoc,
        url: downloadURL,
        updatedAt: serverTimestamp()
      });

      setIsModalOpen(false);
      setSelectedFile(null);
      setNewDoc({ title: "", category: "館別手冊", description: "", format: "PDF", target: "全體同仁" });
      alert("✅ 教育文件已成功上傳並發布。");
    } catch (error) {
      console.error("上傳失敗:", error);
      alert("上傳失敗，請確認 Firebase Storage 權限設定。");
    } finally {
      setUploading(false);
    }
  };

  const filteredDocs = useMemo(() => {
    return activeTab === "全部" ? docs : docs.filter(doc => doc.category === activeTab);
  }, [activeTab, docs]);

  if (loading) return (
    <div className="h-screen w-full flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">正在同步雲端教育文件...</p>
      </div>
    </div>
  );

  return (
    <div className="flex-1 h-screen overflow-y-auto bg-slate-50/30 p-8 font-sans">
      <div className="max-w-6xl mx-auto">
        
        {/* Header */}
        <header className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-3">
              📚 教育文件管理中心
              <span className="text-[10px] bg-emerald-500 text-white px-2 py-0.5 rounded-full animate-pulse uppercase tracking-tighter">Live</span>
            </h1>
            <p className="text-sm text-slate-500 mt-2 font-medium">供同仁下載最新的 SOP 作業規範、館別手冊與法務合約。</p>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex bg-white p-1 rounded-2xl border border-slate-200 shadow-sm w-fit overflow-hidden">
              {["全部", "館別手冊", "作業規範", "法務合約", "系統教學"].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveTab(cat as DocCategory)}
                  className={`px-4 py-2 text-xs font-bold rounded-xl transition-all ${
                    activeTab === cat ? "bg-slate-900 text-white shadow-md" : "text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
            <button 
              onClick={() => setIsModalOpen(true)}
              className="bg-blue-600 text-white px-6 py-2.5 rounded-2xl text-xs font-black shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all active:scale-95"
            >
              + 上傳本機文件
            </button>
          </div>
        </header>

        {/* 文件列表區 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredDocs.map((docItem) => (
            <div 
              key={docItem.id}
              className="group bg-white border border-slate-200 rounded-[32px] p-7 shadow-sm hover:shadow-2xl transition-all duration-500 flex flex-col relative"
            >
              <div className="flex justify-between items-start mb-4">
                <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black border uppercase ${
                  docItem.format === "PDF" ? "bg-red-50 text-red-600 border-red-100" :
                  docItem.format === "DOCX" ? "bg-blue-50 text-blue-600 border-blue-100" :
                  "bg-amber-50 text-amber-600 border-amber-100"
                }`}>
                  {docItem.format}
                </span>
                <button 
                  onClick={() => { if(confirm("確定刪除此文件？")) deleteDoc(doc(db, "documents", docItem.id)); }}
                  className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-all text-xs font-bold p-1"
                >
                  🗑️ 刪除
                </button>
              </div>

              <h3 className="font-black text-slate-800 text-lg mb-2 line-clamp-1">{docItem.title}</h3>
              <p className="text-xs text-slate-500 leading-relaxed flex-1 line-clamp-2 font-medium mb-6">
                {docItem.description || "暫無詳細描述內容。"}
              </p>

              <div className="pt-5 border-t border-slate-50 flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[9px] text-slate-400 font-black uppercase tracking-widest mb-1">適用對象</span>
                  <span className="text-xs font-bold text-slate-700">{docItem.target}</span>
                </div>
                <a 
                  href={docItem.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black bg-slate-900 text-white hover:bg-blue-600 transition-all shadow-md active:scale-95"
                >
                  下載文件 ↓
                </a>
              </div>
            </div>
          ))}
          {filteredDocs.length === 0 && (
            <div className="col-span-full py-24 text-center border-2 border-dashed border-slate-200 rounded-[40px] bg-white/50">
              <p className="text-slate-400 font-bold italic">目前尚無此分類之教育文件內容。</p>
            </div>
          )}
        </div>

        {/* 上傳文件彈窗 */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <div className="bg-white rounded-[40px] w-full max-w-lg p-10 shadow-2xl animate-in zoom-in-95 duration-300">
              <h2 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-2">
                <span className="w-8 h-8 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center">＋</span>
                上傳教育文件 (本機檔案)
              </h2>
              <form onSubmit={handleUploadAndSave} className="space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 ml-1 uppercase">文件標題</label>
                    <input className="w-full border border-slate-100 bg-slate-50 rounded-2xl p-3 text-sm outline-none focus:border-blue-500 transition-all" value={newDoc.title} onChange={e => setNewDoc({...newDoc, title: e.target.value})} placeholder="例如：S3 報價單指引" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 ml-1 uppercase">所屬分類</label>
                    <select className="w-full border border-slate-100 bg-slate-50 rounded-2xl p-3 text-sm outline-none focus:border-blue-500 appearance-none cursor-pointer" value={newDoc.category} onChange={e => setNewDoc({...newDoc, category: e.target.value as DocCategory})}>
                      {["館別手冊", "作業規範", "法務合約", "系統教學"].map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 ml-1 uppercase">選擇本機檔案</label>
                  <input 
                    type="file" 
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                    className="w-full text-sm text-slate-500 file:mr-4 file:py-2.5 file:px-5 file:rounded-xl file:border-0 file:text-[10px] file:font-black file:uppercase file:bg-blue-600 file:text-white hover:file:bg-black transition-all file:cursor-pointer"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 ml-1 uppercase">文件格式</label>
                    <select className="w-full border border-slate-100 bg-slate-50 rounded-2xl p-3 text-sm outline-none focus:border-blue-500 appearance-none cursor-pointer" value={newDoc.format} onChange={e => setNewDoc({...newDoc, format: e.target.value as any})}>
                      {["PDF", "DOCX", "Video", "Link"].map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 ml-1 uppercase">適用對象</label>
                    <input className="w-full border border-slate-100 bg-slate-50 rounded-2xl p-3 text-sm outline-none focus:border-blue-500 transition-all" value={newDoc.target} onChange={e => setNewDoc({...newDoc, target: e.target.value})} placeholder="例如：全體同仁" />
                  </div>
                </div>
                
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 ml-1 uppercase">文件簡短描述</label>
                  <textarea className="w-full border border-slate-100 bg-slate-50 rounded-2xl p-4 text-sm h-24 outline-none focus:border-blue-500 resize-none transition-all" placeholder="請輸入對此文件的簡單說明內容..." value={newDoc.description} onChange={e => setNewDoc({...newDoc, description: e.target.value})} />
                </div>
                
                <div className="flex gap-4 pt-4">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-4 text-xs font-black text-slate-400 uppercase tracking-widest hover:text-slate-600 transition-colors">取消</button>
                  <button 
                    type="submit" 
                    disabled={uploading}
                    className="flex-1 py-4 bg-slate-900 text-white rounded-[20px] text-xs font-black uppercase tracking-widest disabled:bg-slate-300 shadow-xl shadow-slate-900/10 hover:bg-blue-600 transition-all"
                  >
                    {uploading ? "正在上傳同步..." : "確認發布檔案"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 8px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
      `}</style>
    </div>
  );
}