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
  return "";
}

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(process.argv[2]);
console.log("Sheets:", wb.worksheets.map((s) => `"${s.name}" (${s.rowCount}r × ${s.columnCount}c)`));

for (const ws of wb.worksheets) {
  console.log(`\n=== ${ws.name} ===`);
  for (let r = 1; r <= Math.min(3, ws.rowCount); r++) {
    const row = ws.getRow(r);
    const cells: string[] = [];
    for (let c = 1; c <= Math.min(ws.columnCount, 30); c++) {
      const t = cellToText(row.getCell(c).value).slice(0, 25).replace(/\s+/g, " ").trim();
      if (t) cells.push(`[${c}]${t}`);
    }
    console.log(`R${r}: ${cells.join(" | ")}`);
  }
  if (ws.rowCount >= 4) {
    const row = ws.getRow(4);
    const cells: string[] = [];
    for (let c = 1; c <= Math.min(ws.columnCount, 30); c++) {
      const t = cellToText(row.getCell(c).value).slice(0, 25).replace(/\s+/g, " ").trim();
      if (t) cells.push(`[${c}]${t}`);
    }
    console.log(`R4: ${cells.join(" | ")}`);
  }
  const images = ws.getImages();
  console.log(`Images: ${images.length}`);
}
