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

/* ============================================================
   配色：與看板、儀表板、房型維護使用同一套視覺語言
   ============================================================ */
const C = {
  ink: "#1A1A18",
  body: "#3A3833",
  muted: "#8A8780",
  faint: "#B0ADA6",
  hairline: "#E8E6E1",
  surface: "#FAFAF8",
  page: "#F5F4F1",
  accent: "#4E6A74",
  success: "#4F7A52",
  warn: "#A97B22",
  danger: "#B4483C",
};

// --- 類型定義 ---
type DocCategory = "全部" | "館別手冊" | "作業規範" | "法務合約" | "系統教學";
type DocFormat = "PDF" | "DOCX" | "Video" | "Link";

interface DocumentItem {
  id: string;
  category: DocCategory;
  title: string;
  description: string;
  format: DocFormat;
  updatedAt: any;
  target: string; 
  url: string; // 雲端儲存後的下載網址
}

/** 檔案格式標示：用低彩度色系區分，不搶走標題的視覺重量 */
const FORMAT_STYLE: Record<DocFormat, { bg: string; color: string }> = {
  PDF: { bg: "#FBF2F0", color: C.danger },
  DOCX: { bg: "#EDF1F2", color: C.accent },
  Video: { bg: "#FAF3E5", color: C.warn },
  Link: { bg: "#F0EEE9", color: C.muted },
};

const fieldClass =
  "w-full bg-[#FAFAF8] border border-[#E8E6E1] rounded-lg px-3 py-2.5 text-[13px] text-[#1A1A18] outline-none transition-colors focus:bg-white focus:border-[#B0ADA6] placeholder:text-[#C4C1B9]";

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-[11px] font-medium text-[#8A8780] mb-1.5">{children}</label>;
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
    format: "PDF" as DocFormat,
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

  // 各分類的文件數量，讓使用者切換前就知道有沒有內容
  const countByCategory = useMemo(() => {
    const m = new Map<string, number>();
    docs.forEach((d) => m.set(d.category, (m.get(d.category) || 0) + 1));
    return m;
  }, [docs]);

  if (loading) return (
    <div
      className="flex-1 h-screen flex items-center justify-center text-[13px] text-[#A5A29B]"
      style={{ backgroundColor: C.page }}
    >
      正在同步雲端教育文件…
    </div>
  );

  return (
    <div
      className="flex-1 h-screen overflow-y-auto custom-scrollbar font-sans"
      style={{ backgroundColor: C.page }}
    >
      <div className="max-w-6xl mx-auto px-8 py-8">
        
        {/* --- 頁首 --- */}
        <header className="flex flex-wrap items-start justify-between gap-4 pb-5 border-b border-[#E0DDD6]">
          <div>
            <h1 className="text-[22px] font-semibold text-[#1A1A18] tracking-tight">教育文件管理</h1>
            <p className="text-[11px] text-[#A5A29B] mt-1">
              供同仁下載最新的 SOP 作業規範、館別手冊與法務合約
            </p>
          </div>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="bg-[#1A1A18] text-white px-5 py-2.5 rounded-lg text-[13px] font-medium hover:bg-black transition-colors whitespace-nowrap"
          >
            上傳文件
          </button>
        </header>

        {/* --- 分類切換 --- */}
        <div className="flex flex-wrap gap-1.5 mt-5 mb-5">
          {(["全部", "館別手冊", "作業規範", "法務合約", "系統教學"] as DocCategory[]).map((cat) => {
            const active = activeTab === cat;
            const count = cat === "全部" ? docs.length : countByCategory.get(cat) || 0;
            return (
              <button
                key={cat}
                onClick={() => setActiveTab(cat)}
                className={`px-3.5 py-2 text-[12px] font-medium rounded-lg border transition-all ${
                  active
                    ? "bg-[#1A1A18] text-white border-[#1A1A18]"
                    : "bg-white text-[#8A8780] border-[#E0DDD6] hover:border-[#B0ADA6]"
                }`}
              >
                {cat}
                <span className={`ml-1.5 tabular-nums ${active ? "text-white/60" : "text-[#B0ADA6]"}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* --- 文件列表 --- */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDocs.map((docItem) => {
            const fmt = FORMAT_STYLE[docItem.format] || FORMAT_STYLE.Link;
            return (
              <div 
                key={docItem.id}
                className="group bg-white border border-[#E8E6E1] rounded-lg px-5 py-4 hover:border-[#D5D2CB] transition-colors flex flex-col"
              >
                <div className="flex justify-between items-start mb-3">
                  <span
                    className="px-2 py-0.5 rounded text-[10px] font-medium"
                    style={{ backgroundColor: fmt.bg, color: fmt.color }}
                  >
                    {docItem.format}
                  </span>
                  {/* 刪除是不可逆操作，平常不佔位置，滑鼠移到卡片才出現 */}
                  <button 
                    onClick={() => {
                      if (confirm(`確定刪除「${docItem.title}」？\n\n此動作無法復原。`)) {
                        deleteDoc(doc(db, "documents", docItem.id));
                      }
                    }}
                    className="opacity-0 group-hover:opacity-100 text-[11px] text-[#A5A29B] hover:text-[#B4483C] transition-all"
                  >
                    刪除
                  </button>
                </div>

                <h3 className="text-[15px] font-semibold text-[#1A1A18] leading-snug tracking-tight line-clamp-2 mb-1.5">
                  {docItem.title}
                </h3>
                <p className="text-[12px] text-[#8A8780] leading-relaxed line-clamp-2 flex-1">
                  {docItem.description || "尚無說明"}
                </p>

                <div className="mt-4 pt-3 border-t border-[#F0EEE9] flex items-center justify-between gap-3">
                  <span className="text-[11px] text-[#B0ADA6] truncate">{docItem.target}</span>
                  <a 
                    href={docItem.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="shrink-0 px-3 py-1.5 rounded-md text-[12px] font-medium text-[#3A3833] border border-[#E0DDD6] hover:border-[#B0ADA6] hover:bg-[#FAFAF8] transition-colors"
                  >
                    下載
                  </a>
                </div>
              </div>
            );
          })}
          {filteredDocs.length === 0 && (
            <div className="col-span-full py-20 text-center border border-dashed border-[#E0DDD6] rounded-lg bg-white">
              <p className="text-[12px] text-[#A5A29B]">
                {activeTab === "全部" ? "尚未上傳任何教育文件" : `「${activeTab}」分類目前沒有文件`}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* --- 上傳文件彈窗 --- */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 font-sans">
          <div
            className="absolute inset-0 bg-[#1A1A18]/40 backdrop-blur-[2px]"
            onClick={() => !uploading && setIsModalOpen(false)}
          />
          <div className="relative bg-white rounded-xl w-full max-w-lg shadow-[0_20px_60px_rgba(0,0,0,0.16)] overflow-hidden">
            <header className="px-6 py-5 border-b border-[#E8E6E1] flex justify-between items-start">
              <div>
                <div className="text-[10px] font-semibold text-[#B0ADA6] tracking-[0.16em] uppercase mb-1.5">
                  Upload
                </div>
                <h2 className="text-[17px] font-semibold text-[#1A1A18] tracking-tight">上傳教育文件</h2>
              </div>
              <button
                type="button"
                onClick={() => !uploading && setIsModalOpen(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[#A5A29B] hover:bg-[#F5F4F1] hover:text-[#1A1A18] transition-colors"
              >
                ✕
              </button>
            </header>

            <form onSubmit={handleUploadAndSave}>
              <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto custom-scrollbar">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <FieldLabel>文件標題</FieldLabel>
                    <input
                      className={fieldClass}
                      value={newDoc.title}
                      onChange={e => setNewDoc({...newDoc, title: e.target.value})}
                      placeholder="例如：S3 報價單指引"
                    />
                  </div>
                  <div>
                    <FieldLabel>所屬分類</FieldLabel>
                    <select
                      className={fieldClass}
                      value={newDoc.category}
                      onChange={e => setNewDoc({...newDoc, category: e.target.value as DocCategory})}
                    >
                      {["館別手冊", "作業規範", "法務合約", "系統教學"].map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <FieldLabel>選擇本機檔案</FieldLabel>
                  <input 
                    type="file" 
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                    className="w-full text-[12px] text-[#8A8780] file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border file:border-[#E0DDD6] file:text-[12px] file:font-medium file:bg-white file:text-[#3A3833] hover:file:border-[#B0ADA6] file:cursor-pointer file:transition-colors"
                  />
                  {selectedFile && (
                    <p className="text-[11px] text-[#B0ADA6] mt-2 truncate">
                      已選擇 {selectedFile.name}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <FieldLabel>文件格式</FieldLabel>
                    <select
                      className={fieldClass}
                      value={newDoc.format}
                      onChange={e => setNewDoc({...newDoc, format: e.target.value as DocFormat})}
                    >
                      {["PDF", "DOCX", "Video", "Link"].map(f => (
                        <option key={f} value={f}>{f}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <FieldLabel>適用對象</FieldLabel>
                    <input
                      className={fieldClass}
                      value={newDoc.target}
                      onChange={e => setNewDoc({...newDoc, target: e.target.value})}
                      placeholder="例如：全體同仁"
                    />
                  </div>
                </div>
                
                <div>
                  <FieldLabel>文件說明</FieldLabel>
                  <textarea
                    className={`${fieldClass} h-24 resize-none leading-relaxed`}
                    placeholder="簡短說明這份文件的用途"
                    value={newDoc.description}
                    onChange={e => setNewDoc({...newDoc, description: e.target.value})}
                  />
                </div>
              </div>
              
              <footer className="px-6 py-4 border-t border-[#E8E6E1] bg-white flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={uploading}
                  className="text-[12px] text-[#A5A29B] hover:text-[#1A1A18] transition-colors disabled:opacity-50"
                >
                  取消
                </button>
                <button 
                  type="submit" 
                  disabled={uploading}
                  className="ml-auto bg-[#1A1A18] text-white px-8 py-3 rounded-lg text-[13px] font-medium hover:bg-black transition-colors disabled:opacity-50"
                >
                  {uploading ? "上傳中…" : "發布文件"}
                </button>
              </footer>
            </form>
          </div>
        </div>
      )}

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 10px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #D5D2CB; border-radius: 999px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #B0ADA6; }
      `}</style>
    </div>
  );
}
