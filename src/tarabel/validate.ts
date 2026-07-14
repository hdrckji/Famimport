import type Database from "better-sqlite3";

/**
 * Validation des codes contre la nomenclature officielle TARBEL.
 *
 * Un code est déclarable s'il existe avec le suffixe de ligne produit '80',
 * n'est pas supprimé, et n'a pas de date de fin de validité dépassée.
 *
 * IMPORTANT : tant que seuls des exports différentiels journaliers ont été
 * chargés, la table ne contient qu'une fraction de la nomenclature. Dans ce
 * cas on ne peut PAS affirmer qu'un code absent n'existe pas — la validation
 * n'est bloquante que si la nomenclature est jugée complète (seuil de volume).
 */

// La nomenclature TARIC/TARBEL complète compte plusieurs dizaines de milliers
// de codes. En dessous de ce seuil, on considère qu'on n'a que des deltas.
const AUTHORITATIVE_THRESHOLD = 10_000;

export function nomenclatureCount(db: Database.Database): number {
  return (
    db.prepare("SELECT COUNT(*) AS c FROM nomenclature WHERE deleted = 0").get() as { c: number }
  ).c;
}

export function isNomenclatureAuthoritative(db: Database.Database): boolean {
  return nomenclatureCount(db) >= AUTHORITATIVE_THRESHOLD;
}

export type CodeCheck =
  | {
      status: "valid";
      descriptionFr: string | null;
      descriptionNl: string | null;
      /** Droit pays tiers officiel (ERGA OMNES) en %, si connu */
      thirdCountryDuty: number | null;
    }
  | { status: "invalid"; reason: string }
  | { status: "unknown"; reason: string };

/**
 * Vérifie un code 10 chiffres contre la nomenclature.
 * - "valid"   : le code existe et est déclarable
 * - "invalid" : la nomenclature est complète et le code n'y figure pas (ou est expiré)
 * - "unknown" : nomenclature absente/partielle → impossible de trancher
 */
export function checkCode(db: Database.Database, code: string): CodeCheck {
  let clean = code.replace(/\D/g, "");
  // Zéro de tête perdu par Excel (cellule numérique) : un code à 9 chiffres
  // ne peut être qu'un code des chapitres 01-09 → on le restaure.
  if (clean.length === 9) clean = "0" + clean;
  if (clean.length !== 10) {
    return { status: "invalid", reason: `Code à ${clean.length} chiffres (10 attendus)` };
  }

  const row = db
    .prepare(
      `SELECT description_fr, description_nl, deleted, validity_end, is_leaf, third_country_duty
       FROM nomenclature WHERE code = ? AND suffix = '80'`,
    )
    .get(clean) as
    | {
        description_fr: string | null;
        description_nl: string | null;
        deleted: number;
        validity_end: string | null;
        is_leaf: number | null;
        third_country_duty: number | null;
      }
    | undefined;

  if (row) {
    if (row.deleted) return { status: "invalid", reason: "Code supprimé de la nomenclature" };
    if (row.validity_end && row.validity_end < new Date().toISOString()) {
      return { status: "invalid", reason: `Code expiré depuis le ${row.validity_end.slice(0, 10)}` };
    }
    // is_leaf = 0 : position de regroupement, non déclarable en douane.
    // is_leaf NULL : code créé par un delta XML (info leaf inconnue) → accepté.
    if (row.is_leaf === 0) {
      return { status: "invalid", reason: "Position de regroupement, non déclarable (IS_LEAF=0)" };
    }
    return {
      status: "valid",
      descriptionFr: row.description_fr,
      descriptionNl: row.description_nl,
      thirdCountryDuty: row.third_country_duty,
    };
  }

  if (!isNomenclatureAuthoritative(db)) {
    return {
      status: "unknown",
      reason: "Nomenclature officielle incomplète (extraction initiale TARBEL non chargée)",
    };
  }
  return { status: "invalid", reason: "Code introuvable dans la nomenclature TARBEL" };
}

export interface CandidateCode {
  code: string;
  descriptionFr: string | null;
  descriptionEn: string | null;
}

/**
 * Liste les codes déclarables valides sous un préfixe (ex. position HS 6
 * chiffres) — utilisé pour re-proposer à Claude une liste fermée de choix.
 */
export function listCodesUnderPrefix(
  db: Database.Database,
  prefix: string,
  limit = 40,
): CandidateCode[] {
  const clean = prefix.replace(/\D/g, "");
  if (clean.length < 4) return [];
  return db
    .prepare(
      `SELECT code, description_fr AS descriptionFr, description_en AS descriptionEn
       FROM nomenclature
       WHERE code LIKE ? AND suffix = '80' AND deleted = 0
         AND (is_leaf IS NULL OR is_leaf = 1)
         AND (validity_end IS NULL OR validity_end >= datetime('now'))
       ORDER BY code LIMIT ?`,
    )
    .all(`${clean}%`, limit) as CandidateCode[];
}
