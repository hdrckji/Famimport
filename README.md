# Famimport

Outil de vérification et correction des codes HS (**Tarabel 10 chiffres**) pour les imports Chine → Belgique.

## Problème

Les fournisseurs chinois communiquent leurs produits dans un fichier Excel contenant :
- Photo, descriptions multilingues (ZH/EN/NL/FR)
- Code HS proposé (faux ~1 fois sur 2)
- Matériaux en chinois (parfois faux)
- Prix USD, quantités

L'objectif est de vérifier/corriger automatiquement chaque ligne via Claude (vision + descriptions + matériaux) et de produire un Excel enrichi prêt pour la déclaration douanière.

## Installation

```powershell
npm install
copy .env.example .env
# éditer .env pour mettre la clé ANTHROPIC_API_KEY
```

## Utilisation

```powershell
npm start -- --input data/import-fournisseur.xlsx --output output/import-verified.xlsx
```

## Structure

- `src/excel/reader.ts` — lecture Excel + extraction images
- `src/excel/writer.ts` — écriture Excel enrichi avec colonnes vérification
- `src/tarabel/` — chargement de la nomenclature Tarabel de référence
- `src/claude/classify.ts` — appel Claude avec vision + prompt caching
- `src/index.ts` — orchestration CLI

## Avertissement

Les suggestions sont **indicatives**. Toute ligne marquée "à revoir" doit être validée manuellement avant déclaration douanière.
