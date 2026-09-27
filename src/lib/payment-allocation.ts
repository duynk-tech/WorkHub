export function allocatePayment(amount: number, orders: { id: number; remaining: number }[]) {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Số tiền phải lớn hơn 0');
  let left = Math.round(amount * 100);
  const allocations: { orderId: number; amount: number }[] = [];
  for (const order of orders) {
    if (!Number.isFinite(order.remaining)) throw new Error('Công nợ không hợp lệ');
    const applied = Math.min(left, Math.max(0, Math.round(order.remaining * 100)));
    if (applied > 0) allocations.push({ orderId: order.id, amount: applied / 100 });
    left -= applied;
    if (left === 0) break;
  }
  return { allocations, unapplied: left / 100 };
}
