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

// Find the bewerkt-like sheet
const ws =
  wb.getWorksheet("bewerkt") ??
  wb.getWorksheet("BEWERKT") ??
  wb.getWorksheet("creatie");
if (!ws) {
  console.log("No bewerkt/creatie sheet found");
  process.exit(1);
}

// Build header map
const headerRow = ws.getRow(1);
const headerMap = new Map<string, number>();
for (let c = 1; c <= ws.columnCount; c++) {
  const h = cellToText(headerRow.getCell(c).value).toLowerCase().trim();
  if (h) headerMap.set(h, c);
}

const getCol = (...names: string[]): number | undefined => {
  for (const n of names) {
    const c = headerMap.get(n.toLowerCase());
    if (c) return c;
  }
  return undefined;
};

const cHS = getCol("hs code");
const cIntrastat = getCol("intrastatcode", "intrastat");
const cInvoer = getCol("invoer %", "%invoer");
const cAntidump = getCol("antidumping %");
const cMaterial = getCol("material");
const cEAN = getCol("eanbarcode");
const cChinese = getCol("chinese description");
const cEnglish = getCol("english description");

console.log(`Sheet: ${ws.name}, rows: ${ws.rowCount}`);
console.log(`Columns: HS=${cHS} intrastat=${cIntrastat} invoer=${cInvoer} antidump=${cAntidump} material=${cMaterial} EAN=${cEAN} CH=${cChinese} EN=${cEnglish}`);

let totalRows = 0;
let withHS = 0;
let withIntrastat = 0;
let withInvoer = 0;
let withAntidump = 0;
let withEAN = 0;
let hsMatchesIntrastat = 0;
let hsDiffersFromIntrastat = 0;
const uniqueIntrastat = new Set<string>();
const uniqueHS = new Set<string>();

for (let r = 2; r <= ws.rowCount; r++) {
  const row = ws.getRow(r);
  const hs = cellToText(row.getCell(cHS!).value).trim();
  const intra = cellToText(row.getCell(cIntrastat!).value).trim();
  const invoer = cellToText(row.getCell(cInvoer!).value).trim();
  const antidump = cAntidump ? cellToText(row.getCell(cAntidump).value).trim() : "";
  const ean = cEAN ? cellToText(row.getCell(cEAN).value).trim() : "";
  const en = cEnglish ? cellToText(row.getCell(cEnglish).value).trim() : "";
  if (!en && !hs && !intra) continue;
  totalRows++;
  if (hs) { withHS++; uniqueHS.add(hs); }
  if (intra) { withIntrastat++; uniqueIntrastat.add(intra); }
  if (invoer) withInvoer++;
  if (antidump) withAntidump++;
  if (ean) withEAN++;
  if (hs && intra) {
    if (hs === intra) hsMatchesIntrastat++;
    else hsDiffersFromIntrastat++;
  }
}

console.log(`\nTotal rows: ${totalRows}`);
console.log(`  With HS chinois: ${withHS} (${((withHS/totalRows)*100).toFixed(0)}%)`);
console.log(`  With intrastatcode: ${withIntrastat} (${((withIntrastat/totalRows)*100).toFixed(0)}%)`);
console.log(`  With invoer%: ${withInvoer}`);
console.log(`  With antidumping%: ${withAntidump}`);
console.log(`  With EAN: ${withEAN}`);
console.log(`\nHS vs intrastat (where both are present):`);
console.log(`  HS == intrastat: ${hsMatchesIntrastat}`);
console.log(`  HS != intrastat: ${hsDiffersFromIntrastat}`);
console.log(`\nUnique HS codes (Chine): ${uniqueHS.size}`);
console.log(`Unique intrastat codes (déclarés): ${uniqueIntrastat.size}`);
console.log(`\nIntrastat codes utilisés:`);
for (const c of [...uniqueIntrastat].sort()) console.log(`  ${c}`);
