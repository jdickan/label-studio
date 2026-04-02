-- Migration: Add parent_template_id to label_templates for template inheritance hierarchy
ALTER TABLE label_templates
  ADD COLUMN IF NOT EXISTS parent_template_id integer REFERENCES label_templates(id) ON DELETE SET NULL;
