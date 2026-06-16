-- Migration to fix product deletion error caused by lead_level_history rule vs foreign key conflict
-- Dropping the foreign key constraint allows products to be deleted without breaking referential integrity on the append-only lead_level_history table.

ALTER TABLE lead_level_history DROP CONSTRAINT IF EXISTS lead_level_history_product_code_fkey;
