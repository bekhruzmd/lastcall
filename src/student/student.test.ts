import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isMuted, setMuted } from './sound';
import { api, verifyScannedTicket } from '../shared/api';

describe('Student View Utilities & Logic', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, val: string) => {
        store.set(key, String(val));
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => {
        store.clear();
      },
    });
  });

  it('handles mute state persistence in localStorage', () => {
    setMuted(true);
    expect(isMuted()).toBe(true);
    setMuted(false);
    expect(isMuted()).toBe(false);
  });

  it('can create and update profile via api', async () => {
    const profile = await api.getOrCreateProfile('TestStudent');
    expect(profile).not.toBeNull();
    expect(profile?.display_name).toBe('TestStudent');

    const updated = await api.updateProfile({
      display_name: 'Alex',
      diet_prefs: ['vegetarian', 'halal'],
      priority: true,
    });
    expect(updated.display_name).toBe('Alex');
    expect(updated.diet_prefs).toEqual(['vegetarian', 'halal']);
    expect(updated.priority).toBe(true);
  });

  it('claims a post during lottery window as pending', async () => {
    await api.getOrCreateProfile('Sam');
    const post = await api.createPost({
      org_name: 'IEEE',
      title: 'Free Pizza',
      building: 'Engineering Building II (ENB)',
      room: '109',
      portions_total: 5,
      diet_tags: ['vegetarian'],
      duration_min: 30,
    });

    const claimRes = await api.claim(post.id);
    expect(claimRes.ok).toBe(true);
    if (claimRes.ok) {
      expect(claimRes.claim.post_id).toBe(post.id);
      expect(claimRes.claim.status).toBe('pending');
    }
  });

  it('claims an open post and receives a valid signed ticket', async () => {
    await api.getOrCreateProfile('Jordan');
    // The seeded mock database contains active posts in 'open' status
    const activePosts = await api.listActivePosts();
    const openPost = activePosts.find((p) => p.status === 'open' && p.portions_left > 0);
    expect(openPost).toBeDefined();

    if (openPost) {
      const claimRes = await api.claim(openPost.id);
      expect(claimRes.ok).toBe(true);

      if (claimRes.ok) {
        expect(claimRes.claim.status).toBe('won');
        expect(claimRes.claim.ticket_code).toHaveLength(6);
        expect(claimRes.claim.qr).toBeDefined();

        // Offline verification of ticket QR
        const verification = await verifyScannedTicket(claimRes.claim.qr!);
        expect(verification.valid).toBe(true);
        expect(verification.postId).toBe(openPost.id);
        expect(verification.claimId).toBe(claimRes.claim.id);
        expect(verification.code).toBe(claimRes.claim.ticket_code);
      }
    }
  });

  it('enforces one claim per device per post', async () => {
    await api.getOrCreateProfile('Taylor');
    const post = await api.createPost({
      org_name: 'ACM',
      title: 'Cookies',
      building: 'Computer Sciences (CIS)',
      room: '101',
      portions_total: 3,
      diet_tags: [],
      duration_min: 15,
    });

    const first = await api.claim(post.id);
    expect(first.ok).toBe(true);

    const second = await api.claim(post.id);
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.reason).toBe('already_claimed');
    }
  });
});
