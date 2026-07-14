import ExcelJS from "exceljs";
import path from "node:path";
import type Database from "better-sqlite3";

/**
 * Ingestion des extractions complètes TARIC publiées par la Commission
 * européenne sur CIRCABC ("TARIC & Quota Data and Information" →
 * TARIC Full database, accès invité) :
 *
 * - "Declarable codes.xlsx"   : TOUS les codes de la nomenclature avec
 *   IS_LEAF (1 = code réellement déclarable en douane) et dates de validité.
 *   C'est la référence de validation.
 * - "Nomenclature FR.xlsx" / "Nomenclature NL.xlsx" : descriptions officielles.
 * - "Duties Import 01-99.xlsx" : mesures à l'import ; on en extrait le droit
 *   pays tiers (ERGA OMNES, "Third country duty") = le taux d'invoer standard.
 *
 * Format commun : colonne "Goods code" = "0101210000 80" (code + espace +
 * suffixe de ligne produit), dates en DD-MM-YYYY ou objets Date Excel.
 */

export interface XlsxIngestResult {
  file: string;
  kind: "declarable" | "description" | "duties";
  rows: number;
  applied: number;
}

function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("text" in v) return String(v.text);
    if ("result" in v) return String(v.result ?? "");
  }
  return String(v);
}

/** "31-12-1971" ou Date → ISO "1971-12-31T00:00:00" (null si vide) */
function toIsoDate(v: ExcelJS.CellValue): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return v.toISOString().slice(0, 19);
  const s = String(v).trim();
  const m = s.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}T00:00:00`;
  return s;
}

function splitGoodsCode(raw: string): { code: string; suffix: string } | null {
  const m = raw.trim().match(/^(\d{10})\s+(\d{2})$/);
  if (m) return { code: m[1], suffix: m[2] };
  const bare = raw.trim().match(/^(\d{10})$/);
  if (bare) return { code: bare[1], suffix: "80" };
  return null;
}

async function readSheet(filePath: string): Promise<ExcelJS.Worksheet> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error(`Aucun onglet dans ${filePath}`);
  return ws;
}

/** "Declarable codes.xlsx" — crée/actualise toute la nomenclature. */
export async function ingestDeclarableCodes(
  db: Database.Database,
  filePath: string,
): Promise<XlsxIngestResult> {
  const ws = await readSheet(filePath);
  const upsert = db.prepare(`
    INSERT INTO nomenclature (code, suffix, validity_start, validity_end, is_leaf, deleted, updated_at)
    VALUES (@code, @suffix, @start, @end, @leaf, 0, datetime('now'))
    ON CONFLICT(code, suffix) DO UPDATE SET
      validity_start = excluded.validity_start,
      validity_end = excluded.validity_end,
      is_leaf = excluded.is_leaf,
      deleted = 0,
      updated_at = excluded.updated_at
  `);

  let rows = 0;
  let applied = 0;
  const tx = db.transaction(() => {
    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      rows++;
      const parsed = splitGoodsCode(cellText(row.getCell(1).value));
      if (!parsed) return;
      upsert.run({
        code: parsed.code,
        suffix: parsed.suffix,
        start: toIsoDate(row.getCell(2).value),
        end: toIsoDate(row.getCell(5).value),
        leaf: Number(cellText(row.getCell(4).value)) === 1 ? 1 : 0,
      });
      applied++;
    });
  });
  tx();
  return { file: path.basename(filePath), kind: "declarable", rows, applied };
}

/** "Nomenclature FR.xlsx" / "Nomenclature NL.xlsx" — descriptions officielles. */
export async function ingestNomenclatureDescriptions(
  db: Database.Database,
  filePath: string,
  lang: "fr" | "nl",
): Promise<XlsxIngestResult> {
  const ws = await readSheet(filePath);
  const col = lang === "fr" ? "description_fr" : "description_nl";
  const update = db.prepare(
    `UPDATE nomenclature SET ${col} = ?, updated_at = datetime('now') WHERE code = ? AND suffix = ?`,
  );
  const insert = db.prepare(`
    INSERT OR IGNORE INTO nomenclature (code, suffix, ${col}, validity_start, deleted, updated_at)
    VALUES (?, ?, ?, ?, 0, datetime('now'))
  `);

  let rows = 0;
  let applied = 0;
  const tx = db.transaction(() => {
    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      rows++;
      const parsed = splitGoodsCode(cellText(row.getCell(1).value));
      if (!parsed) return;
      const description = cellText(row.getCell(7).value).trim();
      if (!description) return;
      const res = update.run(description, parsed.code, parsed.suffix);
      if (res.changes === 0) {
        insert.run(parsed.code, parsed.suffix, description, toIsoDate(row.getCell(2).value));
      }
      applied++;
    });
  });
  tx();
  return { file: path.basename(filePath), kind: "description", rows, applied };
}

/**
 * "Duties Import 01-99.xlsx" — extrait le droit pays tiers (ERGA OMNES,
 * "Third country duty", mesure en cours = sans date de fin) par code.
 */
export async function ingestImportDuties(
  db: Database.Database,
  filePath: string,
): Promise<XlsxIngestResult> {
  const ws = await readSheet(filePath);
  const update = db.prepare(
    `UPDATE nomenclature SET third_country_duty = ?, updated_at = datetime('now')
     WHERE code = ? AND suffix = '80'`,
  );

  let rows = 0;
  let applied = 0;
  const tx = db.transaction(() => {
    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      rows++;
      const origin = cellText(row.getCell(7).value).trim();
      const measureType = cellText(row.getCell(8).value).trim();
      if (origin !== "ERGA OMNES" || measureType !== "Third country duty") return;
      if (toIsoDate(row.getCell(5).value)) return; // mesure clôturée
      const code = cellText(row.getCell(1).value).trim().replace(/\D/g, "");
      if (code.length !== 10) return;
      const dutyMatch = cellText(row.getCell(10).value).match(/([\d.]+)\s*%/);
      if (!dutyMatch) return;
      const res = update.run(Number(dutyMatch[1]), code);
      if (res.changes > 0) applied++;
    });
  });
  tx();
  return { file: path.basename(filePath), kind: "duties", rows, applied };
}

/** Routage par nom de fichier CIRCABC. Renvoie null si le fichier n'est pas reconnu. */
export async function ingestCircabcXlsx(
  db: Database.Database,
  filePath: string,
): Promise<XlsxIngestResult | null> {
  const name = path.basename(filePath).toLowerCase();
  if (name.startsWith("declarable codes")) return ingestDeclarableCodes(db, filePath);
  if (name.startsWith("nomenclature fr")) return ingestNomenclatureDescriptions(db, filePath, "fr");
  if (name.startsWith("nomenclature nl")) return ingestNomenclatureDescriptions(db, filePath, "nl");
  if (name.startsWith("duties import")) return ingestImportDuties(db, filePath);
  return null;
}
