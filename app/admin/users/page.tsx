"use client";

import { useState, useEffect, useMemo } from "react";
import { db, auth } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import {
  collection,
  onSnapshot,
  doc,
  updateDoc,
  query,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";

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

/**
 * 角色白名單與 Storage 規則的 isInternal() 同一份名單。
 * 這個 Firebase 專案由多個系統共用，角色名稱大小寫並不一致，
 * 清單只撈得到 admin / staff 的話，其他系統建立的同仁會整個消失。
 */
const INTERNAL_ROLES = ["ADMIN", "admin", "FINANCE", "OPERATOR", "staff"] as const;
type Role = (typeof INTERNAL_ROLES)[number];

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "管理員",
  admin: "管理員",
  FINANCE: "財務",
  OPERATOR: "操作員",
  staff: "一般人員",
};

const ROLE_TONE: Record<string, { bg: string; color: string }> = {
  ADMIN: { bg: "#EDF1F2", color: C.accent },
  admin: { bg: "#EDF1F2", color: C.accent },
  FINANCE: { bg: "#FAF3E5", color: C.warn },
  OPERATOR: { bg: "#F1F5F0", color: C.success },
  staff: { bg: "#F0EEE9", color: C.muted },
};

type Department = "未分配" | "營運部" | "財務部" | "工務" | "遠端";
const DEPARTMENTS: Department[] = ["未分配", "營運部", "財務部", "工務", "遠端"];

interface UserProfile {
  id: string;
  displayName: string;
  email: string;
  role: string;
  status?: string;
  phone?: string;
  extension?: string;
  department?: Department;
}

const fieldClass =
  "w-full bg-[#FAFAF8] border border-[#E8E6E1] rounded-lg px-3 py-2.5 text-[13px] text-[#1A1A18] outline-none transition-colors focus:bg-white focus:border-[#B0ADA6] placeholder:text-[#C4C1B9]";

const readonlyClass =
  "w-full bg-[#F0EEE9] border border-[#E8E6E1] rounded-lg px-3 py-2.5 text-[13px] text-[#8A8780]";

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-[11px] font-medium text-[#8A8780] mb-1.5">
      {children}
      {required && <span className="text-[#B4483C] ml-0.5">*</span>}
    </label>
  );
}

function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <h3 className="text-[11px] font-semibold text-[#8A8780] tracking-[0.12em] uppercase shrink-0">
        {children}
      </h3>
      <div className="h-px bg-[#E8E6E1] flex-1" />
    </div>
  );
}

export default function UserManagementPage() {
  const { profile } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const [formData, setFormData] = useState({
    displayName: "",
    email: "",
    role: "staff" as Role,
    phone: "",
    extension: "",
    department: "未分配" as Department,
    password: "",
  });

  // 重設密碼與新增帳號分開，避免編輯資料時誤觸
  const [newPassword, setNewPassword] = useState("");
  const [resetting, setResetting] = useState(false);

  const currentUserId = profile?.uid || "";

  useEffect(() => {
    // 不在查詢層過濾角色 —— 其他系統可能寫入白名單外的值，
    // 在前端過濾才看得見那些資料並加以修正
    const unsubscribe = onSnapshot(
      query(collection(db, "users")),
      (snapshot) => {
        const list = snapshot.docs
          .map((d) => ({ id: d.id, ...d.data() } as UserProfile))
          .filter((u) => INTERNAL_ROLES.includes(u.role as Role))
          .sort((a, b) => (a.displayName || "").localeCompare(b.displayName || "", "zh-Hant"));
        setUsers(list);
        setLoading(false);
      },
      (error) => {
        console.error("Firestore 查詢錯誤:", error);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  const filtered = useMemo(() => {
    const k = keyword.trim().toLowerCase();
    if (!k) return users;
    return users.filter(
      (u) =>
        (u.displayName || "").toLowerCase().includes(k) ||
        (u.email || "").toLowerCase().includes(k) ||
        (u.department || "").includes(k)
    );
  }, [users, keyword]);

  const openModal = (user: UserProfile | null = null) => {
    setResult(null);
    setNewPassword("");
    if (user) {
      setEditingUser(user);
      setFormData({
        displayName: user.displayName || "",
        email: user.email || "",
        role: (user.role as Role) || "staff",
        phone: user.phone || "",
        extension: user.extension || "",
        department: user.department || "未分配",
        password: "",
      });
    } else {
      setEditingUser(null);
      setFormData({
        displayName: "",
        email: "",
        role: "staff",
        phone: "",
        extension: "",
        department: "未分配",
        password: "",
      });
    }
    setShowModal(true);
  };

  /** 呼叫伺服器端的帳號管理 API */
  const callApi = async (payload: Record<string, unknown>) => {
    const user = auth.currentUser;
    if (!user) throw new Error("登入狀態已失效，請重新登入");
    const idToken = await user.getIdToken();
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken, ...payload }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "操作失敗");
    return data;
  };

  const handleSaveUser = async () => {
    if (!formData.displayName || !formData.email) {
      setResult({ ok: false, text: "請填寫姓名與 Email" });
      return;
    }

    setSaving(true);
    setResult(null);
    try {
      if (editingUser) {
        // 編輯只動 Firestore 的欄位，不涉及 Auth
        await updateDoc(doc(db, "users", editingUser.id), {
          displayName: formData.displayName,
          role: formData.role,
          phone: formData.phone,
          extension: formData.extension,
          department: formData.department,
          updatedAt: serverTimestamp(),
        });
        await addDoc(collection(db, "logs"), {
          user: profile?.displayName || "管理員",
          action: "修改人員資料",
          details: `修改了人員：${formData.displayName}（部門：${formData.department}／權限：${formData.role}）`,
          type: "security",
          timestamp: serverTimestamp(),
        });
        setShowModal(false);
      } else {
        // 建立走伺服器端 —— 前端的 createUserWithEmailAndPassword
        // 會讓新帳號取代目前的登入狀態，管理者會被登出
        const data = await callApi({
          action: "create",
          email: formData.email,
          password: formData.password,
          displayName: formData.displayName,
          role: formData.role,
          phone: formData.phone,
          extension: formData.extension,
          department: formData.department,
        });
        setResult({ ok: true, text: data.message });
        if (!data.linked) setShowModal(false);
      }
    } catch (e) {
      setResult({ ok: false, text: e instanceof Error ? e.message : "操作失敗" });
    } finally {
      setSaving(false);
    }
  };

  const handleResetPassword = async () => {
    if (!editingUser) return;
    if (newPassword.length < 8) {
      setResult({ ok: false, text: "密碼至少需要 8 個字元" });
      return;
    }
    if (!confirm(`確定要將 ${editingUser.displayName} 的密碼設為新密碼嗎？\n\n設定後請自行告知本人。`)) return;

    setResetting(true);
    setResult(null);
    try {
      const data = await callApi({
        action: "resetPassword",
        targetUid: editingUser.id,
        newPassword,
      });
      setResult({ ok: true, text: data.message });
      setNewPassword("");
    } catch (e) {
      setResult({ ok: false, text: e instanceof Error ? e.message : "重設失敗" });
    } finally {
      setResetting(false);
    }
  };

  const handleDeleteUser = async (user: UserProfile) => {
    if (user.id === currentUserId) {
      alert("無法刪除您目前的登入帳號");
      return;
    }
    if (
      !confirm(
        `確定要永久刪除「${user.displayName}」嗎？\n\n登入帳號與人員資料都會一併移除，此動作無法復原。`
      )
    )
      return;

    try {
      await callApi({ action: "delete", targetUid: user.id });
    } catch (e) {
      alert(e instanceof Error ? e.message : "刪除失敗");
    }
  };

  if (loading) {
    return (
      <div
        className="flex-1 h-screen flex items-center justify-center text-[13px] text-[#A5A29B]"
        style={{ backgroundColor: C.page }}
      >
        人員資料同步中…
      </div>
    );
  }

  return (
    <div
      className="flex-1 h-screen overflow-y-auto custom-scrollbar font-sans"
      style={{ backgroundColor: C.page }}
    >
      <div className="max-w-6xl mx-auto px-8 py-8">
        <header className="flex flex-wrap items-start justify-between gap-4 pb-5 border-b border-[#E0DDD6]">
          <div>
            <h1 className="text-[22px] font-semibold text-[#1A1A18] tracking-tight">帳號權限管理</h1>
            <p className="text-[11px] text-[#A5A29B] mt-1">
              管理可登入系統的內部同仁，權限角色決定各模組與檔案的存取範圍
            </p>
          </div>
          <button
            onClick={() => openModal()}
            className="bg-[#1A1A18] text-white px-5 py-2.5 rounded-lg text-[13px] font-medium hover:bg-black transition-colors whitespace-nowrap"
          >
            新增人員帳號
          </button>
        </header>

        <div className="flex items-center gap-3 mt-5 mb-4">
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜尋姓名、Email 或部門"
            className="px-3 py-2 bg-white border border-[#E8E6E1] rounded-lg text-[12px] w-64 outline-none focus:border-[#B0ADA6] transition-colors text-[#1A1A18] placeholder:text-[#C4C1B9]"
          />
          {keyword && (
            <button
              onClick={() => setKeyword("")}
              className="text-[11px] text-[#A5A29B] hover:text-[#1A1A18] transition-colors"
            >
              清除
            </button>
          )}
          <span className="ml-auto text-[11px] text-[#B0ADA6] tabular-nums">
            {filtered.length} / {users.length} 人
          </span>
        </div>

        <div className="bg-white rounded-lg border border-[#E8E6E1] overflow-hidden">
          <table className="w-full text-left table-fixed">
            <thead>
              <tr className="border-b border-[#E8E6E1] text-xs font-medium text-[#8A8780] whitespace-nowrap">
                <th className="px-5 py-3 w-[26%]">姓名／部門</th>
                <th className="px-4 py-3 w-[28%]">Email</th>
                <th className="px-4 py-3 w-[18%]">聯繫資訊</th>
                <th className="px-4 py-3 w-[14%]">權限</th>
                <th className="px-5 py-3 w-[14%] text-right" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((user) => {
                const tone = ROLE_TONE[user.role] || ROLE_TONE.staff;
                const isSelf = user.id === currentUserId;
                return (
                  <tr
                    key={user.id}
                    className="group border-t border-[#F0EEE9] hover:bg-[#FAFAF8] transition-colors"
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-[#F0EEE9] flex items-center justify-center text-[#3A3833] text-[12px] font-medium shrink-0">
                          {user.displayName?.charAt(0) || "U"}
                        </div>
                        <div className="min-w-0">
                          <div className="text-[14px] font-medium text-[#1A1A18] truncate">
                            {user.displayName || "未命名"}
                            {isSelf && (
                              <span className="ml-2 text-[10px] text-[#B0ADA6]">你</span>
                            )}
                          </div>
                          <div className="text-[11px] text-[#B0ADA6] mt-0.5">
                            {user.department || "未分配"}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-[12px] text-[#8A8780] truncate">{user.email}</td>
                    <td className="px-4 py-4">
                      <div className="text-[12px] text-[#3A3833] tabular-nums">
                        {user.phone || "—"}
                      </div>
                      <div className="text-[11px] text-[#B0ADA6] mt-0.5 tabular-nums">
                        分機 {user.extension || "—"}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className="inline-block text-[11px] font-medium px-2.5 py-1 rounded whitespace-nowrap"
                        style={{ backgroundColor: tone.bg, color: tone.color }}
                      >
                        {ROLE_LABEL[user.role] || user.role}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => openModal(user)}
                          className="text-[11px] text-[#A5A29B] hover:text-[#1A1A18] px-2 py-1 rounded hover:bg-[#F0EEE9] transition-colors"
                        >
                          編輯
                        </button>
                        {!isSelf && (
                          <button
                            onClick={() => handleDeleteUser(user)}
                            className="text-[11px] text-[#A5A29B] hover:text-[#B4483C] px-2 py-1 rounded hover:bg-[#F0EEE9] transition-colors"
                          >
                            刪除
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="py-16 text-center">
              <p className="text-[12px] text-[#A5A29B]">
                {keyword ? "沒有符合條件的人員" : "尚無人員資料"}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* --- 新增／編輯彈窗 --- */}
      {showModal && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-6 font-sans">
          <div
            className="absolute inset-0 bg-[#1A1A18]/40 backdrop-blur-[2px]"
            onClick={() => !saving && !resetting && setShowModal(false)}
          />
          <div className="relative bg-white rounded-xl w-full max-w-lg shadow-[0_20px_60px_rgba(0,0,0,0.16)] overflow-hidden max-h-[90vh] flex flex-col">
            <header className="px-6 py-5 border-b border-[#E8E6E1] flex justify-between items-start shrink-0">
              <div>
                <div className="text-[10px] font-semibold text-[#B0ADA6] tracking-[0.16em] uppercase mb-1.5">
                  {editingUser ? "Edit member" : "New member"}
                </div>
                <h2 className="text-[17px] font-semibold text-[#1A1A18] tracking-tight">
                  {editingUser ? formData.displayName || "編輯人員" : "新增系統人員"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => !saving && !resetting && setShowModal(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[#A5A29B] hover:bg-[#F5F4F1] hover:text-[#1A1A18] transition-colors"
              >
                ✕
              </button>
            </header>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6 custom-scrollbar">
              <section>
                <SectionHead>基本資料</SectionHead>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <FieldLabel required>人員姓名</FieldLabel>
                    <input
                      className={fieldClass}
                      value={formData.displayName}
                      onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                    />
                  </div>
                  <div>
                    <FieldLabel>所屬部門</FieldLabel>
                    <select
                      className={fieldClass}
                      value={formData.department}
                      onChange={(e) =>
                        setFormData({ ...formData, department: e.target.value as Department })
                      }
                    >
                      {DEPARTMENTS.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="col-span-2">
                    <FieldLabel required>Email 地址</FieldLabel>
                    {editingUser ? (
                      <div className={readonlyClass}>{formData.email}</div>
                    ) : (
                      <input
                        className={fieldClass}
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        placeholder="name@daoteng.org"
                      />
                    )}
                  </div>

                  {!editingUser && (
                    <div className="col-span-2">
                      <FieldLabel required>初始登入密碼</FieldLabel>
                      <input
                        type="text"
                        className={fieldClass}
                        placeholder="至少 8 個字元"
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      />
                      <p className="text-[11px] text-[#B0ADA6] mt-1.5">
                        建立後請自行告知本人，本頁不會再次顯示密碼
                      </p>
                    </div>
                  )}

                  <div>
                    <FieldLabel>手機電話</FieldLabel>
                    <input
                      className={`${fieldClass} tabular-nums`}
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    />
                  </div>
                  <div>
                    <FieldLabel>分機號碼</FieldLabel>
                    <input
                      className={`${fieldClass} tabular-nums`}
                      value={formData.extension}
                      onChange={(e) => setFormData({ ...formData, extension: e.target.value })}
                    />
                  </div>

                  <div className="col-span-2">
                    <FieldLabel>權限角色</FieldLabel>
                    <select
                      className={fieldClass}
                      value={formData.role}
                      onChange={(e) => setFormData({ ...formData, role: e.target.value as Role })}
                    >
                      {INTERNAL_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL[r]}（{r}）
                        </option>
                      ))}
                    </select>
                    <p className="text-[11px] text-[#B0ADA6] mt-1.5">
                      此清單與檔案存取權限共用同一份名單，不在名單內的角色無法上傳檔案
                    </p>
                  </div>
                </div>
              </section>

              {/* 重設密碼：編輯既有人員時才出現 */}
              {editingUser && (
                <section>
                  <SectionHead>重設密碼</SectionHead>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="輸入新密碼，至少 8 個字元"
                      className={fieldClass}
                    />
                    <button
                      type="button"
                      onClick={handleResetPassword}
                      disabled={resetting || !newPassword}
                      className="shrink-0 px-4 py-2.5 rounded-lg text-[12px] font-medium text-[#3A3833] bg-white border border-[#E0DDD6] hover:border-[#B0ADA6] transition-colors disabled:opacity-40"
                    >
                      {resetting ? "設定中…" : "設定"}
                    </button>
                  </div>
                  <p className="text-[11px] text-[#B0ADA6] mt-2 leading-relaxed">
                    立即生效，不會寄送通知信，請自行告知本人。系統會記錄操作者與時間，但不會保存密碼內容。
                  </p>
                </section>
              )}

              {result && (
                <div
                  className="rounded-lg px-4 py-3 text-[12px] leading-relaxed"
                  style={{
                    backgroundColor: result.ok ? "#F1F5F0" : "#FBF2F0",
                    color: result.ok ? C.success : C.danger,
                  }}
                >
                  {result.text}
                </div>
              )}
            </div>

            <footer className="px-6 py-4 border-t border-[#E8E6E1] bg-white flex items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                disabled={saving}
                className="text-[12px] text-[#A5A29B] hover:text-[#1A1A18] transition-colors disabled:opacity-50"
              >
                關閉
              </button>
              <button
                type="button"
                onClick={handleSaveUser}
                disabled={saving}
                className="ml-auto bg-[#1A1A18] text-white px-8 py-3 rounded-lg text-[13px] font-medium hover:bg-black transition-colors disabled:opacity-50"
              >
                {saving ? "處理中…" : editingUser ? "儲存變更" : "建立帳號"}
              </button>
            </footer>
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
