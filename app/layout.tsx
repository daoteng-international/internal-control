"use client"; // 改為客戶端組件以讀取路徑

import "./globals.css";
import Sidebar from "../components/Sidebar";
import { AuthProvider } from "@/lib/auth-context"; // 引入您的驗證模組
import { usePathname } from "next/navigation";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  
  // 判斷當前是否在登入頁面
  const isLoginPage = pathname === "/login";

  return (
    <html lang="zh-Hant">
      <body className="bg-slate-50 text-slate-900">
        {/* 使用 AuthProvider 包裹整個系統 */}
        <AuthProvider>
          <div className="flex min-h-screen">
            {/* 非登入頁面才顯示左側選單 */}
            {!isLoginPage && <Sidebar />}
            
            {/* 右側內容區 */}
            <main className="flex-1 overflow-hidden relative">
              {children}
            </main>
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}