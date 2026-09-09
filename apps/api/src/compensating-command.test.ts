import { describe, expect, it } from 'vitest';
import { withCompensating } from './compensating-command.js';

describe('withCompensating (S24)', () => {
  it('attaches RESTORE_OBJECT for SET_PARAMETER length', () => {
    const t0 = performance.now();
    const cmd = withCompensating(
      {
        id: 'cmd:1',
        type: 'SET_PARAMETER',
        targetIds: ['param:d01:length'],
        payload: { id: 'param:d01:length', path: 'lengthMm', value: 2100 },
      },
      { lengthMm: 2300 },
    );
    expect(performance.now() - t0).toBeLessThan(2);
    expect(cmd.compensating?.type).toBe('RESTORE_OBJECT');
    expect((cmd.compensating?.payload['object'] as { value: number }).value).toBe(2300);
  });

  it('attaches DELETE_OBJECT for CREATE_OBJECT', () => {
    const cmd = withCompensating(
      {
        id: 'cmd:2',
        type: 'CREATE_OBJECT',
        targetIds: ['folder:1'],
        payload: { id: 'folder:1', object: { id: 'folder:1' } },
      },
      {},
    );
    expect(cmd.compensating).toEqual({ type: 'DELETE_OBJECT', payload: { id: 'folder:1' } });
  });
});
