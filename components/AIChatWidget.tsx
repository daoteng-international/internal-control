"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { AiChatResponse, AiProposal, AiRecord, AI_COLLECTION_LABELS } from "@/lib/ai-assistant";

type Message = {
  role: "user" | "assistant";
  content: string;
  records?: AiRecord[];
  proposal?: AiProposal;
};

const DOCK_KEY = "ai-widget-docked";

function FieldPreview({ data }: { data: Record<string, unknown> }) {
  const preview = Object.entries(data)
    .filter(([, value]) => value !== "" && value !== undefined && value !== null)
    .slice(0, 4);

  return (
    <dl className="mt-2 space-y-1 text-[11px] text-[#8A8780]">
      {preview.map(([key, value]) => (
        <div key={key} className="flex gap-2">
          <dt className="w-20 shrink-0 text-[#B0ADA6]">{key}</dt>
          <dd className="min-w-0 flex-1 truncate">
            {Array.isArray(value) ? value.join("、") : String(value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function ProposalCard({
  proposal,
  onApply,
  applying,
}: {
  proposal: AiProposal;
  onApply: (proposal: AiProposal) => void;
  applying: boolean;
}) {
  return (
    <div className="mt-3 rounded-lg border border-[#E8DCC0] bg-[#FAF6EC] p-3">
      <p className="text-[10px] font-semibold tracking-[0.1em] uppercase text-[#A97B22]">待確認修改</p>
      <h4 className="mt-1.5 text-[13px] font-semibold text-[#1A1A18]">{proposal.title}</h4>
      <p className="mt-1 text-[11px] leading-relaxed text-[#8A8780]">{proposal.reason}</p>
      <div className="mt-3 rounded-md bg-white/80 border border-[#EFE7D5] p-2.5 text-[11px]">
        <p className="text-[#B0ADA6]">
          {AI_COLLECTION_LABELS[proposal.collection]} / {proposal.id}
        </p>
        <pre className="mt-1.5 max-h-32 overflow-auto whitespace-pre-wrap break-words text-[#5F5E5A] leading-relaxed">
          {JSON.stringify(proposal.patch, null, 2)}
        </pre>
      </div>
      <button
        type="button"
        onClick={() => onApply(proposal)}
        disabled={applying}
        className="mt-3 w-full rounded-lg bg-[#1A1A18] px-3 py-2 text-[12px] font-medium text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
      >
        {applying ? "寫入中…" : "確認修改資料"}
      </button>
    </div>
  );
}

export default function AIChatWidget() {
  const { user, profile } = useAuth();
  const [open, setOpen] = useState(false);
  // 完全收到畫面邊緣，只留一小條可以拉回來。狀態記在 localStorage，重整後維持
  const [docked, setDocked] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "你好，我可以幫你查客戶、案件、公告、文件與話術範本。需要修改資料時，我會先列出提案，等你確認後才寫入。",
    },
  ]);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      setDocked(localStorage.getItem(DOCK_KEY) === "1");
    } catch {
      // 隱私模式等情境讀不到 localStorage，維持預設展開即可
    }
  }, []);

  const setDockedPersist = (v: boolean) => {
    setDocked(v);
    try {
      localStorage.setItem(DOCK_KEY, v ? "1" : "0");
    } catch {
      // 寫入失敗不影響當次操作
    }
  };

  const chatHistory = useMemo(
    () => messages.map(({ role, content }) => ({ role, content })),
    [messages]
  );

  if (!user) return null;

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
    });
  };

  const callAi = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const userMessage: Message = { role: "user", content: trimmed };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    setError("");
    setLoading(true);
    scrollToBottom();

    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idToken,
          messages: [...chatHistory, userMessage].slice(-8),
          profile,
        }),
      });
      const data = (await res.json()) as AiChatResponse & { error?: string };
      if (!res.ok) throw new Error(data.error || "AI 助手暫時無法使用。");

      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: data.message,
          records: data.records,
          proposal: data.proposal,
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI 助手暫時無法使用。");
    } finally {
      setLoading(false);
      scrollToBottom();
    }
  };

  const applyProposal = async (proposal: AiProposal) => {
    if (!confirm("確定要把這份修改提案寫入資料庫嗎？")) return;
    setApplying(true);
    setError("");

    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken, mode: "apply", proposal }),
      });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "寫入失敗。");

      setMessages((current) => [
        ...current,
        { role: "assistant", content: data.message || "已完成修改。" },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "寫入失敗。");
    } finally {
      setApplying(false);
      scrollToBottom();
    }
  };

  /* --- 收到邊緣的狀態：只留一條窄把手 --- */
  if (docked && !open) {
    return (
      <button
        type="button"
        onClick={() => setDockedPersist(false)}
        title="顯示 AI 資料助理"
        className="fixed right-0 bottom-24 z-[120] font-sans w-5 h-16 rounded-l-lg bg-[#1A1A18]/70 hover:bg-[#1A1A18] text-white text-[9px] tracking-widest transition-all flex items-center justify-center"
      >
        <span className="[writing-mode:vertical-rl]">AI</span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-5 right-5 z-[120] font-sans flex flex-col items-end">
      {open && (
        <section className="mb-3 flex h-[min(660px,calc(100vh-120px))] w-[min(400px,calc(100vw-40px))] flex-col overflow-hidden rounded-xl border border-[#E0DDD6] bg-white shadow-[0_12px_40px_rgba(0,0,0,0.14)]">
          <header className="flex items-center justify-between border-b border-[#E8E6E1] px-5 py-3.5">
            <div>
              <h3 className="text-[13px] font-semibold text-[#1A1A18]">AI 資料助理</h3>
              <p className="text-[11px] text-[#A5A29B] mt-0.5">查資料、整理重點、提出修改提案</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="w-7 h-7 rounded-md flex items-center justify-center text-[#A5A29B] hover:bg-[#F5F4F1] hover:text-[#1A1A18] transition-colors"
            >
              ✕
            </button>
          </header>

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto bg-[#FAFAF8] p-4">
            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[88%] rounded-lg px-3.5 py-2.5 text-[13px] leading-relaxed ${
                    message.role === "user"
                      ? "bg-[#1A1A18] text-white"
                      : "border border-[#E8E6E1] bg-white text-[#3A3833]"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{message.content}</p>

                  {!!message.records?.length && (
                    <div className="mt-3 space-y-2">
                      {message.records.map((record) => (
                        <div key={`${record.collection}-${record.id}`} className="rounded-lg bg-[#FAFAF8] border border-[#F0EEE9] p-3">
                          <p className="text-[10px] text-[#B0ADA6]">
                            {AI_COLLECTION_LABELS[record.collection]} / {record.id}
                          </p>
                          <FieldPreview data={record.data} />
                        </div>
                      ))}
                    </div>
                  )}

                  {message.proposal && (
                    <ProposalCard
                      proposal={message.proposal}
                      onApply={applyProposal}
                      applying={applying}
                    />
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="rounded-lg border border-[#E8E6E1] bg-white px-3.5 py-2.5 text-[12px] text-[#A5A29B]">
                整理資料中…
              </div>
            )}
            {error && (
              <div className="rounded-lg border border-[#EBD3CE] bg-[#FBF2F0] px-3.5 py-2.5 text-[12px] text-[#B4483C]">
                {error}
              </div>
            )}
          </div>

          <form
            className="border-t border-[#E8E6E1] bg-white p-3.5"
            onSubmit={(event) => {
              event.preventDefault();
              callAi();
            }}
          >
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  callAi();
                }
              }}
              rows={3}
              placeholder="例如：幫我找承租中的客戶，或把某某公司的狀態改成已退租"
              className="w-full resize-none rounded-lg border border-[#E8E6E1] bg-[#FAFAF8] px-3.5 py-2.5 text-[13px] outline-none transition focus:border-[#B0ADA6] focus:bg-white text-[#1A1A18] placeholder:text-[#C4C1B9] leading-relaxed"
            />
            <div className="mt-2.5 flex items-center justify-between">
              <p className="text-[10px] text-[#B0ADA6]">Enter 送出，Shift+Enter 換行</p>
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="rounded-lg bg-[#1A1A18] px-4 py-2 text-[12px] font-medium text-white transition hover:bg-black disabled:cursor-not-allowed disabled:bg-[#D5D2CB]"
              >
                送出
              </button>
            </div>
          </form>
        </section>
      )}

      {/* 收合時只佔一顆小圓鈕，滑鼠移上去才展開文字，避免長期擋住頁面右下角內容 */}
      <div
        className="flex items-center gap-1.5"
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
      >
        {!open && hovering && (
          <button
            type="button"
            onClick={() => setDockedPersist(true)}
            title="收到畫面邊緣"
            className="h-8 px-2.5 rounded-lg bg-white border border-[#E0DDD6] text-[11px] text-[#8A8780] hover:text-[#1A1A18] hover:border-[#B0ADA6] transition-all shadow-sm"
          >
            收起
          </button>
        )}
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          title="AI 資料助理"
          className={`h-12 rounded-full bg-[#1A1A18] text-[13px] font-medium text-white shadow-[0_4px_16px_rgba(0,0,0,0.18)] transition-all hover:bg-black flex items-center justify-center overflow-hidden ${
            open || hovering ? "px-5 gap-2.5" : "w-12"
          }`}
        >
          <span className="text-[11px] tracking-wider shrink-0">AI</span>
          {(open || hovering) && (
            <span className="whitespace-nowrap">{open ? "收合" : "資料助理"}</span>
          )}
        </button>
      </div>
    </div>
  );
}
