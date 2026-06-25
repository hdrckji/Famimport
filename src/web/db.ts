import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { initSchema } from "../catalog/schema.js";
import { config } from "../config.js";

let _db: Database.Database | null = null;
export function getDb(): Database.Database {
  if (!_db) {
    fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
    _db = new Database(config.dbPath, { readonly: false });
    _db.pragma("journal_mode = WAL");
    initSchema(_db);
  }
  return _db;
}

export interface DashboardStats {
  totalImports: number;
  totalProducts: number;
  productsCustomsValidated: number;
  productsInternalEstimate: number;
  productsWithEan: number;
  uniqueEans: number;
  uniqueCustomsCodes: number;
  totalDeclarations: number;
  totalCustomsLines: number;
  divergencePct: number;
}

const SOURCE_CUSTOMS = "tarabel_source = 'customs_pdf'";
const SOURCE_PACKING =
  "tarabel_validated IS NOT NULL AND tarabel_validated != '' AND (tarabel_source IS NULL OR tarabel_source != 'customs_pdf')";

export function getDashboardStats(): DashboardStats {
  const db = getDb();
  const totalImports = (db.prepare("SELECT COUNT(*) AS c FROM imports").get() as { c: number }).c;
  const totalProducts = (db.prepare("SELECT COUNT(*) AS c FROM products").get() as { c: number }).c;
  const productsCustomsValidated = (db.prepare(
    `SELECT COUNT(*) AS c FROM products WHERE ${SOURCE_CUSTOMS}`,
  ).get() as { c: number }).c;
  const productsInternalEstimate = (db.prepare(
    `SELECT COUNT(*) AS c FROM products WHERE ${SOURCE_PACKING}`,
  ).get() as { c: number }).c;
  const productsWithEan = (db.prepare(
    "SELECT COUNT(*) AS c FROM products WHERE ean IS NOT NULL AND ean != ''",
  ).get() as { c: number }).c;
  const uniqueEans = (db.prepare(
    "SELECT COUNT(DISTINCT ean) AS c FROM products WHERE ean IS NOT NULL AND ean != ''",
  ).get() as { c: number }).c;
  const uniqueCustomsCodes = (db.prepare(
    `SELECT COUNT(DISTINCT tarabel_validated) AS c FROM products WHERE ${SOURCE_CUSTOMS}`,
  ).get() as { c: number }).c;
  const totalDeclarations = (db.prepare("SELECT COUNT(*) AS c FROM customs_declarations").get() as { c: number }).c;
  const totalCustomsLines = (db.prepare("SELECT COUNT(*) AS c FROM customs_lines").get() as { c: number }).c;
  // Only compute divergence based on customs-validated codes (the trustworthy ones)
  const divergenceRow = db.prepare(`
    SELECT COUNT(*) AS total,
           SUM(CASE WHEN hs_china = tarabel_validated THEN 1 ELSE 0 END) AS matching
    FROM products
    WHERE hs_china IS NOT NULL AND hs_china != ''
      AND ${SOURCE_CUSTOMS}
  `).get() as { total: number; matching: number };
  const divergencePct = divergenceRow.total
    ? Math.round(((divergenceRow.total - divergenceRow.matching) / divergenceRow.total) * 100)
    : 0;
  return {
    totalImports,
    totalProducts,
    productsCustomsValidated,
    productsInternalEstimate,
    productsWithEan,
    uniqueEans,
    uniqueCustomsCodes,
    totalDeclarations,
    totalCustomsLines,
    divergencePct,
  };
}

export interface ImportRow {
  id: number;
  folder_name: string;
  brand: string | null;
  year: number | null;
  product_count: number;
  ingested_at: string;
  schema_variant: string | null;
  declaration_count: number;
  customs_validated_count: number;
  internal_estimate_count: number;
  phase: string | null;
  upload_id: number | null;
}

export function listImports(): ImportRow[] {
  return getDb().prepare(`
    SELECT i.id, i.folder_name, i.brand, i.year, i.product_count, i.ingested_at, i.schema_variant,
           i.phase, i.upload_id,
           (SELECT COUNT(*) FROM customs_declarations WHERE import_id = i.id) AS declaration_count,
           (SELECT COUNT(*) FROM products WHERE import_id = i.id AND ${SOURCE_CUSTOMS}) AS customs_validated_count,
           (SELECT COUNT(*) FROM products WHERE import_id = i.id AND ${SOURCE_PACKING}) AS internal_estimate_count
    FROM imports i
    ORDER BY i.year DESC, i.folder_name DESC
  `).all() as ImportRow[];
}

export interface ProductRow {
  id: number;
  import_id: number;
  folder_name: string;
  row_index: number;
  ean: string | null;
  chinese_description: string | null;
  english_description: string | null;
  nl_description: string | null;
  fr_description: string | null;
  hs_china: string | null;
  tarabel_validated: string | null;
  tarabel_source: string | null;
  invoer_pct: number | null;
  material: string | null;
  price_usd: number | null;
  quantity: number | null;
  photo_path: string | null;
}

export function listProductsForImport(importId: number): ProductRow[] {
  return getDb().prepare(`
    SELECT p.*, i.folder_name
    FROM products p JOIN imports i ON p.import_id = i.id
    WHERE p.import_id = ?
    ORDER BY p.row_index
  `).all(importId) as ProductRow[];
}

export function getImport(importId: number): ImportRow | undefined {
  return getDb().prepare(`
    SELECT i.id, i.folder_name, i.brand, i.year, i.product_count, i.ingested_at, i.schema_variant,
           i.phase, i.upload_id,
           (SELECT COUNT(*) FROM customs_declarations WHERE import_id = i.id) AS declaration_count,
           (SELECT COUNT(*) FROM products WHERE import_id = i.id AND ${SOURCE_CUSTOMS}) AS customs_validated_count,
           (SELECT COUNT(*) FROM products WHERE import_id = i.id AND ${SOURCE_PACKING}) AS internal_estimate_count
    FROM imports i WHERE i.id = ?
  `).get(importId) as ImportRow | undefined;
}

export interface SearchFilters {
  q?: string;
  ean?: string;
  hsCode?: string;
  brand?: string;
  year?: number;
  hasPhoto?: boolean;
  validatedOnly?: boolean;
  limit?: number;
  offset?: number;
}

export interface SearchResult {
  total: number;
  rows: ProductRow[];
}

export function searchProducts(f: SearchFilters): SearchResult {
  const where: string[] = [];
  const params: Array<string | number> = [];
  if (f.q) {
    where.push(`(p.english_description LIKE ? OR p.chinese_description LIKE ? OR p.nl_description LIKE ? OR p.fr_description LIKE ? OR p.omschrijving LIKE ?)`);
    const like = `%${f.q}%`;
    params.push(like, like, like, like, like);
  }
  if (f.ean) {
    where.push("p.ean = ?");
    params.push(f.ean);
  }
  if (f.hsCode) {
    where.push("(p.tarabel_validated LIKE ? OR p.hs_china LIKE ?)");
    params.push(`${f.hsCode}%`, `${f.hsCode}%`);
  }
  if (f.brand) {
    where.push("i.brand = ?");
    params.push(f.brand);
  }
  if (f.year) {
    where.push("i.year = ?");
    params.push(f.year);
  }
  if (f.hasPhoto) {
    where.push("p.photo_path IS NOT NULL AND p.photo_path != ''");
  }
  if (f.validatedOnly) {
    where.push("p.tarabel_validated IS NOT NULL AND p.tarabel_validated != ''");
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const total = (getDb().prepare(`
    SELECT COUNT(*) AS c FROM products p JOIN imports i ON p.import_id = i.id ${whereSql}
  `).get(...params) as { c: number }).c;

  const limit = f.limit ?? 50;
  const offset = f.offset ?? 0;
  const rows = getDb().prepare(`
    SELECT p.*, i.folder_name
    FROM products p JOIN imports i ON p.import_id = i.id
    ${whereSql}
    ORDER BY i.year DESC, p.id DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset) as ProductRow[];

  return { total, rows };
}

export function getProduct(productId: number): ProductRow | undefined {
  return getDb().prepare(`
    SELECT p.*, i.folder_name
    FROM products p JOIN imports i ON p.import_id = i.id
    WHERE p.id = ?
  `).get(productId) as ProductRow | undefined;
}

export interface TopCode {
  code: string;
  uses: number;
}

/**
 * Top codes computed ONLY from customs-validated products.
 * Internal-estimate codes are excluded to avoid amplifying possible
 * classification errors from the internal collaborator.
 */
export function getTopTarabelCodes(limit: number = 15): TopCode[] {
  return getDb().prepare(`
    SELECT tarabel_validated AS code, COUNT(*) AS uses
    FROM products
    WHERE ${SOURCE_CUSTOMS}
    GROUP BY tarabel_validated
    ORDER BY uses DESC LIMIT ?
  `).all(limit) as TopCode[];
}

export interface TarabelCodeSummary {
  code: string;
  description: string | null;
  duty_rate: number | null;
  vat_rate: number | null;
  product_count: number;
  customs_validated_count: number;
  internal_estimate_count: number;
  customs_line_count: number;
  sample_product_id: number | null;
  sample_photo_path: string | null;
}

export interface TarabelCodeListResult {
  total: number;
  rows: TarabelCodeSummary[];
}

export function listTarabelCodes(filter: { q?: string; limit?: number; offset?: number; orderBy?: "code" | "uses" }): TarabelCodeListResult {
  const limit = filter.limit ?? 50;
  const offset = filter.offset ?? 0;
  const orderBy = filter.orderBy === "code" ? "code ASC" : "product_count DESC, code ASC";

  const params: Array<string | number> = [];
  let whereSql = "";
  if (filter.q) {
    const like = `%${filter.q}%`;
    whereSql = "WHERE code LIKE ? OR description LIKE ?";
    params.push(like, like);
  }

  const baseCte = `
    WITH all_codes AS (
      SELECT tarabel_validated AS code FROM products WHERE tarabel_validated IS NOT NULL AND tarabel_validated != ''
      UNION
      SELECT hs_code AS code FROM customs_lines
    ),
    code_descriptions AS (
      SELECT hs_code AS code,
             description,
             duty_rate,
             vat_rate,
             ROW_NUMBER() OVER (PARTITION BY hs_code ORDER BY LENGTH(COALESCE(description, '')) DESC) AS rn
      FROM customs_lines
      WHERE description IS NOT NULL AND description != ''
    ),
    code_stats AS (
      SELECT
        ac.code,
        (SELECT description FROM code_descriptions WHERE code = ac.code AND rn = 1) AS description,
        (SELECT duty_rate FROM code_descriptions WHERE code = ac.code AND rn = 1) AS duty_rate,
        (SELECT vat_rate FROM code_descriptions WHERE code = ac.code AND rn = 1) AS vat_rate,
        (SELECT COUNT(*) FROM products WHERE tarabel_validated = ac.code) AS product_count,
        (SELECT COUNT(*) FROM products WHERE tarabel_validated = ac.code AND tarabel_source = 'customs_pdf') AS customs_validated_count,
        (SELECT COUNT(*) FROM products WHERE tarabel_validated = ac.code AND (tarabel_source IS NULL OR tarabel_source != 'customs_pdf')) AS internal_estimate_count,
        (SELECT COUNT(*) FROM customs_lines WHERE hs_code = ac.code) AS customs_line_count,
        (SELECT id FROM products WHERE tarabel_validated = ac.code AND photo_path IS NOT NULL AND photo_path != '' LIMIT 1) AS sample_product_id,
        (SELECT photo_path FROM products WHERE tarabel_validated = ac.code AND photo_path IS NOT NULL AND photo_path != '' LIMIT 1) AS sample_photo_path
      FROM all_codes ac
      GROUP BY ac.code
    )
  `;

  const total = (getDb().prepare(`${baseCte} SELECT COUNT(*) AS c FROM code_stats ${whereSql}`).get(...params) as { c: number }).c;

  const rows = getDb().prepare(`
    ${baseCte}
    SELECT * FROM code_stats
    ${whereSql}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset) as TarabelCodeSummary[];

  return { total, rows };
}

export interface TarabelCodeDetail {
  code: string;
  description: string | null;
  duty_rate: number | null;
  vat_rate: number | null;
  alt_descriptions: string[];
  product_count: number;
  customs_validated_count: number;
  internal_estimate_count: number;
  customs_line_count: number;
  declarations: Array<{
    import_id: number;
    folder_name: string;
    line_number: number;
    description: string | null;
    net_mass: number | null;
    statistical_value: number | null;
  }>;
  products: ProductRow[];
}

export function getTarabelCode(code: string): TarabelCodeDetail | undefined {
  const customsLines = getDb().prepare(`
    SELECT cl.line_number, cl.description, cl.duty_rate, cl.vat_rate, cl.net_mass, cl.statistical_value,
           cd.import_id, i.folder_name
    FROM customs_lines cl
    JOIN customs_declarations cd ON cl.declaration_id = cd.id
    JOIN imports i ON cd.import_id = i.id
    WHERE cl.hs_code = ?
    ORDER BY i.year DESC, i.folder_name
  `).all(code) as Array<{
    line_number: number; description: string | null; duty_rate: number | null; vat_rate: number | null;
    net_mass: number | null; statistical_value: number | null; import_id: number; folder_name: string;
  }>;

  const products = getDb().prepare(`
    SELECT p.*, i.folder_name
    FROM products p JOIN imports i ON p.import_id = i.id
    WHERE p.tarabel_validated = ?
    ORDER BY (p.tarabel_source = 'customs_pdf') DESC, i.year DESC, p.id DESC
  `).all(code) as ProductRow[];

  if (customsLines.length === 0 && products.length === 0) return undefined;

  // Pick the longest description as primary; keep distinct alternatives
  const descriptions = customsLines
    .map((l) => l.description)
    .filter((d): d is string => !!d && d.trim().length > 0);
  const distinctDescriptions = [...new Set(descriptions.map((d) => d.trim()))];
  const sorted = [...distinctDescriptions].sort((a, b) => b.length - a.length);
  const primary = sorted[0] ?? null;
  const alts = sorted.slice(1);

  const dutyRates = customsLines.map((l) => l.duty_rate).filter((r): r is number => r != null);
  const vatRates = customsLines.map((l) => l.vat_rate).filter((r): r is number => r != null);

  const stats = getDb().prepare(`
    SELECT
      (SELECT COUNT(*) FROM products WHERE tarabel_validated = ?) AS product_count,
      (SELECT COUNT(*) FROM products WHERE tarabel_validated = ? AND tarabel_source = 'customs_pdf') AS customs_validated_count,
      (SELECT COUNT(*) FROM products WHERE tarabel_validated = ? AND (tarabel_source IS NULL OR tarabel_source != 'customs_pdf')) AS internal_estimate_count
  `).get(code, code, code) as { product_count: number; customs_validated_count: number; internal_estimate_count: number };

  return {
    code,
    description: primary,
    duty_rate: dutyRates.length > 0 ? dutyRates[0] : null,
    vat_rate: vatRates.length > 0 ? vatRates[0] : null,
    alt_descriptions: alts,
    product_count: stats.product_count,
    customs_validated_count: stats.customs_validated_count,
    internal_estimate_count: stats.internal_estimate_count,
    customs_line_count: customsLines.length,
    declarations: customsLines.map((l) => ({
      import_id: l.import_id,
      folder_name: l.folder_name,
      line_number: l.line_number,
      description: l.description,
      net_mass: l.net_mass,
      statistical_value: l.statistical_value,
    })),
    products,
  };
}

export interface EanHistoryRow {
  product: ProductRow;
  imports: number;
  codesUsed: string[];
}

export function getEanHistory(ean: string): ProductRow[] {
  return getDb().prepare(`
    SELECT p.*, i.folder_name
    FROM products p JOIN imports i ON p.import_id = i.id
    WHERE p.ean = ?
    ORDER BY i.year DESC, p.row_index
  `).all(ean) as ProductRow[];
}
