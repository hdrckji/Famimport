import ExcelJS from "exceljs";
import {
  COL,
  DATA_START_ROW,
  SHEET_NAME,
} from "./columns.js";
import type { ProductRow } from "../types.js";

function cellToString(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "object") {
    const obj = v as unknown as Record<string, unknown>;
    if ("richText" in obj && Array.isArray(obj.richText))
      return (obj.richText as Array<{ text: string }>)
        .map((rt) => rt.text)
        .join("")
        .trim();
    if ("text" in obj) return String(obj.text).trim();
    if ("result" in obj) return String(obj.result).trim();
  }
  return "";
}

function cellToNumber(v: ExcelJS.CellValue): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  if (typeof v === "object") {
    const obj = v as unknown as Record<string, unknown>;
    if ("result" in obj && typeof obj.result === "number") return obj.result;
  }
  return null;
}

export interface LoadedWorkbook {
  workbook: ExcelJS.Workbook;
  rows: ProductRow[];
}

export async function loadWorkbook(path: string): Promise<LoadedWorkbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);

  const ws = wb.getWorksheet(SHEET_NAME);
  if (!ws) throw new Error(`Sheet "${SHEET_NAME}" introuvable dans ${path}`);

  const imagesByRow = new Map<number, { buffer: Buffer; extension: string }>();
  for (const img of ws.getImages()) {
    const media = wb.model.media[img.imageId as unknown as number];
    if (!media || !media.buffer) continue;
    const range = img.range as ExcelJS.ImageRange;
    const tlRow = range.tl ? Math.round(range.tl.nativeRow) : null;
    if (tlRow == null) continue;
    const oneIndexed = tlRow + 1;
    if (!imagesByRow.has(oneIndexed)) {
      imagesByRow.set(oneIndexed, {
        buffer: Buffer.from(media.buffer),
        extension: media.extension ?? "jpeg",
      });
    }
  }

  const rows: ProductRow[] = [];
  for (let r = DATA_START_ROW; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const chinese = cellToString(row.getCell(COL.chineseDescription).value);
    const english = cellToString(row.getCell(COL.englishDescription).value);
    const hs = cellToString(row.getCell(COL.hsCodeChina).value);
    if (!chinese && !english && !hs) continue;

    const img = imagesByRow.get(r);
    rows.push({
      rowIndex: r,
      leverancier: cellToString(row.getCell(COL.leverancier).value),
      chineseDescription: chinese,
      englishDescription: english,
      omschrijving: cellToString(row.getCell(COL.omschrijving).value),
      descriptionNL: cellToString(row.getCell(COL.descriptionNL).value),
      descriptionFR: cellToString(row.getCell(COL.descriptionFR).value),
      hsCodeChina: hs,
      eanBarcode: cellToString(row.getCell(COL.eanBarcode).value),
      bestelnummer: cellToString(row.getCell(COL.bestelnummer).value),
      quantity: cellToNumber(row.getCell(COL.quantity).value),
      priceUSD: cellToNumber(row.getCell(COL.priceUSD).value),
      material: cellToString(row.getCell(COL.material).value),
      imageBuffer: img?.buffer,
      imageExt: img?.extension,
    });
  }

  return { workbook: wb, rows };
}
