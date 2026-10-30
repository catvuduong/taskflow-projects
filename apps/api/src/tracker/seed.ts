import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DbService } from '../db.service.js';
import { STATUS_LABELS, STATUSES, taskKey, type Priority, type Status } from './board.js';
import { daysAgo, utcDayOffset } from './dates.js';

// Fixed key so concurrent boots serialize on one advisory lock and only the first one seeds.
const SEED_LOCK = 727275;

const MEMBERS = [
  { name: 'Ava Chen', email: 'ava@example.com', color: '#6366f1' },
  { name: 'Marcus Reyes', email: 'marcus@example.com', color: '#0ea5e9' },
  { name: 'Priya Nair', email: 'priya@example.com', color: '#10b981' },
  { name: 'Leo Hoffman', email: 'leo@example.com', color: '#f59e0b' },
  { name: 'Sofia Rossi', email: 'sofia@example.com', color: '#ec4899' },
];

const PROJECTS = [
  { key: 'WEB', name: 'Website relaunch', description: 'Marketing site, docs and onboarding for the Q4 launch.' },
  { key: 'OPS', name: 'Platform operations', description: 'On-call tooling, infrastructure upkeep and reliability work.' },
];

interface SeedTask {
  project: 'WEB' | 'OPS';
  title: string;
  status: Status;
  priority: Priority;
  /** Index into MEMBERS. */
  assignee: number | null;
  /** Days from today (UTC). Negative means overdue while the task is open. */
  due: number | null;
  /** Days ago the task was created. */
  created: number;
  /** Days ago it reached its current status. For done tasks this is the completion day. */
  moved?: number;
  description?: string;
}

// Task numbers are assigned in list order per project, so these are WEB-1..WEB-16 and OPS-1..OPS-14.
const TASKS: SeedTask[] = [
  { project: 'WEB', title: 'Audit legacy landing pages', status: 'backlog', priority: 'low', assignee: null, due: null, created: 13 },
  {
    project: 'WEB',
    title: 'Write pricing FAQ copy',
    status: 'backlog',
    priority: 'medium',
    assignee: 4,
    due: 14,
    created: 12,
    description: 'Cover billing cycles, seat limits and trial rules. Legal reviews after the first draft.',
  },
  { project: 'WEB', title: 'Define signup funnel analytics events', status: 'backlog', priority: 'high', assignee: 2, due: null, created: 11 },
  { project: 'WEB', title: 'Localize onboarding for DE and FR', status: 'todo', priority: 'medium', assignee: 1, due: 5, created: 10, moved: 8 },
  { project: 'WEB', title: 'Design new hero section', status: 'todo', priority: 'high', assignee: 4, due: 2, created: 9, moved: 7 },
  { project: 'WEB', title: 'Migrate blog to MDX', status: 'todo', priority: 'low', assignee: 3, due: -3, created: 13, moved: 12 },
  {
    project: 'WEB',
    title: 'Wire up newsletter opt-in',
    status: 'in_progress',
    priority: 'high',
    assignee: 0,
    due: 1,
    created: 11,
    moved: 6,
    description: 'Double opt-in through the existing email provider. Needs the confirmation template.',
  },
  { project: 'WEB', title: 'Responsive nav for tablet widths', status: 'in_progress', priority: 'medium', assignee: 1, due: -1, created: 10, moved: 5 },
  { project: 'WEB', title: 'Customer logo wall component', status: 'review', priority: 'medium', assignee: 2, due: 0, created: 9, moved: 3 },
  {
    project: 'WEB',
    title: 'Fix Safari flicker on theme switch',
    status: 'review',
    priority: 'urgent',
    assignee: 0,
    due: -2,
    created: 8,
    moved: 2,
    description: 'The theme class lands after first paint on Safari 17. Reproduce with a hard reload in dark mode.',
  },
  { project: 'WEB', title: 'Set up preview deployments', status: 'done', priority: 'medium', assignee: 3, due: null, created: 12, moved: 1 },
  { project: 'WEB', title: 'Add Lighthouse budget to CI', status: 'done', priority: 'low', assignee: 0, due: null, created: 12, moved: 3 },
  { project: 'WEB', title: 'Rewrite meta descriptions', status: 'done', priority: 'low', assignee: 4, due: null, created: 10, moved: 6 },
  { project: 'WEB', title: 'Accessibility pass on pricing table', status: 'done', priority: 'high', assignee: 2, due: null, created: 13, moved: 9 },
  { project: 'WEB', title: 'Cookie banner copy review', status: 'done', priority: 'medium', assignee: 1, due: null, created: 11, moved: 7 },
  { project: 'WEB', title: 'Pricing page A/B test readout', status: 'done', priority: 'high', assignee: 0, due: null, created: 7, moved: 0 },

  { project: 'OPS', title: 'Rotate database credentials', status: 'backlog', priority: 'high', assignee: 3, due: 10, created: 9 },
  { project: 'OPS', title: 'Reduce alert noise on queue depth', status: 'backlog', priority: 'medium', assignee: null, due: null, created: 8 },
  { project: 'OPS', title: 'Write runbook for cache failover', status: 'todo', priority: 'high', assignee: 2, due: 3, created: 12, moved: 10 },
  {
    project: 'OPS',
    title: 'Upgrade Postgres to 16.4',
    status: 'todo',
    priority: 'urgent',
    assignee: 3,
    due: -1,
    created: 13,
    moved: 11,
    description: 'Replicas first, then the primary in the Sunday low-traffic window.',
  },
  { project: 'OPS', title: 'Capacity review for Q1', status: 'todo', priority: 'low', assignee: 4, due: 21, created: 7, moved: 4 },
  { project: 'OPS', title: 'API latency p95 dashboards', status: 'in_progress', priority: 'medium', assignee: 1, due: 4, created: 11, moved: 6 },
  { project: 'OPS', title: 'Tighten CI IAM roles', status: 'in_progress', priority: 'urgent', assignee: 0, due: 2, created: 10, moved: 5 },
  { project: 'OPS', title: 'Backup restore drill', status: 'review', priority: 'high', assignee: 1, due: -4, created: 12, moved: 4 },
  { project: 'OPS', title: 'Fix flaky deploy health check', status: 'review', priority: 'medium', assignee: 0, due: 1, created: 9, moved: 2 },
  { project: 'OPS', title: 'Nightly job timeout alerts', status: 'done', priority: 'medium', assignee: 2, due: null, created: 13, moved: 8 },
  { project: 'OPS', title: 'Move cron jobs to queue workers', status: 'done', priority: 'high', assignee: 3, due: null, created: 12, moved: 5 },
  { project: 'OPS', title: 'Certificate auto-renewal', status: 'done', priority: 'high', assignee: 4, due: null, created: 11, moved: 8 },
  { project: 'OPS', title: 'Log retention policy', status: 'done', priority: 'low', assignee: 2, due: null, created: 10, moved: 9 },
  { project: 'OPS', title: 'Incident postmortem template', status: 'done', priority: 'low', assignee: 0, due: null, created: 9, moved: 1 },
];

interface SeedComment {
  /** Task key, e.g. 'WEB-4'. */
  task: string;
  /** Index into MEMBERS. */
  by: number;
  /** Days ago the comment was posted. */
  ago: number;
  body: string;
}

const COMMENTS: SeedComment[] = [
  { task: 'WEB-4', by: 1, ago: 8, body: 'German strings are in the translation sheet. We need a native speaker to review them before we ship.' },
  { task: 'WEB-5', by: 4, ago: 7, body: 'Three hero variants are in Figma. Leaning toward the one with the product screenshot.' },
  { task: 'WEB-5', by: 0, ago: 5, body: "Agreed. Let's test the screenshot variant against the headline-only one first." },
  { task: 'WEB-6', by: 3, ago: 12, body: 'Pilot with two posts converted cleanly. The remaining posts go next sprint.' },
  { task: 'WEB-7', by: 0, ago: 6, body: 'Double opt-in is wired up. Waiting on the email template from legal.' },
  { task: 'WEB-9', by: 2, ago: 3, body: 'Logos are optimised. Only the grid collapse under 640px is left.' },
  { task: 'WEB-10', by: 0, ago: 2, body: 'Reproduces every time on Safari 17 when switching twice in a row. Fix is in review.' },
  { task: 'WEB-10', by: 3, ago: 1, body: 'Confirmed on iOS as well. Adding a regression test before merge.' },
  { task: 'WEB-14', by: 2, ago: 9, body: 'Contrast on the disabled plan rows was failing. Fixed and re-audited.' },
  { task: 'WEB-16', by: 0, ago: 0, body: 'Variant B lifted signups by 9%. Rolling it out to everyone.' },
  { task: 'OPS-3', by: 2, ago: 10, body: 'Draft runbook is in the wiki. Failover steps still need a rehearsal in staging.' },
  { task: 'OPS-4', by: 3, ago: 11, body: 'Upgrade plan drafted: replicas first, then the primary in the low-traffic window.' },
  { task: 'OPS-7', by: 0, ago: 5, body: 'Scoped the deploy role to ECR push and ECS deploy only. Reviewing with security.' },
  { task: 'OPS-8', by: 1, ago: 4, body: "Restore from last night's snapshot took 38 minutes. Within the RTO, but close." },
  { task: 'OPS-11', by: 3, ago: 5, body: 'Every cron job now runs on the queue workers. Old crontab removed.' },
];

/**
 * Inserts the demo projects, members, tasks, comments and activity once. Returns false if they already exist.
 * Dates are relative to `now`, so the stats chart and overdue counts look populated whenever the seed first runs.
 */
export function seedDemoData(db: DbService, now: Date = new Date()): Promise<boolean> {
  return db.transaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock($1)', [SEED_LOCK]);
    const marker = await client.query('SELECT 1 FROM projects WHERE key = $1', [PROJECTS[0].key]);
    if (marker.rowCount) return false;

    const memberIds: number[] = [];
    for (const member of MEMBERS) {
      const res = await client.query<{ id: number }>(
        `INSERT INTO members (name, email, color) VALUES ($1, $2, $3)
         ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, color = EXCLUDED.color
         RETURNING id`,
        [member.name, member.email, member.color],
      );
      memberIds.push(res.rows[0].id);
    }

    const projectIds = new Map<string, number>();
    for (const project of PROJECTS) {
      const res = await client.query<{ id: number }>(
        'INSERT INTO projects (key, name, description) VALUES ($1, $2, $3) RETURNING id',
        [project.key, project.name, project.description],
      );
      projectIds.set(project.key, res.rows[0].id);
    }

    const numbers = new Map<string, number>();
    const positions = new Map<string, number>();
    const placed = new Map<string, { id: number; projectId: number }>();
    for (const task of TASKS) {
      const projectId = projectIds.get(task.project)!;
      const number = (numbers.get(task.project) ?? 0) + 1;
      numbers.set(task.project, number);
      const slot = `${task.project}:${task.status}`;
      const position = positions.get(slot) ?? 0;
      positions.set(slot, position + 1);

      const key = taskKey(task.project, number);
      const assigneeId = task.assignee === null ? null : memberIds[task.assignee];
      const created = daysAgo(now, task.created);
      const moved = task.moved === undefined ? created : daysAgo(now, task.moved);
      const res = await client.query<{ id: number }>(
        `INSERT INTO tasks (project_id, number, title, description, status, priority, assignee_id, due_on,
                            position, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING id`,
        [
          projectId,
          number,
          task.title,
          task.description ?? '',
          task.status,
          task.priority,
          assigneeId,
          task.due === null ? null : utcDayOffset(now, task.due),
          position,
          created,
          task.status === 'backlog' ? created : moved,
        ],
      );
      const taskId = res.rows[0].id;
      placed.set(key, { id: taskId, projectId });

      const actor = assigneeId ?? memberIds[0];
      await insertActivity(client, projectId, taskId, actor, created, `created ${key} "${task.title}"`);
      if (task.status !== 'backlog') {
        const from = STATUSES[STATUSES.indexOf(task.status) - 1];
        await insertActivity(
          client,
          projectId,
          taskId,
          actor,
          moved,
          `moved ${key} from ${STATUS_LABELS[from]} to ${STATUS_LABELS[task.status]}`,
        );
      }
    }

    for (const comment of COMMENTS) {
      const target = placed.get(comment.task);
      if (!target) throw new Error(`seed comment targets unknown task ${comment.task}`);
      const at = daysAgo(now, comment.ago);
      const memberId = memberIds[comment.by];
      await client.query(
        'INSERT INTO comments (task_id, member_id, body, created_at) VALUES ($1, $2, $3, $4)',
        [target.id, memberId, comment.body, at],
      );
      await insertActivity(client, target.projectId, target.id, memberId, at, `commented on ${comment.task}`);
    }

    return true;
  });
}

async function insertActivity(
  client: PoolClient,
  projectId: number,
  taskId: number,
  memberId: number,
  at: Date,
  text: string,
): Promise<void> {
  await client.query(
    'INSERT INTO activity (project_id, task_id, member_id, text, created_at) VALUES ($1, $2, $3, $4, $5)',
    [projectId, taskId, memberId, text, at],
  );
}

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(private readonly db: DbService) {}

  async onApplicationBootstrap(): Promise<void> {
    // SEED_DEMO=false turns the demo data off, for example in a real deployment.
    if (!this.db.enabled || process.env.SEED_DEMO === 'false') return;
    try {
      if (await seedDemoData(this.db)) this.logger.log('seeded demo projects');
    } catch (err) {
      this.logger.error('demo seed failed', err instanceof Error ? err.stack : String(err));
    }
  }
}
