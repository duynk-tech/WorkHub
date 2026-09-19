#!/bin/sh
set -e

echo "→ Chờ MySQL sẵn sàng…"
until echo "SELECT 1;" | npx prisma db execute --url "$DATABASE_URL" --stdin >/dev/null 2>&1; do
  echo "  MySQL chưa sẵn sàng, thử lại sau 3 giây…"
  sleep 3
done
echo "✓ MySQL đã sẵn sàng"

echo "→ Áp dụng migration…"
npx prisma migrate deploy || npx prisma db push --accept-data-loss

echo "→ Nạp dữ liệu khởi tạo…"
npx tsx prisma/seed/index.ts

echo "✓ Khởi động ứng dụng"
exec "$@"
