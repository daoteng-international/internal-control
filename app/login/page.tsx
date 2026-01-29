"use client";

import { useState } from "react";
import { auth } from "@/lib/firebase"; // 確保您的路徑正確
import { signInWithEmailAndPassword } from "firebase/auth";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // 1. 呼叫 Firebase Auth 登入
      await signInWithEmailAndPassword(auth, email, password);
      // 2. 登入成功後導向 Dashboard
      router.push("/");
    } catch (err: any) {
      setError("登入失敗：帳號或密碼錯誤");
      console.error(err.message);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 font-sans p-4">
      <div className="bg-white p-10 rounded-3xl shadow-2xl w-full max-w-md animate-in zoom-in-95 duration-300">
        <header className="text-center mb-10">
          <h1 className="text-2xl font-black text-slate-800 tracking-tight italic decoration-blue-500 underline underline-offset-8">
            內控系統管理登入
          </h1>
          <p className="text-slate-400 text-xs mt-4 uppercase tracking-[0.2em]">Secure Access Only</p>
        </header>

        <form onSubmit={handleLogin} className="space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-black text-slate-500 uppercase ml-1">電子郵件</label>
            <input 
              type="email" 
              placeholder="admin@example.com"
              className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-medium text-slate-700"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-black text-slate-500 uppercase ml-1">登入密碼</label>
            <input 
              type="password" 
              placeholder="••••••••"
              className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-medium"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && (
            <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-red-500 text-xs font-bold animate-shake">
              ⚠️ {error}
            </div>
          )}

          <button 
            type="submit"
            className="w-full bg-slate-900 text-white py-5 rounded-2xl font-black shadow-xl hover:bg-black active:scale-[0.98] transition-all tracking-widest text-sm"
          >
            立即進入系統
          </button>
        </form>

        <footer className="mt-10 pt-8 border-t border-slate-50 text-center">
          <p className="text-[10px] text-slate-300 font-bold uppercase tracking-widest leading-relaxed">
            系統開發中 · 禁止非授權存取<br/>
            Frontend Prototype v1.0
          </p>
        </footer>
      </div>
    </div>
  );
}