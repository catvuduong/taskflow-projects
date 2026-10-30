'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, errorMessage } from '@/lib/api';
import { formatWhen } from '@/lib/format';
import { useApi } from '@/lib/use-api';
import { useWorkspace } from '@/lib/workspace';
import { PRIORITIES, PRIORITY_LABELS, STATUSES, STATUS_LABELS, type Member, type Priority, type Status, type TaskDetail } from '@/lib/types';
import { Avatar, EmptyState, Notice, Skeleton } from './ui';

interface TaskPanelProps {
  taskId: number;
  members: Member[];
  onChanged: () => void;
  onClose: () => void;
}

export function TaskPanel({ taskId, members, onChanged, onClose }: TaskPanelProps) {
  const { actingAs } = useWorkspace();
  const detail = useApi<TaskDetail>(`/tasks/${taskId}`);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Focus once on open. Re-running it on every render would pull focus out of the field being edited.
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // Every edit goes straight to the API, then both this panel and the board refetch.
  async function save(body: Record<string, unknown>) {
    setError(null);
    try {
      await api(`/tasks/${taskId}`, { method: 'PATCH', body: { ...body, memberId: actingAs?.id } });
      detail.reload();
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function postComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || !actingAs) return;
    setPosting(true);
    setError(null);
    try {
      await api(`/tasks/${taskId}/comments`, { method: 'POST', body: { memberId: actingAs.id, body } });
      setDraft('');
      detail.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPosting(false);
    }
  }

  const task = detail.data;

  return (
    <>
      <button type="button" className="panel-scrim" aria-label="Close task" onClick={onClose} />
      <aside className="panel" data-testid="task-panel" role="dialog" aria-label={task ? `Task ${task.key}` : 'Task'}>
        <header className="panel-head">
          <span className="task-key">{task?.key ?? ' '}</span>
          <button ref={closeRef} type="button" className="icon-button" onClick={onClose} aria-label="Close panel">
            ×
          </button>
        </header>

        <div className="panel-body">
          {error ? <Notice onDismiss={() => setError(null)}>{error}</Notice> : null}
          {detail.error ? <Notice onRetry={detail.reload}>{detail.error}</Notice> : null}
          {!task && !detail.error ? (
            <div className="panel-loading" aria-label="Loading task">
              <Skeleton className="skeleton-title" />
              <Skeleton className="skeleton-block" />
            </div>
          ) : null}

          {task ? (
            <>
              {/* Keyed on updatedAt so the uncontrolled inputs pick up the saved values after every refetch. */}
              <div className="panel-fields" key={task.updatedAt}>
                <label className="field field-wide">
                  <span>Title</span>
                  <input
                    className="input input-title"
                    defaultValue={task.title}
                    maxLength={200}
                    onBlur={(event) => {
                      const title = event.currentTarget.value.trim();
                      if (title && title !== task.title) void save({ title });
                    }}
                  />
                </label>

                <label className="field">
                  <span>Status</span>
                  <select
                    className="input"
                    value={task.status}
                    onChange={(event) => void save({ status: event.target.value as Status })}
                  >
                    {STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {STATUS_LABELS[status]}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Priority</span>
                  <select
                    className="input"
                    value={task.priority}
                    onChange={(event) => void save({ priority: event.target.value as Priority })}
                  >
                    {PRIORITIES.map((priority) => (
                      <option key={priority} value={priority}>
                        {PRIORITY_LABELS[priority]}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Assignee</span>
                  <select
                    className="input"
                    value={task.assigneeId ?? ''}
                    onChange={(event) => void save({ assigneeId: event.target.value === '' ? null : Number(event.target.value) })}
                  >
                    <option value="">Unassigned</option>
                    {members.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Due date</span>
                  <input
                    className="input"
                    type="date"
                    defaultValue={task.dueOn ?? ''}
                    onBlur={(event) => {
                      const dueOn = event.currentTarget.value || null;
                      if (dueOn !== task.dueOn) void save({ dueOn });
                    }}
                  />
                </label>

                <label className="field field-wide">
                  <span>Description</span>
                  <textarea
                    className="input"
                    rows={4}
                    maxLength={5000}
                    placeholder="Add more detail…"
                    defaultValue={task.description}
                    onBlur={(event) => {
                      const description = event.currentTarget.value.trim();
                      if (description !== task.description) void save({ description });
                    }}
                  />
                </label>
              </div>

              <section className="panel-section" aria-labelledby="comments-heading">
                <h3 id="comments-heading" className="section-title">
                  Comments <span className="count">{task.comments.length}</span>
                </h3>
                {task.comments.length === 0 ? (
                  <EmptyState title="No comments yet" />
                ) : (
                  <ul className="comments">
                    {task.comments.map((comment) => (
                      <li key={comment.id} className="comment">
                        <Avatar name={comment.author.name} color={comment.author.color} size="sm" />
                        <div className="comment-body">
                          <div className="comment-meta">
                            <strong>{comment.author.name}</strong>
                            <time dateTime={comment.createdAt}>{formatWhen(comment.createdAt)}</time>
                          </div>
                          <p>{comment.body}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                <form className="comment-form" onSubmit={postComment}>
                  <textarea
                    className="input"
                    aria-label="Comment"
                    rows={3}
                    maxLength={5000}
                    value={draft}
                    placeholder={actingAs ? `Comment as ${actingAs.name}` : 'Add a comment'}
                    onChange={(event) => setDraft(event.target.value)}
                  />
                  <div className="comment-actions">
                    <button type="submit" className="btn btn-primary btn-small" disabled={posting || !draft.trim() || !actingAs}>
                      {posting ? 'Posting…' : 'Comment'}
                    </button>
                  </div>
                </form>
              </section>
            </>
          ) : null}
        </div>
      </aside>
    </>
  );
}
