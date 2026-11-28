'use client';

import dynamic from 'next/dynamic';
import type { ComponentProps } from 'react';
import type * as Charts from './dashboard-charts';

export type { ChartSeries, DonutSlice } from './dashboard-charts';

/**
 * Biểu đồ dashboard tải recharts (~100KB gzip) sau khi trang đã hiện số liệu,
 * thay vì chặn lần hiển thị đầu. Trong lúc chờ giữ đúng chiều cao để trang không nhảy.
 */
function placeholder(height = 240) {
  return function ChartPlaceholder() {
    return (
      <div
        aria-hidden
        className="skeleton"
        style={{ height, borderRadius: 'var(--radius-sm)' }}
      />
    );
  };
}

const LazyMonthlyBars = dynamic(() => import('./dashboard-charts').then((m) => m.MonthlyBars), {
  ssr: false,
  loading: placeholder(240),
});
const LazyMonthlyAreaChart = dynamic(() => import('./dashboard-charts').then((m) => m.MonthlyAreaChart), {
  ssr: false,
  loading: placeholder(240),
});
const LazyStatusDonutChart = dynamic(() => import('./dashboard-charts').then((m) => m.StatusDonutChart), {
  ssr: false,
  loading: placeholder(230),
});

export function MonthlyBars(props: ComponentProps<typeof Charts.MonthlyBars>) {
  return <LazyMonthlyBars {...props} />;
}
export function MonthlyAreaChart(props: ComponentProps<typeof Charts.MonthlyAreaChart>) {
  return <LazyMonthlyAreaChart {...props} />;
}
export function StatusDonutChart(props: ComponentProps<typeof Charts.StatusDonutChart>) {
  return <LazyStatusDonutChart {...props} />;
}
