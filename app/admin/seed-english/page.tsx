"use client";

// app/admin/seed-english/page.tsx
// 一次性補齊房型與樓層的英文描述，執行完可刪除此頁

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { useSidebar } from "@/lib/sidebar-context";
import { collection, getDocs, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { Room, Floor } from "@/lib/types/room";

/**
 * 空間特色的中英對照。
 *
 * 房型母表的特色欄位是自由輸入，但實際用語相當固定，
 * 因此用完整字串比對即可覆蓋絕大多數資料；
 * 對不到的會退回逐詞翻譯，再對不到就留空（提案會自動沿用中文）。
 */
const FEATURE_EN: Record<string, string> = {
  // --- 四維館 ---
  "海景中窗": "Sea view, medium window",
  "A03 與 A5 已打通": "A03 and A5 combined into one unit",
  "面對漢神": "Facing Hanshin Department Store",
  "面對漢神，有窗": "Facing Hanshin Department Store, with window",
  "四維路，大窗": "Facing Siwei Road, large window",
  "四維路／85 大樓，有窗": "Facing Siwei Road / Tuntex Sky Tower, with window",
  "85 大樓，有窗": "Facing Tuntex Sky Tower, with window",
  "85 景觀，有窗": "Tuntex Sky Tower view, with window",
  "內側": "Interior unit",
  "內側，無窗": "Interior unit, no window",

  // --- 民權 27 / 28 樓 ---
  "窗景": "Window view",
  "小窗": "Small window",
  "窗景（旁邊是洽談室，帶看時可留意客戶是否怕吵）":
    "Window view, adjacent to the meeting lounge",
  "內側（旁邊是 F1 會較吵，需不怕吵的客戶）":
    "Interior unit, adjacent to a larger suite",

  // --- 民權 21 樓 ---
  "窗景（方正）": "Window view, regular layout",
  "窗景（可開窗），有柱": "Window view, openable window, with pillar",
  "窗景（三角形）": "Window view, triangular layout",
  "窗景（可開窗），方正": "Window view, openable window, regular layout",
  "窗景（可開窗），但有大柱子": "Window view, openable window, with a large pillar",
  "窗景，但有柱子": "Window view, with pillar",
  "窗景（方正），附會議室": "Window view, regular layout, includes a meeting room",
  "可開窗，但有大柱子": "Openable window, with a large pillar",
  "Podcast 室": "Podcast studio",
  "作為會議室使用，不對外出租": "Reserved as a meeting room, not available for lease",
  "作為會議室使用，不對外出租；規模 C": "Reserved as a meeting room, not available for lease",
  "作為會議室使用，不對外出租；門禁密碼 7570；約可容納 14 人辦公或 4 人會議":
    "Reserved as a meeting room, not available for lease",

  // --- 民權 20 樓 ---
  "辦公區 32 座位、8 人會議室、休息室、主管室 3 間":
    "32 workstations, an 8-person meeting room, a lounge and 3 executive offices",
  "201 內附一人辦公空間，僅接受短租":
    "Single-person office within Suite 201, short-term lease only",
  "方正（柱子有修飾）": "Regular layout, pillars finished with cladding",
  "方正": "Regular layout",
  "有主管室與小型會議室各一": "Includes one executive office and one small meeting room",
  "兩間隔間，可作會議室與主管室":
    "Two partitioned rooms, suitable for a meeting room and an executive office",
  "辦公區 17 座位、會議室、倉庫": "17 workstations, a meeting room and a storage room",
  "20 樓新區，有主管室與會議室":
    "New wing on 20F, includes an executive office and a meeting room",
  "20 樓新區": "New wing on 20F",
};

/** 逐詞翻譯，用於完整字串對不到時的備援 */
const TOKEN_EN: [RegExp, string][] = [
  [/窗景/g, "Window view"],
  [/海景/g, "Sea view"],
  [/大窗/g, "Large window"],
  [/小窗/g, "Small window"],
  [/中窗/g, "Medium window"],
  [/可開窗/g, "Openable window"],
  [/有窗/g, "With window"],
  [/無窗/g, "No window"],
  [/內側/g, "Interior unit"],
  [/方正/g, "Regular layout"],
  [/長型/g, "Long layout"],
  [/三角形/g, "Triangular layout"],
  [/大柱子/g, "Large pillar"],
  [/有圓柱/g, "With pillar"],
  [/有柱/g, "With pillar"],
  [/柱子/g, "Pillar"],
  [/會議室/g, "Meeting room"],
  [/主管室/g, "Executive office"],
  [/休息室/g, "Lounge"],
  [/倉庫/g, "Storage room"],
  [/隔間/g, "Partitioned room"],
  [/採光/g, "Natural light"],
];

function translateFeature(zh: string): string {
  const key = (zh || "").trim();
  if (!key) return "";
  if (FEATURE_EN[key]) return FEATURE_EN[key];

  // 備援：把認得的詞替換掉，剩下的中文字元一併移除，避免中英混雜
  let out = key;
  TOKEN_EN.forEach(([re, en]) => {
    out = out.replace(re, `${en}, `);
  });
  out = out
    .replace(/[\u4e00-\u9fff]+/g, "")
    .replace(/[（）()、，。；;]/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s+/g, " ")
    .replace(/(,\s*)+$/g, "")
    .replace(/^(,\s*)+/g, "")
    .trim();

  return out;
}

/** 五個樓層的英文名稱與空調說明 */
const FLOOR_EN: Record<string, { name: string; ac: string }> = {
  "FL-SW": {
    name: "Siwei Building",
    ac: [
      "Air conditioning: independent unit, available 24 hours",
      "Private electricity: NT$6.5 per kWh, metered separately",
      "High-power appliances are not permitted in the suite",
    ].join("\n"),
  },
  "FL-20": {
    name: "Minquan 20F",
    ac: [
      "Air conditioning: central system, 08:00–18:00",
      "Public area electricity: NT$2,000 per month",
      "Private electricity: NT$200 per ping per month (before tax)",
      "Note: for new leases on 20F, cleaning is charged separately",
    ].join("\n"),
  },
  "FL-21": {
    name: "Minquan 21F",
    ac: [
      "Air conditioning: central system, 08:00–18:00",
      "Public area electricity: NT$800–1,200 per month (before tax)",
      "Private electricity: included in the public area charge",
    ].join("\n"),
  },
  "FL-27": {
    name: "Minquan 27F",
    ac: [
      "Air conditioning: independent unit, available 24 hours",
      "Private electricity: NT$6.5 per kWh, metered separately",
    ].join("\n"),
  },
  "FL-28": {
    name: "Minquan 28F",
    ac: [
      "Air conditioning: independent unit, available 24 hours",
      "Private electricity: NT$6.5 per kWh, metered separately",
    ].join("\n"),
  },
};

interface PlanItem {
  id: string;
  roomNo: string;
  zh: string;
  en: string;
  matched: boolean;
  willChange: boolean;
}

export default function SeedEnglishPage() {
  const router = useRouter();
  const { width: sidebarWidth } = useSidebar();

  const [hasMounted, setHasMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rooms, setRooms] = useState<PlanItem[]>([]);
  const [floors, setFloors] = useState<Floor[]>([]);
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

        const list: PlanItem[] = roomSnap.docs
          .map((d) => {
            const r = { ...(d.data() as Room), id: d.id };
            const zh = r.featureDesc || "";
            const en = translateFeature(zh);
            return {
              id: r.id,
              roomNo: r.roomNo,
              zh,
              en,
              matched: !!FEATURE_EN[zh.trim()],
              willChange: !!en && en !== r.featureDescEn,
            };
          })
          .sort((a, b) => {
            if (a.matched !== b.matched) return a.matched ? 1 : -1;
            return a.roomNo.localeCompare(b.roomNo, "zh-Hant", { numeric: true });
          });

        setRooms(list);
        setFloors(floorSnap.docs.map((d) => ({ ...(d.data() as Floor), id: d.id })));
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, [router]);

  const changeCount = rooms.filter((r) => r.willChange).length;
  const unmatchedCount = rooms.filter((r) => r.zh && !r.matched).length;

  const handleRun = async () => {
    if (!confirm(`即將寫入 ${changeCount} 間房型與 ${floors.length} 個樓層的英文描述。\n\n確定執行嗎？`)) return;

    setRunning(true);
    setLogs([]);
    try {
      for (const f of floors) {
        const en = FLOOR_EN[f.floorCode];
        if (!en) continue;
        await updateDoc(doc(db, "floors", f.id), {
          floorNameEn: en.name,
          acTemplateEn: en.ac,
          updatedAt: serverTimestamp(),
        });
        setLogs((prev) => [...prev, `✓ 樓層 ${f.floorCode}　${en.name}`]);
      }

      for (const r of rooms) {
        if (!r.willChange) continue;
        await updateDoc(doc(db, "rooms", r.id), {
          featureDescEn: r.en,
          updatedAt: serverTimestamp(),
        });
        setLogs((prev) => [...prev, `✓ ${r.roomNo}　${r.en}`]);
      }

      setLogs((prev) => [...prev, `完成：樓層 ${floors.length} 個、房型 ${changeCount} 間`]);
      setDone(true);
    } catch (e) {
      console.error(e);
      setLogs((prev) => [...prev, `✗ 中斷：${e instanceof Error ? e.message : "未知錯誤"}`]);
    } finally {
      setRunning(false);
    }
  };

  if (!hasMounted || loading) {
    return (
      <div className="h-screen flex items-center justify-center font-bold text-slate-400">
        正在讀取資料…
      </div>
    );
  }

  return (
    <div
      style={{ left: sidebarWidth, transition: "left 200ms", backgroundColor: "#F5F4F1" }}
      className="fixed inset-0 flex flex-col font-sans overflow-hidden text-slate-800"
    >
      <header className="px-8 pt-8 pb-5 shrink-0 bg-white border-b border-[#E8E6E1]">
        <h1 className="text-[20px] font-semibold text-[#1A1A18] tracking-tight">補齊英文描述</h1>
        <p className="text-[11px] text-[#A5A29B] mt-1">
          為房型與樓層寫入英文欄位，供英文版提案使用。執行後可到房型維護逐筆微調。
        </p>
      </header>

      <main className="flex-1 min-h-0 overflow-auto custom-scrollbar px-8 py-6 space-y-5">
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "房型總數", value: rooms.length, color: "#1A1A18" },
            { label: "將寫入", value: changeCount, color: "#4F7A52" },
            { label: "逐詞翻譯", value: unmatchedCount, color: "#A97B22" },
            { label: "樓層", value: floors.length, color: "#1A1A18" },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-lg border border-[#E8E6E1] px-4 py-3.5">
              <div className="text-[11px] text-[#8A8780]">{s.label}</div>
              <div className="text-[24px] font-semibold tabular-nums mt-1.5" style={{ color: s.color }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>

        {unmatchedCount > 0 && (
          <div className="bg-white border-l-[3px] border-[#A97B22] ring-1 ring-[#E8E6E1] px-4 py-2.5 rounded-r-lg">
            <p className="text-[12px] text-[#A97B22]">
              有 {unmatchedCount} 間找不到完整對照，改用逐詞翻譯（表格中標示為「逐詞」）。
              這些建議執行後到房型維護頁確認一次。
            </p>
          </div>
        )}

        <button
          onClick={handleRun}
          disabled={running || done || changeCount === 0}
          className="w-full bg-[#1A1A18] text-white py-4 rounded-lg text-[14px] font-medium hover:bg-black transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {running
            ? "寫入中，請勿關閉頁面…"
            : done
            ? "已完成"
            : changeCount === 0
            ? "沒有需要寫入的資料"
            : `執行寫入（${changeCount} 間房型 + ${floors.length} 個樓層）`}
        </button>

        {logs.length > 0 && (
          <div className="bg-[#1A1A18] rounded-lg p-5 max-h-64 overflow-y-auto custom-scrollbar">
            <div className="font-mono text-[11px] space-y-1 text-[#7FB07F]">
              {logs.map((l, i) => (
                <div key={i}>{l}</div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white rounded-lg border border-[#E8E6E1] overflow-hidden">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-[#E8E6E1]">
                <th className="px-5 py-3 text-[10px] font-semibold text-[#A5A29B] tracking-[0.1em] uppercase w-24">房號</th>
                <th className="px-4 py-3 text-[10px] font-semibold text-[#A5A29B] tracking-[0.1em] uppercase">中文</th>
                <th className="px-4 py-3 text-[10px] font-semibold text-[#A5A29B] tracking-[0.1em] uppercase">英文</th>
                <th className="px-4 py-3 text-[10px] font-semibold text-[#A5A29B] tracking-[0.1em] uppercase w-20">來源</th>
              </tr>
            </thead>
            <tbody>
              {rooms.map((r) => (
                <tr key={r.id} className="border-t border-[#F0EEE9]">
                  <td className="px-5 py-2.5 font-semibold text-[#1A1A18]">{r.roomNo}</td>
                  <td className="px-4 py-2.5 text-[#8A8780] text-[12px]">{r.zh || "—"}</td>
                  <td className="px-4 py-2.5 text-[#3A3833]">{r.en || "—"}</td>
                  <td className="px-4 py-2.5">
                    {!r.zh ? (
                      <span className="text-[11px] text-[#C4C1B9]">無</span>
                    ) : r.matched ? (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-[#F1F5F0] text-[#4F7A52]">對照表</span>
                    ) : (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-[#FAF3E5] text-[#A97B22]">逐詞</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {done && (
          <div className="bg-[#F1F5F0] border border-[#D6E3D4] rounded-lg p-5 text-center">
            <p className="text-[13px] font-medium text-[#4F7A52]">寫入完成</p>
            <button
              onClick={() => router.push("/rooms")}
              className="mt-4 bg-[#4F7A52] text-white px-6 py-2.5 rounded-lg text-[12px] font-medium"
            >
              前往房型維護核對
            </button>
          </div>
        )}
      </main>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 10px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #D5D2CB; border-radius: 999px; }
      `}</style>
    </div>
  );
}
