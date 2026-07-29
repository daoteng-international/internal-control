"use client";

// app/admin/seed-rooms/page.tsx
// 一次性匯入：把總表 PDF 的樓層與房型資料寫進 Firestore。
// 匯入完成後這個頁面就可以刪掉，不需要掛進側邊欄。

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { useSidebar } from "@/lib/sidebar-context";
import {
  collection,
  doc,
  getDocs,
  setDoc,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";

import { SEED_FLOORS, expandSeedRooms } from "@/lib/data/room-seed";

type LogLine = { text: string; kind: "info" | "ok" | "skip" | "error" };

export default function SeedRoomsPage() {
  const router = useRouter();
  const { width: sidebarWidth } = useSidebar();
  const [hasMounted, setHasMounted] = useState(false);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [existingCount, setExistingCount] = useState<number | null>(null);

  const seedRooms = expandSeedRooms();

  useEffect(() => {
    setHasMounted(true);
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push("/login");
        return;
      }
      const snap = await getDocs(collection(db, "rooms"));
      setExistingCount(snap.size);
    });
    return () => unsub();
  }, [router]);

  const push = (text: string, kind: LogLine["kind"] = "info") =>
    setLogs((prev) => [...prev, { text, kind }]);

  const handleSeed = async () => {
    const ok = confirm(
      `即將匯入 ${SEED_FLOORS.length} 個樓層與 ${seedRooms.length} 間房型。\n\n` +
        `已存在的房號會自動略過，不會覆蓋你手動修改過的資料。\n\n確定執行嗎？`
    );
    if (!ok) return;

    setRunning(true);
    setLogs([]);

    try {
      // ---- 1. 樓層 ----
      push("開始寫入樓層…");
      for (const f of SEED_FLOORS) {
        await setDoc(
          doc(db, "floors", f.floorCode),
          {
            floorCode: f.floorCode,
            floorName: f.floorName,
            building: f.building,
            acType: f.acType,
            acTemplate: f.acTemplate,
            privateElectricRate: f.privateElectricRate,
            sortOrder: f.sortOrder,
            active: true,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
        push(`✓ 樓層 ${f.floorCode}　${f.floorName}`, "ok");
      }

      // ---- 2. 房型 ----
      push("開始寫入房型…");
      const snap = await getDocs(collection(db, "rooms"));
      // 用「樓層 + 房號」判斷重複，避免不同樓層的同名房號互相擋掉
      const existingKeys = new Set(
        snap.docs.map((d) => `${d.data().floorId}__${d.data().roomNo}`)
      );

      let created = 0;
      let skipped = 0;

      for (const r of seedRooms) {
        const key = `${r.floorId}__${r.roomNo}`;
        if (existingKeys.has(key)) {
          push(`— 略過 ${r.floorId} ${r.roomNo}（已存在）`, "skip");
          skipped++;
          continue;
        }
        await addDoc(collection(db, "rooms"), {
          roomNo: r.roomNo,
          floorId: r.floorId,
          areaPing: r.areaPing,
          capacityMax: r.capacityMax,
          featureDesc: r.featureDesc,
          priceBase: r.priceBase,
          priceHalfYear: r.priceHalfYear,
          priceYearly: r.priceYearly,
          photoUrls: [],
          status: r.status,
          availableFrom: "",
          note: r.note,
          active: r.active,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        push(`✓ ${r.floorId} ${r.roomNo}`, "ok");
        created++;
      }

      push(`完成：新增 ${created} 間，略過 ${skipped} 間`, "ok");
      setDone(true);
    } catch (e) {
      console.error(e);
      push(`✗ 匯入中斷：${e instanceof Error ? e.message : "未知錯誤"}`, "error");
    } finally {
      setRunning(false);
    }
  };

  if (!hasMounted) return null;

  return (
    <div
      style={{ left: sidebarWidth, transition: "left 200ms" }}
      className="fixed inset-0 flex flex-col bg-slate-50/50 font-sans overflow-hidden text-slate-800"
    >
      <header className="p-8 shrink-0 bg-white border-b shadow-sm">
        <h1 className="text-2xl font-bold underline decoration-red-500/30">房型資料一次性匯入</h1>
        <p className="text-xs text-slate-400 mt-2">
          來源：可出租房型總表。匯入後請到「房型資料維護」逐筆核對，這個頁面就可以刪除。
        </p>
      </header>

      <main className="flex-1 min-h-0 overflow-auto custom-scrollbar p-8 space-y-6">
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "待匯入樓層", value: SEED_FLOORS.length },
            { label: "待匯入房型", value: seedRooms.length },
            { label: "資料庫現有房型", value: existingCount ?? "…" },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-xl border border-slate-200 px-5 py-4">
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                {s.label}
              </div>
              <div className="text-3xl font-black mt-1 text-slate-800">{s.value}</div>
            </div>
          ))}
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6">
          <div className="text-sm font-black text-amber-800 mb-3">執行前請確認</div>
          <ul className="text-xs text-amber-900 space-y-2 list-disc pl-5 leading-relaxed">
            <li>已存在的「樓層＋房號」組合會自動略過，不會覆蓋你手動改過的資料</li>
            <li>樓層以 floorCode 為文件 ID 寫入，重複執行只會更新內容，不會產生重複樓層</li>
            <li>門禁密碼、承租戶、新價格都寫在「內部備註」，不會出現在客戶提案上</li>
            <li>會議室（F1、2101）匯入後為停用狀態，不會出現在提案的房號選單</li>
          </ul>
        </div>

        <button
          onClick={handleSeed}
          disabled={running || done}
          className="w-full bg-slate-900 text-white py-5 rounded-2xl font-bold text-base hover:bg-black transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {running ? "匯入中，請勿關閉頁面…" : done ? "匯入已完成" : "開始匯入"}
        </button>

        {logs.length > 0 && (
          <div className="bg-slate-900 rounded-2xl p-6 max-h-[420px] overflow-y-auto custom-scrollbar">
            <div className="font-mono text-[11px] space-y-1">
              {logs.map((l, i) => (
                <div
                  key={i}
                  className={
                    l.kind === "ok"
                      ? "text-emerald-400"
                      : l.kind === "skip"
                      ? "text-slate-500"
                      : l.kind === "error"
                      ? "text-red-400"
                      : "text-slate-300"
                  }
                >
                  {l.text}
                </div>
              ))}
            </div>
          </div>
        )}

        {done && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center">
            <p className="text-sm font-bold text-emerald-800">匯入完成</p>
            <p className="text-xs text-emerald-700 mt-2">
              接著到「房型資料維護」核對資料，特別是備註裡標記「待確認」的幾筆
            </p>
            <button
              onClick={() => router.push("/rooms")}
              className="mt-5 bg-emerald-600 text-white px-6 py-2.5 rounded-xl text-xs font-bold hover:bg-emerald-700"
            >
              前往房型資料維護
            </button>
          </div>
        )}
      </main>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          height: 12px;
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f1f5f9;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 999px;
          border: 3px solid #f1f5f9;
        }
      `}</style>
    </div>
  );
}
