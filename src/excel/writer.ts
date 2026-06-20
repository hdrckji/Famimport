import ExcelJS from "exceljs";
import {
  AUDIT_COLS,
  AUDIT_HEADERS,
  COL,
  HEADER_ROW,
  SHEET_NAME,
} from "./columns.js";
import type { EnrichedRow } from "../types.js";

const FILL_LOW: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFFFC7CE" },
};
const FILL_MEDIUM: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFFFF2CC" },
};
const FILL_HIGH: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFD5E8D4" },
};
const FILL_ERROR: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFD9D9D9" },
};

export async function writeResults(
  workbook: ExcelJS.Workbook,
  enriched: EnrichedRow[],
  outputPath: string,
): Promise<void> {
  const ws = workbook.getWorksheet(SHEET_NAME);
  if (!ws) throw new Error(`Sheet "${SHEET_NAME}" introuvable`);

  const headerRow = ws.getRow(HEADER_ROW);
  for (const [colIdx, label] of AUDIT_HEADERS) {
    const cell = headerRow.getCell(colIdx);
    cell.value = label;
    cell.font = { bold: true };
  }
  headerRow.commit();

  for (const row of enriched) {
    const target = ws.getRow(row.rowIndex);

    if ("error" in row.classification) {
      target.getCell(AUDIT_COLS.justification).value = `ERREUR: ${row.classification.error}`;
      target.getCell(AUDIT_COLS.needsReview).value = "OUI";
      for (let c = COL.intrastat; c <= COL.invoerPct; c++) {
        target.getCell(c).fill = FILL_ERROR;
      }
      target.commit();
      continue;
    }

    const cls = row.classification;
    target.getCell(COL.intrastat).value = cls.tarabelCode;
    if (cls.invoerRate != null) {
      target.getCell(COL.invoerPct).value = cls.invoerRate / 100;
      target.getCell(COL.invoerPct).numFmt = "0.00%";
    }

    target.getCell(AUDIT_COLS.confidence).value = cls.confidence;
    target.getCell(AUDIT_COLS.justification).value = cls.justification;
    target.getCell(AUDIT_COLS.needsReview).value = cls.needsManualReview
      ? "OUI"
      : "non";
    target.getCell(AUDIT_COLS.materialConfirmed).value = cls.materialConfirmed
      ? "OK"
      : "douteux";
    target.getCell(AUDIT_COLS.materialNote).value = cls.materialNote;
    target.getCell(AUDIT_COLS.divergesFromChina).value = cls.divergesFromChina
      ? "OUI"
      : "non";

    const fill =
      cls.confidence === "high"
        ? FILL_HIGH
        : cls.confidence === "medium"
          ? FILL_MEDIUM
          : FILL_LOW;
    target.getCell(COL.intrastat).fill = fill;
    target.getCell(AUDIT_COLS.confidence).fill = fill;
    if (cls.needsManualReview) {
      target.getCell(AUDIT_COLS.needsReview).fill = FILL_LOW;
    }

    target.commit();
  }

  await workbook.xlsx.writeFile(outputPath);
}
