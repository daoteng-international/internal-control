"use client";

import { useState, useEffect } from "react";
import { db, auth } from "@/lib/firebase"; 
import { useAuth } from "@/lib/auth-context"; 
import { sendPasswordResetEmail, createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { 
  collection, 
  onSnapshot, 
  doc, 
  updateDoc,
  query,
  orderBy,
  addDoc,
  setDoc,
  where,
  deleteDoc,
  serverTimestamp
} from "firebase/firestore";

// --- 類型定義 ---
type Role = "admin" | "staff";
type Department = "未分配" | "營運部" | "財務部" | "工務" | "遠端";

interface UserProfile {
  id: string;
  displayName: string;
  email: string;
  role: Role;
  status: string;
  phone?: string;
  extension?: string;
  department?: Department;
}

export default function UserManagementPage() {
  const { profile } = useAuth(); 
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [formData, setFormData] = useState({ 
    displayName: "", 
    email: "", 
    role: "staff" as Role,
    phone: "",
    extension: "",
    department: "未分配" as Department,
    password: ""
  });
  
  const currentUserId = profile?.uid || "bfWKqxutqcNp3xEBUCbTNnoB3YQ2"; 

  useEffect(() => {
    const q = query(
      collection(db, "users"), 
      where("role", "in", ["admin", "staff"]), 
      orderBy("displayName", "asc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setUsers(snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data() 
      } as UserProfile)));
      setLoading(false);
    }, (error) => {
      console.error("Firestore 查詢錯誤:", error);
    });
    return () => unsubscribe();
  }, []);

  const openModal = (user: UserProfile | null = null) => {
    if (user) {
      setEditingUser(user);
      setFormData({ 
        displayName: user.displayName, 
        email: user.email, 
        role: user.role,
        phone: user.phone || "",
        extension: user.extension || "",
        department: user.department || "未分配",
        password: ""
      });
    } else {
      setEditingUser(null);
      setFormData({ displayName: "", email: "", role: "staff", phone: "", extension: "", department: "未分配", password: "" });
    }
    setShowModal(true);
  };

  const handleSaveUser = async () => {
    if (!formData.displayName || !formData.email) return alert("請填寫姓名與 Email");
    if (!editingUser && !formData.password) return alert("請設定初始密碼");
    
    try {
      if (editingUser) {
        await updateDoc(doc(db, "users", editingUser.id), {
          displayName: formData.displayName,
          role: formData.role,
          phone: formData.phone,
          extension: formData.extension,
          department: formData.department,
          updatedAt: serverTimestamp()
        });

        await addDoc(collection(db, "logs"), {
          user: profile?.displayName || "管理員",
          action: "修改人員資料",
          details: `修改了人員：${formData.displayName} (部門：${formData.department})`,
          type: "security",
          timestamp: serverTimestamp()
        });
      } else {
        // 💡 建立 Firebase Auth 帳號
        const userCredential = await createUserWithEmailAndPassword(
          auth,
          formData.email,
          formData.password
        );
        const newUid = userCredential.user.uid;

        // 💡 設定 Auth 的 displayName
        await updateProfile(userCredential.user, {
          displayName: formData.displayName
        });

        // 💡 用 Auth UID 當文件 ID 寫入 Firestore
        await setDoc(doc(db, "users", newUid), {
          displayName: formData.displayName,
          email: formData.email,
          role: formData.role,
          phone: formData.phone,
          extension: formData.extension,
          department: formData.department,
          createdAt: serverTimestamp(),
          status: "ACTIVE"
        });

        await addDoc(collection(db, "logs"), {
          user: profile?.displayName || "管理員",
          action: "新增帳號",
          details: `建立了新人員：${formData.displayName} (部門：${formData.department})`,
          type: "security",
          timestamp: serverTimestamp()
        });
      }

      setShowModal(false);
      alert(editingUser ? "資料更新成功！" : "帳號建立成功！");
    } catch (e: any) {
      console.error(e);
      if (e.code === "auth/email-already-in-use") {
        alert("此 Email 已被註冊，請使用其他 Email。");
      } else if (e.code === "auth/weak-password") {
        alert("密碼強度不足，請設定至少 6 位數密碼。");
      } else {
        alert("操作失敗：" + e.message);
      }
    }
  };

  const handleResetPassword = async () => {
    if (!formData.email) return;
    try {
      await sendPasswordResetEmail(auth, formData.email);
      alert(`已成功發送重設密碼郵件至：${formData.email} \n請提醒同仁收信。`);
    } catch (e) {
      console.error(e);
      alert("發送重設郵件失敗");
    }
  };

  const handleDeleteUser = async (user: UserProfile) => {
    if (user.id === currentUserId) return alert("⚠️ 無法刪除您目前的登入帳號。");
    if (!confirm(`確定要永久刪除人員「${user.displayName}」嗎？此操作將無法復原。`)) return;

    try {
      await deleteDoc(doc(db, "users", user.id));
      await addDoc(collection(db, "logs"), {
        user: profile?.displayName || "管理員",
        action: "刪除帳號",
        details: `刪除了人員帳號：${user.displayName} (${user.email})`,
        type: "security",
        timestamp: serverTimestamp()
      });
      alert("帳號已成功刪除");
    } catch (e) { console.error(e); }
  };

  if (loading) return <div className="h-screen flex items-center justify-center text-slate-300 font-bold italic tracking-widest text-sm">人員數據同步中...</div>;

  return (
    <div className="flex-1 min-h-screen bg-slate-50/50 p-8 lg:p-12 font-sans text-slate-700">
      <div className="max-w-6xl mx-auto">
        <header className="mb-10 flex justify-between items-end">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-1.5 h-6 bg-indigo-500 rounded-full shadow-sm"></div>
              <h1 className="text-2xl font-bold text-slate-700 tracking-tight">帳號權限管理</h1>
            </div>
            <p className="text-[10px] text-slate-400 mt-1 font-semibold uppercase tracking-widest ml-4">Access Control & Staff Directory</p>
          </div>
          <button onClick={() => openModal()} className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-bold shadow-lg hover:bg-indigo-700 transition-all active:scale-95">
            + 新增人員帳號
          </button>
        </header>

        <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-widest">
              <tr>
                <th className="px-8 py-5">使用者名稱 / 部門</th>
                <th className="px-6 py-5">Email</th>
                <th className="px-6 py-5">聯繫資訊</th>
                <th className="px-6 py-5">權限</th>
                <th className="px-8 py-5 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-sm">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-500 font-bold text-xs border border-indigo-100 shadow-sm">
                        {user.displayName?.charAt(0) || "U"}
                      </div>
                      <div>
                        <div className="font-bold">{user.displayName}</div>
                        <div className="text-[10px] text-indigo-400 font-semibold uppercase mt-0.5">{user.department || "未分配"}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-6 text-slate-400 font-medium">{user.email}</td>
                  <td className="px-6 py-6">
                    <div className="text-[11px] font-bold text-slate-600">{user.phone || "--"}</div>
                    <div className="text-[10px] text-slate-400 mt-1 font-semibold">EXT: {user.extension || "--"}</div>
                  </td>
                  <td className="px-6 py-6">
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border uppercase ${
                      user.role === "admin" ? "text-indigo-600 bg-indigo-50 border-indigo-100" : "text-slate-400 bg-slate-100 border-slate-200"
                    }`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="px-8 py-6 text-right space-x-4">
                    <button onClick={() => openModal(user)} className="text-blue-500 font-bold hover:underline">編輯</button>
                    {user.id !== currentUserId && (
                      <button onClick={() => handleDeleteUser(user)} className="text-red-400 font-bold hover:underline">刪除</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 新增/編輯 彈窗 */}
        {showModal && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-6 overflow-y-auto">
            <div className="bg-white rounded-[2rem] p-8 w-full max-w-lg shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-200 my-auto">
              <h3 className="text-xl font-bold text-slate-700 mb-6">{editingUser ? "編輯人員資料" : "新增系統人員"}</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">人員姓名</label>
                  <input className="w-full border rounded-xl p-3 text-sm bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-500 font-bold mt-1" value={formData.displayName} onChange={e => setFormData({...formData, displayName: e.target.value})} />
                </div>
                <div className="col-span-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">所屬部門</label>
                  <select className="w-full border rounded-xl p-3 text-sm bg-slate-50 font-bold outline-none focus:ring-2 focus:ring-indigo-500 mt-1" value={formData.department} onChange={e => setFormData({...formData, department: e.target.value as Department})}>
                    <option value="未分配">未分配</option>
                    <option value="營運部">營運部</option>
                    <option value="財務部">財務部</option>
                    <option value="工務">工務</option>
                    <option value="遠端">遠端</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Email 地址 {editingUser && "(唯讀)"}</label>
                  <input className={`w-full border rounded-xl p-3 text-sm mt-1 font-medium ${editingUser ? "bg-slate-100 text-slate-400 cursor-not-allowed border-transparent" : "bg-slate-50 border-slate-100 focus:ring-2 focus:ring-indigo-500"}`} value={formData.email} readOnly={!!editingUser} onChange={e => setFormData({...formData, email: e.target.value})} />
                </div>

                {/* 💡 密碼管理區塊 */}
                {editingUser ? (
                  <div className="col-span-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">帳號安全管理</label>
                    <button 
                      onClick={handleResetPassword}
                      className="w-full mt-1 py-3 border border-indigo-200 text-indigo-600 rounded-xl text-[11px] font-bold hover:bg-indigo-50 transition-colors flex items-center justify-center gap-2"
                    >
                      📧 發送重設密碼信件給該同仁
                    </button>
                  </div>
                ) : (
                  <div className="col-span-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">初始登入密碼</label>
                    <input 
                      type="password"
                      className="w-full border border-slate-100 rounded-xl p-3 text-sm bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-500 mt-1 font-medium" 
                      placeholder="請設定至少 6 位數密碼"
                      value={formData.password} 
                      onChange={e => setFormData({...formData, password: e.target.value})} 
                    />
                  </div>
                )}

                <div className="col-span-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">手機電話</label>
                  <input className="w-full border rounded-xl p-3 text-sm bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-500 mt-1 font-medium" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
                </div>
                <div className="col-span-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">分機號碼</label>
                  <input className="w-full border rounded-xl p-3 text-sm bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-500 mt-1 font-medium" value={formData.extension} onChange={e => setFormData({...formData, extension: e.target.value})} />
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">權限角色</label>
                  <select className="w-full border rounded-xl p-3 text-sm bg-slate-50 font-bold outline-none focus:ring-2 focus:ring-indigo-500 mt-1" value={formData.role} onChange={e => setFormData({...formData, role: e.target.value as Role})}>
                    <option value="staff">👥 一般人員 (Staff)</option>
                    <option value="admin">🚀 管理員 (Admin)</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3 pt-8">
                <button onClick={() => setShowModal(false)} className="flex-1 py-3 text-slate-400 font-bold text-sm">取消</button>
                <button onClick={handleSaveUser} className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold shadow-lg text-sm active:scale-95">確認儲存</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}