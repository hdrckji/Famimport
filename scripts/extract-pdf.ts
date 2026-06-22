import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import fs from "node:fs/promises";

const path = process.argv[2];
const maxPages = Number(process.argv[3] ?? "0");

const data = await fs.readFile(path);
const doc = await pdfjs.getDocument({
  data: new Uint8Array(data),
  isEvalSupported: false,
  useSystemFonts: true,
}).promise;

console.log(`PDF: ${path}`);
console.log(`Pages: ${doc.numPages}`);

const pagesToRead = maxPages > 0 ? Math.min(maxPages, doc.numPages) : doc.numPages;
for (let p = 1; p <= pagesToRead; p++) {
  const page = await doc.getPage(p);
  const content = await page.getTextContent();
  const text = content.items
    .map((it: any) => it.str)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  console.log(`\n=== PAGE ${p} ===`);
  console.log(text.slice(0, 4000));
  if (text.length > 4000) console.log(`... [truncated, full length ${text.length}]`);
}
