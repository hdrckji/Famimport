import path from "node:path";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import Database from "better-sqlite3";
import { initSchema } from "./schema.js";
import { readPackingList, type CatalogRow } from "./reader.js";

export interface IngestStats {
  folder: string;
  status: "ok" | "skipped" | "error";
  productsAdded: number;
  message?: string;
}

const INVOICE_LIKE = /\b(inland|invoice|charges|catalogus|amendment|bestelling)/i;

async function listCandidatePackingLists(folder: string): Promise<string[]> {
  const files = await fs.readdir(folder);
  const xlsx = files.filter(
    (f) => f.toLowerCase().endsWith(".xlsx") && !INVOICE_LIKE.test(f),
  );
  if (xlsx.length === 0) return [];

  const withSize = await Promise.all(
    xlsx.map(async (f) => {
      const stat = await fs.stat(path.join(folder, f));
      return { f, size: stat.size };
    }),
  );

  const tier = (f: string): number => {
    if (/^kopie\s*van\s*att\.?\s*no\.?\s*1/i.test(f)) return 0;
    if (/intrastat/i.test(f)) return 0;
    if (/packing|paklijst/i.test(f) && !/\b(kopie|erreurs|att\.?\s*no)/i.test(f)) return 1;
    if (/berekening/i.test(f)) return 2;
    if (/usage|facturatie|factuurcontrole/i.test(f)) return 3;
    return 4;
  };

  withSize.sort((a, b) => {
    const ta = tier(a.f);
    const tb = tier(b.f);
    if (ta !== tb) return ta - tb;
    return b.size - a.size;
  });

  return withSize.map((x) => path.join(folder, x.f));
}

function parseFolderName(folder: string): { year?: number; brand?: string } {
  const base = path.basename(folder);
  const m = base.match(/^(\d{2})\s*([A-Za-z]+)\s*\d/);
  if (!m) return {};
  return { year: 2000 + Number(m[1]), brand: m[2].toUpperCase() };
}

async function savePhoto(
  row: CatalogRow,
  folderName: string,
  photosRoot: string,
): Promise<string | undefined> {
  if (!row.imageBuffer || row.imageBuffer.length === 0) return undefined;
  const baseId = row.ean || row.bestelnummer || `row${row.rowIndex}`;
  const safeBase = baseId.replace(/[^a-zA-Z0-9._-]/g, "_");
  const dir = path.join(photosRoot, folderName);
  await fs.mkdir(dir, { recursive: true });
  const fileName = `${safeBase}.${row.imageExt ?? "jpg"}`;
  const fullPath = path.join(dir, fileName);
  await fs.writeFile(fullPath, row.imageBuffer);
  return path.relative(photosRoot, fullPath);
}

export async function ingestImport(
  db: Database.Database,
  folderPath: string,
  photosRoot: string,
): Promise<IngestStats> {
  const folderName = path.basename(folderPath);
  const existing = db
    .prepare("SELECT id FROM imports WHERE folder_name = ?")
    .get(folderName) as { id: number } | undefined;
  if (existing) {
    return { folder: folderName, status: "skipped", productsAdded: 0, message: "already ingested" };
  }

  const candidates = await listCandidatePackingLists(folderPath);
  if (candidates.length === 0) {
    return { folder: folderName, status: "error", productsAdded: 0, message: "no xlsx found" };
  }

  let read: Awaited<ReturnType<typeof readPackingList>> = null;
  let packingPath: string | null = null;
  const tried: string[] = [];
  for (const c of candidates) {
    tried.push(path.basename(c));
    try {
      const result = await readPackingList(c);
      if (result && result.rows.length > 0) {
        read = result;
        packingPath = c;
        break;
      }
    } catch {
      // try next
    }
  }
  if (!read || !packingPath) {
    return {
      folder: folderName,
      status: "error",
      productsAdded: 0,
      message: `no data sheet detected in: ${tried.join(", ")}`,
    };
  }

  const { year, brand } = parseFolderName(folderName);

  const insertImport = db.prepare(`
    INSERT INTO imports (folder_name, brand, year, sheet_used, file_path, schema_variant)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const insertProduct = db.prepare(`
    INSERT INTO products (
      import_id, row_index, ean, leverancier, bestelnummer,
      chinese_description, english_description, nl_description, fr_description, omschrijving,
      hs_china, tarabel_validated, invoer_pct, antidumping_pct,
      material, price_usd, quantity, photo_path, raw_data
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const importResult = insertImport.run(
    folderName,
    brand ?? null,
    year ?? null,
    read.sheetName,
    packingPath,
    read.schemaVariant,
  );
  const importId = Number(importResult.lastInsertRowid);

  let added = 0;
  for (const row of read.rows) {
    const photoPath = await savePhoto(row, folderName, photosRoot);
    insertProduct.run(
      importId,
      row.rowIndex,
      row.ean ?? null,
      row.leverancier ?? null,
      row.bestelnummer ?? null,
      row.chineseDescription ?? null,
      row.englishDescription ?? null,
      row.nlDescription ?? null,
      row.frDescription ?? null,
      row.omschrijving ?? null,
      row.hsChina ?? null,
      row.tarabelValidated ?? null,
      row.invoerPct ?? null,
      row.antidumpingPct ?? null,
      row.material ?? null,
      row.priceUSD ?? null,
      row.quantity ?? null,
      photoPath ?? null,
      JSON.stringify(row, (k, v) => (k === "imageBuffer" ? undefined : v)),
    );
    added++;
  }

  db.prepare("UPDATE imports SET product_count = ? WHERE id = ?").run(
    added,
    importId,
  );

  return { folder: folderName, status: "ok", productsAdded: added };
}

export async function ingestAll(
  parentDir: string,
  dbPath: string,
  photosRoot: string,
): Promise<IngestStats[]> {
  if (!existsSync(parentDir)) throw new Error(`Not found: ${parentDir}`);
  await fs.mkdir(path.dirname(dbPath), { recursive: true });
  await fs.mkdir(photosRoot, { recursive: true });

  const db = new Database(dbPath);
  initSchema(db);

  const entries = await fs.readdir(parentDir, { withFileTypes: true });
  const folders = entries
    .filter((e) => e.isDirectory())
    .map((e) => path.join(parentDir, e.name))
    .sort();

  const stats: IngestStats[] = [];
  for (let i = 0; i < folders.length; i++) {
    process.stdout.write(`\r[${i + 1}/${folders.length}] ${path.basename(folders[i]).padEnd(20)}`);
    try {
      const s = await ingestImport(db, folders[i], photosRoot);
      stats.push(s);
    } catch (err) {
      stats.push({
        folder: path.basename(folders[i]),
        status: "error",
        productsAdded: 0,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
  process.stdout.write("\n");
  db.close();
  return stats;
}
