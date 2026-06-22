import path from "node:path";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import Database from "better-sqlite3";
import { initSchema } from "../catalog/schema.js";
import { findCustomsPdf } from "./discover.js";
import { parseCustomsPdf } from "./parse.js";

export interface CustomsIngestStats {
  folder: string;
  status: "ok" | "no_pdf" | "no_lines" | "error" | "skipped";
  lineCount: number;
  format?: string;
  matchedProducts: number;
  message?: string;
}

async function ingestFolder(
  db: Database.Database,
  folderPath: string,
): Promise<CustomsIngestStats> {
  const folderName = path.basename(folderPath);

  const importRow = db
    .prepare("SELECT id FROM imports WHERE folder_name = ?")
    .get(folderName) as { id: number } | undefined;
  if (!importRow) {
    return { folder: folderName, status: "error", lineCount: 0, matchedProducts: 0, message: "import not in catalog" };
  }
  const importId = importRow.id;

  const existing = db
    .prepare("SELECT id FROM customs_declarations WHERE import_id = ?")
    .get(importId) as { id: number } | undefined;
  if (existing) {
    return { folder: folderName, status: "skipped", lineCount: 0, matchedProducts: 0, message: "already parsed" };
  }

  const found = await findCustomsPdf(folderPath);
  if (!found) {
    return { folder: folderName, status: "no_pdf", lineCount: 0, matchedProducts: 0 };
  }

  const decl = await parseCustomsPdf(found.pdfPath);
  if (!decl || decl.lines.length === 0) {
    return {
      folder: folderName,
      status: "no_lines",
      lineCount: 0,
      matchedProducts: 0,
      format: found.format,
      message: "PDF parsed but no lines extracted",
    };
  }

  const insertDecl = db.prepare(`
    INSERT INTO customs_declarations (import_id, pdf_path, format, mrn, acceptance_date, line_count, raw_text)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const declResult = insertDecl.run(
    importId,
    found.pdfPath,
    decl.format,
    decl.mrn ?? null,
    decl.acceptanceDate ?? null,
    decl.lines.length,
    decl.rawText.slice(0, 20000),
  );
  const declId = Number(declResult.lastInsertRowid);

  const insertLine = db.prepare(`
    INSERT INTO customs_lines (declaration_id, line_number, hs_code, description, gross_mass, net_mass, statistical_value, duty_rate, duty_amount, vat_rate, raw_block)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const line of decl.lines) {
    insertLine.run(
      declId,
      line.lineNumber,
      line.hsCode,
      line.description ?? null,
      line.grossMass ?? null,
      line.netMass ?? null,
      line.statisticalValue ?? null,
      line.dutyRate ?? null,
      line.dutyAmount ?? null,
      line.vatRate ?? null,
      line.rawBlock ?? null,
    );
  }

  // Matching: for each product in this import without tarabel_validated,
  // try to match its chinese HS code prefix to a customs line.
  const matched = matchCustomsToProducts(db, importId, declId);

  return {
    folder: folderName,
    status: "ok",
    lineCount: decl.lines.length,
    format: found.format,
    matchedProducts: matched,
  };
}

function matchCustomsToProducts(
  db: Database.Database,
  importId: number,
  declId: number,
): number {
  const customsLines = db
    .prepare("SELECT hs_code FROM customs_lines WHERE declaration_id = ?")
    .all(declId) as Array<{ hs_code: string }>;

  const products = db
    .prepare(
      "SELECT id, hs_china, tarabel_validated FROM products WHERE import_id = ?",
    )
    .all(importId) as Array<{ id: number; hs_china: string | null; tarabel_validated: string | null }>;

  const updateProduct = db.prepare(
    "UPDATE products SET tarabel_validated = ?, tarabel_source = 'customs_pdf' WHERE id = ?",
  );

  let matched = 0;
  for (const p of products) {
    if (p.tarabel_validated) continue;
    if (!p.hs_china) continue;
    const prefix6 = p.hs_china.slice(0, 6);
    const prefix4 = p.hs_china.slice(0, 4);

    const exact = customsLines.filter((c) => c.hs_code.startsWith(prefix6));
    const broader = customsLines.filter((c) => c.hs_code.startsWith(prefix4));

    let chosen: string | null = null;
    if (exact.length === 1) chosen = exact[0].hs_code;
    else if (exact.length === 0 && broader.length === 1) chosen = broader[0].hs_code;

    if (chosen) {
      updateProduct.run(chosen, p.id);
      matched++;
    }
  }
  return matched;
}

export async function ingestAllCustoms(
  parentDir: string,
  dbPath: string,
): Promise<CustomsIngestStats[]> {
  if (!existsSync(parentDir)) throw new Error(`Not found: ${parentDir}`);
  if (!existsSync(dbPath)) throw new Error(`Catalog DB missing: ${dbPath}`);

  const db = new Database(dbPath);
  initSchema(db);

  const entries = await fs.readdir(parentDir, { withFileTypes: true });
  const folders = entries
    .filter((e) => e.isDirectory())
    .map((e) => path.join(parentDir, e.name))
    .sort();

  const stats: CustomsIngestStats[] = [];
  for (let i = 0; i < folders.length; i++) {
    process.stdout.write(`\r[${i + 1}/${folders.length}] ${path.basename(folders[i]).padEnd(20)}`);
    try {
      stats.push(await ingestFolder(db, folders[i]));
    } catch (err) {
      stats.push({
        folder: path.basename(folders[i]),
        status: "error",
        lineCount: 0,
        matchedProducts: 0,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
  process.stdout.write("\n");
  db.close();
  return stats;
}
