import Anthropic from "@anthropic-ai/sdk";
import type { ClassificationResult, ProductRow } from "../types.js";

const MODEL = process.env.CLAUDE_MODEL ?? "claude-opus-4-7";

const SYSTEM_INSTRUCTIONS = `Tu es un expert en classification douanière pour les importations Chine → Belgique (Union européenne).

Ton rôle : pour chaque produit, déterminer le **code Tarabel à 10 chiffres** correct (nomenclature TARIC EU + extension nationale belge).

Méthode :
1. Analyse en priorité la PHOTO du produit (si fournie), puis la description anglaise, puis chinois/NL/FR, puis le matériau.
2. Le code HS proposé par le fournisseur chinois est faux ~50% du temps : ne lui fais pas confiance aveuglément, vérifie qu'il colle au produit.
3. Le matériau chinois est généralement correct mais peut être erroné. Si la photo contredit clairement le matériau déclaré, signale-le.
4. Si plusieurs codes sont plausibles, choisis le plus probable et indique une confiance "medium".
5. Si tu hésites entre plusieurs familles très différentes, marque "low" + needsManualReview=true.
6. Pour les taux de droits d'invoer, donne l'estimation EU standard (taux conventionnel "erga omnes" ou applicable à la Chine si différent), en pourcentage. Si tu ne le connais pas avec certitude, mets null.
   - invoerRateForChinaCode : le taux qui s'appliquerait SI on utilisait le code HS proposé par la Chine (utile pour montrer à l'utilisateur ce qu'il paierait avec le mauvais code).
   - invoerRateForSuggestedCode : le taux qui s'applique à TON code Tarabel suggéré. Si tu suggères le même code que la Chine, mets la même valeur dans les deux champs.

Format de sortie : UNIQUEMENT un objet JSON valide, sans texte autour, conforme à ce schéma :
{
  "tarabelCode": "string (10 chiffres, sans espace)",
  "invoerRateForChinaCode": number | null,
  "invoerRateForSuggestedCode": number | null,
  "confidence": "high" | "medium" | "low",
  "justification": "string en français, max 2 phrases, explique POURQUOI ce code",
  "materialConfirmed": boolean,
  "materialNote": "string en français, vide si rien à signaler",
  "divergesFromChina": boolean (true si ton code ≠ code chinois),
  "needsManualReview": boolean (true si confidence=low OU divergence majeure de famille)
}`;

export interface RetryFeedback {
  /** Code proposé au tour précédent, absent de la nomenclature officielle */
  invalidCode: string;
  /** Codes réellement valides sous la même position (peut être vide) */
  candidates: Array<{ code: string; descriptionFr: string | null; descriptionEn: string | null }>;
  /** Dernier recours : la réponse DOIT être un code de la liste, sans exception */
  strict?: boolean;
}

function buildUserContent(row: ProductRow, feedback?: RetryFeedback): Anthropic.ContentBlockParam[] {
  const blocks: Anthropic.ContentBlockParam[] = [];

  if (row.imageBuffer && row.imageBuffer.length > 0) {
    const mediaType = (
      row.imageExt === "png" ? "image/png" : "image/jpeg"
    ) as "image/png" | "image/jpeg";
    blocks.push({
      type: "image",
      source: {
        type: "base64",
        media_type: mediaType,
        data: row.imageBuffer.toString("base64"),
      },
    });
  }

  const lines: string[] = [
    "Produit à classifier :",
    `- Description chinoise : ${row.chineseDescription || "(vide)"}`,
    `- Description anglaise : ${row.englishDescription || "(vide)"}`,
    `- Description NL : ${row.descriptionNL || row.omschrijving || "(vide)"}`,
    `- Description FR : ${row.descriptionFR || "(vide)"}`,
    `- Matériau (chinois, parfois faux) : ${row.material || "(vide)"}`,
    `- Code HS proposé par la Chine (souvent faux) : ${row.hsCodeChina || "(vide)"}`,
    `- Prix unitaire USD : ${row.priceUSD ?? "(inconnu)"}`,
    `- Quantité : ${row.quantity ?? "(inconnu)"}`,
    "",
  ];

  if (feedback) {
    lines.push(
      `ATTENTION : le code ${feedback.invalidCode} que tu as proposé N'EXISTE PAS dans la nomenclature officielle TARBEL en vigueur.`,
    );
    if (feedback.candidates.length > 0) {
      lines.push(
        feedback.strict
          ? "DERNIER ESSAI. Ton champ tarabelCode DOIT être l'un des codes ci-dessous, recopié EXACTEMENT (10 chiffres). Toute autre réponse sera rejetée. Choisis le plus adapté au produit (souvent la subdivision « autres ») :"
          : "Voici les codes réellement valides sous cette position. Recopie EXACTEMENT l'un de ces codes dans tarabelCode — ne réponds JAMAIS un code hors de cette liste (sauf si tu changes complètement de position) :",
      );
      for (const c of feedback.candidates) {
        lines.push(`  - ${c.code} : ${c.descriptionFr ?? c.descriptionEn ?? ""}`);
      }
    } else {
      lines.push("Propose une autre position de la nomenclature, en vérifiant soigneusement les subdivisions.");
    }
    lines.push("");
  }

  lines.push("Réponds avec UNIQUEMENT le JSON, rien d'autre.");
  blocks.push({ type: "text", text: lines.join("\n") });
  return blocks;
}

function parseClassification(text: string): ClassificationResult {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  const obj = JSON.parse(cleaned) as Partial<ClassificationResult>;

  const tarabelCode = String(obj.tarabelCode ?? "").replace(/\D/g, "");
  if (tarabelCode.length === 0) throw new Error("tarabelCode manquant");
  if (tarabelCode.length !== 10) {
    throw new Error(`tarabelCode invalide : ${tarabelCode} (${tarabelCode.length} chiffres au lieu de 10)`);
  }

  const parseRate = (v: unknown): number | null => {
    if (v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  return {
    tarabelCode,
    invoerRateForChinaCode: parseRate(obj.invoerRateForChinaCode),
    invoerRateForSuggestedCode: parseRate(obj.invoerRateForSuggestedCode),
    confidence: (obj.confidence ?? "low") as ClassificationResult["confidence"],
    justification: String(obj.justification ?? ""),
    materialConfirmed: Boolean(obj.materialConfirmed),
    materialNote: String(obj.materialNote ?? ""),
    divergesFromChina: Boolean(obj.divergesFromChina),
    needsManualReview: Boolean(obj.needsManualReview),
  };
}

export class Classifier {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async classify(row: ProductRow, feedback?: RetryFeedback): Promise<ClassificationResult> {
    const response = await this.client.messages.create({
      model: MODEL,
      max_tokens: 600,
      system: [
        {
          type: "text",
          text: SYSTEM_INSTRUCTIONS,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: buildUserContent(row, feedback),
        },
      ],
    });

    const textBlock = response.content.find(
      (b): b is Anthropic.TextBlock => b.type === "text",
    );
    if (!textBlock) throw new Error("Réponse Claude vide");
    return parseClassification(textBlock.text);
  }
}
