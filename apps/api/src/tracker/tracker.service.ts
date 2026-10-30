import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DbService } from '../db.service.js';
import {
  nextTaskNumber,
  planMove,
  STATUS_LABELS,
  STATUSES,
  taskKey,
  type Placement,
  type Priority,
  type Status,
} from './board.js';
import { utcDay, utcDayOffset } from './dates.js';

export interface Member {
  id: number;
  name: string;
  email: string;
  color: string;
}

export interface Project {
  id: number;
  key: string;
  name: string;
  description: string;
}

export interface ProjectSummary extends Project {
  taskCount: number;
  doneCount: number;
}

export interface Task {
  id: number;
  projectId: number;
  key: string;
  number: number;
  title: string;
  description: string;
  status: Status;
  priority: Priority;
  assigneeId: number | null;
  dueOn: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface Comment {
  id: number;
  taskId: number;
  body: string;
  createdAt: string;
  author: { id: number; name: string; color: string };
}

export interface TaskDetail extends Task {
  comments: Comment[];
}

export interface Board {
  project: Project;
  /** Server's UTC date, so the client judges "overdue" the same way the stats do. */
  today: string;
  columns: { status: Status; label: string; tasks: Task[] }[];
}

export interface ActivityItem {
  id: number;
  text: string;
  createdAt: string;
  taskId: number | null;
  taskKey: string | null;
  member: { id: number; name: string; color: string } | null;
}

export interface Stats {
  open: number;
  done: number;
  total: number;
  overdue: number;
  byAssignee: { memberId: number | null; name: string; color: string | null; open: number; done: number }[];
  completedPerDay: { date: string; count: number }[];
}

export interface NewTask {
  title: string;
  description: string;
  status: Status;
  priority: Priority;
  assigneeId: number | null;
  dueOn: string | null;
}

export interface TaskPatch {
  title?: string;
  description?: string;
  status?: Status;
  priority?: Priority;
  assigneeId?: number | null;
  dueOn?: string | null;
}

interface TaskRow {
  id: number;
  project_id: number;
  project_key: string;
  number: number;
  title: string;
  description: string;
  status: Status;
  priority: Priority;
  assignee_id: number | null;
  due_on: string | null;
  position: number;
  created_at: Date;
  updated_at: Date;
}

interface CommentRow {
  id: number;
  task_id: number;
  body: string;
  created_at: Date;
  member_id: number;
  member_name: string;
  member_color: string;
}

interface ActivityRow {
  id: number;
  text: string;
  created_at: Date;
  task_id: number | null;
  number: number | null;
  project_key: string;
  member_id: number | null;
  member_name: string | null;
  member_color: string | null;
}

const TASK_SELECT = `
  SELECT t.id, t.project_id, p.key AS project_key, t.number, t.title, t.description, t.status,
         t.priority, t.assignee_id, t.due_on, t.position, t.created_at, t.updated_at
  FROM tasks t
  JOIN projects p ON p.id = t.project_id`;

const COMMENT_SELECT = `
  SELECT c.id, c.task_id, c.body, c.created_at,
         m.id AS member_id, m.name AS member_name, m.color AS member_color
  FROM comments c
  JOIN members m ON m.id = c.member_id`;

// Moving a card with no explicit position puts it at the bottom of its column.
const APPEND = Number.POSITIVE_INFINITY;

@Injectable()
export class TrackerService {
  constructor(private readonly db: DbService) {}

  listMembers(): Promise<Member[]> {
    return this.db.query<Member>('SELECT id, name, email, color FROM members ORDER BY id');
  }

  listProjects(): Promise<ProjectSummary[]> {
    return this.db.query<ProjectSummary>(`
      SELECT p.id, p.key, p.name, p.description,
             COUNT(t.id)::int AS "taskCount",
             COUNT(t.id) FILTER (WHERE t.status = 'done')::int AS "doneCount"
      FROM projects p
      LEFT JOIN tasks t ON t.project_id = p.id
      GROUP BY p.id
      ORDER BY p.id`);
  }

  async createProject(input: { key: string; name: string; description: string }): Promise<Project> {
    try {
      const [project] = await this.db.query<Project>(
        'INSERT INTO projects (key, name, description) VALUES ($1, $2, $3) RETURNING id, key, name, description',
        [input.key, input.name, input.description],
      );
      return project;
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException(`project key ${input.key} is already taken`);
      throw err;
    }
  }

  async getBoard(projectId: number): Promise<Board> {
    const project = await this.requireProject(projectId);
    const rows = await this.db.query<TaskRow>(
      `${TASK_SELECT} WHERE t.project_id = $1 ORDER BY t.position, t.id`,
      [projectId],
    );
    const tasks = rows.map(taskFromRow);
    return {
      project,
      today: utcDay(new Date()),
      columns: STATUSES.map((status) => ({
        status,
        label: STATUS_LABELS[status],
        tasks: tasks.filter((task) => task.status === status),
      })),
    };
  }

  async createTask(projectId: number, input: NewTask, memberId?: number): Promise<Task> {
    return this.db.transaction(async (client) => {
      // Locking the project row serializes task creation per project, so each new number is unique.
      const project = await lockProject(client, projectId);
      if (memberId !== undefined) await assertMember(client, memberId);
      if (input.assigneeId !== null) await assertMember(client, input.assigneeId);

      const numbers = await client.query<{ number: number }>(
        'SELECT number FROM tasks WHERE project_id = $1',
        [projectId],
      );
      const number = nextTaskNumber(numbers.rows.map((row) => row.number));
      const position = await client.query<{ position: number }>(
        'SELECT COALESCE(MAX(position) + 1, 0) AS position FROM tasks WHERE project_id = $1 AND status = $2',
        [projectId, input.status],
      );

      const inserted = await client.query<{ id: number }>(
        `INSERT INTO tasks (project_id, number, title, description, status, priority, assignee_id, due_on, position)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [
          projectId,
          number,
          input.title,
          input.description,
          input.status,
          input.priority,
          input.assigneeId,
          input.dueOn,
          position.rows[0].position,
        ],
      );
      const task = await requireTask(client, inserted.rows[0].id);
      await logActivity(
        client,
        projectId,
        task.id,
        memberId ?? null,
        `created ${taskKey(project.key, number)} "${input.title}"`,
      );
      return taskFromRow(task);
    });
  }

  async updateTask(taskId: number, patch: TaskPatch, memberId?: number): Promise<Task> {
    return this.db.transaction(async (client) => {
      const cards = await lockBoard(client, taskId);
      const current = await requireTask(client, taskId);
      if (memberId !== undefined) await assertMember(client, memberId);
      if (typeof patch.assigneeId === 'number') await assertMember(client, patch.assigneeId);

      const sets: string[] = [];
      const values: unknown[] = [taskId];
      const changes: string[] = [];
      const set = (column: string, value: unknown, label: string) => {
        values.push(value);
        sets.push(`${column} = $${values.length}`);
        changes.push(label);
      };

      if (patch.title !== undefined && patch.title !== current.title) set('title', patch.title, 'title');
      if (patch.description !== undefined && patch.description !== current.description) {
        set('description', patch.description, 'description');
      }
      if (patch.priority !== undefined && patch.priority !== current.priority) {
        set('priority', patch.priority, 'priority');
      }
      if (patch.assigneeId !== undefined && patch.assigneeId !== current.assignee_id) {
        set('assignee_id', patch.assigneeId, 'assignee');
      }
      if (patch.dueOn !== undefined && patch.dueOn !== current.due_on) set('due_on', patch.dueOn, 'due date');

      if (patch.status !== undefined && patch.status !== current.status) {
        await this.placeCard(client, current, cards, patch.status, APPEND, memberId);
      }

      if (sets.length > 0) {
        await client.query(`UPDATE tasks SET ${sets.join(', ')}, updated_at = now() WHERE id = $1`, values);
        await logActivity(
          client,
          current.project_id,
          taskId,
          memberId ?? null,
          `updated ${taskKey(current.project_key, current.number)}: ${changes.join(', ')}`,
        );
      }
      return taskFromRow(await requireTask(client, taskId));
    });
  }

  async moveTask(taskId: number, status: Status, position: number | undefined, memberId?: number): Promise<Task> {
    return this.db.transaction(async (client) => {
      const cards = await lockBoard(client, taskId);
      const current = await requireTask(client, taskId);
      if (memberId !== undefined) await assertMember(client, memberId);
      await this.placeCard(client, current, cards, status, position ?? APPEND, memberId);
      return taskFromRow(await requireTask(client, taskId));
    });
  }

  async getTask(taskId: number): Promise<TaskDetail> {
    const [row] = await this.db.query<TaskRow>(`${TASK_SELECT} WHERE t.id = $1`, [taskId]);
    if (!row) throw new NotFoundException(`task ${taskId} not found`);
    const comments = await this.db.query<CommentRow>(
      `${COMMENT_SELECT} WHERE c.task_id = $1 ORDER BY c.created_at, c.id`,
      [taskId],
    );
    return { ...taskFromRow(row), comments: comments.map(commentFromRow) };
  }

  async addComment(taskId: number, memberId: number, body: string): Promise<Comment> {
    return this.db.transaction(async (client) => {
      const task = await requireTask(client, taskId);
      await assertMember(client, memberId);
      const inserted = await client.query<{ id: number }>(
        'INSERT INTO comments (task_id, member_id, body) VALUES ($1, $2, $3) RETURNING id',
        [taskId, memberId, body],
      );
      await logActivity(
        client,
        task.project_id,
        taskId,
        memberId,
        `commented on ${taskKey(task.project_key, task.number)}`,
      );
      const row = await client.query<CommentRow>(`${COMMENT_SELECT} WHERE c.id = $1`, [inserted.rows[0].id]);
      return commentFromRow(row.rows[0]);
    });
  }

  async getActivity(projectId: number): Promise<ActivityItem[]> {
    await this.requireProject(projectId);
    const rows = await this.db.query<ActivityRow>(
      `SELECT a.id, a.text, a.created_at, a.task_id, t.number, p.key AS project_key,
              m.id AS member_id, m.name AS member_name, m.color AS member_color
       FROM activity a
       JOIN projects p ON p.id = a.project_id
       LEFT JOIN tasks t ON t.id = a.task_id
       LEFT JOIN members m ON m.id = a.member_id
       WHERE a.project_id = $1
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT 50`,
      [projectId],
    );
    return rows.map((row) => ({
      id: row.id,
      text: row.text,
      createdAt: row.created_at.toISOString(),
      taskId: row.task_id,
      taskKey: row.task_id !== null && row.number !== null ? taskKey(row.project_key, row.number) : null,
      member:
        row.member_id !== null && row.member_name !== null && row.member_color !== null
          ? { id: row.member_id, name: row.member_name, color: row.member_color }
          : null,
    }));
  }

  async getStats(projectId: number): Promise<Stats> {
    await this.requireProject(projectId);
    // Overdue and the 14-day window are both computed in UTC, so they do not depend on the machine timezone.
    const now = new Date();
    const today = utcDay(now);
    const firstDay = utcDayOffset(now, -13);

    const [totals] = await this.db.query<{ open: number; done: number; overdue: number }>(
      `SELECT COUNT(*) FILTER (WHERE status <> 'done')::int AS open,
              COUNT(*) FILTER (WHERE status = 'done')::int AS done,
              COUNT(*) FILTER (WHERE status <> 'done' AND due_on < $2::date)::int AS overdue
       FROM tasks
       WHERE project_id = $1`,
      [projectId, today],
    );

    const byAssignee = await this.db.query<{
      memberId: number | null;
      name: string | null;
      color: string | null;
      open: number;
      done: number;
    }>(
      `SELECT t.assignee_id AS "memberId", m.name, m.color,
              COUNT(*) FILTER (WHERE t.status <> 'done')::int AS open,
              COUNT(*) FILTER (WHERE t.status = 'done')::int AS done
       FROM tasks t
       LEFT JOIN members m ON m.id = t.assignee_id
       WHERE t.project_id = $1
       GROUP BY t.assignee_id, m.name, m.color
       ORDER BY open DESC, m.name NULLS LAST`,
      [projectId],
    );

    // A done task's updated_at is the day it was completed. The column is the last time the task changed.
    const completed = await this.db.query<{ day: string; count: number }>(
      `SELECT to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, COUNT(*)::int AS count
       FROM tasks
       WHERE project_id = $1 AND status = 'done' AND updated_at >= $2::timestamptz
       GROUP BY 1`,
      [projectId, `${firstDay}T00:00:00Z`],
    );
    const countByDay = new Map(completed.map((row) => [row.day, row.count]));
    const completedPerDay = Array.from({ length: 14 }, (_, index) => {
      const date = utcDayOffset(now, index - 13);
      return { date, count: countByDay.get(date) ?? 0 };
    });

    return {
      open: totals.open,
      done: totals.done,
      total: totals.open + totals.done,
      overdue: totals.overdue,
      byAssignee: byAssignee.map((row) => ({
        memberId: row.memberId,
        name: row.name ?? 'Unassigned',
        color: row.color,
        open: row.open,
        done: row.done,
      })),
      completedPerDay,
    };
  }

  private async requireProject(projectId: number): Promise<Project> {
    const [project] = await this.db.query<Project>(
      'SELECT id, key, name, description FROM projects WHERE id = $1',
      [projectId],
    );
    if (!project) throw new NotFoundException(`project ${projectId} not found`);
    return project;
  }

  /**
   * Puts `current` into `toStatus` at `toPosition`, renumbers the columns it touches and logs the move.
   * Must run inside a transaction that already holds the board lock from lockBoard.
   */
  private async placeCard(
    client: PoolClient,
    current: TaskRow,
    cards: Placement[],
    toStatus: Status,
    toPosition: number,
    memberId?: number,
  ): Promise<void> {
    const changed = planMove(cards, current.id, toStatus, toPosition);
    const statusChanged = toStatus !== current.status;
    for (const card of changed) {
      // Only a real status change counts as an update; renumbering a neighbour must not move its completion date.
      const bumpUpdatedAt = card.id === current.id && statusChanged;
      await client.query(
        `UPDATE tasks SET status = $2, position = $3${bumpUpdatedAt ? ', updated_at = now()' : ''} WHERE id = $1`,
        [card.id, card.status, card.position],
      );
    }

    const key = taskKey(current.project_key, current.number);
    if (statusChanged) {
      await logActivity(
        client,
        current.project_id,
        current.id,
        memberId ?? null,
        `moved ${key} from ${STATUS_LABELS[current.status]} to ${STATUS_LABELS[toStatus]}`,
      );
    } else if (changed.length > 0) {
      await logActivity(
        client,
        current.project_id,
        current.id,
        memberId ?? null,
        `reordered ${key} in ${STATUS_LABELS[toStatus]}`,
      );
    }
  }
}

function taskFromRow(row: TaskRow): Task {
  return {
    id: row.id,
    projectId: row.project_id,
    key: taskKey(row.project_key, row.number),
    number: row.number,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    assigneeId: row.assignee_id,
    dueOn: row.due_on,
    position: row.position,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function commentFromRow(row: CommentRow): Comment {
  return {
    id: row.id,
    taskId: row.task_id,
    body: row.body,
    createdAt: row.created_at.toISOString(),
    author: { id: row.member_id, name: row.member_name, color: row.member_color },
  };
}

async function lockProject(client: PoolClient, projectId: number): Promise<{ id: number; key: string }> {
  const res = await client.query<{ id: number; key: string }>(
    'SELECT id, key FROM projects WHERE id = $1 FOR UPDATE',
    [projectId],
  );
  if (res.rowCount === 0) throw new NotFoundException(`project ${projectId} not found`);
  return res.rows[0];
}

/**
 * Locks every task on the board of `taskId`, in id order, so concurrent moves and edits on one board
 * queue up instead of deadlocking. Returns the board's cards as they stand under the lock.
 */
async function lockBoard(client: PoolClient, taskId: number): Promise<Placement[]> {
  const res = await client.query<Placement>(
    `SELECT id, status, position FROM tasks
     WHERE project_id = (SELECT project_id FROM tasks WHERE id = $1)
     ORDER BY id
     FOR UPDATE`,
    [taskId],
  );
  if (!res.rows.some((row) => row.id === taskId)) throw new NotFoundException(`task ${taskId} not found`);
  return res.rows;
}

async function requireTask(client: PoolClient, taskId: number): Promise<TaskRow> {
  const res = await client.query<TaskRow>(`${TASK_SELECT} WHERE t.id = $1`, [taskId]);
  if (res.rowCount === 0) throw new NotFoundException(`task ${taskId} not found`);
  return res.rows[0];
}

async function assertMember(client: PoolClient, memberId: number): Promise<void> {
  const res = await client.query('SELECT 1 FROM members WHERE id = $1', [memberId]);
  if (res.rowCount === 0) throw new BadRequestException(`member ${memberId} does not exist`);
}

async function logActivity(
  client: PoolClient,
  projectId: number,
  taskId: number | null,
  memberId: number | null,
  text: string,
): Promise<void> {
  await client.query(
    'INSERT INTO activity (project_id, task_id, member_id, text) VALUES ($1, $2, $3, $4)',
    [projectId, taskId, memberId, text],
  );
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
}
