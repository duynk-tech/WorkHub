'use client';

import {
  BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

/**
 * Bộ biểu đồ cho Dashboard (Bar, Area/Line, Pie/Donut).
 *
 * Recharts phải chạy ở client nên tách khỏi trang dashboard (server component):
 * trang lo truy vấn, gom số và dựng khung thẻ, file này chỉ lo vẽ.
 * Cố tình KHÔNG import '@/components/ui' để tránh xung đột chunk RSC/Client.
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

export interface DonutSlice {
  name: string;
  value: number;
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

export function MonthlyAreaChart({
  data,
  series,
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
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          {series.map((s) => (
            <linearGradient key={s.key} id={`area-grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={s.color} stopOpacity={0.22} />
              <stop offset="95%" stopColor={s.color} stopOpacity={0.01} />
            </linearGradient>
          ))}
        </defs>
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
          formatter={(v: number | string, name: string) => [asMoney ? money(Number(v)) : v, name]}
        />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
        {series.map((s) => (
          <Area
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.name}
            stroke={s.color}
            strokeWidth={2}
            fill={`url(#area-grad-${s.key})`}
            dot={{ r: 3, fill: s.color, strokeWidth: 0 }}
            activeDot={{ r: 5 }}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function StatusDonutChart({
  data,
  height = 230,
  centerLabel = 'Tổng',
}: {
  data: DonutSlice[];
  height?: number;
  centerLabel?: string;
}) {
  const nonZero = data.filter((d) => d.value > 0);
  const total = nonZero.reduce((sum, d) => sum + d.value, 0);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 210px) minmax(0, 1fr)', gap: 16, alignItems: 'center' }}>
      <div style={{ position: 'relative', width: '100%', height }}>
        <ResponsiveContainer width="100%" height={height}>
          <PieChart>
            <Pie
              data={nonZero}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius="56%"
              outerRadius="82%"
              paddingAngle={2}
              strokeWidth={0}
            >
              {nonZero.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(v: number | string, name: string) => {
                const num = Number(v);
                const pct = total ? Math.round((num / total) * 100) : 0;
                return [`${num} (${pct}%)`, name];
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-strong)', lineHeight: 1.1 }} className="tnum">
            {total}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{centerLabel}</span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {nonZero.map((item) => {
          const pct = total ? Math.round((item.value / total) * 100) : 0;
          return (
            <div key={item.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 12.5 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                <span style={{ width: 9, height: 9, borderRadius: 99, background: item.color, flexShrink: 0 }} />
                <span style={{ color: 'var(--text-base)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.name}
                </span>
              </span>
              <span style={{ color: 'var(--text-strong)', fontWeight: 600, whiteSpace: 'nowrap' }} className="tnum">
                {item.value} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({pct}%)</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
