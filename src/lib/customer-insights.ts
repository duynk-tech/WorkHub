export function customerInsights(customer: any, today = new Date()) {
  const date = today.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
  const orders = (customer.orders || []).filter((o: any) => o.status !== 'CANCELLED');
  const rows = orders.map((o: any) => {
    const total = Number(o.totalAmount ?? 0), paid = Number(o.paidAmount ?? 0);
    const returned = Math.min(total, Number(o.returnedAmount ?? 0));
    const remaining = Math.max(0, total - returned - paid);
    const due = o.dueDate ? new Date(o.dueDate).toISOString().slice(0, 10) : null;
    return { ...o, total, paid, returned, remaining, overdue: remaining > 0 && !!due && due < date };
  });
  const payments = customer.payments || [];
  const unapplied = payments.filter((p: any) => p.allocationVersion === 1).reduce((s: number, p: any) => s + Math.max(0, Number(p.amount) - (p.allocations || []).reduce((a: number, x: any) => a + Number(x.amount), 0)), 0);
  const legacyPayments = payments.filter((p: any) => p.allocationVersion !== 1).length;
  const returnedByLine = new Map<number, number>();
  for (const r of customer.returns || []) for (const i of r.items || []) {
    if (i.orderItemId) returnedByLine.set(i.orderItemId, (returnedByLine.get(i.orderItemId) ?? 0) + Number(i.quantity));
  }
  const parts = orders.filter((o: any) => o.stockIssuedAt || ['DELIVERED', 'COMPLETED'].includes(o.status)).flatMap((order: any) => (order.items || []).filter((i: any) => i.itemType === 'SPARE_PART').map((item: any) => {
    const returnedQty = returnedByLine.get(item.id) ?? 0;
    return { item, order, returnedQty, netQty: Math.max(0, Number(item.quantity) - returnedQty) };
  }));
  const grouped = new Map<string, { key: string; name: string; quantity: number; returnedQty: number; netQty: number }>();
  for (const row of parts) {
    const key = row.item.inventoryItemId ? `stock:${row.item.inventoryItemId}` : `line:${row.item.id}`;
    const group = grouped.get(key) ?? { key, name: row.item.name, quantity: 0, returnedQty: 0, netQty: 0 };
    group.quantity += Number(row.item.quantity); group.returnedQty += row.returnedQty; group.netQty += row.netQty;
    grouped.set(key, group);
  }
  const sum = (key: string) => rows.reduce((s: number, r: any) => s + Number(r[key]), 0);
  return { rows, parts, partGroups: [...grouped.values()], billed: sum('total'), paid: sum('paid'), returned: sum('returned'), outstanding: sum('remaining'), overdue: rows.filter((r: any) => r.overdue).reduce((s: number, r: any) => s + r.remaining, 0), overdueOrders: rows.filter((r: any) => r.overdue).length, unapplied, legacyPayments,
    allocationMismatch: rows.filter((o: any) => {
      const assigned = payments.flatMap((p: any) => p.allocations || []).filter((a: any) => a.orderId === o.id).reduce((s: number, a: any) => s + Number(a.amount), 0);
      return legacyPayments === 0 && Math.abs(o.paid - assigned) > .01;
    }).length };
}
export function customerCsv(rows: unknown[][]) {
  const cell = (value: unknown) => { let s = String(value ?? ''); if (/^[=+@\-\t\r]/.test(s)) s = "'" + s; return '"' + s.replaceAll('"', '""') + '"'; };
  return '\uFEFF' + rows.map(row => row.map(cell).join(';')).join('\r\n');
}
