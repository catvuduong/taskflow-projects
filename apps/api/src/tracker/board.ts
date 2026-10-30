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

export interface Placement {
  id: number;
  status: Status;
  position: number;
}

export function taskKey(projectKey: string, number: number): string {
  return `${projectKey}-${number}`;
}

/** Per-project numbering: one above the highest number ever used in the project. */
export function nextTaskNumber(existing: number[]): number {
  return existing.reduce((highest, number) => Math.max(highest, number), 0) + 1;
}

/**
 * Works out where every card ends up after `taskId` is moved to `toStatus` at index `toPosition`.
 * Columns stay dense (positions 0..n-1), so the source column closes the gap the card left.
 * Returns only the cards whose status or position changed; an out-of-range position appends.
 */
export function planMove(
  cards: Placement[],
  taskId: number,
  toStatus: Status,
  toPosition: number,
): Placement[] {
  if (!cards.some((card) => card.id === taskId)) {
    throw new Error(`task ${taskId} is not on this board`);
  }

  const columns = new Map<Status, number[]>(STATUSES.map((status) => [status, []]));
  const ordered = [...cards].sort((a, b) => a.position - b.position || a.id - b.id);
  for (const card of ordered) {
    if (card.id !== taskId) columns.get(card.status)!.push(card.id);
  }

  const target = columns.get(toStatus)!;
  target.splice(Math.min(Math.max(toPosition, 0), target.length), 0, taskId);

  const before = new Map(cards.map((card) => [card.id, card]));
  const changed: Placement[] = [];
  for (const [status, ids] of columns) {
    ids.forEach((id, position) => {
      const previous = before.get(id)!;
      if (previous.status !== status || previous.position !== position) {
        changed.push({ id, status, position });
      }
    });
  }
  return changed;
}
