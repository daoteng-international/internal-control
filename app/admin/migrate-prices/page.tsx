"use client";

// app/admin/migrate-prices/page.tsx
// 一次性轉換：把備註裡的「新價格」設為對外報價
// 執行完可刪除此頁

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { useSidebar } from "@/lib/sidebar-context";
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";

import { Room, Floor, currency } from "@/lib/types/room";

interface PlanItem {
  room: Room;
  floorName: string;
  newPrice: number | null; // 從備註解析出的新價格
  willChange: boolean;
}

/**
 * 從備註文字裡取出「新價格 28,000」這種寫法的數字。
 * 匯入時是以固定格式寫入的，所以用單一規則解析即可；
 * 解析不到就回傳 null，該筆維持原本的統一報價。
 */
function parseNewPrice(note?: string): number | null {
  if (!note) return null;
  const m = note.match(/新價格\s*([\d,]+)/);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export default function MigratePricesPage() {
  const router = useRouter();
  const { width: sidebarWidth } = useSidebar();

  const [hasMounted, setHasMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<PlanItem[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    setHasMounted(true);
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push("/login");
        return;
      }
      try {
        const [roomSnap, floorSnap] = await Promise.all([
          getDocs(collection(db, "rooms")),
          getDocs(collection(db, "floors")),
        ]);
        const floors = new Map(
          floorSnap.docs.map((d) => [d.id, { ...(d.data() as Floor), id: d.id }])
        );
        const rooms = roomSnap.docs.map((d) => ({ ...(d.data() as Room), id: d.id }));

        const items: PlanItem[] = rooms
          .map((room) => {
            const newPrice = parseNewPrice(room.note);
            return {
              room,
              floorName: floors.get(room.floorId)?.floorName || "—",
              newPrice,
              // 只有解析得到、而且跟現值不同才需要更新
              willChange: newPrice !== null && newPrice !== room.priceBase,
            };
          })
          .sort((a, b) => {
            if (a.willChange !== b.willChange) return a.willChange ? -1 : 1;
            return a.room.roomNo.localeCompare(b.room.roomNo);
          });

        setPlan(items);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, [router]);

  const changeCount = plan.filter((p) => p.willChange).length;

  const handleRun = async () => {
    const ok = confirm(
      `即將更新 ${changeCount} 間房型的對外報價。\n\n` +
        `原本的統一報價會保留在「調價前原價」欄位，隨時可以對照。\n\n確定執行嗎？`
    );
    if (!ok) return;

    setRunning(true);
    setLogs([]);
    try {
      for (const item of plan) {
        if (!item.willChange || item.newPrice === null) continue;
        await updateDoc(doc(db, "rooms", item.room.id), {
          priceBase: item.newPrice,
          // 保留原統一報價，之後想比對或回復都還找得到
          priceOriginal: item.room.priceOriginal ?? item.room.priceBase,
          updatedAt: serverTimestamp(),
        });
        setLogs((prev) => [
          ...prev,
          `✓ ${item.room.roomNo}　${currency(item.room.priceBase)} → ${currency(item.newPrice!)}`,
        ]);
      }
      setLogs((prev) => [...prev, `完成：共更新 ${changeCount} 間`]);
      setDone(true);
    } catch (e) {
      console.error(e);
      setLogs((prev) => [
        ...prev,
        `✗ 中斷：${e instanceof Error ? e.message : "未知錯誤"}`,
      ]);
    } finally {
      setRunning(false);
    }
  };

  if (!hasMounted || loading) {
    return (
      <div className="h-screen flex items-center justify-center font-bold text-slate-400">
        正在讀取房型資料…
      </div>
    );
  }

  return (
    <div
      style={{ left: sidebarWidth, transition: "left 200ms" }}
      className="fixed inset-0 flex flex-col bg-slate-50/50 font-sans overflow-hidden text-slate-800"
    >
      <header className="p-8 shrink-0 bg-white border-b shadow-sm">
        <h1 className="text-2xl font-bold underline decoration-red-500/30">
          價格基準轉換
        </h1>
        <p className="text-xs text-slate-400 mt-2">
          將備註中的「新價格」設為對外報價；沒有新價格的房型維持原統一報價不變
        </p>
      </header>

      <main className="flex-1 min-h-0 overflow-auto custom-scrollbar p-8 space-y-6">
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "房型總數", value: plan.length, color: "text-slate-800" },
            { label: "將更新", value: changeCount, color: "text-red-500" },
            { label: "維持不變", value: plan.length - changeCount, color: "text-slate-400" },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-xl border border-slate-200 px-5 py-4">
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                {s.label}
              </div>
              <div className={`text-3xl font-black mt-1 ${s.color}`}>{s.value}</div>
            </div>
          ))}
        </div>

        <button
          onClick={handleRun}
          disabled={running || done || changeCount === 0}
          className="w-full bg-slate-900 text-white py-5 rounded-2xl font-bold text-base hover:bg-black transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {running
            ? "更新中，請勿關閉頁面…"
            : done
            ? "轉換已完成"
            : changeCount === 0
            ? "沒有需要更新的房型"
            : `執行轉換（${changeCount} 間）`}
        </button>

        {logs.length > 0 && (
          <div className="bg-slate-900 rounded-2xl p-6 max-h-64 overflow-y-auto custom-scrollbar">
            <div className="font-mono text-[11px] space-y-1 text-emerald-400">
              {logs.map((l, i) => (
                <div key={i}>{l}</div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                <th className="text-left px-6 py-4">房號</th>
                <th className="text-left px-4 py-4">樓層</th>
                <th className="text-right px-4 py-4">目前報價</th>
                <th className="text-right px-4 py-4">新價格</th>
                <th className="text-center px-4 py-4">結果</th>
              </tr>
            </thead>
            <tbody>
              {plan.map((item) => (
                <tr
                  key={item.room.id}
                  className={`border-t border-slate-100 ${
                    item.willChange ? "bg-amber-50/40" : ""
                  }`}
                >
                  <td className="px-6 py-3 font-black text-slate-800">{item.room.roomNo}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{item.floorName}</td>
                  <td className="px-4 py-3 text-right text-xs font-bold text-slate-600">
                    {currency(item.room.priceBase)}
                  </td>
                  <td className="px-4 py-3 text-right text-xs font-bold text-slate-800">
                    {item.newPrice !== null ? currency(item.newPrice) : "—"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {item.willChange ? (
                      <span className="text-[10px] font-black bg-red-500 text-white px-2 py-1 rounded">
                        將更新
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-slate-400">維持原價</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {done && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center">
            <p className="text-sm font-bold text-emerald-800">轉換完成</p>
            <button
              onClick={() => router.push("/rooms")}
              className="mt-4 bg-emerald-600 text-white px-6 py-2.5 rounded-xl text-xs font-bold hover:bg-emerald-700"
            >
              前往房型資料維護核對
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
