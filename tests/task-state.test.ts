import { describe, expect, it } from 'vitest';
import { taskState } from '@/lib/task-state';
import { assertCompletion, syncChecklistProgress } from '@/server/modules/task/mutations';
import { vi } from 'vitest';
describe('Task lifecycle', () => {
  it('completes at 100% and clears completion when reopened', () => {
    const done = taskState('DONE', 20, { status: 'IN_PROGRESS', progress: 20 });
    expect(done.progress).toBe(100);
    expect(done.completedAt).toBeInstanceOf(Date);
    expect(taskState('IN_PROGRESS', undefined, done)).toEqual({ status: 'IN_PROGRESS', progress: 0, completedAt: null });
  });
  it('rejects invalid states and unbounded progress', () => {
    expect(() => taskState('UNKNOWN', 10, { status: 'TODO', progress: 0 })).toThrow();
    expect(() => taskState('TODO', NaN, { status: 'TODO', progress: 0 })).toThrow();
    expect(() => taskState('DONE', 120, { status: 'TODO', progress: 0 })).toThrow();
  });
  it('requires the reviewer before completion and refuses incomplete checklist', async () => {
    const tx = { taskChecklistItem: { count: vi.fn().mockResolvedValue(1) }, task: { count: vi.fn().mockResolvedValue(0) } };
    const ctx = { employeeId: 1, isAdmin: false, permissions: new Set() };
    await expect(assertCompletion(tx as any, ctx as any, { id: 1, reviewerId: 2 })).rejects.toThrow('người kiểm tra');
    await expect(assertCompletion(tx as any, ctx as any, { id: 1, reviewerId: 1 })).rejects.toThrow('checklist');
  });
  it('recalculates progress after checklist composition changes', async () => {
    const tx = { taskChecklistItem: { findMany: vi.fn().mockResolvedValue([{ isDone: true }, { isDone: false }]) }, task: { update: vi.fn() } };
    await syncChecklistProgress(tx as any, 5);
    expect(tx.task.update).toHaveBeenCalledWith({ where: { id: 5 }, data: { progress: 50 } });
  });
});
