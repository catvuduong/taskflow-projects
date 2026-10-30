'use client';

import { useParams } from 'next/navigation';
import { formatWhen } from '@/lib/format';
import { useApi } from '@/lib/use-api';
import type { ActivityItem, Stats } from '@/lib/types';
import { CompletionChart } from './completion-chart';
import { Avatar, EmptyState, Notice, Skeleton } from './ui';

export function OverviewView() {
  const { id } = useParams<{ id: string }>();
  const stats = useApi<Stats>(`/projects/${id}/stats`);
  const activity = useApi<ActivityItem[]>(`/projects/${id}/activity`);

  if (stats.error) return <Notice onRetry={stats.reload}>{stats.error}</Notice>;
  if (!stats.data) return <OverviewSkeleton />;

  const { open, done, total, overdue, byAssignee, completedPerDay } = stats.data;
  const donePercent = total === 0 ? 0 : Math.round((done / total) * 100);

  return (
    <div className="overview">
      <div className="page-head">
        <div>
          <p className="eyebrow">Overview</p>
          <h1>Project health</h1>
        </div>
      </div>

      <section className="stat-grid" aria-label="Summary">
        <StatCard testId="stat-open" label="Open" value={open} hint={`${total} tasks in total`} />
        <StatCard testId="stat-done" label="Done" value={done} hint={`${donePercent}% complete`} tone="good" />
        <StatCard
          testId="stat-overdue"
          label="Overdue"
          value={overdue}
          hint={overdue === 0 ? 'Nothing past due' : 'Past due and still open'}
          tone={overdue > 0 ? 'critical' : undefined}
        />
        <StatCard testId="stat-total" label="Total" value={total} hint="Across all columns" />
      </section>

      <div className="overview-grid">
        <section className="card card-wide" aria-labelledby="completion-heading">
          <header className="card-head">
            <div>
              <h2 id="completion-heading">Completed per day</h2>
              <p className="card-sub">Last 14 days, UTC</p>
            </div>
          </header>
          <CompletionChart data={completedPerDay} />
        </section>

        <section className="card" aria-labelledby="workload-heading">
          <header className="card-head">
            <div>
              <h2 id="workload-heading">Workload</h2>
              <p className="card-sub">Tasks per assignee</p>
            </div>
          </header>
          {byAssignee.length === 0 ? (
            <EmptyState title="No tasks yet" />
          ) : (
            <ul className="workload">
              {byAssignee.map((row) => {
                const count = row.open + row.done;
                const share = count === 0 ? 0 : Math.round((row.done / count) * 100);
                return (
                  <li key={row.memberId ?? 'none'} className="workload-row">
                    {row.color ? (
                      <Avatar name={row.name} color={row.color} size="sm" />
                    ) : (
                      <span className="avatar avatar-sm avatar-empty" aria-hidden="true">
                        –
                      </span>
                    )}
                    <div className="workload-main">
                      <div className="workload-line">
                        <span className="workload-name">{row.name}</span>
                        <span className="workload-counts">
                          {row.open} open · {row.done} done
                        </span>
                      </div>
                      <div className="meter" role="img" aria-label={`${share}% of ${row.name}'s tasks are done`}>
                        <span style={{ width: `${share}%` }} />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="card" aria-labelledby="activity-heading">
          <header className="card-head">
            <div>
              <h2 id="activity-heading">Activity</h2>
              <p className="card-sub">Latest changes across the project</p>
            </div>
          </header>
          <ActivityFeed items={activity.data} error={activity.error} onRetry={activity.reload} />
        </section>
      </div>
    </div>
  );
}

function StatCard({
  testId,
  label,
  value,
  hint,
  tone,
}: {
  testId: string;
  label: string;
  value: number;
  hint: string;
  tone?: 'good' | 'critical';
}) {
  return (
    <article className={`stat${tone ? ` stat-${tone}` : ''}`} data-testid={testId}>
      <p className="stat-label">{label}</p>
      <p className="stat-value">{value}</p>
      <p className="stat-hint">{hint}</p>
    </article>
  );
}

function ActivityFeed({
  items,
  error,
  onRetry,
}: {
  items: ActivityItem[] | undefined;
  error: string | undefined;
  onRetry: () => void;
}) {
  if (error) return <Notice onRetry={onRetry}>{error}</Notice>;
  if (!items) {
    return (
      <div className="feed-loading" aria-label="Loading activity">
        <Skeleton className="skeleton-row" />
        <Skeleton className="skeleton-row" />
        <Skeleton className="skeleton-row" />
      </div>
    );
  }
  if (items.length === 0) return <EmptyState title="No activity yet">Moves, edits and comments show up here.</EmptyState>;

  return (
    <ol className="feed">
      {items.map((item) => (
        <li key={item.id} className="feed-item" data-testid="activity-item">
          {item.member ? (
            <Avatar name={item.member.name} color={item.member.color} size="sm" />
          ) : (
            <span className="avatar avatar-sm avatar-empty" aria-hidden="true">
              ·
            </span>
          )}
          <div className="feed-body">
            <p>
              {item.member ? <strong>{item.member.name} </strong> : null}
              {item.text}
            </p>
            <time dateTime={item.createdAt}>{formatWhen(item.createdAt)}</time>
          </div>
        </li>
      ))}
    </ol>
  );
}

function OverviewSkeleton() {
  return (
    <div className="overview" aria-label="Loading overview">
      <div className="page-head">
        <div>
          <Skeleton className="skeleton-eyebrow" />
          <Skeleton className="skeleton-title" />
        </div>
      </div>
      <section className="stat-grid">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="skeleton-stat" />
        ))}
      </section>
      <div className="overview-grid">
        <Skeleton className="skeleton-block card-wide" />
        <Skeleton className="skeleton-block" />
      </div>
    </div>
  );
}
