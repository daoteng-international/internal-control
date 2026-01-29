"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { auth } from "@/lib/firebase";
import { signOut } from "firebase/auth";

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { profile } = useAuth();

  // 更新選單項目，加入「活動管理」
  const menuItems = [
    { name: "Dashboard", href: "/" },
    { name: "系統公告", href: "/announcements" },
    { name: "案件管理", href: "/cases" },
    { name: "工商登記管理", href: "/registrations" },
    { name: "活動管理", href: "/events" }, // 新增此行，對應您的 app/events 資料夾
    { name: "客戶資料管理", href: "/customers" },
    { name: "辦公室契約管理", href: "/contracts" }, 
    { name: "教育文件管理", href: "/documents" },
    { name: "歷程記錄 (管理權限)", href: "/history" },
  ];

  const handleLogout = async () => {
    if (window.confirm("確定要登出系統嗎？")) {
      await signOut(auth);
      router.push("/login");
    }
  };

  return (
    <aside className="min-h-screen w-64 bg-slate-900 text-white shrink-0 flex flex-col font-sans">
      <div className="px-6 py-10">
        <div className="text-xl font-bold tracking-tight text-white uppercase border-b border-slate-700 pb-4">
          內控系統 DEMO
        </div>
        <div className="mt-4 flex items-center gap-3 bg-slate-800/50 p-3 rounded-xl border border-slate-700/50">
          <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center font-black text-xs shadow-lg">
            {profile?.displayName?.charAt(0) || "U"}
          </div>
          <div className="overflow-hidden">
            <div className="text-xs font-bold truncate">{profile?.displayName || "載入中..."}</div>
            <div className="text-[10px] text-slate-500 uppercase tracking-tighter">{profile?.role || "USER"}</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-4 space-y-1">
        <div className="mb-4 px-2 text-[10px] font-bold text-slate-600 uppercase tracking-widest">
          MAIN MENU
        </div>
        {menuItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded-lg px-4 py-3 text-sm font-medium transition-all duration-200 ${
                isActive 
                  ? "bg-slate-800 text-white border-l-4 border-blue-500 pl-3" 
                  : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
              }`}
            >
              {item.name}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-800">
        <button 
          onClick={handleLogout}
          className="w-full flex items-center justify-between px-4 py-3 text-xs font-bold text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-xl transition-all group"
        >
          <span>LOGOUT 登出系統</span>
          <span className="opacity-0 group-hover:opacity-100 transition-opacity">→</span>
        </button>
        
        <div className="mt-4 px-4 py-3 bg-blue-500/5 rounded-xl border border-blue-500/10">
          <div className="text-[10px] font-bold text-slate-500 uppercase mb-1 text-center">System Status</div>
          <div className="flex items-center justify-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-bold text-emerald-500 uppercase">Online</span>
          </div>
        </div>
      </div>
    </aside>
  );
}