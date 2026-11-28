/**
 * Chạy `fn` trên từng phần tử với tối đa `limit` việc song song. Dùng cho job gửi
 * thông báo hàng loạt: nối tiếp từng cái thì chậm, bắn hết cùng lúc thì nghẽn pool DB.
 */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}
