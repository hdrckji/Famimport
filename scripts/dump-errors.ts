import ExcelJS from "exceljs";

function cellToText(v: any): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((r: any) => r.text).join("");
    if ("text" in v) return String(v.text);
  }
  return JSON.stringify(v);
}

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(process.argv[2]);
const ws = wb.getWorksheet("creatie")!;
for (let r = 3; r <= 8; r++) {
  const row = ws.getRow(r);
  const hsCh = row.getCell(8);
  const tarabel = row.getCell(9);
  const invoer = row.getCell(10);
  const invoerSugg = row.getCell(57);
  const diverge = cellToText(row.getCell(56).value);
  const hsCellFillColor = (hsCh.fill as any)?.fgColor?.argb ?? "none";
  const hsCellFontColor = (hsCh.font as any)?.color?.argb ?? "none";
  console.log(`R${r}: HS_CN=${cellToText(hsCh.value)}  Tarabel=${cellToText(tarabel.value)}  %CN=${cellToText(invoer.value)}  %Sugg=${cellToText(invoerSugg.value)}  Diverge=${diverge}  HS_fill=${hsCellFillColor}  HS_fontColor=${hsCellFontColor}`);
}
