'use client';

import Link from 'next/link';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useState, type FormEvent, type ReactNode } from 'react';
import { api, errorMessage } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { useWorkspace, WorkspaceProvider } from '@/lib/workspace';
import type { Member, ProjectSummary } from '@/lib/types';
import { Notice, Skeleton } from './ui';
import { ThemeToggle } from './theme-toggle';

export function AppShell({ children }: { children: ReactNode }) {
  const params = useParams<{ id?: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const projects = useApi<ProjectSummary[]>('/projects');
  const members = useApi<Member[]>('/members');
  const [navOpen, setNavOpen] = useState(false);

  const activeId = params.id ? Number(params.id) : null;
  const activeProject = projects.data?.find((project) => project.id === activeId);
  const base = activeId === null ? null : `/projects/${activeId}`;

  return (
    <WorkspaceProvider members={members.data ?? []}>
      <div className={`shell${navOpen ? ' shell-nav-open' : ''}`}>
        <aside className="sidebar" aria-label="Sidebar">
          <Link href="/" className="brand" onClick={() => setNavOpen(false)}>
            <span className="brand-mark" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="16" height="16">
                <rect x="3" y="4" width="5" height="16" rx="1.5" fill="currentColor" />
                <rect x="10" y="4" width="5" height="10" rx="1.5" fill="currentColor" opacity=".6" />
                <rect x="17" y="4" width="4" height="7" rx="1.5" fill="currentColor" opacity=".35" />
              </svg>
            </span>
            Taskflow
          </Link>

          <div className="sidebar-section">
            <h2 className="sidebar-heading">Projects</h2>
            {projects.error ? <p className="sidebar-error">{projects.error}</p> : null}
            {projects.data === undefined && projects.error === undefined ? (
              <div className="sidebar-skeleton" aria-label="Loading projects">
                <Skeleton className="skeleton-row" />
                <Skeleton className="skeleton-row" />
              </div>
            ) : null}
            <nav className="project-list" aria-label="Projects">
              {projects.data?.map((project) => (
                <Link
                  key={project.id}
                  href={`/projects/${project.id}/board`}
                  className={`project-link${project.id === activeId ? ' is-active' : ''}`}
                  aria-current={project.id === activeId ? 'page' : undefined}
                  onClick={() => setNavOpen(false)}
                >
                  <span className="project-key">{project.key}</span>
                  <span className="project-name">{project.name}</span>
                  <span className="project-count" title="Done of total tasks">
                    {project.doneCount}/{project.taskCount}
                  </span>
                </Link>
              ))}
            </nav>
            <NewProjectForm
              onCreated={(project) => {
                projects.reload();
                setNavOpen(false);
                router.push(`/projects/${project.id}/board`);
              }}
            />
          </div>

          <div className="sidebar-footer">
            <ActingAs />
            <ApiHealth />
          </div>
        </aside>

        {navOpen ? (
          <button type="button" className="nav-scrim" aria-label="Close navigation" onClick={() => setNavOpen(false)} />
        ) : null}

        <div className="main">
          <header className="topbar">
            <button
              type="button"
              className="icon-button nav-toggle"
              aria-label="Open navigation"
              aria-expanded={navOpen}
              onClick={() => setNavOpen(true)}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
            <div className="crumbs">
              {activeProject ? (
                <>
                  <span className="crumb-key">{activeProject.key}</span>
                  <span className="crumb-name">{activeProject.name}</span>
                </>
              ) : (
                <span className="crumb-name">Projects</span>
              )}
            </div>
            {base ? (
              <nav className="tabs" aria-label="Project views">
                <Link href={base} className={`tab${pathname === base ? ' is-active' : ''}`} aria-current={pathname === base ? 'page' : undefined}>
                  Overview
                </Link>
                <Link
                  href={`${base}/board`}
                  className={`tab${pathname === `${base}/board` ? ' is-active' : ''}`}
                  aria-current={pathname === `${base}/board` ? 'page' : undefined}
                >
                  Board
                </Link>
              </nav>
            ) : null}
            <div className="topbar-spacer" />
            <ThemeToggle />
          </header>
          {members.error ? <Notice>{members.error}</Notice> : null}
          <main className="content">{children}</main>
        </div>
      </div>
    </WorkspaceProvider>
  );
}

function ActingAs() {
  const { members, actingAs, setActingAs } = useWorkspace();
  if (members.length === 0) return null;
  return (
    <label className="acting-as">
      <span className="acting-as-label">Acting as</span>
      <select value={actingAs?.id} onChange={(event) => setActingAs(Number(event.target.value))}>
        {members.map((member) => (
          <option key={member.id} value={member.id}>
            {member.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function ApiHealth() {
  const health = useApi<{ status: string; db: string }>('/health');
  const text = health.data
    ? `api ${health.data.status} / db ${health.data.db}`
    : health.error
      ? 'api unreachable'
      : 'checking…';
  return (
    <p className="api-health" data-testid="health">
      {text}
    </p>
  );
}

function NewProjectForm({ onCreated }: { onCreated: (project: { id: number }) => void }) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const project = await api<{ id: number }>('/projects', { method: 'POST', body: { key, name } });
      setOpen(false);
      setKey('');
      setName('');
      onCreated(project);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="sidebar-add" onClick={() => setOpen(true)}>
        + New project
      </button>
    );
  }

  return (
    <form className="new-project" onSubmit={submit}>
      <input
        aria-label="Project key"
        placeholder="Key, e.g. WEB"
        value={key}
        maxLength={10}
        onChange={(event) => setKey(event.target.value.toUpperCase())}
        required
      />
      <input
        aria-label="Project name"
        placeholder="Project name"
        value={name}
        maxLength={80}
        onChange={(event) => setName(event.target.value)}
        required
      />
      {error ? <p className="form-error">{error}</p> : null}
      <div className="new-project-actions">
        <button type="submit" className="btn btn-primary btn-small" disabled={saving}>
          {saving ? 'Creating…' : 'Create'}
        </button>
        <button type="button" className="btn btn-ghost btn-small" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
