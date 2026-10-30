import type { ReactNode } from 'react';
import { initials } from '@/lib/format';
import { PRIORITY_LABELS, type Priority } from '@/lib/types';

export function Avatar({ name, color, size = 'md' }: { name: string; color: string; size?: 'sm' | 'md' }) {
  return (
    <span className={`avatar avatar-${size}`} style={{ background: color }} title={name} aria-label={name}>
      {initials(name)}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return <span className={`priority priority-${priority}`}>{PRIORITY_LABELS[priority]}</span>;
}

export function Notice({
  tone = 'error',
  children,
  onRetry,
  onDismiss,
}: {
  tone?: 'error' | 'info';
  children: ReactNode;
  onRetry?: () => void;
  onDismiss?: () => void;
}) {
  return (
    <div className={`notice notice-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <span className="notice-text">{children}</span>
      {onRetry ? (
        <button type="button" className="btn btn-ghost btn-small" onClick={onRetry}>
          Try again
        </button>
      ) : null}
      {onDismiss ? (
        <button type="button" className="icon-button icon-button-small" onClick={onDismiss} aria-label="Dismiss">
          ×
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty-state">
      <p className="empty-title">{title}</p>
      {children ? <p className="empty-text">{children}</p> : null}
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <span className={`skeleton ${className}`} aria-hidden="true" />;
}
