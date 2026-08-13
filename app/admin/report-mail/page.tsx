"use client";

// app/admin/report-mail/page.tsx
// 報表自動寄送的設定與手動測試

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { useSidebar } from "@/lib/sidebar-context";
import { doc, onSnapshot, setDoc, collection, query, orderBy, limit } from "firebase/firestore";

const C = {
  ink: "#1A1A18",
  muted: "#8A8780",
  faint: "#B0ADA6",
  hairline: "#E8E6E1",
  page: "#F5F4F1",
  success: "#4F7A52",
  danger: "#B4483C",
};

const fieldClass =
  "w-full bg-[#FAFAF8] border border-[#E8E6E1] rounded-lg px-3 py-2.5 text-[13px] text-[#1A1A18] outline-none transition-colors focus:bg-white focus:border-[#B0ADA6] placeholder:text-[#C4C1B9]";

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

interface MailLog {
  id: string;
  period: string;
  subject: string;
  recipients: string[];
  triggeredBy: string;
  sentAt: string;
}

export default function ReportMailSettingsPage() {
  const router = useRouter();
  const { width: sidebarWidth } = useSidebar();

  const [hasMounted, setHasMounted] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [recipientText, setRecipientText] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [lastSentAt, setLastSentAt] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState<"week" | "month" | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [preview, setPreview] = useState<string>("");
  const [logs, setLogs] = useState<MailLog[]>([]);

  useEffect(() => {
    setHasMounted(true);
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      if (!u) router.push("/login");
      else setUser(u);
    });

    const unsubSetting = onSnapshot(doc(db, "settings", "reportMail"), (snap) => {
      const data = snap.exists() ? snap.data() : {};
      setRecipientText((data?.recipients || []).join("\n"));
      setEnabled(data?.enabled !== false);
      setLastSentAt(data?.lastSentAt || "");
    });

    const unsubLogs = onSnapshot(
      query(collection(db, "reportMailLogs"), orderBy("sentAt", "desc"), limit(10)),
      (snap) => setLogs(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })))
    );

    return () => {
      unsubAuth();
      unsubSetting();
      unsubLogs();
    };
  }, [router]);

  const parseRecipients = () =>
    recipientText
      .split(/[\n,;，；]/)
      .map((s) => s.trim())
      .filter((s) => s.includes("@"));

  const handleSave = async () => {
    setSaving(true);
    setResult(null);
    try {
      await setDoc(
        doc(db, "settings", "reportMail"),
        { recipients: parseRecipients(), enabled },
        { merge: true }
      );
      setResult({ ok: true, text: "設定已儲存" });
    } catch (e) {
      console.error(e);
      setResult({ ok: false, text: "儲存失敗，請確認權限設定" });
    } finally {
      setSaving(false);
    }
  };

  // 手動寄送：offset -1 代表寄「上一期」的報表，與排程實際跑的內容一致
  const handleSend = async (period: "week" | "month") => {
    if (!user) return;
    const list = parseRecipients();
    if (!list.length) {
      setResult({ ok: false, text: "請先填寫並儲存收件人" });
      return;
    }
    if (!confirm(`確定要立即寄出${period === "week" ? "週" : "月"}報給 ${list.length} 位收件人嗎？`)) return;

    setSending(period);
    setResult(null);
    setPreview("");
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/reports/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken, period, offset: -1 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "寄送失敗");
      setResult({ ok: true, text: data.message || "已寄出" });
      setPreview(data.preview || "");
    } catch (e) {
      setResult({ ok: false, text: e instanceof Error ? e.message : "寄送失敗" });
    } finally {
      setSending(null);
    }
  };

  if (!hasMounted) return null;

  const recipientCount = parseRecipients().length;

  return (
    <div
      style={{ left: sidebarWidth, transition: "left 200ms", backgroundColor: C.page }}
      className="fixed inset-0 flex flex-col font-sans overflow-hidden text-slate-800"
    >
      <header className="px-8 pt-8 pb-5 shrink-0 bg-white border-b border-[#E8E6E1]">
        <h1 className="text-[20px] font-semibold text-[#1A1A18] tracking-tight">報表自動寄送</h1>
        <p className="text-[11px] text-[#A5A29B] mt-1">
          週報每週一寄出上週資料，月報每月一號寄出上個月資料
        </p>
      </header>

      <main className="flex-1 min-h-0 overflow-auto custom-scrollbar px-8 py-6">
        <div className="max-w-3xl space-y-6">
          {/* --- 收件人 --- */}
          <section className="bg-white rounded-lg border border-[#E8E6E1] px-5 py-4">
            <SectionHead>收件人</SectionHead>
            <textarea
              rows={4}
              value={recipientText}
              onChange={(e) => setRecipientText(e.target.value)}
              placeholder={"一行一個 Email\nsam@example.com\nboss@example.com"}
              className={`${fieldClass} leading-relaxed`}
            />
            <p className="mt-2 text-[11px] text-[#B0ADA6]">
              目前有效的 Email 共 {recipientCount} 個。可用換行、逗號或分號分隔。
            </p>

            <label className="mt-4 flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="w-[18px] h-[18px] accent-[#1A1A18] cursor-pointer"
              />
              <span className="text-[13px] text-[#3A3833]">啟用自動寄送</span>
              <span className="text-[11px] text-[#B0ADA6]">停用後排程會跳過，手動寄送仍可使用</span>
            </label>

            <div className="mt-5 flex items-center gap-3">
              <button
                onClick={handleSave}
                disabled={saving}
                className="bg-[#1A1A18] text-white px-6 py-2.5 rounded-lg text-[13px] font-medium hover:bg-black transition-colors disabled:opacity-50"
              >
                {saving ? "儲存中…" : "儲存設定"}
              </button>
              {lastSentAt && (
                <span className="text-[11px] text-[#B0ADA6]">
                  最近寄送 {new Date(lastSentAt).toLocaleString("zh-TW", { hour12: false })}
                </span>
              )}
            </div>
          </section>

          {/* --- 手動寄送 --- */}
          <section className="bg-white rounded-lg border border-[#E8E6E1] px-5 py-4">
            <SectionHead>立即寄送</SectionHead>
            <p className="text-[12px] text-[#8A8780] mb-4 leading-relaxed">
              寄出的內容與排程完全相同（週報為上週、月報為上個月）。
              第一次設定完建議先手動寄一次，確認收件人真的收得到、內容也符合預期。
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => handleSend("week")}
                disabled={sending !== null}
                className="px-5 py-2.5 rounded-lg text-[13px] font-medium text-[#3A3833] bg-white border border-[#E0DDD6] hover:border-[#B0ADA6] transition-colors disabled:opacity-50"
              >
                {sending === "week" ? "寄送中…" : "寄出週報"}
              </button>
              <button
                onClick={() => handleSend("month")}
                disabled={sending !== null}
                className="px-5 py-2.5 rounded-lg text-[13px] font-medium text-[#3A3833] bg-white border border-[#E0DDD6] hover:border-[#B0ADA6] transition-colors disabled:opacity-50"
              >
                {sending === "month" ? "寄送中…" : "寄出月報"}
              </button>
            </div>

            {result && (
              <div
                className="mt-4 rounded-lg px-4 py-2.5 text-[12px]"
                style={{
                  backgroundColor: result.ok ? "#F1F5F0" : "#FBF2F0",
                  color: result.ok ? C.success : C.danger,
                }}
              >
                {result.text}
              </div>
            )}

            {preview && (
              <div className="mt-4">
                <div className="text-[11px] text-[#8A8780] mb-2">實際寄出的內容</div>
                <pre className="bg-[#FAFAF8] border border-[#E8E6E1] rounded-lg p-4 text-[12px] leading-relaxed whitespace-pre-wrap text-[#3A3833] max-h-72 overflow-y-auto custom-scrollbar">
                  {preview}
                </pre>
              </div>
            )}
          </section>

          {/* --- 寄送紀錄 --- */}
          <section className="bg-white rounded-lg border border-[#E8E6E1] px-5 py-4">
            <SectionHead>最近寄送紀錄</SectionHead>
            {logs.length > 0 ? (
              <div className="space-y-0">
                {logs.map((log, i) => (
                  <div
                    key={log.id}
                    className={`flex items-baseline justify-between gap-4 py-2.5 ${
                      i > 0 ? "border-t border-[#F0EEE9]" : ""
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-[12px] text-[#1A1A18] truncate">{log.subject}</div>
                      <div className="text-[11px] text-[#B0ADA6] mt-0.5">
                        {log.recipients?.length || 0} 位收件人 ·{" "}
                        {log.triggeredBy === "scheduler" ? "自動排程" : log.triggeredBy}
                      </div>
                    </div>
                    <span className="text-[11px] text-[#B0ADA6] tabular-nums shrink-0">
                      {new Date(log.sentAt).toLocaleString("zh-TW", {
                        month: "numeric",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                      })}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[12px] text-[#A5A29B] py-3">尚無寄送紀錄</p>
            )}
          </section>
        </div>
      </main>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 10px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #D5D2CB; border-radius: 999px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #B0ADA6; }
      `}</style>
    </div>
  );
}
