import fs from "node:fs/promises";
import path from "node:path";
import { Classifier } from "../claude/classify.js";
import type { ProductRow } from "../types.js";
import { getDb } from "./db.js";
import { config } from "../config.js";

interface PendingRow {
  id: number;
  upload_id: number;
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
}

const CONCURRENCY = Math.max(1, Number(process.env.CLAUDE_CONCURRENCY ?? 3));
const enqueuedUploads = new Set<number>();
let classifier: Classifier | null = null;
let inFlight = 0;
const queue: number[] = [];

function getClassifier(): Classifier | null {
  if (classifier) return classifier;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  classifier = new Classifier(key);
  return classifier;
}

function isClaudeConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

async function loadPhotoBuffer(photoPath: string): Promise<{ buffer: Buffer; ext: string } | null> {
  const full = path.join(config.uploadPhotosDir, photoPath);
  try {
    const buffer = await fs.readFile(full);
    const ext = path.extname(full).slice(1).toLowerCase() || "jpg";
    return { buffer, ext };
  } catch {
    return null;
  }
}

function toProductRow(r: PendingRow, photo: { buffer: Buffer; ext: string } | null): ProductRow {
  return {
    rowIndex: 0,
    leverancier: "",
    chineseDescription: r.chinese_description ?? "",
    englishDescription: r.english_description ?? "",
    omschrijving: "",
    descriptionNL: r.nl_description ?? "",
    descriptionFR: r.fr_description ?? "",
    hsCodeChina: r.hs_china ?? "",
    eanBarcode: r.ean ?? "",
    bestelnummer: "",
    quantity: r.quantity,
    priceUSD: r.price_usd,
    material: r.material ?? "",
    imageBuffer: photo?.buffer,
    imageExt: photo?.ext,
  };
}

async function classifyOne(rowId: number): Promise<void> {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT id, upload_id, ean, chinese_description, english_description, nl_description, fr_description,
              hs_china, material, price_usd, quantity, photo_path
       FROM upload_rows WHERE id = ?`,
    )
    .get(rowId) as PendingRow | undefined;
  if (!row) return;

  const cls = getClassifier();
  if (!cls) {
    db.prepare(
      `UPDATE upload_rows SET claude_status = 'skipped', claude_error = ?, claude_completed_at = datetime('now') WHERE id = ?`,
    ).run("ANTHROPIC_API_KEY non configurée", rowId);
    return;
  }

  const photo = row.photo_path ? await loadPhotoBuffer(row.photo_path) : null;

  try {
    const result = await cls.classify(toProductRow(row, photo));
    db.prepare(
      `UPDATE upload_rows SET
        claude_status = 'done',
        claude_code = ?,
        claude_invoer_pct = ?,
        claude_china_invoer_pct = ?,
        claude_confidence = ?,
        claude_justification = ?,
        claude_material_confirmed = ?,
        claude_material_note = ?,
        claude_diverges_from_china = ?,
        claude_needs_manual_review = ?,
        claude_completed_at = datetime('now')
       WHERE id = ?`,
    ).run(
      result.tarabelCode,
      result.invoerRateForSuggestedCode,
      result.invoerRateForChinaCode,
      result.confidence,
      result.justification,
      result.materialConfirmed ? 1 : 0,
      result.materialNote,
      result.divergesFromChina ? 1 : 0,
      result.needsManualReview ? 1 : 0,
      rowId,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    db.prepare(
      `UPDATE upload_rows SET claude_status = 'error', claude_error = ?, claude_completed_at = datetime('now') WHERE id = ?`,
    ).run(msg, rowId);
  } finally {
    updateUploadProgress(row.upload_id);
  }
}

function updateUploadProgress(uploadId: number): void {
  const db = getDb();
  const stats = db
    .prepare(
      `SELECT
        SUM(CASE WHEN claude_status IN ('done','error','skipped') THEN 1 ELSE 0 END) AS processed,
        SUM(CASE WHEN claude_status = 'error' THEN 1 ELSE 0 END) AS errors,
        SUM(CASE WHEN claude_status IN ('pending','processing') THEN 1 ELSE 0 END) AS remaining
       FROM upload_rows WHERE upload_id = ? AND claude_status IS NOT NULL`,
    )
    .get(uploadId) as { processed: number | null; errors: number | null; remaining: number | null };

  const remaining = stats.remaining ?? 0;
  const newStatus = remaining > 0 ? "processing" : "done";
  db.prepare(
    `UPDATE uploads SET claude_processed = ?, claude_errors = ?, claude_status = ? WHERE id = ?`,
  ).run(stats.processed ?? 0, stats.errors ?? 0, newStatus, uploadId);
}

async function pump(): Promise<void> {
  while (inFlight < CONCURRENCY && queue.length > 0) {
    const rowId = queue.shift()!;
    inFlight++;
    const db = getDb();
    db.prepare(`UPDATE upload_rows SET claude_status = 'processing' WHERE id = ? AND claude_status = 'pending'`).run(rowId);
    classifyOne(rowId)
      .catch(() => {})
      .finally(() => {
        inFlight--;
        pump();
      });
  }
}

export function enqueueUpload(uploadId: number): void {
  if (enqueuedUploads.has(uploadId)) return;
  enqueuedUploads.add(uploadId);

  const db = getDb();
  const pendingRows = db
    .prepare(
      `SELECT id FROM upload_rows
       WHERE upload_id = ? AND claude_status IN ('pending','processing')
       ORDER BY row_index`,
    )
    .all(uploadId) as Array<{ id: number }>;

  if (pendingRows.length === 0) {
    updateUploadProgress(uploadId);
    enqueuedUploads.delete(uploadId);
    return;
  }

  if (!isClaudeConfigured()) {
    // Mark them all skipped synchronously and bail — no point queuing
    db.prepare(
      `UPDATE upload_rows SET claude_status = 'skipped', claude_error = ?, claude_completed_at = datetime('now')
       WHERE upload_id = ? AND claude_status IN ('pending','processing')`,
    ).run("ANTHROPIC_API_KEY non configurée", uploadId);
    updateUploadProgress(uploadId);
    enqueuedUploads.delete(uploadId);
    return;
  }

  for (const r of pendingRows) queue.push(r.id);
  pump().finally(() => {
    enqueuedUploads.delete(uploadId);
  });
}

/**
 * Mark rows that have no catalog match as pending for Claude.
 * Called once after processUpload finishes ingesting.
 */
export function markRowsForClaude(uploadId: number): void {
  const db = getDb();
  const res = db
    .prepare(
      `UPDATE upload_rows
       SET claude_status = 'pending'
       WHERE upload_id = ?
         AND (suggestion_source = 'none' OR suggestion_source IS NULL)
         AND claude_status IS NULL`,
    )
    .run(uploadId);
  db.prepare(`UPDATE uploads SET claude_total = ?, claude_status = ? WHERE id = ?`).run(
    res.changes,
    res.changes > 0 ? "processing" : "done",
    uploadId,
  );
}

/**
 * Called at server startup: resume any upload that has unfinished Claude work.
 */
export function resumePendingClaudeWork(): void {
  const db = getDb();
  const uploads = db
    .prepare(
      `SELECT DISTINCT upload_id AS id FROM upload_rows WHERE claude_status IN ('pending','processing')`,
    )
    .all() as Array<{ id: number }>;
  // Reset any 'processing' row that was interrupted back to 'pending'
  db.prepare(`UPDATE upload_rows SET claude_status = 'pending' WHERE claude_status = 'processing'`).run();
  for (const u of uploads) enqueueUpload(u.id);
  if (uploads.length > 0) {
    console.log(`[claude-worker] Reprise de ${uploads.length} upload(s) avec travail Claude en attente`);
  }
}
