CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "products_name_trgm_idx"
  ON "products" USING GIN ("name" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "products_code_trgm_idx"
  ON "products" USING GIN ("code" gin_trgm_ops);
