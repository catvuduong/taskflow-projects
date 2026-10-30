'use client';

import type { DragEvent } from 'react';
import { formatDay } from '@/lib/format';
import type { Member, Status, Task } from '@/lib/types';
import { MoveMenu } from './move-menu';
import { Avatar, PriorityBadge } from './ui';

interface TaskCardProps {
  task: Task;
  assignee: Member | undefined;
  today: string;
  dragging: boolean;
  onOpen: () => void;
  onMove: (status: Status) => void;
  onDragStart: (event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
}

export function TaskCard({ task, assignee, today, dragging, onOpen, onMove, onDragStart, onDragEnd }: TaskCardProps) {
  const overdue = task.dueOn !== null && task.status !== 'done' && task.dueOn < today;

  return (
    <article
      className={`task-card${dragging ? ' is-dragging' : ''}`}
      data-testid="task-card"
      data-task-id={task.id}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpen}
    >
      <div className="task-card-top">
        <span className="task-key">{task.key}</span>
        <PriorityBadge priority={task.priority} />
      </div>
      <button type="button" className="task-title" onClick={onOpen}>
        {task.title}
      </button>
      <div className="task-card-foot">
        {task.dueOn ? (
          <span className={`due${overdue ? ' is-overdue' : ''}`} title={overdue ? 'Overdue' : 'Due date'}>
            {overdue ? 'Overdue · ' : ''}
            {formatDay(task.dueOn)}
          </span>
        ) : (
          <span />
        )}
        <div className="task-card-actions">
          {assignee ? (
            <Avatar name={assignee.name} color={assignee.color} size="sm" />
          ) : (
            <span className="avatar avatar-sm avatar-empty" aria-label="Unassigned">
              –
            </span>
          )}
          <MoveMenu current={task.status} onMove={onMove} />
        </div>
      </div>
    </article>
  );
}
