import ExcelJS from "exceljs";

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile("C:/Users/jimmy.hendrickx/Downloads/ex.xlsx");
const ws = wb.getWorksheet("creatie")!;
for (let r = 3; r <= 8; r++) {
  const cell = ws.getRow(r).getCell(8);
  const fill = (cell.fill as any)?.fgColor?.argb ?? "none";
  const fontColor = (cell.font as any)?.color?.argb ?? "none";
  console.log(`R${r} col 8 (HS code): value=${cell.value} fill=${fill} fontColor=${fontColor}`);
}
