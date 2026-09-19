import * as React from 'react';
import { cn, initials } from '@/lib/utils';

/* ── Button ─────────────────────────────────────────────── */
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'soft' | 'danger' | 'danger-soft';
type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  iconOnly?: boolean;
  loading?: boolean;
}

export function Button({
  variant = 'secondary', size = 'md', block, iconOnly, loading, className, children, disabled, ...props
}: ButtonProps) {
  return (
    <button
      className={cn('btn', `btn-${variant}`, size !== 'md' && `btn-${size}`, block && 'btn-block', iconOnly && 'btn-icon', className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn('spin', className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

/* ── Card ───────────────────────────────────────────────── */
export function Card({ className, hover, ...props }: React.HTMLAttributes<HTMLDivElement> & { hover?: boolean }) {
  return <div className={cn('card', hover && 'card-hover', className)} {...props} />;
}
export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('card-header', className)} {...props} />;
}
export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('card-title', className)} {...props} />;
}
export function CardSubtitle({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('card-subtitle', className)} {...props} />;
}
export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('card-body', className)} {...props} />;
}
export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('card-footer', className)} {...props} />;
}

/* ── Form ───────────────────────────────────────────────── */
export function Field({
  label, required, hint, error, className, children,
}: {
  label?: string; required?: boolean; hint?: string; error?: string; className?: string; children: React.ReactNode;
}) {
  return (
    <div className={cn('field', className)}>
      {label && <label className={cn('label', required && 'label-required')}>{label}</label>}
      {children}
      {error ? <span className="error-text">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean; sizeSm?: boolean }>(
  function Input({ className, invalid, sizeSm, ...props }, ref) {
    return <input ref={ref} className={cn('input', sizeSm && 'input-sm', invalid && 'input-error', className)} {...props} />;
  },
);

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(
  function Textarea({ className, invalid, ...props }, ref) {
    return <textarea ref={ref} className={cn('textarea', invalid && 'input-error', className)} {...props} />;
  },
);

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean; sizeSm?: boolean }>(
  function Select({ className, invalid, sizeSm, ...props }, ref) {
    return <select ref={ref} className={cn('select', sizeSm && 'input-sm', invalid && 'input-error', className)} {...props} />;
  },
);

export const Checkbox = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { indeterminate?: boolean }>(
  function Checkbox({ className, indeterminate, ...props }, ref) {
    const innerRef = React.useRef<HTMLInputElement | null>(null);
    React.useEffect(() => {
      if (innerRef.current) innerRef.current.indeterminate = Boolean(indeterminate);
    }, [indeterminate]);
    return (
      <input
        type="checkbox"
        ref={(el) => {
          innerRef.current = el;
          if (typeof ref === 'function') ref(el);
          else if (ref) ref.current = el;
        }}
        className={cn('checkbox', className)}
        {...props}
      />
    );
  },
);
export function Switch({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input type="checkbox" role="switch" className={cn('switch', className)} {...props} />;
}

export function SearchInput({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={cn('input-group', className)}>
      <span className="input-group-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
        </svg>
      </span>
      <input className="input" {...props} />
    </div>
  );
}

/* ── Badge ──────────────────────────────────────────────── */
type BadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'outline';

export function Badge({
  tone = 'neutral', dot, className, style, ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone; dot?: boolean }) {
  return <span className={cn('badge', tone !== 'neutral' && `badge-${tone}`, dot && 'badge-dot', className)} style={style} {...props} />;
}

/* ── Avatar ─────────────────────────────────────────────── */
export function Avatar({
  name, src, size = 'md', className,
}: { name?: string | null; src?: string | null; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  return (
    <span className={cn('avatar', size !== 'md' && `avatar-${size}`, className)} title={name ?? undefined}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src ? <img src={src} alt={name ?? ''} /> : initials(name)}
    </span>
  );
}

/* ── Misc ───────────────────────────────────────────────── */
export function EmptyState({
  icon, title, description, action,
}: { icon?: React.ReactNode; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="empty-state">
      {icon && <div className="empty-state-icon">{icon}</div>}
      <div>
        <div style={{ fontWeight: 600, color: 'var(--text-strong)' }}>{title}</div>
        {description && <div className="hint" style={{ marginTop: 4 }}>{description}</div>}
      </div>
      {action}
    </div>
  );
}

export function Progress({ value, tone }: { value: number; tone?: string }) {
  return (
    <div className="progress">
      <div className="progress-bar" style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: tone }} />
    </div>
  );
}

export function Alert({
  tone = 'info', icon, children, className, style,
}: { tone?: 'info' | 'success' | 'warning' | 'danger'; icon?: React.ReactNode; children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={cn('alert', `alert-${tone}`, className)} style={style}>
      {icon}
      <div>{children}</div>
    </div>
  );
}

export function PageHeader({
  title, description, actions,
}: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="page-header">
      <div>
        <h1 className="page-title">{title}</h1>
        {description && <p className="page-desc">{description}</p>}
      </div>
      {actions && <div className="toolbar">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label, value, hint, icon, tone, footer,
}: { label: string; value: React.ReactNode; hint?: React.ReactNode; icon?: React.ReactNode; tone?: string; footer?: React.ReactNode }) {
  return (
    <Card hover className="stat-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <span className="stat-label">{label}</span>
        {icon && (
          <span style={{
            display: 'grid', placeItems: 'center', width: 30, height: 30, borderRadius: 8,
            background: tone ? `color-mix(in srgb, ${tone} 14%, transparent)` : 'var(--brand-soft)',
            color: tone ?? 'var(--brand)',
          }}>
            {icon}
          </span>
        )}
      </div>
      <div className="stat-value">{value}</div>
      {hint && <div className="hint">{hint}</div>}
      {footer}
    </Card>
  );
}

export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={cn('skeleton', className)} style={style} />;
}

export function Divider({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <hr className={cn('divider', className)} style={style} />;
}
