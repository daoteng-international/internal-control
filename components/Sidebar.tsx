"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { auth } from "@/lib/firebase";
import { signOut } from "firebase/auth";
import { useSidebar } from "@/lib/sidebar-context";

// 簡單的線條圖示（純 SVG，不依賴外部套件）
function Icon({ name, className = "w-5 h-5" }: { name: string; className?: string }) {
  const common = {
    className,
    fill: "none",
    viewBox: "0 0 24 24",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "dashboard":
      return (
        <svg {...common}>
          <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
          <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
          <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
          <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
        </svg>
      );
    case "announcement":
      return (
        <svg {...common}>
          <path d="M4 10v4a1 1 0 0 0 1 1h1l4 4V5L6 9H5a1 1 0 0 0-1 1Z" />
          <path d="M14 9a3 3 0 0 1 0 6" />
          <path d="M17 6a7 7 0 0 1 0 12" />
        </svg>
      );
    case "building":
      return (
        <svg {...common}>
          <rect x="4" y="3" width="11" height="18" rx="1" />
          <path d="M8 7h3M8 11h3M8 15h3" />
          <path d="M15 21v-6h5v6" />
        </svg>
      );
    case "book":
      return (
        <svg {...common}>
          <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15Z" />
          <path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...common}>
          <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
          <path d="M3.5 9.5h17" />
          <path d="M8 3v4M16 3v4" />
        </svg>
      );
    case "users":
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3.2" />
          <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
          <path d="M16 4.3a3.2 3.2 0 0 1 0 6.2" />
          <path d="M18.5 14.3c2 .7 3.5 2.7 3.5 5.7" />
        </svg>
      );
    case "document":
      return (
        <svg {...common}>
          <path d="M6 3.5h9L19 8v12.5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z" />
          <path d="M14 3.5V8h4.5" />
          <path d="M8.5 13h7M8.5 16.5h7" />
        </svg>
      );
    case "template":
      return (
        <svg {...common}>
          <rect x="3.5" y="4" width="17" height="16" rx="1.5" />
          <path d="M3.5 9.5h17" />
          <path d="M9 9.5V20" />
        </svg>
      );
    case "erp":
      return (
        <svg {...common}>
          <ellipse cx="12" cy="5.5" rx="7.5" ry="2.5" />
          <path d="M4.5 5.5v6c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5v-6" />
          <path d="M4.5 11.5v6c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5v-6" />
        </svg>
      );
    case "user-cog":
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3.2" />
          <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
          <circle cx="18" cy="15" r="2.3" />
          <path d="M18 11.5v1M18 17.5v1M14.5 15h1M20.5 15h1M15.5 12l.7.7M19.8 16.3l.7.7M15.5 18l.7-.7M19.8 13.7l.7-.7" />
        </svg>
      );
    case "history":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7.5V12l3 2" />
        </svg>
      );
    case "logout":
      return (
        <svg {...common}>
          <path d="M9 20H5.5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1H9" />
          <path d="M15.5 16l4-4-4-4" />
          <path d="M19 12H9" />
        </svg>
      );
    default:
      return <svg {...common}><circle cx="12" cy="12" r="8" /></svg>;
  }
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { profile } = useAuth();
  const { collapsed, toggle } = useSidebar();

  // 1. 定義原始選單項目
  const menuItems = [
    { name: "Dashboard", href: "/", icon: "dashboard" },
    { name: "系統公告", href: "/announcements", icon: "announcement" },
    { name: "辦公室出租管理", href: "/cases", icon: "building" },
    { name: "質晑所課程", href: "/registrations", icon: "book" },
    { name: "活動管理", href: "/events", icon: "calendar" },
    { name: "Deltra ERP", href: "/deltra-erp", icon: "erp" },
    { name: "客戶資料管理", href: "/customers", icon: "users" },
    { name: "教育文件管理", href: "/documents", icon: "document" },
  ];

  // 2. 定義管理員專屬項目
  const adminItems = [
    { name: "範本管理", href: "/admin/templates", icon: "template" },
    { name: "人員/帳號管理", href: "/admin/users", icon: "user-cog" },
    { name: "歷程記錄 (管理權限)", href: "/history", icon: "history" },
  ];

  const handleLogout = async () => {
    if (window.confirm("確定要登出系統嗎？")) {
      await signOut(auth);
      router.push("/login");
    }
  };

  return (
    <aside
      className={`min-h-screen bg-slate-900 text-white shrink-0 flex flex-col font-sans transition-all duration-200 ${
        collapsed ? "w-20" : "w-64"
      }`}
    >
      <div className={`py-10 relative ${collapsed ? "px-3" : "px-6"}`}>
        {/* 收合/展開切換按鈕，浮貼在側邊欄右側邊緣 */}
        <button
          onClick={toggle}
          title={collapsed ? "展開選單" : "收合選單"}
          className="absolute -right-3 top-10 w-6 h-6 rounded-full bg-slate-800 border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700 flex items-center justify-center text-xs shadow-lg transition-all z-10"
        >
          {collapsed ? "›" : "‹"}
        </button>

        {collapsed ? (
          <div className="text-lg font-black text-center text-white border-b border-slate-700 pb-4">內</div>
        ) : (
          <div className="text-xl font-bold tracking-tight text-white uppercase border-b border-slate-700 pb-4">
            內控系統 DEMO
          </div>
        )}

        <div
          className={`mt-4 flex items-center bg-slate-800/50 rounded-xl border border-slate-700/50 ${
            collapsed ? "justify-center p-2" : "gap-3 p-3"
          }`}
        >
          <div className="w-8 h-8 shrink-0 rounded-full bg-blue-500 flex items-center justify-center font-black text-xs shadow-lg">
            {profile?.displayName?.charAt(0) || "U"}
          </div>
          {!collapsed && (
            <div className="overflow-hidden">
              <div className="text-xs font-bold truncate">{profile?.displayName || "載入中..."}</div>
              <div className="text-[10px] text-slate-500 uppercase tracking-tighter">{profile?.role || "USER"}</div>
            </div>
          )}
        </div>
      </div>

      <nav className={`flex-1 space-y-1 ${collapsed ? "px-2" : "px-4"}`}>
        {!collapsed && (
          <div className="mb-4 px-2 text-[10px] font-bold text-slate-600 uppercase tracking-widest">
            MAIN MENU
          </div>
        )}

        {/* 渲染一般選單 */}
        {menuItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.name : undefined}
              className={`flex items-center rounded-lg text-sm font-medium transition-all duration-200 ${
                collapsed ? "justify-center px-2 py-3" : "gap-3 px-4 py-3"
              } ${
                isActive
                  ? `bg-slate-800 text-white ${collapsed ? "" : "border-l-4 border-blue-500 pl-3"}`
                  : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
              }`}
            >
              <Icon name={item.icon} className="w-5 h-5 shrink-0" />
              {!collapsed && <span>{item.name}</span>}
            </Link>
          );
        })}

        {/* 💡 僅當權限為 admin 時顯示額外選單 */}
        {profile?.role === "admin" && (
          <>
            {!collapsed && (
              <div className="mt-8 mb-4 px-2 text-[10px] font-bold text-slate-600 uppercase tracking-widest">
                ADMIN CONTROL
              </div>
            )}
            {collapsed && <div className="mt-8 mb-2 h-px bg-slate-800" />}
            {adminItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={collapsed ? item.name : undefined}
                  className={`flex items-center rounded-lg text-sm font-medium transition-all duration-200 ${
                    collapsed ? "justify-center px-2 py-3" : "gap-3 px-4 py-3"
                  } ${
                    isActive
                      ? `bg-slate-800 text-white ${collapsed ? "" : "border-l-4 border-blue-500 pl-3"}`
                      : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
                  }`}
                >
                  <Icon name={item.icon} className="w-5 h-5 shrink-0" />
                  {!collapsed && <span>{item.name}</span>}
                </Link>
              );
            })}
          </>
        )}
      </nav>

      <div className={`border-t border-slate-800 ${collapsed ? "p-2" : "p-4"}`}>
        <button
          onClick={handleLogout}
          title={collapsed ? "登出系統" : undefined}
          className={`w-full flex items-center text-xs font-bold text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-xl transition-all group ${
            collapsed ? "justify-center py-3" : "justify-between px-4 py-3"
          }`}
        >
          {collapsed ? (
            <Icon name="logout" className="w-5 h-5" />
          ) : (
            <span>LOGOUT 登出系統</span>
          )}
          {!collapsed && <span className="opacity-0 group-hover:opacity-100 transition-opacity">→</span>}
        </button>

        {!collapsed && (
          <div className="mt-4 px-4 py-3 bg-blue-500/5 rounded-xl border border-blue-500/10">
            <div className="text-[10px] font-bold text-slate-500 uppercase mb-1 text-center">System Status</div>
            <div className="flex items-center justify-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-bold text-emerald-500 uppercase">Online</span>
            </div>
          </div>
        )}
        {collapsed && (
          <div className="mt-4 flex justify-center" title="Online">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          </div>
        )}
      </div>
    </aside>
  );
}
