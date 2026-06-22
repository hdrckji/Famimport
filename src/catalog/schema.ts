import type Database from "better-sqlite3";

export function initSchema(db: Database.Database): void {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS imports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      folder_name TEXT NOT NULL UNIQUE,
      brand TEXT,
      year INTEGER,
      sheet_used TEXT,
      file_path TEXT NOT NULL,
      ingested_at TEXT NOT NULL DEFAULT (datetime('now')),
      product_count INTEGER DEFAULT 0,
      schema_variant TEXT,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      import_id INTEGER NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
      row_index INTEGER NOT NULL,
      ean TEXT,
      leverancier TEXT,
      bestelnummer TEXT,
      chinese_description TEXT,
      english_description TEXT,
      nl_description TEXT,
      fr_description TEXT,
      omschrijving TEXT,
      hs_china TEXT,
      tarabel_validated TEXT,
      invoer_pct REAL,
      antidumping_pct REAL,
      material TEXT,
      price_usd REAL,
      quantity REAL,
      photo_path TEXT,
      raw_data TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_products_ean ON products(ean);
    CREATE INDEX IF NOT EXISTS idx_products_hs_china ON products(hs_china);
    CREATE INDEX IF NOT EXISTS idx_products_tarabel ON products(tarabel_validated);
    CREATE INDEX IF NOT EXISTS idx_products_import ON products(import_id);

    CREATE TABLE IF NOT EXISTS customs_declarations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      import_id INTEGER NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
      pdf_path TEXT NOT NULL,
      format TEXT NOT NULL,
      mrn TEXT,
      acceptance_date TEXT,
      parsed_at TEXT NOT NULL DEFAULT (datetime('now')),
      line_count INTEGER DEFAULT 0,
      raw_text TEXT
    );

    CREATE TABLE IF NOT EXISTS customs_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      declaration_id INTEGER NOT NULL REFERENCES customs_declarations(id) ON DELETE CASCADE,
      line_number INTEGER NOT NULL,
      hs_code TEXT NOT NULL,
      description TEXT,
      gross_mass REAL,
      net_mass REAL,
      statistical_value REAL,
      duty_rate REAL,
      duty_amount REAL,
      vat_rate REAL,
      raw_block TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_customs_lines_declaration ON customs_lines(declaration_id);
    CREATE INDEX IF NOT EXISTS idx_customs_lines_hs ON customs_lines(hs_code);
    CREATE INDEX IF NOT EXISTS idx_customs_declarations_import ON customs_declarations(import_id);
  `);

  const cols = db.prepare("PRAGMA table_info(products)").all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === "tarabel_source")) {
    db.exec("ALTER TABLE products ADD COLUMN tarabel_source TEXT");
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS uploads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      original_name TEXT NOT NULL,
      stored_path TEXT NOT NULL,
      uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
      status TEXT NOT NULL DEFAULT 'pending',
      total_rows INTEGER DEFAULT 0,
      matched_ean INTEGER DEFAULT 0,
      matched_desc INTEGER DEFAULT 0,
      no_match INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS upload_rows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      upload_id INTEGER NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
      row_index INTEGER NOT NULL,
      ean TEXT,
      chinese_description TEXT,
      english_description TEXT,
      nl_description TEXT,
      fr_description TEXT,
      hs_china TEXT,
      material TEXT,
      price_usd REAL,
      quantity REAL,
      photo_path TEXT,
      suggested_code TEXT,
      suggested_invoer_pct REAL,
      suggestion_source TEXT,
      suggestion_confidence TEXT,
      suggestion_note TEXT,
      catalog_history TEXT,
      user_decision TEXT,
      user_code TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_upload_rows_upload ON upload_rows(upload_id);
  `);
}
