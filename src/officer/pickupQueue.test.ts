import { beforeEach, describe, expect, it, vi } from 'vitest';

const listClaimsForPost = vi.fn();
const markPickedUp = vi.fn();
vi.mock('../shared/api', () => ({ api: { listClaimsForPost, markPickedUp } }));
const pickup = { claimId: 'claim-a', postId: 'post-a', name: 'Ana', code: 'K7P2QX' };

beforeEach(() => {
  vi.resetModules();
  listClaimsForPost.mockReset();
  markPickedUp.mockReset();
  const entries = new Map<string, string>();
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value); },
  });
});

describe('officer offline pickup queue', () => {
  it('persists across reload and deduplicates repeated scans', async () => {
    let queue = await import('./pickupQueue');
    expect(queue.queuePickup(pickup)).toBe(true);
    queue.queuePickup(pickup);
    vi.resetModules();
    queue = await import('./pickupQueue');
    expect(queue.readQueue()).toEqual([pickup]);
  });

  it('keeps an offline pickup, then records it exactly once on reconnect', async () => {
    const queue = await import('./pickupQueue');
    queue.queuePickup(pickup);
    vi.stubGlobal('navigator', { onLine: false });
    await queue.syncPickups();
    expect(listClaimsForPost).not.toHaveBeenCalled();
    expect(queue.readQueue()).toHaveLength(1);
    vi.stubGlobal('navigator', { onLine: true });
    listClaimsForPost.mockResolvedValue([{ id: 'claim-a', post_id: 'post-a', status: 'won' }]);
    markPickedUp.mockResolvedValue(undefined);
    await Promise.all([queue.syncPickups(), queue.syncPickups()]);
    expect(markPickedUp).toHaveBeenCalledExactlyOnceWith('claim-a');
    expect(queue.readQueue()).toEqual([]);
  });

  it('clears a pickup already recorded by the server without marking twice', async () => {
    const queue = await import('./pickupQueue');
    queue.queuePickup(pickup);
    listClaimsForPost.mockResolvedValue([{ id: 'claim-a', post_id: 'post-a', status: 'picked_up' }]);
    await queue.syncPickups();
    expect(markPickedUp).not.toHaveBeenCalled();
    expect(queue.readQueue()).toEqual([]);
  });

  it('retains failed requests for the next retry', async () => {
    const queue = await import('./pickupQueue');
    queue.queuePickup(pickup);
    listClaimsForPost.mockRejectedValue(new Error('Network unavailable'));
    await queue.syncPickups();
    expect(queue.readQueue()).toEqual([{ ...pickup, issue: 'Network unavailable' }]);
    listClaimsForPost.mockResolvedValue([{ id: 'claim-a', post_id: 'post-a', status: 'won' }]);
    await queue.syncPickups();
    expect(queue.readQueue()).toEqual([]);
  });

  it('does not lose the in-memory pickup if browser storage fills up', async () => {
    const queue = await import('./pickupQueue');
    vi.stubGlobal('localStorage', { getItem: () => '[]', setItem: () => { throw new Error('Quota exceeded'); } });
    expect(queue.queuePickup(pickup)).toBe(false);
    expect(queue.readQueue()).toEqual([pickup]);
  });

  it('explains expired pickups and continues syncing other tickets', async () => {
    const queue = await import('./pickupQueue');
    queue.queuePickup(pickup);
    queue.queuePickup({ ...pickup, claimId: 'claim-b', code: 'ABCD23' });
    listClaimsForPost.mockResolvedValue([
      { id: 'claim-a', post_id: 'post-a', status: 'expired' },
      { id: 'claim-b', post_id: 'post-a', status: 'won' },
    ]);
    await queue.syncPickups();
    expect(markPickedUp).toHaveBeenCalledExactlyOnceWith('claim-b');
    expect(queue.readQueue()).toEqual([{ ...pickup, issue: expect.stringContaining('expired') }]);
    vi.resetModules();
    expect((await import('./pickupQueue')).readQueue()[0].issue).toContain('expired');
  });

  it('retains a record when pickup fails after a successful status check', async () => {
    const queue = await import('./pickupQueue');
    queue.queuePickup(pickup);
    listClaimsForPost.mockResolvedValue([{ id: 'claim-a', post_id: 'post-a', status: 'won' }]);
    markPickedUp.mockRejectedValueOnce(new Error('Connection lost'));
    await queue.syncPickups();
    expect(queue.readQueue()[0].issue).toBe('Connection lost');
    await queue.syncPickups();
    expect(queue.readQueue()).toEqual([]);
  });

  it('does not lose a new pickup queued while a request is in flight', async () => {
    const queue = await import('./pickupQueue');
    queue.queuePickup(pickup);
    let finish!: (claims: unknown[]) => void;
    listClaimsForPost.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const sync = queue.syncPickups();
    const second = { ...pickup, claimId: 'claim-b' };
    queue.queuePickup(second);
    finish([{ id: 'claim-a', post_id: 'post-a', status: 'won' }]);
    await sync;
    expect(queue.readQueue()).toEqual([second]);
  });

});
