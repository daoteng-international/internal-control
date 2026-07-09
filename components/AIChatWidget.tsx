"use client";

import { useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { AiChatResponse, AiProposal, AiRecord, AI_COLLECTION_LABELS } from "@/lib/ai-assistant";

type Message = {
  role: "user" | "assistant";
  content: string;
  records?: AiRecord[];
  proposal?: AiProposal;
};

function FieldPreview({ data }: { data: Record<string, unknown> }) {
  const preview = Object.entries(data)
    .filter(([, value]) => value !== "" && value !== undefined && value !== null)
    .slice(0, 4);

  return (
    <dl className="mt-2 space-y-1 text-[11px] text-slate-500">
      {preview.map(([key, value]) => (
        <div key={key} className="flex gap-2">
          <dt className="w-20 shrink-0 font-bold text-slate-400">{key}</dt>
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
    <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-slate-700">
      <p className="text-xs font-black text-amber-700">待確認修改</p>
      <h4 className="mt-1 text-sm font-black">{proposal.title}</h4>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">{proposal.reason}</p>
      <div className="mt-3 rounded-xl bg-white/80 p-2 text-[11px]">
        <p className="font-bold text-slate-400">
          {AI_COLLECTION_LABELS[proposal.collection]} / {proposal.id}
        </p>
        <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-words text-slate-600">
          {JSON.stringify(proposal.patch, null, 2)}
        </pre>
      </div>
      <button
        type="button"
        onClick={() => onApply(proposal)}
        disabled={applying}
        className="mt-3 w-full rounded-xl bg-slate-900 px-3 py-2 text-xs font-black text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {applying ? "寫入中..." : "確認修改資料"}
      </button>
    </div>
  );
}

export default function AIChatWidget() {
  const { user, profile } = useAuth();
  const [open, setOpen] = useState(false);
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

  return (
    <div className="fixed bottom-5 right-5 z-[120] font-sans">
      {open && (
        <section className="mb-4 flex h-[min(680px,calc(100vh-120px))] w-[min(420px,calc(100vw-40px))] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/20">
          <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h3 className="text-sm font-black text-slate-900">AI 資料助理</h3>
              <p className="text-[11px] font-bold text-slate-400">查資料、整理重點、提出修改提案</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full px-2 py-1 text-sm font-black text-slate-400 hover:bg-slate-100"
            >
              x
            </button>
          </header>

          <div ref={listRef} className="flex-1 space-y-4 overflow-y-auto bg-slate-50/80 p-4">
            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                    message.role === "user"
                      ? "bg-slate-900 text-white"
                      : "border border-slate-100 bg-white text-slate-700"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{message.content}</p>

                  {!!message.records?.length && (
                    <div className="mt-3 space-y-2">
                      {message.records.map((record) => (
                        <div key={`${record.collection}-${record.id}`} className="rounded-2xl bg-slate-50 p-3">
                          <p className="text-[11px] font-black text-slate-400">
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
              <div className="rounded-2xl border border-slate-100 bg-white px-4 py-3 text-sm font-bold text-slate-400 shadow-sm">
                AI 正在整理資料...
              </div>
            )}
            {error && (
              <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-600">
                {error}
              </div>
            )}
          </div>

          <form
            className="border-t border-slate-100 bg-white p-4"
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
              className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
            />
            <div className="mt-3 flex items-center justify-between">
              <p className="text-[11px] font-bold text-slate-400">Enter 送出，Shift+Enter 換行</p>
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-black text-white shadow-lg shadow-indigo-200 transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
              >
                送出
              </button>
            </div>
          </form>
        </section>
      )}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex h-14 items-center gap-3 rounded-full bg-slate-900 px-5 text-sm font-black text-white shadow-2xl shadow-slate-900/30 transition hover:-translate-y-0.5 hover:bg-indigo-600"
      >
        <span className="grid h-8 w-8 place-items-center rounded-full bg-white/10">AI</span>
        <span>{open ? "收合助理" : "AI 資料助理"}</span>
      </button>
    </div>
  );
}
