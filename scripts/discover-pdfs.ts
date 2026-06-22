import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import fs from "node:fs/promises";
import path from "node:path";

const root = process.argv[2];

const SKIP_PATTERNS = [
  /inland.*charge/i, /catalogus/i, /pavan.*invoice/i,
  /bestelling/i, /^hbl/i, /^dn-/i,
  // Pure invoices (not customs)
  /^invoice\s+\d+/i,
];

function classifyText(text: string): string {
  const t = text.slice(0, 3000);
  if (/IDMS Declaration|Notification for release/i.test(t)) return "IDMS";
  if (/\[18 09 057\]|\[18 09 056\]|Code onderverdeling GS/i.test(t)) return "ATT_FIELDS";
  if (/AANGIFTE|Aangifte|Goederencode|Brutomassa/i.test(t) && t.length > 500) return "PLDA_SAD";
  if (t.replace(/\s/g, "").length < 50) return "SCANNED_OR_EMPTY";
  return "UNKNOWN";
}

async function extractFirstPageText(pdfPath: string): Promise<string> {
  try {
    const data = await fs.readFile(pdfPath);
    const doc = await pdfjs.getDocument({
      data: new Uint8Array(data),
      isEvalSupported: false,
      useSystemFonts: true,
    }).promise;
    const pagesToScan = Math.min(2, doc.numPages);
    let all = "";
    for (let p = 1; p <= pagesToScan; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      all += content.items.map((it: any) => it.str).join(" ") + "\n";
    }
    return all.replace(/\s+/g, " ").trim();
  } catch (err) {
    return `(error: ${err instanceof Error ? err.message : String(err)})`;
  }
}

const folders = (await fs.readdir(root, { withFileTypes: true }))
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();

const results: Array<{
  folder: string;
  pdf?: string;
  format: string;
  candidates: string[];
}> = [];

for (const folder of folders) {
  const folderPath = path.join(root, folder);
  const files = await fs.readdir(folderPath);
  const pdfs = files.filter((f) => f.toLowerCase().endsWith(".pdf"));

  const candidates = pdfs.filter((f) => !SKIP_PATTERNS.some((p) => p.test(f)));

  let chosen: { file: string; format: string } | null = null;
  let fallback: { file: string; format: string } | null = null;
  for (const c of candidates) {
    const text = await extractFirstPageText(path.join(folderPath, c));
    const fmt = classifyText(text);
    if (fmt === "IDMS" || fmt === "ATT_FIELDS" || fmt === "PLDA_SAD") {
      chosen = { file: c, format: fmt };
      break;
    }
    if (!fallback) fallback = { file: c, format: fmt };
  }
  if (!chosen && fallback) chosen = fallback;

  results.push({
    folder,
    pdf: chosen?.file,
    format: chosen?.format ?? "NO_CUSTOMS_PDF",
    candidates,
  });
  process.stdout.write(`\r${folder.padEnd(20)} → ${chosen?.format ?? "none"}    `);
}
process.stdout.write("\n");

console.log("\n--- Format distribution ---");
const byFormat = new Map<string, number>();
for (const r of results) byFormat.set(r.format, (byFormat.get(r.format) ?? 0) + 1);
console.table([...byFormat.entries()].map(([format, count]) => ({ format, count })));

console.log("\n--- Per import ---");
console.table(results.map((r) => ({
  folder: r.folder,
  format: r.format,
  pdf: r.pdf ?? "(none)",
})));
