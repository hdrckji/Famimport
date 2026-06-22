import { extractPdfText } from "./extract.js";
import { parseIdms } from "./parsers/idms.js";
import { parsePldaSad } from "./parsers/plda.js";
import { parseAttFields } from "./parsers/att-fields.js";
import type { CustomsDeclaration, CustomsFormat } from "./types.js";

export function detectFormat(text: string): CustomsFormat {
  const t = text.slice(0, 5000);
  if (/\[18 09 057\]|\[18 09 056\]|Code onderverdeling GS/i.test(t)) return "ATT_FIELDS";
  if (/IDMS Declaration|Notification for release|Commodity code\s*:\s*\d/i.test(t)) return "IDMS";
  if (/AANGIFTE|Goederencode|Brutomassa|PK[-\s]Verpakking/i.test(t)) return "PLDA_SAD";
  return "UNKNOWN";
}

export async function parseCustomsPdf(
  pdfPath: string,
): Promise<CustomsDeclaration | null> {
  const { pages, full } = await extractPdfText(pdfPath);
  if (full.replace(/\s/g, "").length < 100) return null;
  const fmt = detectFormat(full);
  if (fmt === "ATT_FIELDS") return parseAttFields(full);
  if (fmt === "IDMS") return parseIdms(full);
  if (fmt === "PLDA_SAD") return parsePldaSad(pages);
  return null;
}
