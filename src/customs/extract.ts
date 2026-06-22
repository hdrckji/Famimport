import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import fs from "node:fs/promises";

export async function extractPdfText(pdfPath: string): Promise<{
  pages: string[];
  full: string;
}> {
  const data = await fs.readFile(pdfPath);
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(data),
    useSystemFonts: true,
  }).promise;
  const pages: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const text = content.items
      .map((it: any) => it.str)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    pages.push(text);
  }
  return { pages, full: pages.join("\n") };
}
