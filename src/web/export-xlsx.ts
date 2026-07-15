import ExcelJS from "exceljs";
import path from "node:path";
import { getUpload, getUploadRows } from "./upload.js";
import { pickDataSheet } from "../catalog/reader.js";
import { getDb } from "./db.js";
import { checkCode } from "../tarabel/validate.js";

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
  const picked = pickDataSheet(sourceWb);
  if (!picked) throw new Error("Onglet de données introuvable");
  const { sheet, headers, headerRow: headerRowIdx } = picked;
  const headerRow = sheet.getRow(headerRowIdx);

  function findCol(...patterns: RegExp[]): number | null {
    for (const [text, col] of headers) {
      if (patterns.some((p) => p.test(text))) return col;
    }
    return null;
  }

  const hsCol = findCol(/^hs\s*code$/, /^goederen.*code/) ?? 8;
  const intrastatCol = findCol(/^intrastat.?code$/, /^intrastat$/) ?? hsCol;
  const invoerCol = findCol(/^invoer\s*%$/, /^%\s*invoer$/, /^invoer$/);

  // Si le fichier est lui-même un export vérifié (re-contrôle), on réécrit le
  // bloc d'audit existant au lieu d'en ajouter un deuxième à côté.
  const existingAudit = [...headers].find(([t]) => t === "code final")?.[1];
  const auditStart = existingAudit ?? sheet.columnCount + 1;
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

    // Priorité du code final : manuel > catalogue validé douane > Claude >
    // estimation interne. Un code d'historique jamais validé douane est faux
    // trop souvent pour primer sur la vision Claude — il ne sert de repli que
    // si Claude n'a rien produit. Même logique que effectiveCode() (views-upload.ts).
    const hasSuggestion = r.suggested_code != null && r.suggested_code !== "";
    const catalogValidated = hasSuggestion && r.suggestion_validated === 1;
    const claudeDone = r.claude_status === "done" && !!r.claude_code;
    const claudeOk = claudeDone && checkCode(getDb(), r.claude_code!).status !== "invalid";

    let fromCatalog: boolean;
    let finalCode: string | null;
    let finalInvoer: number | null;
    let finalSource: string;
    if (r.user_code != null) {
      fromCatalog = true;
      finalCode = r.user_code;
      finalInvoer = r.suggested_invoer_pct;
      finalSource = "manual";
    } else if (catalogValidated) {
      fromCatalog = true;
      finalCode = r.suggested_code;
      finalInvoer = r.suggested_invoer_pct;
      finalSource = r.suggestion_source ?? "";
    } else if (claudeOk) {
      fromCatalog = false;
      finalCode = r.claude_code;
      finalInvoer = r.claude_invoer_pct;
      finalSource = "claude_vision";
    } else if (hasSuggestion) {
      fromCatalog = true;
      finalCode = r.suggested_code;
      finalInvoer = r.suggested_invoer_pct;
      finalSource = r.suggestion_source ?? "";
    } else if (claudeDone) {
      // Code Claude invalide et aucun repli : il sera flaggé CODE INEXISTANT plus bas
      fromCatalog = false;
      finalCode = r.claude_code;
      finalInvoer = r.claude_invoer_pct;
      finalSource = "claude_vision";
    } else {
      fromCatalog = false;
      finalCode = null;
      finalInvoer = null;
      finalSource = r.claude_status ?? "";
    }
    let finalConfidence = fromCatalog
      ? r.suggestion_confidence ?? ""
      : claudeDone
        ? r.claude_confidence ?? ""
        : "";
    let finalNote = fromCatalog
      ? r.suggestion_note ?? ""
      : claudeDone
        ? r.claude_justification ?? ""
        : r.claude_error ?? r.suggestion_note ?? "";
    if (!fromCatalog && claudeOk && hasSuggestion && r.user_code == null) {
      const prefix =
        r.claude_code === r.suggested_code
          ? `Estimation interne ${r.suggested_code} confirmée par Claude. `
          : `Estimation interne ${r.suggested_code} (jamais validée douane) remplacée par Claude. `;
      finalNote = prefix + finalNote;
    }
    let decision = r.user_decision ?? (finalCode ? (fromCatalog ? "auto-catalogue" : "auto-claude") : "à compléter");

    // Garde-fou final : un code absent de la nomenclature officielle TARBEL
    // n'est JAMAIS écrit dans la colonne Intrastat du fichier exporté.
    let codeCheck = finalCode ? checkCode(getDb(), finalCode) : null;

    // Suggestion catalogue périmée (nomenclature qui a évolué) : si Claude a
    // proposé un code encore valide, on bascule dessus plutôt que de bloquer.
    if (
      codeCheck?.status === "invalid" &&
      r.user_code == null &&
      r.claude_status === "done" &&
      r.claude_code &&
      r.claude_code !== finalCode
    ) {
      const claudeCheck = checkCode(getDb(), r.claude_code);
      if (claudeCheck.status !== "invalid") {
        finalNote = `Code catalogue ${finalCode} plus déclarable → remplacé par Claude. ${r.claude_justification ?? ""}`.trim();
        finalCode = r.claude_code;
        finalInvoer = r.claude_invoer_pct;
        finalSource = "claude_vision";
        finalConfidence = r.claude_confidence ?? "";
        decision = "auto-claude (catalogue périmé)";
        fromCatalog = false;
        codeCheck = claudeCheck;
      }
    }

    const codeInvalid = codeCheck?.status === "invalid";

    if (finalCode && !codeInvalid) {
      target.getCell(intrastatCol).value = finalCode;
      if (finalInvoer != null && invoerCol != null) {
        target.getCell(invoerCol).value = finalInvoer;
        target.getCell(invoerCol).numFmt = "0.00%";
      }
    }
    if (codeInvalid) {
      decision = "CODE INEXISTANT — à corriger";
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

    target.getCell(auditCols.finalCode).value = codeInvalid
      ? `${finalCode} ❌ inexistant`
      : finalCode;
    target.getCell(auditCols.source).value = finalSource;
    target.getCell(auditCols.confidence).value = finalConfidence;
    target.getCell(auditCols.decision).value = decision;
    target.getCell(auditCols.materialOk).value =
      r.claude_material_confirmed == null ? "" : r.claude_material_confirmed ? "OK" : "DIVERGENT";
    target.getCell(auditCols.materialNote).value = r.claude_material_note ?? "";
    target.getCell(auditCols.note).value =
      codeInvalid && codeCheck?.status === "invalid"
        ? `⚠ ${codeCheck.reason}. ${finalNote}`.trim()
        : finalNote;

    const fill = codeInvalid
      ? FILL_LOW
      : finalConfidence === "high"
        ? FILL_HIGH
        : finalConfidence === "medium"
          ? FILL_MEDIUM
          : finalConfidence === "low"
            ? FILL_LOW
            : FILL_NONE;
    target.getCell(auditCols.confidence).fill = fill;
    target.getCell(intrastatCol).fill = fill;
    if (codeInvalid) {
      target.getCell(auditCols.finalCode).fill = FILL_LOW;
      target.getCell(auditCols.decision).fill = FILL_LOW;
    }
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
