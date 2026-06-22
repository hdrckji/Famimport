import { loadWorkbook } from "../src/excel/reader.js";
import { writeResults } from "../src/excel/writer.js";
import type { EnrichedRow } from "../src/types.js";
import ExcelJS from "exceljs";

const inputPath = "C:/Users/jimmy.hendrickx/Downloads/ex.xlsx";
const outputPath =
  "C:/Users/jimmy.hendrickx/Famimport/output/test-writer-fill.xlsx";

const { workbook, rows } = await loadWorkbook(inputPath);

// Alternate divergesFromChina: true, false, true, false, ...
const enriched: EnrichedRow[] = rows.slice(0, 10).map((r, i) => ({
  ...r,
  classification: {
    tarabelCode: r.hsCodeChina || "0000000000",
    invoerRateForChinaCode: 5.5,
    invoerRateForSuggestedCode: 5.5,
    confidence: "high" as const,
    justification: `Test row ${i}, diverges=${i % 2 === 0}`,
    materialConfirmed: true,
    materialNote: "",
    divergesFromChina: i % 2 === 0,
    needsManualReview: false,
  },
}));

await writeResults(workbook, enriched, outputPath);

// Read back and verify
const wb2 = new ExcelJS.Workbook();
await wb2.xlsx.readFile(outputPath);
const ws = wb2.getWorksheet("creatie")!;
console.log("\n=== Verification col 8 (HS code) styling ===");
for (let i = 0; i < 10; i++) {
  const r = enriched[i].rowIndex;
  const cell = ws.getRow(r).getCell(8);
  const fill = (cell.fill as any)?.fgColor?.argb ?? "none";
  const fontColor = (cell.font as any)?.color?.argb ?? "none";
  const expected = i % 2 === 0 ? "RED" : "none";
  const actual = fill === "FFFFC7CE" ? "RED" : fill;
  const ok = expected === actual ? "OK" : "FAIL";
  console.log(`R${r} expected=${expected} actual=${actual} font=${fontColor} → ${ok}`);
}
