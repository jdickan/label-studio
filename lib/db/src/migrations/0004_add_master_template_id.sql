ALTER TABLE "design_system" ADD COLUMN IF NOT EXISTS "master_template_id" integer REFERENCES "label_templates"("id") ON DELETE SET NULL;
