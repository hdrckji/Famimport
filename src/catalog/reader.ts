import ExcelJS from "exceljs";

export interface CatalogRow {
  rowIndex: number;
  ean?: string;
  leverancier?: string;
  bestelnummer?: string;
  chineseDescription?: string;
  englishDescription?: string;
  nlDescription?: string;
  frDescription?: string;
  omschrijving?: string;
  hsChina?: string;
  tarabelValidated?: string;
  invoerPct?: number;
  antidumpingPct?: number;
  material?: string;
  priceUSD?: number;
  quantity?: number;
  imageBuffer?: Buffer;
  imageExt?: string;
}

export interface ReadResult {
  workbook: ExcelJS.Workbook;
  sheetName: string;
  schemaVariant: string;
  headerRow: number;
  rows: CatalogRow[];
}

function cellToText(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "object") {
    const obj = v as unknown as Record<string, unknown>;
    if ("richText" in obj && Array.isArray(obj.richText))
      return (obj.richText as Array<{ text: string }>)
        .map((rt) => rt.text)
        .join("")
        .trim();
    if ("text" in obj) return String(obj.text).trim();
    if ("result" in obj) return String(obj.result).trim();
  }
  return "";
}

function cellToNumber(v: ExcelJS.CellValue): number | undefined {
  if (v == null || v === "") return undefined;
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) ? n : undefined;
  }
  if (typeof v === "object") {
    const obj = v as unknown as Record<string, unknown>;
    if ("result" in obj && typeof obj.result === "number") return obj.result;
  }
  return undefined;
}

function normalizeCode(s: string): string {
  return s.replace(/\D/g, "");
}

const HEADER_PATTERNS: Record<keyof Omit<CatalogRow, "rowIndex" | "imageBuffer" | "imageExt">, RegExp[]> = {
  ean: [/^eanbarcode$/, /^ean.?barcode$/, /^ean$/, /^bar\s*code$/],
  leverancier: [/^leverancier$/],
  bestelnummer: [/^bestel.?nummer$/, /^bestelummer$/],
  chineseDescription: [/^chinese.*description$/],
  englishDescription: [/^english.*description$/],
  nlDescription: [/meertalige.*omschrijving.*nl/, /^omschrijving.*nl$/],
  frDescription: [/meertalige.*omschrijving.*fr/, /^omschrijving.*fr$/],
  omschrijving: [/^omschrijving$/],
  hsChina: [/^hs\s*code$/, /^goederen.*code$/],
  tarabelValidated: [/^intrastat.?code$/, /^intrastat$/],
  invoerPct: [/^invoer\s*%$/, /^%\s*invoer$/, /^%.*invoerrechten$/, /^invoer$/],
  antidumpingPct: [/antidump/],
  material: [/^material$/, /^材料$/],
  priceUSD: [/^price$/, /^unit\s*price$/, /^prijs$/],
  quantity: [/^aantal$/, /^qty$/],
};

function buildHeaderMap(headers: Map<string, number>): Map<keyof typeof HEADER_PATTERNS, number> {
  const map = new Map<keyof typeof HEADER_PATTERNS, number>();
  for (const [field, patterns] of Object.entries(HEADER_PATTERNS) as Array<
    [keyof typeof HEADER_PATTERNS, RegExp[]]
  >) {
    for (const [headerText, colIdx] of headers) {
      if (patterns.some((p) => p.test(headerText))) {
        map.set(field, colIdx);
        break;
      }
    }
  }
  return map;
}

const HEADER_SCAN_ROWS = 20;

function pickDataSheet(workbook: ExcelJS.Workbook): {
  sheet: ExcelJS.Worksheet;
  headers: Map<string, number>;
  variant: string;
  headerRow: number;
} | null {
  const candidates = ["bewerkt", "BEWERKT", "creatie", "Creatie"];
  const considered: ExcelJS.Worksheet[] = [];
  for (const name of candidates) {
    const ws = workbook.getWorksheet(name);
    if (ws) considered.push(ws);
  }
  for (const ws of workbook.worksheets) {
    if (!considered.includes(ws)) considered.push(ws);
  }

  for (const ws of considered) {
    const maxScan = Math.min(HEADER_SCAN_ROWS, ws.rowCount);
    for (let r = 1; r <= maxScan; r++) {
      const headers = new Map<string, number>();
      const row = ws.getRow(r);
      for (let c = 1; c <= ws.columnCount; c++) {
        const h = cellToText(row.getCell(c).value).toLowerCase().trim();
        if (h && !headers.has(h)) headers.set(h, c);
      }
      const hasHS = [...headers.keys()].some((k) =>
        /^hs\s*code$|^intrastat|^goederen.*code/.test(k),
      );
      const hasDesc = [...headers.keys()].some((k) =>
        /chinese|english/.test(k),
      );
      if (hasHS && hasDesc) {
        const variant = ws.name.toLowerCase();
        return { sheet: ws, headers, variant, headerRow: r };
      }
    }
  }
  return null;
}

function extractImages(
  workbook: ExcelJS.Workbook,
  sheet: ExcelJS.Worksheet,
): Map<number, { buffer: Buffer; extension: string }> {
  const byRow = new Map<number, { buffer: Buffer; extension: string }>();
  for (const img of sheet.getImages()) {
    const media = workbook.model.media[img.imageId as unknown as number];
    if (!media || !media.buffer) continue;
    const range = img.range as ExcelJS.ImageRange;
    const tlRow = range.tl ? Math.round(range.tl.nativeRow) : null;
    if (tlRow == null) continue;
    const oneIndexed = tlRow + 1;
    if (!byRow.has(oneIndexed)) {
      byRow.set(oneIndexed, {
        buffer: Buffer.from(media.buffer),
        extension: media.extension ?? "jpeg",
      });
    }
  }
  return byRow;
}

export async function readPackingList(path: string): Promise<ReadResult | null> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const picked = pickDataSheet(wb);
  if (!picked) return null;
  const { sheet, headers, variant, headerRow } = picked;
  const colMap = buildHeaderMap(headers);
  const images = extractImages(wb, sheet);

  const rows: CatalogRow[] = [];
  for (let r = headerRow + 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const get = (field: keyof typeof HEADER_PATTERNS) => {
      const c = colMap.get(field);
      return c ? row.getCell(c).value : null;
    };

    const chineseDescription = cellToText(get("chineseDescription"));
    const englishDescription = cellToText(get("englishDescription"));
    const hsRaw = cellToText(get("hsChina"));
    const intraRaw = cellToText(get("tarabelValidated"));

    if (!chineseDescription && !englishDescription && !hsRaw && !intraRaw)
      continue;

    const img = images.get(r);
    rows.push({
      rowIndex: r,
      ean: cellToText(get("ean")) || undefined,
      leverancier: cellToText(get("leverancier")) || undefined,
      bestelnummer: cellToText(get("bestelnummer")) || undefined,
      chineseDescription: chineseDescription || undefined,
      englishDescription: englishDescription || undefined,
      nlDescription: cellToText(get("nlDescription")) || undefined,
      frDescription: cellToText(get("frDescription")) || undefined,
      omschrijving: cellToText(get("omschrijving")) || undefined,
      hsChina: hsRaw ? normalizeCode(hsRaw) : undefined,
      tarabelValidated: intraRaw ? normalizeCode(intraRaw) : undefined,
      invoerPct: cellToNumber(get("invoerPct")),
      antidumpingPct: cellToNumber(get("antidumpingPct")),
      material: cellToText(get("material")) || undefined,
      priceUSD: cellToNumber(get("priceUSD")),
      quantity: cellToNumber(get("quantity")),
      imageBuffer: img?.buffer,
      imageExt: img?.extension,
    });
  }

  return { workbook: wb, sheetName: sheet.name, schemaVariant: variant, headerRow, rows };
}
