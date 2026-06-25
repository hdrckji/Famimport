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
    materialOk: auditStart + 4,
    materialNote: auditStart + 5,
    note: auditStart + 6,
  };
  const auditHeaders: Array<[number, string]> = [
    [auditCols.finalCode, "Code final"],
    [auditCols.source, "Source"],
    [auditCols.confidence, "Confiance"],
    [auditCols.decision, "Décision"],
    [auditCols.materialOk, "Matériau vérifié"],
    [auditCols.materialNote, "Matériau (note Claude)"],
    [auditCols.note, "Note"],
  ];
  for (const [col, label] of auditHeaders) {
    const cell = headerRow.getCell(col);
    cell.value = label;
    cell.font = { bold: true };
  }

  for (const r of rows) {
    const target = sheet.getRow(r.row_index);

    // Catalog suggestion wins. If absent and Claude has produced something, fall back to Claude.
    const fromCatalog = r.user_code != null || (r.suggested_code != null && r.suggested_code !== "");
    const finalCode =
      r.user_code ??
      r.suggested_code ??
      (r.claude_status === "done" ? r.claude_code : null) ??
      null;
    const finalInvoer =
      r.user_code != null
        ? r.suggested_invoer_pct
        : r.suggested_code != null
          ? r.suggested_invoer_pct
          : r.claude_status === "done"
            ? r.claude_invoer_pct
            : null;
    const finalSource = r.user_code
      ? "manual"
      : r.suggested_code
        ? r.suggestion_source ?? ""
        : r.claude_status === "done"
          ? "claude_vision"
          : r.claude_status ?? "";
    const finalConfidence = fromCatalog
      ? r.suggestion_confidence ?? ""
      : r.claude_status === "done"
        ? r.claude_confidence ?? ""
        : "";
    const finalNote = fromCatalog
      ? r.suggestion_note ?? ""
      : r.claude_status === "done"
        ? r.claude_justification ?? ""
        : r.claude_error ?? r.suggestion_note ?? "";
    const decision = r.user_decision ?? (finalCode ? (fromCatalog ? "auto-catalogue" : "auto-claude") : "à compléter");

    if (finalCode) {
      target.getCell(intrastatCol).value = finalCode;
      if (finalInvoer != null) {
        target.getCell(invoerCol).value = finalInvoer;
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
    target.getCell(auditCols.source).value = finalSource;
    target.getCell(auditCols.confidence).value = finalConfidence;
    target.getCell(auditCols.decision).value = decision;
    target.getCell(auditCols.materialOk).value =
      r.claude_material_confirmed == null ? "" : r.claude_material_confirmed ? "OK" : "DIVERGENT";
    target.getCell(auditCols.materialNote).value = r.claude_material_note ?? "";
    target.getCell(auditCols.note).value = finalNote;

    const fill =
      finalConfidence === "high"
        ? FILL_HIGH
        : finalConfidence === "medium"
          ? FILL_MEDIUM
          : finalConfidence === "low"
            ? FILL_LOW
            : FILL_NONE;
    target.getCell(auditCols.confidence).fill = fill;
    target.getCell(intrastatCol).fill = fill;
    if (r.claude_material_confirmed === 0) {
      target.getCell(auditCols.materialOk).fill = FILL_LOW;
    } else if (r.claude_material_confirmed === 1) {
      target.getCell(auditCols.materialOk).fill = FILL_HIGH;
    }
    target.commit();
  }

  const arrayBuffer = await sourceWb.xlsx.writeBuffer();
  const buffer = Buffer.from(arrayBuffer as ArrayBuffer);
  const base = path.basename(upload.original_name, path.extname(upload.original_name));
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return { buffer, filename: `${base}.verified-${ts}.xlsx` };
}
