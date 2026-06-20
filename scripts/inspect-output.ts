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
const ws = wb.getWorksheet("creatie");
if (!ws) throw new Error("creatie sheet missing");

const cols = [
  [3, "CH"],
  [4, "EN"],
  [8, "HS China"],
  [9, "Tarabel"],
  [10, "%invoer"],
  [28, "Material"],
  [51, "Conf"],
  [52, "Justif"],
  [53, "Review"],
  [54, "MatOK"],
  [55, "MatNote"],
  [56, "Diverge"],
] as const;

for (let r = 3; r <= 5; r++) {
  console.log(`\n--- Row ${r} ---`);
  const row = ws.getRow(r);
  for (const [c, label] of cols) {
    const v = cellToText(row.getCell(c).value).slice(0, 120);
    console.log(`  ${label.padEnd(8)}: ${v}`);
  }
}
