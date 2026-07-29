// lib/storage-upload.ts
// Firebase Storage 上傳／刪除的共用工具

import { storage } from "@/lib/firebase";
import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";

/** 房型照片上限（對應 Storage 規則的 5MB） */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
/** 合約附件上限（對應 Storage 規則的 20MB） */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

/**
 * 壓縮圖片。
 *
 * 手機拍的照片動輒 3–5MB，直接上傳會逼近規則上限，提案文件也用不到那個解析度。
 * 統一縮到長邊 1600px、JPEG 品質 0.8，實測多半會降到 200–400KB。
 */
export async function compressImage(
  file: File,
  maxDimension = 1600,
  quality = 0.8
): Promise<Blob> {
  // GIF 壓了會失去動畫，直接原檔回傳
  if (file.type === "image/gif") return file;

  const bitmap = await createImageBitmap(file);
  let { width, height } = bitmap;

  if (width > maxDimension || height > maxDimension) {
    const scale = maxDimension / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality)
  );

  // 壓完反而更大就用原檔（本來就很小的圖會有這種情況）
  if (!blob || blob.size >= file.size) return file;
  return blob;
}

/** 把檔名整理成安全的字串，避免中文與空白造成路徑問題 */
function safeFileName(original: string) {
  const dot = original.lastIndexOf(".");
  const ext = dot >= 0 ? original.slice(dot).toLowerCase() : "";
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `${stamp}${ext}`;
}

/**
 * 上傳檔案到指定資料夾。
 * @param folder 例如 `rooms/abc123` 或 `cases/xyz789`
 */
export function uploadFile(
  folder: string,
  file: Blob,
  originalName: string,
  onProgress?: (percent: number) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const path = `${folder}/${safeFileName(originalName)}`;
    const task = uploadBytesResumable(ref(storage, path), file, {
      contentType: file.type || "application/octet-stream",
    });

    task.on(
      "state_changed",
      (snap) => {
        if (onProgress && snap.totalBytes > 0) {
          onProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100));
        }
      },
      (err) => reject(err),
      async () => {
        try {
          resolve(await getDownloadURL(task.snapshot.ref));
        } catch (e) {
          reject(e);
        }
      }
    );
  });
}

/** 上傳房型照片：先壓縮再上傳 */
export async function uploadRoomPhoto(
  roomScope: string,
  file: File,
  onProgress?: (percent: number) => void
): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("只能上傳圖片檔");
  }
  const compressed = await compressImage(file);
  if (compressed.size > MAX_IMAGE_BYTES) {
    throw new Error("圖片壓縮後仍超過 5MB，請改用較小的檔案");
  }
  return uploadFile(`rooms/${roomScope}`, compressed, file.name, onProgress);
}

/** 上傳案件附件：不壓縮，直接傳 */
export async function uploadCaseAttachment(
  caseScope: string,
  file: File,
  onProgress?: (percent: number) => void
): Promise<string> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("檔案超過 20MB 上限");
  }
  return uploadFile(`cases/${caseScope}`, file, file.name, onProgress);
}

/**
 * 依下載網址刪除 Storage 上的檔案。
 *
 * 舊資料可能存的是 blob: 開頭的暫存網址（Storage 尚未接上前的做法），
 * 那種沒有實體檔案，直接跳過即可。
 */
export async function deleteByUrl(url: string): Promise<void> {
  if (!url || !url.startsWith("https://firebasestorage.googleapis.com")) return;
  try {
    await deleteObject(ref(storage, url));
  } catch (e: any) {
    // 檔案已不存在不算錯誤，其他錯誤才往外拋
    if (e?.code === "storage/object-not-found") return;
    throw e;
  }
}

/** 一次刪除多個檔案，個別失敗不中斷整批 */
export async function deleteManyByUrl(urls: string[]): Promise<void> {
  await Promise.allSettled((urls || []).map((u) => deleteByUrl(u)));
}
