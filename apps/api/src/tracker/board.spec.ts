import { nextTaskNumber, planMove, taskKey, type Placement } from './board.js';

// Sorted by id so assertions do not depend on the order planMove happens to return changes in.
const byId = (cards: Placement[]) => [...cards].sort((a, b) => a.id - b.id);

describe('nextTaskNumber', () => {
  it('starts a project at 1', () => {
    expect(nextTaskNumber([])).toBe(1);
  });

  it('continues from the highest number, even with gaps', () => {
    expect(nextTaskNumber([1, 2, 7])).toBe(8);
    expect(nextTaskNumber([3])).toBe(4);
  });

  it('builds keys like WEB-12', () => {
    expect(taskKey('WEB', nextTaskNumber([1, 11]))).toBe('WEB-12');
  });
});

describe('planMove', () => {
  const board: Placement[] = [
    { id: 1, status: 'todo', position: 0 },
    { id: 2, status: 'todo', position: 1 },
    { id: 3, status: 'todo', position: 2 },
    { id: 4, status: 'in_progress', position: 0 },
    { id: 5, status: 'in_progress', position: 1 },
  ];

  it('re-orders inside a column and renumbers it densely', () => {
    const changed = planMove(board, 3, 'todo', 0);
    expect(byId(changed)).toEqual([
      { id: 1, status: 'todo', position: 1 },
      { id: 2, status: 'todo', position: 2 },
      { id: 3, status: 'todo', position: 0 },
    ]);
  });

  it('inserts into another column and closes the gap in the source', () => {
    const changed = planMove(board, 1, 'in_progress', 1);
    expect(byId(changed)).toEqual([
      { id: 1, status: 'in_progress', position: 1 },
      { id: 2, status: 'todo', position: 0 },
      { id: 3, status: 'todo', position: 1 },
      { id: 5, status: 'in_progress', position: 2 },
    ]);
  });

  it('appends when the position is past the end of the column', () => {
    const changed = planMove(board, 1, 'in_progress', 99);
    expect(byId(changed)).toContainEqual({ id: 1, status: 'in_progress', position: 2 });
  });

  it('places into an empty column at position 0 whatever position was asked for', () => {
    expect(byId(planMove(board, 4, 'done', 5))).toEqual([
      { id: 4, status: 'done', position: 0 },
      { id: 5, status: 'in_progress', position: 0 },
    ]);
  });

  it('reports no changes when a card is dropped where it already is', () => {
    expect(planMove(board, 2, 'todo', 1)).toEqual([]);
  });

  it('rejects a card that is not on the board', () => {
    expect(() => planMove(board, 42, 'done', 0)).toThrow('task 42 is not on this board');
  });
});
