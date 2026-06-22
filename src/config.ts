import path from "node:path";

const DATA_ROOT = process.env.DATA_ROOT ?? path.join(process.cwd(), "catalog");

export const config = {
  port: Number(process.env.PORT ?? 3050),
  dbPath: process.env.DB_PATH ?? path.join(DATA_ROOT, "catalog.db"),
  photosDir: process.env.PHOTOS_DIR ?? path.join(DATA_ROOT, "photos"),
  uploadsDir: process.env.UPLOADS_DIR ?? path.join(DATA_ROOT, "uploads"),
  uploadPhotosDir: process.env.UPLOAD_PHOTOS_DIR ?? path.join(DATA_ROOT, "upload-photos"),
  appPassword: process.env.APP_PASSWORD ?? "",
  sessionSecret: process.env.SESSION_SECRET ?? "dev-secret-change-me",
  isProduction: process.env.NODE_ENV === "production",
};
