"use client";

import "./globals.css";
import Sidebar from "../components/Sidebar";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

// 💡 獨立出來的保護層元件
function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const isLoginPage = pathname === "/login";

  useEffect(() => {
    if (!loading && !user && !isLoginPage) {
      router.replace("/login"); // 💡 確認未登入才跳轉
    }
  }, [loading, user, isLoginPage]);

  // 💡 還在確認登入狀態時，什麼都不顯示
  if (loading) return null;

  // 💡 未登入且不在登入頁，什麼都不顯示（等待跳轉）
  if (!user && !isLoginPage) return null;

  return (
    <div className="flex min-h-screen">
      {!isLoginPage && <Sidebar />}
      <main className="flex-1 overflow-hidden relative">
        {children}
      </main>
    </div>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body className="bg-slate-50 text-slate-900">
        <AuthProvider>
          <AuthGuard>
            {children}
          </AuthGuard>
        </AuthProvider>
      </body>
    </html>
  );
}