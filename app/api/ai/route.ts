import { NextRequest, NextResponse } from "next/server";
import {
  AI_COLLECTION_LABELS,
  AI_READABLE_COLLECTIONS,
  AI_RECORD_FIELDS,
  AiChatResponse,
  AiCollection,
  AiProposal,
  AiRecord,
  isReadableCollection,
  isWritableCollection,
} from "@/lib/ai-assistant";

const FIREBASE_API_KEY = "AIzaSyBfQ7zCkz-RZ7V04u4qrPGEZdzvti9Ikyw";
const FIREBASE_PROJECT_ID = "daoteng-9bbe9";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type FirestoreValue =
  | { stringValue: string }
  | { integerValue: string }
  | { doubleValue: number }
  | { booleanValue: boolean }
  | { timestampValue: string }
  | { nullValue: null }
  | { arrayValue: { values?: FirestoreValue[] } }
  | { mapValue: { fields?: Record<string, FirestoreValue> } };

type FirestoreDocument = {
  name?: string;
  fields?: Record<string, FirestoreValue>;
};

type FirestoreListResponse = {
  documents?: FirestoreDocument[];
};

type GeminiPart = {
  text?: string;
};

type GeminiResponse = {
  error?: { message?: string };
  candidates?: Array<{
    content?: {
      parts?: GeminiPart[];
    };
  }>;
};

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

async function verifyFirebaseToken(idToken: string) {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    }
  );

  if (!res.ok) return null;
  const data = await res.json();
  return data.users?.[0] || null;
}

function decodeFirestoreValue(value: FirestoreValue): unknown {
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("nullValue" in value) return null;
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(decodeFirestoreValue);
  if ("mapValue" in value) {
    return Object.fromEntries(
      Object.entries(value.mapValue.fields || {}).map(([key, nestedValue]) => [
        key,
        decodeFirestoreValue(nestedValue),
      ])
    );
  }
  return null;
}

function encodeFirestoreValue(value: unknown): FirestoreValue {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (typeof value === "string") return { stringValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeFirestoreValue) } };
  if (typeof value === "object") {
    return {
      mapValue: {
        fields: Object.fromEntries(
          Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [
            key,
            encodeFirestoreValue(nestedValue),
          ])
        ),
      },
    };
  }
  return { stringValue: String(value) };
}

function decodeDocument(collectionName: AiCollection, firestoreDoc: FirestoreDocument): AiRecord {
  const fields = firestoreDoc.fields || {};
  const data = Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, decodeFirestoreValue(value as FirestoreValue)])
  );
  return {
    id: String(firestoreDoc.name || "").split("/").pop() || "",
    collection: collectionName,
    data,
  };
}

function compactRecord(record: AiRecord): AiRecord {
  const allowedFields = AI_RECORD_FIELDS[record.collection];
  return {
    ...record,
    data: Object.fromEntries(
      allowedFields
        .filter((field) => record.data[field] !== undefined)
        .map((field) => [field, record.data[field]])
    ),
  };
}

async function listCollection(collectionName: AiCollection, idToken: string, limit = 60) {
  const url =
    `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}` +
    `/databases/(default)/documents/${collectionName}?pageSize=${limit}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${idToken}` },
    cache: "no-store",
  });

  if (!res.ok) return [];
  const data = (await res.json()) as FirestoreListResponse;
  return (data.documents || []).map((firestoreDoc) =>
    compactRecord(decodeDocument(collectionName, firestoreDoc))
  );
}

async function getContextRecords(idToken: string) {
  const recordsByCollection = await Promise.all(
    AI_READABLE_COLLECTIONS.map(async (collection) => listCollection(collection, idToken))
  );
  return recordsByCollection.flat();
}

function extractJson(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced?.[1] || text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Gemini did not return JSON.");
  return JSON.parse(raw.slice(start, end + 1));
}

async function callGemini(messages: ChatMessage[], records: AiRecord[]) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("缺少 GEMINI_API_KEY。請先在 Cloud Run 設定 Gemini API key。");
  }

  const systemInstruction = `
你是道騰內控系統的 AI 資料助理。請用繁體中文回答。
你可以協助查詢資料、摘要資料、找出可能的客戶/案件/公告/範本，或提出修改資料的建議。
重要規則：
1. 只能依據 DATASET 內的資料回答，不要編造。
2. 如果使用者想修改資料，請只輸出 proposal，不要假裝已經修改。
3. proposal.collection 只能是 members、cases、announcements、copyTemplates。
4. proposal.patch 只能放使用者明確要求變更的欄位。
5. 不確定要改哪一筆時，請詢問使用者，不要產生 proposal。
6. 回傳必須是純 JSON，格式：
{
  "message": "給使用者看的回答",
  "records": [{"collection":"members","id":"...","data":{}}],
  "proposal": {"collection":"members","id":"...","title":"...","reason":"...","patch":{}}
}
沒有 records 或 proposal 時可省略。

集合說明：
${Object.entries(AI_COLLECTION_LABELS)
  .map(([key, label]) => `- ${key}: ${label}`)
  .join("\n")}
`;

  const prompt = `
DATASET:
${JSON.stringify(records, null, 2)}

CHAT:
${messages.map((m) => `${m.role}: ${m.content}`).join("\n")}
`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
        },
      }),
    }
  );

  const data = (await res.json()) as GeminiResponse;
  if (!res.ok) {
    throw new Error(data.error?.message || "Gemini API 呼叫失敗。");
  }

  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
  return extractJson(text) as AiChatResponse;
}

function sanitizeProposal(proposal: AiProposal | undefined, records: AiRecord[]) {
  if (!proposal) return undefined;
  if (!isWritableCollection(proposal.collection)) return undefined;
  const targetExists = records.some(
    (record) => record.collection === proposal.collection && record.id === proposal.id
  );
  if (!targetExists) return undefined;

  return {
    collection: proposal.collection,
    id: proposal.id,
    title: proposal.title || "資料修改提案",
    reason: proposal.reason || "依照使用者要求更新資料",
    patch: proposal.patch || {},
  } satisfies AiProposal;
}

async function applyProposal(proposal: AiProposal, idToken: string) {
  if (!isWritableCollection(proposal.collection)) {
    throw new Error("這個集合不允許由 AI 助手修改。");
  }

  const fields = Object.fromEntries(
    Object.entries({
      ...proposal.patch,
      updatedAt: new Date().toISOString(),
    }).map(([key, value]) => [key, encodeFirestoreValue(value)])
  );

  const updateMask = Object.keys(fields)
    .map((field) => `updateMask.fieldPaths=${encodeURIComponent(field)}`)
    .join("&");

  const url =
    `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}` +
    `/databases/(default)/documents/${proposal.collection}/${proposal.id}?${updateMask}`;

  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ fields }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error?.message || "寫入 Firestore 失敗。");
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const idToken = String(body.idToken || "");
    if (!idToken) return jsonError("請先登入。", 401);

    const user = await verifyFirebaseToken(idToken);
    if (!user) return jsonError("登入狀態已失效，請重新登入。", 401);

    if (body.mode === "apply") {
      const proposal = body.proposal as AiProposal;
      if (!proposal?.collection || !proposal?.id || !proposal?.patch) {
        return jsonError("缺少修改提案。");
      }
      if (!isWritableCollection(proposal.collection)) {
        return jsonError("這個集合不允許由 AI 助手修改。");
      }
      await applyProposal(proposal, idToken);
      return NextResponse.json({ message: "已完成修改。" });
    }

    const messages = Array.isArray(body.messages) ? (body.messages as ChatMessage[]).slice(-8) : [];
    if (!messages.length) return jsonError("請輸入訊息。");

    const records = await getContextRecords(idToken);
    const answer = await callGemini(messages, records);
    const safeRecords = (answer.records || []).filter((record) => isReadableCollection(record.collection));

    return NextResponse.json({
      message: answer.message || "我查好了。",
      records: safeRecords.slice(0, 8),
      proposal: sanitizeProposal(answer.proposal, records),
    });
  } catch (error) {
    console.error(error);
    return jsonError(error instanceof Error ? error.message : "AI 助手暫時無法使用。", 500);
  }
}
