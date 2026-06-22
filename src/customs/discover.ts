import fs from "node:fs/promises";
import path from "node:path";
import { extractPdfText } from "./extract.js";
import { detectFormat } from "./parse.js";

const SKIP_PATTERNS = [
  /inland.*charge/i, /catalogus/i, /pavan.*invoice/i,
  /bestelling/i, /^hbl/i, /^dn-/i,
  /^invoice\s+\d+/i,
];

export interface CustomsPdfCandidate {
  pdfPath: string;
  format: "IDMS" | "PLDA_SAD" | "ATT_FIELDS";
}

export async function findCustomsPdf(folder: string): Promise<CustomsPdfCandidate | null> {
  const files = await fs.readdir(folder);
  const pdfs = files
    .filter((f) => f.toLowerCase().endsWith(".pdf"))
    .filter((f) => !SKIP_PATTERNS.some((p) => p.test(f)));

  for (const f of pdfs) {
    const full = path.join(folder, f);
    try {
      const { full: text } = await extractPdfText(full);
      const fmt = detectFormat(text);
      if (fmt === "IDMS" || fmt === "PLDA_SAD" || fmt === "ATT_FIELDS") {
        return { pdfPath: full, format: fmt };
      }
    } catch {
      // try next
    }
  }
  return null;
}
