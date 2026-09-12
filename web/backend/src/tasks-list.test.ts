import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { taskListQuerySchema, TasksService } from './tasks';

describe('task list pagination', () => {
  it('normalizes defaults and string query parameters', () => {
    expect(taskListQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20, search: '' });
    expect(taskListQuerySchema.parse({ page: '2', pageSize: '50', search: '  活动  ' })).toEqual({ page: 2, pageSize: 50, search: '活动' });
  });

  it('scopes search and pagination to the current owner', async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: 'task-1' }]);
    const count = vi.fn().mockResolvedValue(21);
    const service = new TasksService({ task: { findMany, count } } as never, {} as never);

    await expect(service.listPage('owner-1', { page: 2, pageSize: 20, search: '问候' })).resolves.toEqual({
      items: [{ id: 'task-1' }], total: 21, page: 2, pageSize: 20,
    });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 20,
      take: 20,
      where: {
        ownerId: 'owner-1',
        OR: [
          { title: { contains: '问候', mode: 'insensitive' } },
          { content: { contains: '问候', mode: 'insensitive' } },
        ],
      },
    }));
    expect(count).toHaveBeenCalledWith({ where: expect.objectContaining({ ownerId: 'owner-1' }) });
  });
});
