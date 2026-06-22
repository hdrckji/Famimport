import ExcelJS from "exceljs";
import fs from "node:fs";
import path from "node:path";

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

interface SheetReport {
  sheet: string;
  rows: number;
  cols: number;
  headers: Map<string, number>;
  images: number;
}

interface FileReport {
  file: string;
  sheets: SheetReport[];
}

function inspectFile(filePath: string): Promise<FileReport> {
  return (async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(filePath);
    const sheets: SheetReport[] = [];
    for (const ws of wb.worksheets) {
      const headers = new Map<string, number>();
      const headerRow = ws.getRow(1);
      for (let c = 1; c <= ws.columnCount; c++) {
        const h = cellToText(headerRow.getCell(c).value).toLowerCase().trim();
        if (h) headers.set(h, c);
      }
      const images = ws.getImages().length;
      sheets.push({
        sheet: ws.name,
        rows: ws.rowCount,
        cols: ws.columnCount,
        headers,
        images,
      });
    }
    return { file: path.basename(filePath), sheets };
  })();
}

const auditDir = process.argv[2];
const files = fs
  .readdirSync(auditDir)
  .filter((f) => f.endsWith(".xlsx"))
  .map((f) => path.join(auditDir, f));

const reports: FileReport[] = [];
for (const f of files) {
  reports.push(await inspectFile(f));
}

// Find the "main" data sheet in each file: prefer one with both HS code and product descriptions
function pickDataSheet(file: FileReport): SheetReport | undefined {
  for (const s of file.sheets) {
    const hasHS = [...s.headers.keys()].some((k) =>
      /hs.*code|goederen|nomenclatuur|intrastat/.test(k),
    );
    const hasDesc = [...s.headers.keys()].some((k) =>
      /chinese|english|description|omschrijving/.test(k),
    );
    if (hasHS && hasDesc) return s;
  }
  return undefined;
}

console.log("\n========== AUDIT REPORT ==========\n");

for (const r of reports) {
  console.log(`\n┌─ ${r.file}`);
  console.log(`│  Sheets: ${r.sheets.map((s) => `"${s.sheet}" (${s.rows}r×${s.cols}c, ${s.images} imgs)`).join(", ")}`);

  const data = pickDataSheet(r);
  if (!data) {
    console.log(`│  ❌ No data sheet identified`);
    continue;
  }
  console.log(`│  ✓ Data sheet: "${data.sheet}"`);

  const headerList = [...data.headers.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([h, c]) => `[${c}]${h}`)
    .join(" | ");
  console.log(`│  Headers: ${headerList}`);

  const findHeader = (...patterns: RegExp[]): { name: string; col: number } | null => {
    for (const [h, c] of data.headers) {
      for (const p of patterns) {
        if (p.test(h)) return { name: h, col: c };
      }
    }
    return null;
  };

  const fields = {
    hsChina: findHeader(/^hs\s*code$/, /goederen.*code/),
    intrastat: findHeader(/intrastat.?code/, /^intrastat$/),
    invoer: findHeader(/invoer.*%|%.*invoer|invoer\s*rechten/),
    antidump: findHeader(/antidump/),
    material: findHeader(/material/),
    ean: findHeader(/eanbarcode|ean.*barcode|^ean$/),
    chinese: findHeader(/chinese.*description/),
    english: findHeader(/english.*description/),
    photos: findHeader(/^photos?$/, /^foto/),
    qty: findHeader(/^aantal$|^qty$/),
    price: findHeader(/^price$|^prijs$/),
  };

  for (const [k, v] of Object.entries(fields)) {
    console.log(`│  ${k.padEnd(10)}: ${v ? `col ${v.col} ("${v.name}")` : "❌ NOT FOUND"}`);
  }

  // Now compute fill rates on the data sheet
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(files[reports.indexOf(r)]);
  const ws = wb.getWorksheet(data.sheet)!;
  let total = 0, hs = 0, intra = 0, ean = 0, hsEqIntra = 0, hsNeIntra = 0;
  const uniqueIntra = new Set<string>();
  for (let row = 2; row <= ws.rowCount; row++) {
    const get = (col?: number) =>
      col ? cellToText(ws.getRow(row).getCell(col).value).trim() : "";
    const chV = get(fields.chinese?.col);
    const enV = get(fields.english?.col);
    const hsV = get(fields.hsChina?.col);
    const inV = get(fields.intrastat?.col);
    const eanV = get(fields.ean?.col);
    if (!chV && !enV && !hsV && !inV) continue;
    total++;
    if (hsV) hs++;
    if (inV) { intra++; uniqueIntra.add(inV); }
    if (eanV) ean++;
    if (hsV && inV) {
      if (hsV === inV) hsEqIntra++;
      else hsNeIntra++;
    }
  }
  const pct = (n: number) => total === 0 ? "n/a" : `${((n / total) * 100).toFixed(0)}%`;
  console.log(`│  Rows: ${total}  HS:${hs}(${pct(hs)})  Intrastat:${intra}(${pct(intra)})  EAN:${ean}(${pct(ean)})`);
  if (hs > 0 && intra > 0) {
    console.log(`│  HS=Intrastat: ${hsEqIntra}  HS≠Intrastat: ${hsNeIntra}  (divergence ${((hsNeIntra/(hsEqIntra+hsNeIntra))*100).toFixed(0)}%)`);
  }
  console.log(`│  Unique intrastat codes: ${uniqueIntra.size}: ${[...uniqueIntra].sort().join(", ")}`);
  console.log(`└────`);
}
