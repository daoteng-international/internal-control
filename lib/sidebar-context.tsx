"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

// 展開/收合時的寬度（px），跟 Sidebar.tsx 的 w-64 / w-20 對應
export const SIDEBAR_WIDTH_EXPANDED = 256;  // w-64
export const SIDEBAR_WIDTH_COLLAPSED = 80;  // w-20

interface SidebarContextType {
  collapsed: boolean;
  toggle: () => void;
  width: number; // 目前側邊欄實際寬度，供其他頁面（如 fixed 定位的看板）動態對齊
}

const SidebarContext = createContext<SidebarContextType>({
  collapsed: false,
  toggle: () => {},
  width: SIDEBAR_WIDTH_EXPANDED,
});

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // 讀取使用者上次的收合偏好（localStorage），避免每次重新整理都要重按
  useEffect(() => {
    const saved = localStorage.getItem("sidebar-collapsed");
    if (saved === "true") setCollapsed(true);
    setHydrated(true);
  }, []);

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("sidebar-collapsed", String(next));
      return next;
    });
  };

  // hydrated 前先當作展開狀態渲染，避免 SSR/CSR 內容不一致造成畫面閃爍
  const effectiveCollapsed = hydrated ? collapsed : false;
  const width = effectiveCollapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED;

  return (
    <SidebarContext.Provider value={{ collapsed: effectiveCollapsed, toggle, width }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  return useContext(SidebarContext);
}
