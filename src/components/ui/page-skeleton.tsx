import { Skeleton } from './index';

/**
 * Khung chờ dùng cho loading.tsx của các route — bố cục khớp trang thật
 * (header có viền dưới, thẻ số liệu, bảng) để lúc dữ liệu về không bị nhảy.
 */

function HeaderSkeleton({ actions = true }: { actions?: boolean }) {
  return (
    <div className="page-header" aria-hidden>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minWidth: 0 }}>
        <Skeleton style={{ width: 'min(240px, 60%)', height: 24 }} />
        <Skeleton style={{ width: 'min(380px, 85%)', height: 14 }} />
      </div>
      {actions && <Skeleton style={{ width: 132, height: 36, borderRadius: 'var(--radius-md)' }} />}
    </div>
  );
}

function StatsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid-stats" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="card stat-card">
          <Skeleton style={{ width: '55%', height: 12 }} />
          <Skeleton style={{ width: 72, height: 24 }} />
          <Skeleton style={{ width: '40%', height: 11 }} />
        </div>
      ))}
    </div>
  );
}

function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="table-wrap" aria-hidden>
      <div style={{ display: 'flex', gap: 10, padding: 12, borderBottom: '1px solid var(--border-base)', flexWrap: 'wrap' }}>
        <Skeleton style={{ flex: '1 1 220px', height: 36, borderRadius: 'var(--radius-md)' }} />
        <Skeleton style={{ width: 150, height: 36, borderRadius: 'var(--radius-md)' }} />
        <Skeleton style={{ width: 150, height: 36, borderRadius: 'var(--radius-md)' }} />
      </div>
      <div style={{ height: 42, background: 'var(--surface-sunken)', borderBottom: '1px solid var(--border-base)' }} />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} style={{ display: 'flex', gap: 16, alignItems: 'center', padding: '13px 14px', borderBottom: i < rows - 1 ? '1px solid var(--border-base)' : undefined }}>
          <Skeleton style={{ width: 80, height: 12 }} />
          <Skeleton style={{ flex: 1, height: 12 }} />
          <Skeleton style={{ width: 90, height: 12 }} />
          <Skeleton style={{ width: 64, height: 20, borderRadius: 'var(--radius-sm)' }} />
        </div>
      ))}
    </div>
  );
}

export function ListPageSkeleton() {
  return (
    <div className="stack" role="status" aria-label="Đang tải">
      <HeaderSkeleton />
      <StatsSkeleton />
      <TableSkeleton />
    </div>
  );
}

export function DetailPageSkeleton() {
  return (
    <div className="stack" role="status" aria-label="Đang tải">
      <HeaderSkeleton />
      <Skeleton style={{ width: 'min(420px, 100%)', height: 36, borderRadius: 'var(--radius-md)' }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 16 }}>
        {[0, 1].map((i) => (
          <div key={i} className="card" aria-hidden>
            <div className="card-header"><Skeleton style={{ width: 140, height: 14 }} /></div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[0, 1, 2, 3, 4].map((r) => (
                <div key={r} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <Skeleton style={{ width: '30%', height: 12 }} />
                  <Skeleton style={{ width: '45%', height: 12 }} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <TableSkeleton rows={5} />
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="stack" role="status" aria-label="Đang tải">
      <div className="row-between" aria-hidden>
        <Skeleton style={{ width: 'min(260px, 60%)', height: 36, borderRadius: 'var(--radius-md)' }} />
        <Skeleton style={{ width: 200, height: 32, borderRadius: 'var(--radius-md)' }} />
      </div>
      <StatsSkeleton />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))', gap: 16 }}>
        {[0, 1].map((i) => (
          <div key={i} className="card" aria-hidden>
            <div className="card-header"><Skeleton style={{ width: 180, height: 14 }} /></div>
            <div className="card-body"><Skeleton style={{ height: 230 }} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}
