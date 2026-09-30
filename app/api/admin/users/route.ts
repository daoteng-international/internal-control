// app/api/admin/users/route.ts
// 帳號管理的伺服器端操作：建立、重設密碼、刪除。
//
// 這些動作都必須走 Admin SDK：
//   建立 —— 前端的 createUserWithEmailAndPassword 會讓新帳號取代目前的登入狀態，
//           管理者建完人員就被登出了
//   重設 —— 前端只能寄重設信，無法直接指定密碼
//   刪除 —— 前端刪不掉 Auth 帳號，只刪 Firestore 會讓該 email 永遠無法再建立

import { NextResponse } from "next/server";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 清理環境變數的值。
 *
 * .env 檔的引號處理在不同環境並不一致（本機、Cloud Run、Secret Manager），
 * 值有時會連同前後的引號一起被讀進來，導致 OpenSSL 解不開私鑰。
 * 與其要求每個環境都填得一模一樣，在程式端統一清掉比較可靠。
 */
function cleanEnv(raw?: string) {
  if (!raw) return undefined;
  let v = raw.trim();
  // 去掉成對或單邊多餘的引號
  while ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1).trim();
  }
  while (v.startsWith('"') || v.startsWith("'")) v = v.slice(1);
  while (v.endsWith('"') || v.endsWith("'")) v = v.slice(0, -1);
  return v;
}

function getAdminApp() {
  if (getApps().length > 0) return getApps()[0];

  const projectId = cleanEnv(process.env.FIREBASE_PROJECT_ID);
  const clientEmail = cleanEnv(process.env.FIREBASE_CLIENT_EMAIL);
  // 環境變數裡的私鑰換行會被存成 \n 字面值，必須還原
  const privateKey = cleanEnv(process.env.FIREBASE_PRIVATE_KEY)?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("缺少 Firebase Admin 環境變數，請確認 .env.local 設定");
  }

  if (!privateKey.includes("-----BEGIN PRIVATE KEY-----")) {
    throw new Error(
      "FIREBASE_PRIVATE_KEY 格式不正確，請確認是從服務帳號 JSON 的 private_key 欄位完整複製"
    );
  }

  return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

/** 這個 Firebase 專案由多個系統共用，角色名稱大小寫並不一致 */
function isAdminRole(role?: string) {
  return role === "admin" || role === "ADMIN";
}

/** 驗證呼叫者具備管理者權限。前端隱藏按鈕擋不住直接呼叫 API 的人 */
async function requireAdmin(idToken?: string) {
  if (!idToken) return { ok: false as const, error: "缺少登入憑證", status: 401 };

  const app = getAdminApp();
  let decoded;
  try {
    decoded = await getAuth(app).verifyIdToken(idToken);
  } catch {
    return { ok: false as const, error: "登入憑證無效，請重新登入", status: 401 };
  }

  const snap = await getFirestore(app).collection("users").doc(decoded.uid).get();
  if (!snap.exists || !isAdminRole(snap.data()?.role)) {
    return { ok: false as const, error: "需要管理者權限才能執行此操作", status: 403 };
  }

  return { ok: true as const, uid: decoded.uid, email: decoded.email || "" };
}

async function writeLog(action: string, details: string, operator: string) {
  await getFirestore(getAdminApp()).collection("logs").add({
    user: operator,
    action,
    details,
    type: "security",
    timestamp: FieldValue.serverTimestamp(),
  });
}

export async function POST(req: Request) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "請求格式錯誤" }, { status: 400 });
  }

  const { idToken, action } = body || {};

  try {
    const auth0 = await requireAdmin(idToken);
    if (!auth0.ok) {
      return NextResponse.json({ error: auth0.error }, { status: auth0.status });
    }

    const app = getAdminApp();
    const auth = getAuth(app);
    const db = getFirestore(app);
    const operator = auth0.email || auth0.uid;

    /* ---------- 建立帳號 ---------- */
    if (action === "create") {
      const { email, password, displayName, role, phone, extension, department } = body;

      if (!email || !displayName) {
        return NextResponse.json({ error: "請填寫姓名與 Email" }, { status: 400 });
      }
      if (!password || password.length < 8) {
        return NextResponse.json({ error: "密碼至少需要 8 個字元" }, { status: 400 });
      }

      // 這個 Firebase 專案由多個系統共用，email 可能已被其他系統建立過。
      // 遇到這種情況不該直接報錯，而是把既有帳號納入本系統。
      let uid: string;
      let linked = false;
      try {
        const existing = await auth.getUserByEmail(email);
        uid = existing.uid;
        linked = true;
        await auth.updateUser(uid, { password, displayName });
      } catch {
        const created = await auth.createUser({ email, password, displayName });
        uid = created.uid;
      }

      await db.collection("users").doc(uid).set(
        {
          id: uid,
          displayName,
          email,
          role: role || "staff",
          phone: phone || "",
          extension: extension || "",
          department: department || "未分配",
          status: "ACTIVE",
          updatedAt: FieldValue.serverTimestamp(),
          ...(linked ? {} : { createdAt: FieldValue.serverTimestamp() }),
        },
        { merge: true }
      );

      await writeLog(
        linked ? "納入既有帳號" : "新增帳號",
        linked
          ? `將既有帳號 ${displayName} (${email}) 納入本系統並重設密碼`
          : `建立了新人員：${displayName} (${email})`,
        operator
      );

      return NextResponse.json({
        message: linked
          ? `${email} 原本已存在於 Firebase，已納入本系統並套用新密碼`
          : `已建立 ${displayName} 的帳號`,
        linked,
      });
    }

    /* ---------- 重設密碼 ---------- */
    if (action === "resetPassword") {
      const { targetUid, newPassword } = body;
      if (!targetUid) return NextResponse.json({ error: "缺少目標帳號" }, { status: 400 });
      if (!newPassword || newPassword.length < 8) {
        return NextResponse.json({ error: "密碼至少需要 8 個字元" }, { status: 400 });
      }

      let target;
      try {
        target = await auth.getUser(targetUid);
      } catch {
        return NextResponse.json({ error: "找不到這個帳號" }, { status: 404 });
      }

      await auth.updateUser(targetUid, { password: newPassword });
      // 密碼內容不寫進紀錄，只留下誰在什麼時候改了誰的
      await writeLog("重設密碼", `重設了 ${target.email || targetUid} 的登入密碼`, operator);

      return NextResponse.json({ message: `已更新 ${target.email || targetUid} 的密碼` });
    }

    /* ---------- 刪除帳號 ---------- */
    if (action === "delete") {
      const { targetUid } = body;
      if (!targetUid) return NextResponse.json({ error: "缺少目標帳號" }, { status: 400 });
      if (targetUid === auth0.uid) {
        return NextResponse.json({ error: "無法刪除自己的帳號" }, { status: 400 });
      }

      const snap = await db.collection("users").doc(targetUid).get();
      const info = snap.exists ? snap.data() : null;

      // Auth 帳號可能已被其他系統刪除，失敗不該中斷整個流程
      try {
        await auth.deleteUser(targetUid);
      } catch (e) {
        console.warn("刪除 Auth 帳號失敗，續行刪除 Firestore 文件:", e);
      }
      await db.collection("users").doc(targetUid).delete();

      await writeLog(
        "刪除帳號",
        `刪除了人員帳號：${info?.displayName || targetUid} (${info?.email || ""})`,
        operator
      );

      return NextResponse.json({ message: "帳號已刪除" });
    }

    return NextResponse.json({ error: "未知的操作類型" }, { status: 400 });
  } catch (err) {
    console.error("帳號管理操作失敗:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "操作失敗" },
      { status: 500 }
    );
  }
}
