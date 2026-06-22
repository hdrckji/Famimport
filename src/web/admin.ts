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
