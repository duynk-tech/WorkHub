#!/bin/sh
set -e

echo "→ Chờ MySQL sẵn sàng…"
until echo "SELECT 1;" | npx prisma db execute --url "$DATABASE_URL" --stdin >/dev/null 2>&1; do
  echo "  MySQL chưa sẵn sàng, thử lại sau 3 giây…"
  sleep 3
done
echo "✓ MySQL đã sẵn sàng"

echo "→ Áp dụng migration & đồng bộ schema…"
npx prisma migrate deploy || true
npx prisma db push --skip-generate

if [ "$AUTO_SEED" = "true" ]; then
  echo "→ Nạp dữ liệu khởi tạo (AUTO_SEED=true)…"
  npx tsx prisma/seed/index.ts
else
  echo "→ Bỏ qua seed tự động (AUTO_SEED không bật). Khởi tạo dữ liệu qua giao diện web (/install)."
fi

echo "✓ Khởi động ứng dụng"
exec "$@"
