// app/api/reports/send/route.ts
// 組裝報表資料並以 Gmail SMTP 寄出摘要信。
//
// 兩種觸發方式：
//   1. Cloud Scheduler 定時呼叫（帶 CRON_SECRET）
//   2. 後台手動按「立即寄送」（帶 Firebase idToken）

import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

import {
  Period,
  resolveRange,
  buildReportData,
  buildMailDraft,
} from "@/lib/report-mail";

// Node.js runtime：nodemailer 與 firebase-admin 都不能在 Edge 執行
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getAdminApp() {
  if (getApps().length > 0) return getApps()[0];

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  // 環境變數裡的私鑰換行會被存成 \n 字面值，必須還原
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("缺少 Firebase Admin 環境變數，請確認 .env.local 設定");
  }

  return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

/** 驗證呼叫來源：排程用共用密鑰，人工觸發用登入者的 idToken */
async function authorize(req: Request, body: any) {
  // === 除錯用，問題排除後可整段刪除 ===
  console.log("=== authorize 被呼叫 ===");
  console.log("有 idToken:", !!body?.idToken, "長度:", body?.idToken?.length);
  console.log("PROJECT_ID:", process.env.FIREBASE_PROJECT_ID || "(未設定)");
  console.log("CLIENT_EMAIL 有值:", !!process.env.FIREBASE_CLIENT_EMAIL);
  console.log("PRIVATE_KEY 長度:", process.env.FIREBASE_PRIVATE_KEY?.length || 0);
  console.log("PRIVATE_KEY 開頭正確:", process.env.FIREBASE_PRIVATE_KEY?.startsWith("-----BEGIN"));
  // === 除錯結束 ===

  const secret = process.env.CRON_SECRET;
  const headerSecret = req.headers.get("x-cron-secret");
  if (secret && headerSecret === secret) return { ok: true, by: "scheduler" };

  const idToken = body?.idToken;
  if (idToken) {
    try {
      const decoded = await getAuth(getAdminApp()).verifyIdToken(idToken);
      console.log("驗證成功:", decoded.email);
      return { ok: true, by: decoded.email || decoded.uid };
    } catch (e) {
      console.error("!!! verifyIdToken 失敗:", e);
      return { ok: false, by: "" };
    }
  }
  console.log("!!! body 裡沒有 idToken");
  return { ok: false, by: "" };
}

export async function POST(req: Request) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    // 排程呼叫時可能沒有 body
  }

  const auth = await authorize(req, body);
  if (!auth.ok) {
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  }

  const period: Period = body?.period === "month" ? "month" : "week";
  // 排程在期間結束後才跑（週一寄上週、一號寄上個月），所以預設回看一期
  const offset = typeof body?.offset === "number" ? body.offset : -1;

  try {
    const db = getFirestore(getAdminApp());

    // --- 讀取寄送設定 ---
    const settingSnap = await db.collection("settings").doc("reportMail").get();
    const setting = settingSnap.exists ? settingSnap.data() || {} : {};
    const recipients: string[] = Array.isArray(setting.recipients) ? setting.recipients : [];
    const enabled = setting.enabled !== false;

    if (!recipients.length) {
      return NextResponse.json({ error: "尚未設定收件人" }, { status: 400 });
    }
    // 手動觸發不受開關限制，排程才需要尊重停用設定
    if (!enabled && auth.by === "scheduler") {
      return NextResponse.json({ message: "自動寄送已停用，本次略過。" });
    }

    // --- 讀取原始資料並統計 ---
    const [caseSnap, memberSnap] = await Promise.all([
      db.collection("cases").get(),
      db.collection("members").get(),
    ]);
    const cases = caseSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const members = memberSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const { start, end, prevStart } = resolveRange(period, offset, new Date());
    const data = buildReportData(cases, members, start, end, prevStart);

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const draft = buildMailDraft({
      period,
      rangeStart: start,
      rangeEnd: end,
      data,
      url: baseUrl ? `${baseUrl}/reports/weekly` : "",
    });

    // --- 寄信 ---
    const user = process.env.GMAIL_USER;
    const pass = process.env.GMAIL_APP_PASSWORD;
    if (!user || !pass) {
      return NextResponse.json({ error: "缺少 Gmail 寄信設定" }, { status: 500 });
    }

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user, pass },
    });

    await transporter.sendMail({
      from: `道騰內控系統 <${user}>`,
      to: recipients.join(", "),
      subject: draft.subject,
      text: draft.body,
    });

    // --- 記錄寄送歷程，方便日後查核有沒有漏寄 ---
    await db.collection("settings").doc("reportMail").set(
      {
        lastSentAt: new Date().toISOString(),
        lastSentPeriod: period,
        lastSentBy: auth.by,
      },
      { merge: true }
    );

    await db.collection("reportMailLogs").add({
      period,
      offset,
      subject: draft.subject,
      recipients,
      triggeredBy: auth.by,
      sentAt: new Date().toISOString(),
    });

    return NextResponse.json({
      message: `已寄出給 ${recipients.length} 位收件人`,
      subject: draft.subject,
      preview: draft.body,
    });
  } catch (err) {
    console.error("寄送報表失敗:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "寄送失敗" },
      { status: 500 }
    );
  }
}
