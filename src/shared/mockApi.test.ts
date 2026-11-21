import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NewPostInput } from './types';

const input: NewPostInput = {
  org_name: 'Test Club', title: 'Sandwiches', building: 'Library (LIB)', room: 'Lobby',
  portions_total: 2, diet_tags: ['vegetarian'], duration_min: 15,
};

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-21T17:00:00Z'));
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
  });
  vi.stubGlobal('BroadcastChannel', undefined);
});

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('mock pickup lifecycle', () => {
  it('runs post → draw → signed ticket → code lookup → pickup → board', async () => {
    const { api, verifyScannedTicket } = await import('./api');
    await api.getOrCreateProfile('Ana');
    const before = await api.getImpactStats();
    const post = await api.createPost(input);
    const joined = await api.claim(post.id);
    expect(joined.ok && joined.claim.status).toBe('pending');
    if (!joined.ok) throw new Error('Expected a pending claim');
    vi.setSystemTime(Date.parse(post.lottery_ends_at) + 1);
    await api.resolveLotteryIfDue(post.id);
    const ticket = await api.getClaim(joined.claim.id);
    expect(ticket?.qr).toBeTruthy();
    expect(await verifyScannedTicket(ticket!.qr!)).toMatchObject({ valid: true, postId: post.id });
    expect((await api.findClaimByCode(post.id, ticket!.ticket_code!))?.id).toBe(ticket!.id);
    expect((await api.getPost(post.id))?.portions_left).toBe(1);
    await api.markPickedUp(ticket!.id);
    await expect(api.markPickedUp(ticket!.id)).rejects.toThrow('Already picked up');
    expect((await api.getImpactStats()).mealsRescued).toBe(before.mealsRescued + 1);
    expect(await api.listRecentPickups()).toContainEqual(expect.objectContaining({ display_name: 'Ana', org_name: 'Test Club' }));
  });

  it('retains posts and profiles when browser storage is unavailable', async () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('Unavailable'); }, setItem: () => { throw new Error('Unavailable'); } });
    const { api } = await import('./api');
    await api.getOrCreateProfile('Ana');
    const post = await api.createPost(input);
    expect((await api.getPost(post.id))?.title).toBe('Sandwiches');
    expect((await api.getOrCreateProfile())?.display_name).toBe('Ana');
    expect((await api.claim(post.id)).ok).toBe(true);
  });

  it('rejects pickup after expiry even without a feed refresh', async () => {
    const { api } = await import('./api');
    const post = await api.createPost({ ...input, portions_total: 1 });
    const joined = await api.claim(post.id);
    if (!joined.ok) throw new Error('Expected a claim');
    vi.setSystemTime(Date.parse(post.lottery_ends_at) + 1);
    await api.resolveLotteryIfDue(post.id);
    expect((await api.getPost(post.id))?.status).toBe('closed');
    vi.setSystemTime(Date.parse(post.expires_at));
    await expect(api.markPickedUp(joined.claim.id)).rejects.toThrow('Ticket is not valid');
    expect((await api.getClaim(joined.claim.id))?.status).toBe('expired');
  });

  it('does not draw winners or accept claims after the post expires', async () => {
    const { api } = await import('./api');
    const post = await api.createPost(input);
    const joined = await api.claim(post.id);
    if (!joined.ok) throw new Error('Expected a claim');
    vi.setSystemTime(Date.parse(post.expires_at));
    await api.resolveLotteryIfDue(post.id);
    expect((await api.getClaim(joined.claim.id))?.status).not.toBe('won');
    expect(await api.claim(post.id)).toMatchObject({ ok: false, reason: 'post_closed' });
  });
});
