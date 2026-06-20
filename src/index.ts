import "dotenv/config";
import path from "node:path";
import fs from "node:fs/promises";
import { loadWorkbook } from "./excel/reader.js";
import { writeResults } from "./excel/writer.js";
import { Classifier } from "./claude/classify.js";
import type { EnrichedRow } from "./types.js";

interface CliArgs {
  input: string;
  output: string;
  limit: number | null;
  concurrency: number;
}

function parseArgs(argv: string[]): CliArgs {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        args[key] = next;
        i++;
      } else {
        args[key] = "true";
      }
    }
  }
  if (!args.input) throw new Error("--input <path.xlsx> requis");
  const input = path.resolve(args.input);
  const output =
    args.output ??
    path.join(
      path.dirname(input),
      `${path.basename(input, path.extname(input))}.verified.xlsx`,
    );
  return {
    input,
    output: path.resolve(output),
    limit: args.limit ? Number(args.limit) : null,
    concurrency: args.concurrency ? Number(args.concurrency) : 4,
  };
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
  onProgress?: (done: number, total: number) => void,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  let done = 0;
  const total = items.length;

  async function nextOne(): Promise<void> {
    while (true) {
      const idx = cursor++;
      if (idx >= total) return;
      results[idx] = await worker(items[idx], idx);
      done++;
      onProgress?.(done, total);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, total) }, () => nextOne()),
  );
  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey)
    throw new Error("ANTHROPIC_API_KEY manquant dans l'environnement (.env)");

  console.log(`📄 Lecture : ${args.input}`);
  const { workbook, rows: allRows } = await loadWorkbook(args.input);
  const rows = args.limit ? allRows.slice(0, args.limit) : allRows;
  console.log(
    `→ ${allRows.length} produits trouvés${args.limit ? ` (traitement limité aux ${rows.length} premiers)` : ""}`,
  );
  const withImage = rows.filter((r) => r.imageBuffer).length;
  console.log(`→ ${withImage}/${rows.length} avec image`);

  const classifier = new Classifier(apiKey);

  console.log(
    `🤖 Classification (concurrence ${args.concurrency}, modèle ${process.env.CLAUDE_MODEL ?? "claude-opus-4-7"})...`,
  );
  const enriched: EnrichedRow[] = await runWithConcurrency(
    rows,
    args.concurrency,
    async (row) => {
      try {
        const classification = await classifier.classify(row);
        return { ...row, classification };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ...row, classification: { error: msg } };
      }
    },
    (done, total) => {
      process.stdout.write(`\r  ${done}/${total}    `);
    },
  );
  process.stdout.write("\n");

  await fs.mkdir(path.dirname(args.output), { recursive: true });
  await writeResults(workbook, enriched, args.output);

  const okCount = enriched.filter(
    (r) => !("error" in r.classification),
  ).length;
  const review = enriched.filter(
    (r) =>
      !("error" in r.classification) && r.classification.needsManualReview,
  ).length;
  const divergent = enriched.filter(
    (r) =>
      !("error" in r.classification) && r.classification.divergesFromChina,
  ).length;
  const errs = enriched.length - okCount;

  console.log("\n✅ Terminé");
  console.log(`   Fichier de sortie : ${args.output}`);
  console.log(`   ${okCount}/${enriched.length} classifiés sans erreur`);
  console.log(`   ${divergent} codes divergent du code chinois`);
  console.log(`   ${review} à revoir manuellement`);
  if (errs > 0) console.log(`   ⚠ ${errs} erreurs (voir colonne justification)`);
}

main().catch((err) => {
  console.error("\n❌ Échec :", err);
  process.exit(1);
});
