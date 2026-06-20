import ExcelJS from "exceljs";

const path = process.argv[2];
if (!path) {
  console.error("Usage: tsx scripts/inspect-excel.ts <path-to-xlsx>");
  process.exit(1);
}

function cellToText(v: any): string {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean")
    return String(v);
  if (typeof v === "object") {
    if ("richText" in v && Array.isArray(v.richText))
      return v.richText.map((rt: any) => rt.text).join("");
    if ("text" in v) return String(v.text);
    if ("result" in v) return String(v.result);
    if ("hyperlink" in v) return String(v.hyperlink);
  }
  return JSON.stringify(v);
}

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(path);

console.log("=== WORKBOOK ===");
console.log("Sheets:", wb.worksheets.map((s) => s.name));
console.log("Media in workbook:", wb.model.media.length);

for (const ws of wb.worksheets) {
  console.log(`\n\n========== SHEET: "${ws.name}" ==========`);
  console.log(`Rows: ${ws.rowCount}, Cols: ${ws.columnCount}`);

  const maxRows = Math.min(ws.rowCount, 12);
  console.log(`\n--- First ${maxRows} rows ---`);
  for (let r = 1; r <= maxRows; r++) {
    const row = ws.getRow(r);
    const cells: string[] = [];
    for (let c = 1; c <= Math.min(ws.columnCount, 21); c++) {
      const txt = cellToText(row.getCell(c).value).slice(0, 35).replace(/\s+/g, " ").trim();
      cells.push(`[${c}]${txt}`);
    }
    console.log(`R${r}: ${cells.join(" | ")}`);
  }

  try {
    const images = ws.getImages();
    console.log(`\n--- Images on this sheet: ${images.length} ---`);
    for (const img of images.slice(0, 3)) {
      const media: any = wb.model.media[img.imageId as any];
      const r = img.range as any;
      const tl = r?.tl ? `tl(col=${r.tl.nativeCol},row=${r.tl.nativeRow})` : "?";
      const br = r?.br ? `br(col=${r.br.nativeCol},row=${r.br.nativeRow})` : "?";
      console.log(`  id=${img.imageId} ${tl} ${br} ext=${media?.extension} buf=${media?.buffer?.length}`);
    }
  } catch (e: any) {
    console.log("(no images method on sheet)");
  }
}
