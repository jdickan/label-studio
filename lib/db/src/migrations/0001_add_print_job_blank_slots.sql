-- Migration: Add blank_slots and job_type to print_jobs table
-- Applied via drizzle-kit push

ALTER TABLE print_jobs
  ADD COLUMN IF NOT EXISTS job_type text NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS blank_slots jsonb NOT NULL DEFAULT '[]';
