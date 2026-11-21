import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Claim, Post } from '../shared/types';

const { getClaim, getPost } = vi.hoisted(() => ({ getClaim: vi.fn(), getPost: vi.fn() }));
vi.mock('../shared/api', () => ({ api: { getClaim, getPost } }));
import { loadTicketData, saveTicketCache } from './ticketData';

const claim: Claim = { id: 'claim-1', post_id: 'post-1', device_id: '', display_name: 'Ana', status: 'won', ticket_code: 'K7P2QX', ticket_sig: 'signature', qr: 'signed-qr', created_at: '2026-11-21T17:00:00Z', picked_up_at: null };
const post: Post = { id: 'post-1', org_name: 'Club', title: 'Pizza', building: 'Library (LIB)', room: 'Lobby', portions_total: 1, portions_left: 0, diet_tags: [], photo_url: null, poster_hash: 'hash', created_at: claim.created_at, lottery_ends_at: claim.created_at, expires_at: '2026-11-21T17:15:00Z', status: 'closed' };

beforeEach(() => {
  getClaim.mockReset().mockResolvedValue(claim);
  getPost.mockReset().mockResolvedValue(post);
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => { store.set(key, value); } });
});
afterEach(() => vi.unstubAllGlobals());

describe('ticket loading and offline cache', () => {
  it('loads once and preserves the ticket for offline use', async () => {
    expect(await loadTicketData(claim.id)).toEqual({ claim, post, offline: false });
    expect(getClaim).toHaveBeenCalledTimes(1);
    expect(getPost).toHaveBeenCalledTimes(1);
    getClaim.mockRejectedValue(new Error('Offline'));
    expect(await loadTicketData(claim.id)).toEqual({ claim, post, offline: true });
  });

  it('retains cached location and expiry when the post fetch fails', async () => {
    saveTicketCache(claim.id, claim, post);
    getPost.mockRejectedValue(new Error('Offline'));
    expect(await loadTicketData(claim.id)).toEqual({ claim, post, offline: true });
    getClaim.mockRejectedValue(new Error('Offline'));
    expect((await loadTicketData(claim.id)).post?.expires_at).toBe(post.expires_at);
  });

  it('updates pickup status without losing the cached location', async () => {
    saveTicketCache(claim.id, claim, post);
    const pickedUp = { ...claim, status: 'picked_up' as const };
    saveTicketCache(claim.id, pickedUp, null);
    getClaim.mockRejectedValue(new Error('Offline'));
    expect(await loadTicketData(claim.id)).toEqual({ claim: pickedUp, post, offline: true });
  });

  it('does not resurrect a cached ticket when the server says it is missing', async () => {
    saveTicketCache(claim.id, claim, post);
    getClaim.mockResolvedValue(null);
    await expect(loadTicketData(claim.id)).rejects.toThrow('Ticket not found');
  });

  it('does not use another claim from a corrupted cache', async () => {
    localStorage.setItem(`lb.ticket.${claim.id}`, JSON.stringify({ claim: { ...claim, id: 'another' }, post }));
    getClaim.mockRejectedValue(new Error('Offline'));
    await expect(loadTicketData(claim.id)).rejects.toThrow('Offline');
  });
});
