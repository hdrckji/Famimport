import path from "node:path";
import fs from "node:fs/promises";
import { writeFileSync } from "node:fs";
import { readPackingList } from "../catalog/reader.js";
import { lookupCatalog } from "./lookup.js";
import { getDb } from "./db.js";
import { config } from "../config.js";
import { enqueueUpload, markRowsForClaude } from "./claude-worker.js";

const UPLOADS_DIR = config.uploadsDir;
const UPLOAD_PHOTOS_DIR = config.uploadPhotosDir;

export interface UploadSummary {
  id: number;
  original_name: string;
  stored_path: string;
  uploaded_at: string;
  status: string;
  total_rows: number;
  matched_ean: number;
  matched_desc: number;
  no_match: number;
  claude_status: string | null;
  claude_total: number | null;
  claude_processed: number | null;
  claude_errors: number | null;
}

export interface UploadRow {
  id: number;
  upload_id: number;
  row_index: number;
  ean: string | null;
  chinese_description: string | null;
  english_description: string | null;
  nl_description: string | null;
  fr_description: string | null;
  hs_china: string | null;
  material: string | null;
  price_usd: number | null;
  quantity: number | null;
  photo_path: string | null;
  suggested_code: string | null;
  suggested_invoer_pct: number | null;
  suggestion_source: string | null;
  suggestion_confidence: string | null;
  suggestion_note: string | null;
  catalog_history: string | null;
  user_decision: string | null;
  user_code: string | null;
  claude_status: string | null;
  claude_code: string | null;
  claude_invoer_pct: number | null;
  claude_china_invoer_pct: number | null;
  claude_confidence: string | null;
  claude_justification: string | null;
  claude_material_confirmed: number | null;
  claude_material_note: string | null;
  claude_diverges_from_china: number | null;
  claude_needs_manual_review: number | null;
  claude_error: string | null;
  claude_completed_at: string | null;
}

export async function processUpload(storedPath: string, originalName: string): Promise<number> {
  await fs.mkdir(UPLOAD_PHOTOS_DIR, { recursive: true });
  const db = getDb();

  const insertUpload = db.prepare(`
    INSERT INTO uploads (original_name, stored_path, status)
    VALUES (?, ?, 'processing')
  `);
  const result = insertUpload.run(originalName, storedPath);
  const uploadId = Number(result.lastInsertRowid);

  let read;
  try {
    read = await readPackingList(storedPath);
  } catch (err) {
    db.prepare("UPDATE uploads SET status = ? WHERE id = ?").run(
      `error: ${err instanceof Error ? err.message : String(err)}`,
      uploadId,
    );
    throw err;
  }
  if (!read) {
    db.prepare("UPDATE uploads SET status = 'error' WHERE id = ?").run(uploadId);
    throw new Error("Aucun onglet de données détecté dans l'Excel");
  }

  const photoDir = path.join(UPLOAD_PHOTOS_DIR, String(uploadId));
  await fs.mkdir(photoDir, { recursive: true });

  const insertRow = db.prepare(`
    INSERT INTO upload_rows (
      upload_id, row_index, ean, chinese_description, english_description, nl_description, fr_description,
      hs_china, material, price_usd, quantity, photo_path,
      suggested_code, suggested_invoer_pct, suggestion_source, suggestion_confidence, suggestion_note, catalog_history
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let matchedEan = 0;
  let matchedDesc = 0;
  let noMatch = 0;

  const tx = db.transaction(() => {
    for (const row of read.rows) {
      let photoPath: string | null = null;
      if (row.imageBuffer && row.imageBuffer.length > 0) {
        const base = (row.ean || row.bestelnummer || `row${row.rowIndex}`).replace(/[^a-zA-Z0-9._-]/g, "_");
        const fileName = `${base}.${row.imageExt ?? "jpg"}`;
        const full = path.join(photoDir, fileName);
        writeFileSync(full, row.imageBuffer);
        photoPath = path.relative(UPLOAD_PHOTOS_DIR, full);
      }
      const match = lookupCatalog(db, {
        ean: row.ean,
        chineseDescription: row.chineseDescription,
        englishDescription: row.englishDescription,
        hsChina: row.hsChina,
      });
      if (match.source.startsWith("ean")) matchedEan++;
      else if (match.source === "desc_match") matchedDesc++;
      else noMatch++;

      insertRow.run(
        uploadId,
        row.rowIndex,
        row.ean ?? null,
        row.chineseDescription ?? null,
        row.englishDescription ?? null,
        row.nlDescription ?? null,
        row.frDescription ?? null,
        row.hsChina ?? null,
        row.material ?? null,
        row.priceUSD ?? null,
        row.quantity ?? null,
        photoPath,
        match.code,
        match.invoerPct,
        match.source,
        match.confidence,
        match.note,
        match.historyCodes ? JSON.stringify(match.historyCodes) : null,
      );
    }
    db.prepare(`
      UPDATE uploads
      SET status = 'done', total_rows = ?, matched_ean = ?, matched_desc = ?, no_match = ?
      WHERE id = ?
    `).run(read.rows.length, matchedEan, matchedDesc, noMatch, uploadId);
  });
  tx();

  // Mark rows without a catalog match as pending Claude vision, then kick off the worker.
  markRowsForClaude(uploadId);
  setImmediate(() => enqueueUpload(uploadId));

  return uploadId;
}

export function getUpload(id: number): UploadSummary | undefined {
  return getDb().prepare("SELECT * FROM uploads WHERE id = ?").get(id) as UploadSummary | undefined;
}

export function listUploads(): UploadSummary[] {
  return getDb().prepare("SELECT * FROM uploads ORDER BY uploaded_at DESC").all() as UploadSummary[];
}

export function getUploadRows(uploadId: number): UploadRow[] {
  return getDb().prepare(`
    SELECT * FROM upload_rows WHERE upload_id = ? ORDER BY row_index
  `).all(uploadId) as UploadRow[];
}

export async function ensureUploadDirs(): Promise<void> {
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
  await fs.mkdir(UPLOAD_PHOTOS_DIR, { recursive: true });
}

export { UPLOADS_DIR, UPLOAD_PHOTOS_DIR };
