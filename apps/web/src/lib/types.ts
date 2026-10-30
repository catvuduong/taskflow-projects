// Mirrors the API's response shapes (apps/api/src/tracker). Keep the two in step by hand.

export const STATUSES = ['backlog', 'todo', 'in_progress', 'review', 'done'] as const;
export type Status = (typeof STATUSES)[number];

export const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const STATUS_LABELS: Record<Status, string> = {
  backlog: 'Backlog',
  todo: 'To do',
  in_progress: 'In progress',
  review: 'Review',
  done: 'Done',
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
};

export interface Member {
  id: number;
  name: string;
  email: string;
  color: string;
}

export interface ProjectSummary {
  id: number;
  key: string;
  name: string;
  description: string;
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
  project: { id: number; key: string; name: string; description: string };
  today: string;
  columns: { status: Status; label: string; tasks: Task[] }[];
}

export interface Stats {
  open: number;
  done: number;
  total: number;
  overdue: number;
  byAssignee: { memberId: number | null; name: string; color: string | null; open: number; done: number }[];
  completedPerDay: { date: string; count: number }[];
}

export interface ActivityItem {
  id: number;
  text: string;
  createdAt: string;
  taskId: number | null;
  taskKey: string | null;
  member: { id: number; name: string; color: string } | null;
}
