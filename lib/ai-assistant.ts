export type AiCollection = "members" | "cases" | "announcements" | "documents" | "copyTemplates";
export type AiWritableCollection = Exclude<AiCollection, "documents">;

export type AiRecord = {
  id: string;
  collection: AiCollection;
  data: Record<string, unknown>;
};

export type AiProposal = {
  collection: AiWritableCollection;
  id: string;
  title: string;
  reason: string;
  patch: Record<string, unknown>;
};

export type AiChatResponse = {
  message: string;
  records?: AiRecord[];
  proposal?: AiProposal;
};

export const AI_READABLE_COLLECTIONS: AiCollection[] = [
  "members",
  "cases",
  "announcements",
  "documents",
  "copyTemplates",
];

export const AI_WRITABLE_COLLECTIONS: AiWritableCollection[] = [
  "members",
  "cases",
  "announcements",
  "copyTemplates",
];

export const AI_COLLECTION_LABELS: Record<AiCollection, string> = {
  members: "客戶/課程/活動資料",
  cases: "辦公室案件",
  announcements: "公告",
  documents: "文件",
  copyTemplates: "話術範本",
};

export const AI_RECORD_FIELDS: Record<AiCollection, string[]> = {
  members: [
    "companyName",
    "customer",
    "contactPerson",
    "phone",
    "email",
    "taxId",
    "status",
    "stage",
    "productLines",
    "tags",
    "note",
    "contractStartDate",
    "contractEndDate",
    "updatedAt",
  ],
  cases: [
    "companyName",
    "customer",
    "contactPerson",
    "phone",
    "email",
    "taxId",
    "status",
    "stage",
    "note",
    "updatedAt",
  ],
  announcements: ["title", "content", "status", "targetDepartments", "isPinned", "date", "updatedAt"],
  documents: ["title", "category", "fileName", "fileUrl", "uploadedBy", "updatedAt"],
  copyTemplates: ["label", "category", "content", "order", "updatedAt"],
};

export function isWritableCollection(collection: string): collection is AiWritableCollection {
  return (AI_WRITABLE_COLLECTIONS as string[]).includes(collection);
}

export function isReadableCollection(collection: string): collection is AiCollection {
  return (AI_READABLE_COLLECTIONS as string[]).includes(collection);
}
