import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import type { Request } from 'express';

export const STORAGE_ROOT = path.resolve(process.cwd(), 'storage', 'uploads');
const ALLOWED_CATEGORIES = new Set([
  'avatars',
  'venues',
  'materials',
  'assignments',
  'announcements',
  'discussions',
]);

for (const cat of ALLOWED_CATEGORIES) {
  const dir = path.join(STORAGE_ROOT, cat);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/csv',
]);

export function resolveSafeStoragePath(category: string, filename: string): string | null {
  if (!ALLOWED_CATEGORIES.has(category)) return null;
  const safeBase = path.basename(filename);
  if (!safeBase || safeBase !== filename || safeBase.includes('..')) return null;
  const categoryDir = path.resolve(STORAGE_ROOT, category);
  const targetPath = path.resolve(categoryDir, safeBase);
  if (!targetPath.startsWith(categoryDir + path.sep)) {
    return null;
  }
  return targetPath;
}

export function createCategoryUploader(category: string, maxFileSizeBytes = 10 * 1024 * 1024) {
  if (!ALLOWED_CATEGORIES.has(category)) {
    throw new Error(`Invalid upload category: ${category}`);
  }
  const destDir = path.resolve(STORAGE_ROOT, category);
  const storage = multer.diskStorage({
    destination: (_req: Request, _file, cb) => {
      cb(null, destDir);
    },
    filename: (_req: Request, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '');
      const safeExt = ext.length <= 10 ? ext : '';
      cb(null, `${crypto.randomUUID()}${safeExt}`);
    },
  });

  return multer({
    storage,
    limits: { fileSize: maxFileSizeBytes },
    fileFilter: (_req, file, cb) => {
      if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
        cb(new Error('Unsupported file type. Allowed: PDF, PPT/PPTX, DOC/DOCX, TXT, CSV, JPEG, PNG, WEBP.'));
        return;
      }
      cb(null, true);
    },
  });
}

export function getStorageStats(): { category: string; fileCount: number; totalBytes: number }[] {
  const stats: { category: string; fileCount: number; totalBytes: number }[] = [];
  for (const cat of ALLOWED_CATEGORIES) {
    const dir = path.join(STORAGE_ROOT, cat);
    let fileCount = 0;
    let totalBytes = 0;
    if (fs.existsSync(dir)) {
      const entries = fs.readdirSync(dir);
      for (const entry of entries) {
        const full = path.join(dir, entry);
        const st = fs.statSync(full);
        if (st.isFile()) {
          fileCount += 1;
          totalBytes += st.size;
        }
      }
    }
    stats.push({ category: cat, fileCount, totalBytes });
  }
  return stats;
}
