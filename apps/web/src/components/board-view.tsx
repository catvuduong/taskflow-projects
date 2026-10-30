'use client';

import { useParams } from 'next/navigation';
import { Fragment, useState, type DragEvent, type FormEvent } from 'react';
import { api, errorMessage } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { useWorkspace } from '@/lib/workspace';
import { PRIORITIES, PRIORITY_LABELS, type Board, type Priority, type Status, type Task } from '@/lib/types';
import { TaskCard } from './task-card';
import { TaskPanel } from './task-panel';
import { EmptyState, Notice, Skeleton } from './ui';

const COLUMN_TONE: Record<Status, string> = {
  backlog: 'slate',
  todo: 'sky',
  in_progress: 'blue',
  review: 'violet',
  done: 'green',
};

export function BoardView() {
  const { id } = useParams<{ id: string }>();
  const projectId = Number(id);
  const board = useApi<Board>(`/projects/${projectId}/board`);
  const { members, actingAs } = useWorkspace();
  const actingId = actingAs?.id;

  const [assigneeFilter, setAssigneeFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | Priority>('all');
  const [openTaskId, setOpenTaskId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [dragTaskId, setDragTaskId] = useState<number | null>(null);
  // beforeId is the card the placeholder sits above; null means the bottom of the column.
  const [dropTarget, setDropTarget] = useState<{ status: Status; beforeId: number | null } | null>(null);

  // Runs a mutation, then refetches the board. Returns whether it worked so forms know when to clear.
  async function run(action: () => Promise<unknown>): Promise<boolean> {
    setActionError(null);
    try {
      await action();
      board.reload();
      return true;
    } catch (err) {
      setActionError(errorMessage(err));
      return false;
    }
  }

  function moveTask(taskId: number, status: Status, position?: number) {
    return run(() => api(`/tasks/${taskId}/move`, { method: 'PATCH', body: { status, position, memberId: actingId } }));
  }

  function createTask(status: Status, title: string) {
    return run(() => api(`/projects/${projectId}/tasks`, { method: 'POST', body: { title, status, memberId: actingId } }));
  }

  const filtersActive = assigneeFilter !== 'all' || priorityFilter !== 'all';
  const matches = (task: Task) =>
    (assigneeFilter === 'all' ||
      (assigneeFilter === 'none' ? task.assigneeId === null : task.assigneeId === Number(assigneeFilter))) &&
    (priorityFilter === 'all' || task.priority === priorityFilter);

  function onDragStart(event: DragEvent<HTMLElement>, task: Task) {
    // Firefox only starts a drag when some data is set.
    event.dataTransfer.setData('text/plain', task.key);
    event.dataTransfer.effectAllowed = 'move';
    setDragTaskId(task.id);
  }

  function onDragOver(event: DragEvent<HTMLElement>, status: Status) {
    if (dragTaskId === null) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const beforeId = cardBelow(event.currentTarget, event.clientY, dragTaskId);
    if (dropTarget?.status !== status || dropTarget.beforeId !== beforeId) setDropTarget({ status, beforeId });
  }

  function onDrop(event: DragEvent<HTMLElement>, status: Status, column: Task[]) {
    if (dragTaskId === null) return;
    event.preventDefault();
    const taskId = dragTaskId;
    const beforeId = cardBelow(event.currentTarget, event.clientY, taskId);
    setDragTaskId(null);
    setDropTarget(null);
    // Position counts the other cards in the column, so the dragged card itself is not part of the index.
    const others = column.filter((task) => task.id !== taskId).map((task) => task.id);
    void moveTask(taskId, status, beforeId === null ? undefined : others.indexOf(beforeId));
  }

  function onDragLeave(event: DragEvent<HTMLElement>, status: Status) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setDropTarget((current) => (current?.status === status ? null : current));
  }

  if (board.error) return <Notice onRetry={board.reload}>{board.error}</Notice>;
  if (!board.data) return <BoardSkeleton />;

  const { columns, today, project } = board.data;
  const totalTasks = columns.reduce((sum, column) => sum + column.tasks.length, 0);
  const openTask = openTaskId === null ? undefined : columns.flatMap((column) => column.tasks).find((task) => task.id === openTaskId);

  return (
    <div className="board-page">
      <div className="page-head">
        <div>
          <p className="eyebrow">{project.key}</p>
          <h1>{project.name}</h1>
          {project.description ? <p className="page-sub">{project.description}</p> : null}
        </div>
        <div className="filters">
          <label className="filter">
            <span>Assignee</span>
            <select value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.target.value)}>
              <option value="all">Everyone</option>
              <option value="none">Unassigned</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </label>
          <label className="filter">
            <span>Priority</span>
            <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value as 'all' | Priority)}>
              <option value="all">All priorities</option>
              {PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {PRIORITY_LABELS[priority]}
                </option>
              ))}
            </select>
          </label>
          {filtersActive ? (
            <button
              type="button"
              className="btn btn-ghost btn-small"
              onClick={() => {
                setAssigneeFilter('all');
                setPriorityFilter('all');
              }}
            >
              Clear filters
            </button>
          ) : null}
        </div>
      </div>

      {actionError ? <Notice onDismiss={() => setActionError(null)}>{actionError}</Notice> : null}
      {totalTasks === 0 ? (
        <EmptyState title="No tasks yet">Add the first one with the “Add task” row in any column.</EmptyState>
      ) : null}

      <div className="board" role="region" aria-label="Board">
        {columns.map((column) => {
          const visible = column.tasks.filter(matches);
          const showDropAtEnd = dropTarget?.status === column.status && dropTarget.beforeId === null;
          return (
            <section
              key={column.status}
              className={`column column-${COLUMN_TONE[column.status]}`}
              data-testid={`board-column-${column.status}`}
              aria-labelledby={`column-${column.status}`}
              onDragOver={(event) => onDragOver(event, column.status)}
              onDragLeave={(event) => onDragLeave(event, column.status)}
              onDrop={(event) => onDrop(event, column.status, column.tasks)}
            >
              <header className="column-head">
                <span className="column-dot" aria-hidden="true" />
                <h2 id={`column-${column.status}`}>{column.label}</h2>
                <span className="count" aria-label={`${visible.length} tasks`}>
                  {visible.length}
                </span>
              </header>

              <div className="column-body">
                {visible.map((task) => (
                  <Fragment key={task.id}>
                    {dropTarget?.status === column.status && dropTarget.beforeId === task.id ? <DropLine /> : null}
                    <TaskCard
                      task={task}
                      assignee={members.find((member) => member.id === task.assigneeId)}
                      today={today}
                      dragging={dragTaskId === task.id}
                      onOpen={() => setOpenTaskId(task.id)}
                      onMove={(status) => void moveTask(task.id, status)}
                      onDragStart={(event) => onDragStart(event, task)}
                      onDragEnd={() => {
                        setDragTaskId(null);
                        setDropTarget(null);
                      }}
                    />
                  </Fragment>
                ))}
                {showDropAtEnd ? <DropLine /> : null}
                {visible.length === 0 && !showDropAtEnd ? (
                  <p className="column-empty">{filtersActive ? 'No matching tasks' : 'Drop tasks here'}</p>
                ) : null}
              </div>

              <QuickCreate label={column.label} onCreate={(title) => createTask(column.status, title)} />
            </section>
          );
        })}
      </div>

      {openTaskId !== null ? (
        openTask ? (
          <TaskPanel
            taskId={openTaskId}
            members={members}
            onChanged={board.reload}
            onClose={() => setOpenTaskId(null)}
          />
        ) : null
      ) : null}
    </div>
  );
}

/** The id of the first visible card whose midpoint is below the pointer, or null for the bottom. */
function cardBelow(column: HTMLElement, clientY: number, draggingId: number): number | null {
  for (const card of column.querySelectorAll<HTMLElement>('[data-task-id]')) {
    const id = Number(card.dataset.taskId);
    if (id === draggingId) continue;
    const rect = card.getBoundingClientRect();
    if (clientY < rect.top + rect.height / 2) return id;
  }
  return null;
}

function DropLine() {
  return <div className="drop-line" aria-hidden="true" />;
}

function QuickCreate({ label, onCreate }: { label: string; onCreate: (title: string) => Promise<boolean> }) {
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    setSaving(true);
    const created = await onCreate(trimmed);
    setSaving(false);
    if (created) setTitle('');
  }

  return (
    <form className="quick-create" onSubmit={submit}>
      <input
        aria-label={`New task in ${label}`}
        placeholder="+ Add task"
        value={title}
        maxLength={200}
        disabled={saving}
        onChange={(event) => setTitle(event.target.value)}
      />
    </form>
  );
}

function BoardSkeleton() {
  return (
    <div className="board-page" aria-label="Loading board">
      <div className="page-head">
        <div>
          <Skeleton className="skeleton-eyebrow" />
          <Skeleton className="skeleton-title" />
        </div>
      </div>
      <div className="board">
        {['backlog', 'todo', 'in_progress', 'review', 'done'].map((status) => (
          <div key={status} className="column">
            <Skeleton className="skeleton-row" />
            <Skeleton className="skeleton-card" />
            <Skeleton className="skeleton-card" />
          </div>
        ))}
      </div>
    </div>
  );
}
