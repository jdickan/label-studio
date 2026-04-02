-- Migration: Add label_designs table for WYSIWYG visual label design
CREATE TABLE IF NOT EXISTS label_designs (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  label_sheet_id INTEGER REFERENCES label_sheets(id) ON DELETE SET NULL,
  objects JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
