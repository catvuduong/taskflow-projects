'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { EmptyState, Notice, Skeleton } from '@/components/ui';
import { useApi } from '@/lib/use-api';
import type { ProjectSummary } from '@/lib/types';

// The home page opens the first project's board, the screen people see first.
export default function Home() {
  const router = useRouter();
  const projects = useApi<ProjectSummary[]>('/projects');
  const firstId = projects.data?.[0]?.id;

  useEffect(() => {
    if (firstId !== undefined) router.replace(`/projects/${firstId}/board`);
  }, [firstId, router]);

  if (projects.error) return <Notice onRetry={projects.reload}>{projects.error}</Notice>;
  if (projects.data && projects.data.length === 0) {
    return <EmptyState title="No projects yet">Create one from the sidebar to get started.</EmptyState>;
  }
  return (
    <div aria-label="Opening your board" className="page-loading">
      <Skeleton className="skeleton-title" />
      <Skeleton className="skeleton-block" />
    </div>
  );
}
