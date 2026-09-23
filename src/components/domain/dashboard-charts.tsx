'use client';

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

/**
 * Biểu đồ cột cho dashboard.
 *
 * Recharts phải chạy ở client nên tách khỏi trang dashboard (server component):
 * trang lo truy vấn, gom số theo tháng và dựng khung thẻ, file này chỉ lo vẽ.
 *
 * Cố tình KHÔNG import '@/components/ui': barrel đó là module dùng chung không
 * đánh dấu 'use client' nhưng lại re-export các component client. Trang dashboard
 * đã nạp barrel ở phía server, nạp thêm lần nữa qua nhánh client làm hỏng chunk
 * (ReferenceError: SearchableSelect is not defined). Khung thẻ để trang cha dựng.
 *
 * Dùng chung đúng bảng màu và style trục với màn Báo cáo, để một con số nhìn ở
 * hai nơi vẫn ra cùng một màu.
 */

const axisStyle = { fontSize: 11, fill: 'var(--text-muted)' };

const tooltipStyle = {
  background: 'var(--surface-card)',
  border: '1px solid var(--border-base)',
  borderRadius: 8,
  fontSize: 12,
  boxShadow: 'var(--shadow-md)',
  color: 'var(--text-strong)',
};

export interface ChartSeries {
  key: string;
  name: string;
  color: string;
}

const compact = (n: number) => {
  const v = Math.abs(n);
  if (v >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)} tỷ`;
  if (v >= 1_000_000) return `${Math.round(n / 1_000_000)} tr`;
  if (v >= 1_000) return `${Math.round(n / 1_000)} k`;
  return String(n);
};

const money = (n: number) => `${new Intl.NumberFormat('vi-VN').format(Math.round(n || 0))} ₫`;

export function MonthlyBars({
  data,
  series,
  /** Giá trị là tiền: trục và tooltip rút gọn "tr/tỷ" cho đỡ rối. */
  asMoney = false,
  height = 240,
}: {
  data: Record<string, number | string>[];
  series: ChartSeries[];
  asMoney?: boolean;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
        <XAxis dataKey="label" tick={axisStyle} tickLine={false} axisLine={{ stroke: 'var(--border-subtle)' }} />
        <YAxis
          tick={axisStyle}
          tickLine={false}
          axisLine={false}
          width={asMoney ? 54 : 34}
          tickFormatter={(v: number) => (asMoney ? compact(v) : String(v))}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          cursor={{ fill: 'var(--surface-hover)' }}
          formatter={(v: number | string, name: string) => [asMoney ? money(Number(v)) : v, name]}
        />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
        {series.map((s) => (
          <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={38} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
