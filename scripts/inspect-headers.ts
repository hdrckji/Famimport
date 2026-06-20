import ExcelJS from "exceljs";

function cellToText(v: any): string {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean")
    return String(v);
  if (typeof v === "object") {
    if ("richText" in v && Array.isArray(v.richText))
      return v.richText.map((rt: any) => rt.text).join("");
    if ("text" in v) return String(v.text);
    if ("result" in v) return String(v.result);
  }
  return JSON.stringify(v);
}

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(process.argv[2]);

for (const name of ["BEWERKT", "creatie"]) {
  const ws = wb.getWorksheet(name);
  if (!ws) continue;
  console.log(`\n=== ${name} — all column headers ===`);
  const r1 = ws.getRow(1);
  const r2 = ws.getRow(2);
  const r3 = ws.getRow(3);
  for (let c = 1; c <= ws.columnCount; c++) {
    const h = cellToText(r1.getCell(c).value).slice(0, 40);
    const note = cellToText(r2.getCell(c).value).slice(0, 30);
    const sample = cellToText(r3.getCell(c).value).slice(0, 30);
    if (h || note || sample)
      console.log(`  col ${c}: "${h}" | note: "${note}" | sample: "${sample}"`);
  }
}
