import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { DbService } from './../src/db.service.js';
import { seedDemoData } from './../src/tracker/seed.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const uniqueKey = () => `T${Math.random().toString(36).slice(2, 8).toUpperCase().padEnd(6, 'X')}`;
const utcDate = (time: number) => new Date(time).toISOString().slice(0, 10);

interface Card {
  id: number;
  key: string;
  status: string;
  position: number;
}

describe('Tracker (e2e)', () => {
  let app: INestApplication<App>;
  let memberId: number;

  const api = () => request(app.getHttpServer());

  async function createProject(): Promise<{ id: number; key: string }> {
    const res = await api().post('/projects').send({ key: uniqueKey(), name: 'Test project' }).expect(201);
    return res.body;
  }

  async function createTask(projectId: number, body: Record<string, unknown> = {}): Promise<Card & { number: number }> {
    const res = await api().post(`/projects/${projectId}/tasks`).send({ title: 'Task', ...body }).expect(201);
    return res.body;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    const members = (await api().get('/members').expect(200)).body;
    memberId = members[0].id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('seeds two demo projects, and seeding again changes nothing', async () => {
    const projects = (await api().get('/projects').expect(200)).body;
    const web = projects.find((project: { key: string }) => project.key === 'WEB');
    expect(projects.map((project: { key: string }) => project.key)).toEqual(expect.arrayContaining(['WEB', 'OPS']));
    expect(web.taskCount).toBeGreaterThanOrEqual(16);
    expect(await seedDemoData(app.get(DbService))).toBe(false);
  });

  it('rejects an invalid project key', async () => {
    await api().post('/projects').send({ key: 'bad key', name: 'Nope' }).expect(400);
  });

  it('numbers tasks per project, keeping numbers unique under concurrent creates', async () => {
    const project = await createProject();
    const tasks = await Promise.all(Array.from({ length: 8 }, (_, index) => createTask(project.id, { title: `Task ${index}` })));

    expect(tasks.map((task) => task.number).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    for (const task of tasks) expect(task.key).toBe(`${project.key}-${task.number}`);
  });

  it('moves a card into another column at a position and logs the move', async () => {
    const project = await createProject();
    const first = await createTask(project.id, { title: 'First', status: 'todo' });
    const second = await createTask(project.id, { title: 'Second', status: 'todo' });
    const third = await createTask(project.id, { title: 'Third', status: 'todo' });

    const moved = (
      await api()
        .patch(`/tasks/${third.id}/move`)
        .send({ status: 'in_progress', position: 0, memberId })
        .expect(200)
    ).body;
    expect(moved).toMatchObject({ status: 'in_progress', position: 0 });

    const board = (await api().get(`/projects/${project.id}/board`).expect(200)).body;
    const column = (status: string): Card[] => board.columns.find((c: { status: string }) => c.status === status).tasks;
    expect(column('todo').map((card) => [card.key, card.position])).toEqual([
      [first.key, 0],
      [second.key, 1],
    ]);
    expect(column('in_progress').map((card) => card.key)).toEqual([third.key]);

    const activity = (await api().get(`/projects/${project.id}/activity`).expect(200)).body;
    expect(activity[0]).toMatchObject({
      text: `moved ${third.key} from To do to In progress`,
      taskKey: third.key,
      member: { id: memberId },
    });
  });

  it('rejects a move to an unknown status', async () => {
    const project = await createProject();
    const task = await createTask(project.id);
    await api().patch(`/tasks/${task.id}/move`).send({ status: 'archived' }).expect(400);
  });

  it('stores a comment with its author and returns it with the task', async () => {
    const project = await createProject();
    const task = await createTask(project.id);

    const comment = (
      await api().post(`/tasks/${task.id}/comments`).send({ memberId, body: 'Looks good' }).expect(201)
    ).body;
    expect(comment).toMatchObject({ body: 'Looks good', taskId: task.id, author: { id: memberId } });

    const detail = (await api().get(`/tasks/${task.id}`).expect(200)).body;
    expect(detail.comments.map((c: { body: string }) => c.body)).toEqual(['Looks good']);

    await api().post(`/tasks/${task.id}/comments`).send({ body: 'No author' }).expect(400);
    await api().post(`/tasks/${task.id}/comments`).send({ memberId: 999999, body: 'Ghost' }).expect(400);
  });

  it('reports open vs done, per-assignee load, overdue tasks and 14 days of completions', async () => {
    const project = await createProject();
    const now = Date.now();
    const finished = await createTask(project.id, { title: 'Finished', assigneeId: memberId });
    await createTask(project.id, { title: 'Open, unassigned' });
    await createTask(project.id, { title: 'Overdue', assigneeId: memberId, dueOn: utcDate(now - DAY_MS) });
    await api().patch(`/tasks/${finished.id}`).send({ status: 'done', memberId }).expect(200);

    const stats = (await api().get(`/projects/${project.id}/stats`).expect(200)).body;
    expect(stats).toMatchObject({ open: 2, done: 1, total: 3, overdue: 1 });
    expect(stats.byAssignee.find((row: { memberId: number }) => row.memberId === memberId)).toMatchObject({
      open: 1,
      done: 1,
    });
    expect(stats.byAssignee.find((row: { memberId: number | null }) => row.memberId === null)).toMatchObject({
      name: 'Unassigned',
      open: 1,
      done: 0,
    });
    expect(stats.completedPerDay).toHaveLength(14);
    expect(stats.completedPerDay.at(-1)).toEqual({ date: utcDate(now), count: 1 });
  });

  it('returns 404 for an unknown project or task', async () => {
    await api().get('/projects/999999/board').expect(404);
    await api().get('/tasks/999999').expect(404);
  });
});
