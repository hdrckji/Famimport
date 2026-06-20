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
6. Pour le taux de droits d'invoer (invoerRate), donne l'estimation EU standard pour ce code (taux conventionnel) en pourcentage. Si tu ne le connais pas avec certitude, mets null.

Format de sortie : UNIQUEMENT un objet JSON valide, sans texte autour, conforme à ce schéma :
{
  "tarabelCode": "string (10 chiffres, sans espace)",
  "invoerRate": number | null,
  "confidence": "high" | "medium" | "low",
  "justification": "string en français, max 2 phrases, explique POURQUOI ce code",
  "materialConfirmed": boolean,
  "materialNote": "string en français, vide si rien à signaler",
  "divergesFromChina": boolean (true si ton code ≠ code chinois),
  "needsManualReview": boolean (true si confidence=low OU divergence majeure de famille)
}`;

function buildUserContent(row: ProductRow): Anthropic.ContentBlockParam[] {
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
    "Réponds avec UNIQUEMENT le JSON, rien d'autre.",
  ];
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

  return {
    tarabelCode,
    invoerRate:
      obj.invoerRate == null || Number.isNaN(Number(obj.invoerRate))
        ? null
        : Number(obj.invoerRate),
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

  async classify(row: ProductRow): Promise<ClassificationResult> {
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
          content: buildUserContent(row),
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
