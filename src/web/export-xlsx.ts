import ExcelJS from "exceljs";
import path from "node:path";
import { getUpload, getUploadRows } from "./upload.js";

const FILL_HIGH: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD5E8D4" } };
const FILL_MEDIUM: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF2CC" } };
const FILL_LOW: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFC7CE" } };
const FILL_NONE: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9D9D9" } };

export async function buildExportWorkbook(uploadId: number): Promise<{ buffer: Buffer; filename: string }> {
  const upload = getUpload(uploadId);
  if (!upload) throw new Error("Upload not found");

  const sourceWb = new ExcelJS.Workbook();
  await sourceWb.xlsx.readFile(upload.stored_path);

  const rows = getUploadRows(uploadId);
  const sheet =
    sourceWb.getWorksheet("creatie") ??
    sourceWb.getWorksheet("bewerkt") ??
    sourceWb.getWorksheet("BEWERKT");
  if (!sheet) throw new Error("Onglet de données introuvable");

  const headerRow = sheet.getRow(1);
  function findCol(...patterns: RegExp[]): number | null {
    for (let c = 1; c <= sheet!.columnCount; c++) {
      const v = headerRow.getCell(c).value;
      const text = typeof v === "string" ? v.toLowerCase().trim() : "";
      if (text && patterns.some((p) => p.test(text))) return c;
    }
    return null;
  }

  const intrastatCol = findCol(/^intrastat.?code$/, /^intrastat$/) ?? 9;
  const invoerCol = findCol(/^invoer\s*%$/, /^%\s*invoer$/, /^invoer$/) ?? 10;
  const hsCol = findCol(/^hs\s*code$/) ?? 8;

  const auditStart = sheet.columnCount + 1;
  const auditCols = {
    finalCode: auditStart,
    source: auditStart + 1,
    confidence: auditStart + 2,
    decision: auditStart + 3,
    note: auditStart + 4,
  };
  const auditHeaders: Array<[number, string]> = [
    [auditCols.finalCode, "Code final"],
    [auditCols.source, "Source"],
    [auditCols.confidence, "Confiance"],
    [auditCols.decision, "Décision"],
    [auditCols.note, "Note"],
  ];
  for (const [col, label] of auditHeaders) {
    const cell = headerRow.getCell(col);
    cell.value = label;
    cell.font = { bold: true };
  }

  for (const r of rows) {
    const target = sheet.getRow(r.row_index);
    const finalCode = r.user_code ?? r.suggested_code ?? null;
    const decision = r.user_decision ?? (finalCode ? "auto" : "à compléter");

    if (finalCode) {
      target.getCell(intrastatCol).value = finalCode;
      if (r.suggested_invoer_pct != null) {
        target.getCell(invoerCol).value = r.suggested_invoer_pct;
        target.getCell(invoerCol).numFmt = "0.00%";
      }
    }

    // Red highlight on the China HS code if divergent
    if (r.hs_china && finalCode && r.hs_china !== finalCode) {
      const c = target.getCell(hsCol);
      const baseStyle = JSON.parse(JSON.stringify(c.style ?? {}));
      c.style = {
        ...baseStyle,
        fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFC7CE" } },
        font: { ...(baseStyle.font ?? {}), bold: true, color: { argb: "FF9C0006" } },
      };
    }

    target.getCell(auditCols.finalCode).value = finalCode;
    target.getCell(auditCols.source).value = r.suggestion_source ?? "";
    target.getCell(auditCols.confidence).value = r.suggestion_confidence ?? "";
    target.getCell(auditCols.decision).value = decision;
    target.getCell(auditCols.note).value = r.suggestion_note ?? "";

    const fill =
      r.suggestion_confidence === "high"
        ? FILL_HIGH
        : r.suggestion_confidence === "medium"
          ? FILL_MEDIUM
          : r.suggestion_confidence === "low"
            ? FILL_LOW
            : FILL_NONE;
    target.getCell(auditCols.confidence).fill = fill;
    target.getCell(intrastatCol).fill = fill;
    target.commit();
  }

  const arrayBuffer = await sourceWb.xlsx.writeBuffer();
  const buffer = Buffer.from(arrayBuffer as ArrayBuffer);
  const base = path.basename(upload.original_name, path.extname(upload.original_name));
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return { buffer, filename: `${base}.verified-${ts}.xlsx` };
}
