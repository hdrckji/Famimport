import "dotenv/config";
import { getDb } from "./web/db.js";

/**
 * Pousse la nomenclature locale vers l'instance de production.
 *
 * Usage :
 *   APP_PASSWORD=... npm run push-nomenclature -- https://famimport-production.up.railway.app
 * (le mot de passe peut aussi être passé en 2e argument)
 */

const args = process.argv.slice(2);
const base = (args[0] ?? "https://famimport-production.up.railway.app").replace(/\/$/, "");
const password = process.env.APP_PASSWORD ?? args[1];

if (!password) {
  console.error("APP_PASSWORD manquant (variable d'env ou 2e argument)");
  process.exit(1);
}

// 1. Login → cookie de session
const loginRes = await fetch(`${base}/login`, {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ password, next: "/" }).toString(),
  redirect: "manual",
});
const cookie = loginRes.headers.get("set-cookie")?.split(";")[0];
if (loginRes.status !== 302 || !cookie?.includes("famimport_session=")) {
  console.error(`Échec du login (${loginRes.status}) — mot de passe incorrect ?`);
  process.exit(1);
}
console.log("Login OK");

// 2. Dump de la nomenclature locale
const rows = getDb()
  .prepare(
    `SELECT code, suffix, sid, description_fr, description_nl, description_en,
            validity_start, validity_end, deleted, is_leaf, third_country_duty
     FROM nomenclature`,
  )
  .all();
console.log(`${rows.length} lignes de nomenclature à envoyer…`);

// 3. Envoi
const res = await fetch(`${base}/admin/seed-nomenclature`, {
  method: "POST",
  headers: { cookie, "content-type": "application/json" },
  body: JSON.stringify(rows),
});
console.log(`${res.status} ${await res.text()}`);
