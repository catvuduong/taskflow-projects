import { BadRequestException, Body, Controller, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { PRIORITIES, STATUSES } from './board.js';
import {
  id,
  optionalDay,
  optionalNullableId,
  optionalOneOf,
  optionalPosition,
  optionalText,
  requireText,
  oneOf,
} from './input.js';
import { TrackerService } from './tracker.service.js';

const PROJECT_KEY = /^[A-Z][A-Z0-9]{1,9}$/;

type JsonBody = Record<string, unknown> | undefined;

@Controller()
export class TrackerController {
  constructor(private readonly tracker: TrackerService) {}

  @Get('members')
  listMembers() {
    return this.tracker.listMembers();
  }

  @Get('projects')
  listProjects() {
    return this.tracker.listProjects();
  }

  @Post('projects')
  createProject(@Body() body: JsonBody) {
    const key = requireText(body?.key, 'key', 10).toUpperCase();
    if (!PROJECT_KEY.test(key)) {
      throw new BadRequestException('key must be 2-10 letters or digits and start with a letter');
    }
    return this.tracker.createProject({
      key,
      name: requireText(body?.name, 'name', 80),
      description: optionalText(body?.description, 'description', 500) ?? '',
    });
  }

  @Get('projects/:id/board')
  getBoard(@Param('id', ParseIntPipe) projectId: number) {
    return this.tracker.getBoard(projectId);
  }

  @Post('projects/:id/tasks')
  createTask(@Param('id', ParseIntPipe) projectId: number, @Body() body: JsonBody) {
    return this.tracker.createTask(
      projectId,
      {
        title: requireText(body?.title, 'title', 200),
        description: optionalText(body?.description, 'description', 5000) ?? '',
        status: optionalOneOf(body?.status, STATUSES, 'status') ?? 'backlog',
        priority: optionalOneOf(body?.priority, PRIORITIES, 'priority') ?? 'medium',
        assigneeId: optionalNullableId(body?.assigneeId, 'assigneeId') ?? null,
        dueOn: optionalDay(body?.dueOn, 'dueOn') ?? null,
      },
      optionalMemberId(body),
    );
  }

  @Get('projects/:id/activity')
  getActivity(@Param('id', ParseIntPipe) projectId: number) {
    return this.tracker.getActivity(projectId);
  }

  @Get('projects/:id/stats')
  getStats(@Param('id', ParseIntPipe) projectId: number) {
    return this.tracker.getStats(projectId);
  }

  @Get('tasks/:id')
  getTask(@Param('id', ParseIntPipe) taskId: number) {
    return this.tracker.getTask(taskId);
  }

  @Patch('tasks/:id')
  updateTask(@Param('id', ParseIntPipe) taskId: number, @Body() body: JsonBody) {
    return this.tracker.updateTask(
      taskId,
      {
        title: body?.title === undefined ? undefined : requireText(body.title, 'title', 200),
        description: optionalText(body?.description, 'description', 5000),
        status: optionalOneOf(body?.status, STATUSES, 'status'),
        priority: optionalOneOf(body?.priority, PRIORITIES, 'priority'),
        assigneeId: optionalNullableId(body?.assigneeId, 'assigneeId'),
        dueOn: optionalDay(body?.dueOn, 'dueOn'),
      },
      optionalMemberId(body),
    );
  }

  @Patch('tasks/:id/move')
  moveTask(@Param('id', ParseIntPipe) taskId: number, @Body() body: JsonBody) {
    return this.tracker.moveTask(
      taskId,
      oneOf(body?.status, STATUSES, 'status'),
      optionalPosition(body?.position),
      optionalMemberId(body),
    );
  }

  @Post('tasks/:id/comments')
  addComment(@Param('id', ParseIntPipe) taskId: number, @Body() body: JsonBody) {
    return this.tracker.addComment(
      taskId,
      id(body?.memberId, 'memberId'),
      requireText(body?.body, 'body', 5000),
    );
  }
}

/** The member acting in the UI, used for the activity feed. Optional so scripts can call the API without one. */
function optionalMemberId(body: JsonBody): number | undefined {
  return body?.memberId === undefined ? undefined : id(body.memberId, 'memberId');
}
