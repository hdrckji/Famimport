import { createWriteStream } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import zlib from "node:zlib";
import path from "node:path";
import * as tar from "tar";
import type express from "express";
import { config } from "../config.js";

/**
 * Temporary admin endpoints used to seed the production volume with
 * the initial catalog (SQLite DB + photos tar.gz). Protected by the
 * normal app authentication (requireAuth middleware).
 *
 * Remove or disable once seeding is done.
 */

export async function seedDb(req: express.Request, res: express.Response): Promise<void> {
  const dbDir = path.dirname(config.dbPath);
  await mkdir(dbDir, { recursive: true });
  const tmpPath = `${config.dbPath}.upload`;

  try {
    await pipeline(req, createWriteStream(tmpPath));
    await rename(tmpPath, config.dbPath);
    res.json({ ok: true, message: "SQLite DB seeded. Restart the service from the Railway dashboard to reload the DB handle." });
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
}

export async function seedPhotos(req: express.Request, res: express.Response): Promise<void> {
  await mkdir(config.photosDir, { recursive: true });
  const tmpTar = path.join(path.dirname(config.photosDir), `photos-upload-${Date.now()}.tar.gz`);

  try {
    await pipeline(req, createWriteStream(tmpTar));

    await pipeline(
      (await import("node:fs")).createReadStream(tmpTar),
      zlib.createGunzip(),
      tar.x({ cwd: config.photosDir, strip: 0 }),
    );

    await rm(tmpTar, { force: true });
    res.json({ ok: true, message: "Photos extracted to " + config.photosDir });
  } catch (err) {
    await rm(tmpTar, { force: true }).catch(() => {});
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
}

/**
 * Move /data/photos/photos/* up to /data/photos/ and remove the empty inner dir.
 * Fixes a tar archive that was created with an extra leading directory.
 */
export async function flattenPhotos(_req: express.Request, res: express.Response): Promise<void> {
  const fs = await import("node:fs/promises");
  try {
    const root = config.photosDir;
    const innerPath = path.join(root, "photos");
    const innerStat = await fs.stat(innerPath).catch(() => null);
    if (!innerStat || !innerStat.isDirectory()) {
      res.json({ ok: false, message: "no inner photos/ directory found, nothing to flatten" });
      return;
    }
    const entries = await fs.readdir(innerPath);
    let moved = 0;
    for (const e of entries) {
      await fs.rename(path.join(innerPath, e), path.join(root, e));
      moved++;
    }
    await fs.rmdir(innerPath).catch(() => {});
    res.json({ ok: true, moved, message: `Moved ${moved} entries from photos/photos/ up to photos/` });
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
}

/**
 * Convert all backslashes in products.photo_path to forward slashes.
 * Needed when the catalog was ingested on Windows but served on Linux.
 */
export async function fixPhotoPaths(_req: express.Request, res: express.Response): Promise<void> {
  try {
    const { getDb } = await import("./db.js");
    const db = getDb();
    const before = (db.prepare("SELECT COUNT(*) AS c FROM products WHERE photo_path LIKE '%\\%'").get() as { c: number }).c;
    const result = db.prepare("UPDATE products SET photo_path = REPLACE(photo_path, '\\', '/') WHERE photo_path LIKE '%\\%'").run();
    res.json({ ok: true, before, updated: result.changes });
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
}

/**
 * Re-run the customs→products matching using the improved heuristic
 * (matches by both hs_china and existing internal estimate, and overwrites
 * packing-list estimates with customs-validated codes).
 */
export async function rematchCustoms(_req: express.Request, res: express.Response): Promise<void> {
  try {
    const { getDb } = await import("./db.js");
    const { rematchAllCustoms } = await import("../customs/ingest.js");
    const db = getDb();
    const result = rematchAllCustoms(db);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
}

/**
 * Charge/actualise la nomenclature officielle TARBEL en production.
 * Corps : JSON array des lignes de la table `nomenclature` (envoyé par
 * `npm run push-nomenclature` depuis le poste local).
 */
export async function seedNomenclature(req: express.Request, res: express.Response): Promise<void> {
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const rows = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Array<{
      code: string;
      suffix: string;
      sid: number | null;
      description_fr: string | null;
      description_nl: string | null;
      description_en: string | null;
      validity_start: string | null;
      validity_end: string | null;
      deleted: number;
      is_leaf: number | null;
      third_country_duty: number | null;
    }>;
    if (!Array.isArray(rows) || rows.length === 0) {
      res.status(400).json({ ok: false, error: "corps vide ou invalide" });
      return;
    }
    const { getDb } = await import("./db.js");
    const db = getDb();
    const upsert = db.prepare(`
      INSERT INTO nomenclature (code, suffix, sid, description_fr, description_nl, description_en,
                                validity_start, validity_end, deleted, is_leaf, third_country_duty, updated_at)
      VALUES (@code, @suffix, @sid, @description_fr, @description_nl, @description_en,
              @validity_start, @validity_end, @deleted, @is_leaf, @third_country_duty, datetime('now'))
      ON CONFLICT(code, suffix) DO UPDATE SET
        sid = excluded.sid,
        description_fr = excluded.description_fr,
        description_nl = excluded.description_nl,
        description_en = excluded.description_en,
        validity_start = excluded.validity_start,
        validity_end = excluded.validity_end,
        deleted = excluded.deleted,
        is_leaf = excluded.is_leaf,
        third_country_duty = excluded.third_country_duty,
        updated_at = datetime('now')
    `);
    const tx = db.transaction(() => {
      for (const r of rows) upsert.run(r);
    });
    tx();
    const count = (db.prepare("SELECT COUNT(*) AS c FROM nomenclature WHERE deleted = 0").get() as { c: number }).c;
    res.json({ ok: true, received: rows.length, activeCodes: count });
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
}

export async function adminStatus(_req: express.Request, res: express.Response): Promise<void> {
  const fs = await import("node:fs/promises");
  const result: Record<string, unknown> = {
    dbPath: config.dbPath,
    photosDir: config.photosDir,
  };
  try {
    const stat = await fs.stat(config.dbPath);
    result.dbSize = stat.size;
    result.dbMtime = stat.mtime.toISOString();
  } catch {
    result.dbSize = null;
  }
  try {
    const dir = await fs.readdir(config.photosDir);
    result.photoFolders = dir.length;
  } catch {
    result.photoFolders = null;
  }
  res.json(result);
}
