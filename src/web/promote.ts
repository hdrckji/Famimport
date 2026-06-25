import path from "node:path";
import fs from "node:fs";
import { getDb } from "./db.js";
import { config } from "../config.js";

export interface PromotionResult {
  importId: number;
  folderName: string;
  productCount: number;
  rowsWithoutCode: number;
}

/**
 * Promote a finished verification (upload) to a real import in the catalog.
 *
 * Each upload row becomes a product. The tarabel_source for each product is:
 *   - 'manual'        if the user typed a code (user_code)
 *   - the catalog source (e.g. 'packing_list')  if catalog matched (suggestion_source != 'none')
 *   - 'claude_vision' if Claude produced a code
 *   - NULL            if no code (row stays "à classer" — it's still inserted so the PDF can later upgrade it)
 *
 * Photos are copied from upload-photos/<uploadId>/ to photos/uploads/<uploadId>/
 * so the catalog UI can serve them via /photo/.
 */
export function promoteUploadToImport(uploadId: number): PromotionResult {
  const db = getDb();
  const upload = db
    .prepare("SELECT id, original_name, stored_path FROM uploads WHERE id = ?")
    .get(uploadId) as { id: number; original_name: string; stored_path: string } | undefined;
  if (!upload) throw new Error(`Upload ${uploadId} not found`);

  const existing = db
    .prepare("SELECT id FROM imports WHERE upload_id = ?")
    .get(uploadId) as { id: number } | undefined;
  if (existing) throw new Error(`Cet upload est déjà promu en import #${existing.id}`);

  // Build a folder_name unique to this upload. Strip extension and add UPL-<id> prefix
  // to make it visually distinct from the historical FAMI/TROPI imports.
  const baseName = upload.original_name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9._-]/g, "_");
  const folderName = `UPL-${uploadId}-${baseName}`.slice(0, 80);

  const year = new Date().getFullYear();

  const photosSrcDir = path.join(config.uploadPhotosDir, String(uploadId));
  const photosDstDir = path.join(config.photosDir, "uploads", String(uploadId));
  fs.mkdirSync(photosDstDir, { recursive: true });

  const rows = db
    .prepare(
      `SELECT id, row_index, ean, chinese_description, english_description, nl_description, fr_description,
              hs_china, material, price_usd, quantity, photo_path,
              suggested_code, suggested_invoer_pct, suggestion_source,
              user_code,
              claude_status, claude_code, claude_invoer_pct, claude_confidence
       FROM upload_rows WHERE upload_id = ? ORDER BY row_index`,
    )
    .all(uploadId) as Array<{
      id: number;
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
      user_code: string | null;
      claude_status: string | null;
      claude_code: string | null;
      claude_invoer_pct: number | null;
      claude_confidence: string | null;
    }>;

  let rowsWithoutCode = 0;
  let importIdOut = 0;

  db.transaction(() => {
    const insertImport = db.prepare(`
      INSERT INTO imports (folder_name, brand, year, sheet_used, file_path, product_count, schema_variant, notes, upload_id, phase)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const importResult = insertImport.run(
      folderName,
      null,
      year,
      null,
      upload.stored_path,
      rows.length,
      null,
      `Promoted from upload #${uploadId} (${upload.original_name})`,
      uploadId,
      "awaiting_customs",
    );
    importIdOut = Number(importResult.lastInsertRowid);

    const insertProduct = db.prepare(`
      INSERT INTO products (
        import_id, row_index, ean, chinese_description, english_description, nl_description, fr_description,
        hs_china, tarabel_validated, invoer_pct, material, price_usd, quantity, photo_path, tarabel_source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const r of rows) {
      let code: string | null = null;
      let invoer: number | null = null;
      let source: string | null = null;

      if (r.user_code) {
        code = r.user_code;
        invoer = r.suggested_invoer_pct ?? r.claude_invoer_pct ?? null;
        source = "manual";
      } else if (r.suggested_code && r.suggestion_source && r.suggestion_source !== "none") {
        code = r.suggested_code;
        invoer = r.suggested_invoer_pct;
        // Catalog suggestions come from previous packing-list or customs estimates.
        // We keep them as 'packing_list' here (estimation) — only a real customs PDF
        // upgrades a product to 'customs_pdf'.
        source = "packing_list";
      } else if (r.claude_status === "done" && r.claude_code) {
        code = r.claude_code;
        invoer = r.claude_invoer_pct;
        source = "claude_vision";
      } else {
        rowsWithoutCode++;
      }

      // Copy the photo into the catalog folder, returning the new relative path
      let catalogPhotoPath: string | null = null;
      if (r.photo_path) {
        const src = path.join(config.uploadPhotosDir, r.photo_path);
        if (fs.existsSync(src)) {
          const fileName = path.basename(r.photo_path);
          const dst = path.join(photosDstDir, fileName);
          try {
            fs.copyFileSync(src, dst);
            catalogPhotoPath = path.relative(config.photosDir, dst).replace(/\\/g, "/");
          } catch {
            catalogPhotoPath = null;
          }
        }
      }

      insertProduct.run(
        importIdOut,
        r.row_index,
        r.ean,
        r.chinese_description,
        r.english_description,
        r.nl_description,
        r.fr_description,
        r.hs_china,
        code,
        invoer,
        r.material,
        r.price_usd,
        r.quantity,
        catalogPhotoPath,
        source,
      );
    }
  })();

  return {
    importId: importIdOut,
    folderName,
    productCount: rows.length,
    rowsWithoutCode,
  };
}

export function getPromotedImportId(uploadId: number): number | null {
  const row = getDb()
    .prepare("SELECT id FROM imports WHERE upload_id = ?")
    .get(uploadId) as { id: number } | undefined;
  return row?.id ?? null;
}
