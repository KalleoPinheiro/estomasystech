-- Fotos de uma condição em ordem cronológica (listagem da ficha e comparação de duas fotos): índice composto, aditivo.
-- IF NOT EXISTS: reaplicar é inofensivo. Desfazer: DROP INDEX idx_condition_photos_condition_created.
CREATE INDEX IF NOT EXISTS "idx_condition_photos_condition_created" ON "condition_photos" USING btree ("condition_id","created_at");
