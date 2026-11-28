-- Index tìm kiếm mờ (ILIKE '%...%') cho các ô search chính.
-- Prisma chưa khai được GIN trigram trong schema, nên chạy tay một lần trên DB:
--   psql "$DATABASE_URL" -f prisma/sql/search-trgm-indexes.sql
-- Câu lệnh idempotent, chạy lại không sao.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "Customer_name_trgm_idx"  ON "Customer" USING gin ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Customer_phone_trgm_idx" ON "Customer" USING gin ("phone" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Task_title_trgm_idx"     ON "Task"     USING gin ("title" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "CustomerOrder_orderCode_trgm_idx" ON "CustomerOrder" USING gin ("orderCode" gin_trgm_ops);
