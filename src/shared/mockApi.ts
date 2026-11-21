// In-memory backend for building the UI without Supabase.
// State lives in localStorage and changes are broadcast to other tabs,
// so a feed tab, an officer tab and a board tab stay in sync.

import * as ed from '@noble/ed25519';
import type { Api } from './api';
import { lotterySeconds } from './constants';
import { getDeviceId } from './identity';
import { drawWinners } from './lottery';
import { b64urlEncode, buildQr, randomTicketCode, signPayload } from './ticket';
import type { Claim, ClaimResult, Post, Profile } from './types';

// Fixed development key. Never used outside mock mode.
const MOCK_SECRET = new Uint8Array(32).map((_, i) => (i * 37 + 11) % 256);
let mockPublicKey: Promise<string> | null = null;
export function mockTicketPublicKey(): Promise<string> {
  if (!mockPublicKey) mockPublicKey = ed.getPublicKeyAsync(MOCK_SECRET).then(b64urlEncode);
  return mockPublicKey;
}

interface State {
  profiles: Record<string, Profile & { priority: boolean }>;
  posts: Post[];
  claims: Claim[];
}

const KEY = 'lb.mock.v1';
const DAY = 86_400_000;

function iso(ms: number) {
  return new Date(ms).toISOString();
}

function seed(): State {
  const now = Date.now();
  const profiles: State['profiles'] = {};
  const names = ['Ana', 'Marcus', 'Priya', 'Diego', 'Lena', 'Kofi'];
  names.forEach((n, i) => {
    profiles[`demo-${i}`] = {
      device_id: `demo-${i}`,
      display_name: n,
      diet_prefs: [],
      priority: i === 2,
      created_at: iso(now - 30 * DAY),
    };
  });
  const post = (o: Partial<Post>): Post => ({
    id: crypto.randomUUID(),
    org_name: 'SHPE',
    title: 'Pizza',
    building: 'Engineering Building II (ENB)',
    room: '109',
    portions_total: 10,
    portions_left: 10,
    diet_tags: [],
    photo_url: null,
    poster_device_id: 'demo-0',
    created_at: iso(now - 5 * 60_000),
    lottery_ends_at: iso(now - 4 * 60_000),
    expires_at: iso(now + 25 * 60_000),
    status: 'open',
    ...o,
  });
  const posts = [
    post({ title: '12 slices cheese pizza', portions_total: 12, portions_left: 7 }),
    post({
      org_name: 'Muslim Student Association',
      title: 'Chicken shawarma wraps',
      building: 'Marshall Student Center (MSC)',
      room: '2708',
      portions_total: 8,
      portions_left: 5,
      diet_tags: ['halal'],
    }),
  ];
  // Win history so the weighting is visible.
  const claims: Claim[] = [];
  [3, 2, 1, 0, 0, 0].forEach((wins, i) => {
    for (let w = 0; w < wins; w++) {
      claims.push({
        id: crypto.randomUUID(),
        post_id: 'history',
        device_id: `demo-${i}`,
        display_name: names[i],
        status: 'picked_up',
        ticket_code: null,
        ticket_sig: null,
        created_at: iso(now - (w + 1) * DAY),
        picked_up_at: iso(now - (w + 1) * DAY),
      });
    }
  });
  return { profiles, posts, claims };
}

function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* fall through */
  }
  return seed();
}

let state: State = load();
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('lb-mock') : null;
type Listener = (kind: 'post' | 'claim', row: Post | Claim) => void;
const listeners = new Set<Listener>();

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* in-memory only */
  }
}

function emit(kind: 'post' | 'claim', row: Post | Claim) {
  save();
  listeners.forEach((l) => l(kind, row));
  channel?.postMessage({ kind, row });
}

channel?.addEventListener('message', (ev: MessageEvent) => {
  state = load();
  listeners.forEach((l) => l(ev.data.kind, ev.data.row));
});

function winsLast7Days(deviceId: string): number {
  const since = Date.now() - 7 * DAY;
  return state.claims.filter(
    (c) =>
      c.device_id === deviceId &&
      (c.status === 'won' || c.status === 'picked_up') &&
      Date.parse(c.created_at) >= since,
  ).length;
}

async function issueTicket(claim: Claim, post: Post) {
  claim.ticket_code = randomTicketCode();
  claim.ticket_sig = await signPayload(
    { c: claim.id, p: post.id, k: claim.ticket_code, e: Math.floor(Date.parse(post.expires_at) / 1000) },
    MOCK_SECRET,
  );
}

function expireDue() {
  const now = Date.now();
  for (const p of state.posts) {
    if ((p.status === 'open' || p.status === 'lottery') && Date.parse(p.expires_at) <= now) {
      p.status = 'expired';
      state.claims
        .filter((c) => c.post_id === p.id && c.status === 'won')
        .forEach((c) => (c.status = 'expired'));
      emit('post', p);
    }
  }
}

async function resolveLottery(postId: string) {
  state = load();
  const post = state.posts.find((p) => p.id === postId);
  if (!post || post.status !== 'lottery' || Date.now() < Date.parse(post.lottery_ends_at)) return;
  const pending = state.claims.filter((c) => c.post_id === postId && c.status === 'pending');
  const winners = new Set(
    drawWinners(
      pending.map((c) => ({
        id: c.id,
        winsLast7Days: winsLast7Days(c.device_id),
        priority: Boolean(state.profiles[c.device_id]?.priority),
      })),
      post.portions_left,
    ),
  );
  for (const c of pending) {
    if (winners.has(c.id)) {
      c.status = 'won';
      await issueTicket(c, post);
    } else {
      c.status = 'lost';
    }
  }
  post.portions_left -= winners.size;
  post.status = post.portions_left > 0 ? 'open' : 'closed';
  emit('post', post);
  pending.forEach((c) => emit('claim', c));
}

function withQr(c: Claim): Claim {
  const post = state.posts.find((p) => p.id === c.post_id);
  if (!post || !c.ticket_code || !c.ticket_sig || !(c.status === 'won' || c.status === 'picked_up')) return { ...c };
  const qr = buildQr(
    { c: c.id, p: post.id, k: c.ticket_code, e: Math.floor(Date.parse(post.expires_at) / 1000) },
    c.ticket_sig,
  );
  return { ...c, qr };
}

function publicProfile(p: State['profiles'][string]): Profile {
  return { device_id: p.device_id, display_name: p.display_name, diet_prefs: p.diet_prefs, priority: p.priority, created_at: p.created_at };
}

export const mockApi: Api = {
  async getOrCreateProfile(displayName) {
    state = load();
    const id = getDeviceId();
    if (!state.profiles[id]) {
      if (!displayName) return null;
      state.profiles[id] = {
        device_id: id,
        display_name: displayName.slice(0, 20),
        diet_prefs: [],
        priority: false,
        created_at: new Date().toISOString(),
      };
      save();
    }
    return publicProfile(state.profiles[id]);
  },

  async updateProfile(patch) {
    state = load();
    const id = getDeviceId();
    const p = state.profiles[id];
    if (!p) throw new Error('No profile yet');
    Object.assign(p, patch);
    if (patch.display_name) p.display_name = patch.display_name.slice(0, 20);
    save();
    return publicProfile(p);
  },

  async createPost(input) {
    state = load();
    const now = Date.now();
    const post: Post = {
      id: crypto.randomUUID(),
      org_name: input.org_name,
      title: input.title,
      building: input.building,
      room: input.room,
      portions_total: input.portions_total,
      portions_left: input.portions_total,
      diet_tags: input.diet_tags,
      photo_url: input.photo_url ?? null,
      poster_device_id: getDeviceId(),
      created_at: iso(now),
      lottery_ends_at: iso(now + lotterySeconds() * 1000),
      expires_at: iso(now + input.duration_min * 60_000),
      status: 'lottery',
    };
    state.posts.unshift(post);
    emit('post', post);
    return { ...post };
  },

  async getPost(postId) {
    state = load();
    const p = state.posts.find((x) => x.id === postId);
    return p ? { ...p } : null;
  },

  async listActivePosts() {
    state = load();
    expireDue();
    return state.posts.filter((p) => p.status === 'lottery' || p.status === 'open').map((p) => ({ ...p }));
  },

  async claim(postId): Promise<ClaimResult> {
    await resolveLottery(postId);
    state = load();
    const deviceId = getDeviceId();
    const post = state.posts.find((p) => p.id === postId);
    if (!post || post.status === 'closed' || post.status === 'expired') {
      return { ok: false, reason: 'post_closed', message: 'This post is no longer active.' };
    }
    if (state.claims.some((c) => c.post_id === postId && c.device_id === deviceId)) {
      return { ok: false, reason: 'already_claimed', message: 'You already claimed this one.' };
    }
    const profile = state.profiles[deviceId];
    const claim: Claim = {
      id: crypto.randomUUID(),
      post_id: postId,
      device_id: deviceId,
      display_name: profile?.display_name ?? 'Guest',
      status: 'pending',
      ticket_code: null,
      ticket_sig: null,
      created_at: new Date().toISOString(),
      picked_up_at: null,
    };
    if (post.status === 'open') {
      if (post.portions_left <= 0) return { ok: false, reason: 'none_left', message: 'None left — sorry!' };
      post.portions_left -= 1;
      claim.status = 'won';
      await issueTicket(claim, post);
      if (post.portions_left === 0) post.status = 'closed';
      emit('post', post);
    }
    state.claims.push(claim);
    emit('claim', claim);
    return { ok: true, claim: withQr(claim) };
  },

  resolveLotteryIfDue: resolveLottery,

  async getClaim(claimId) {
    state = load();
    const c = state.claims.find((x) => x.id === claimId);
    return c ? withQr(c) : null;
  },

  async getMyClaimForPost(postId) {
    state = load();
    const c = state.claims.find((x) => x.post_id === postId && x.device_id === getDeviceId());
    return c ? withQr(c) : null;
  },

  async getPublicClaim(claimId) {
    state = load();
    const c = state.claims.find((x) => x.id === claimId);
    return c ? { ...c, ticket_code: null, ticket_sig: null } : null;
  },

  async findClaimByCode(postId, code) {
    state = load();
    const c = state.claims.find((x) => x.post_id === postId && x.ticket_code === code.trim().toUpperCase());
    return c ? { ...c, ticket_sig: null } : null;
  },

  async listClaimsForPost(postId) {
    state = load();
    return state.claims
      .filter((c) => c.post_id === postId)
      .map((c) => ({ ...c, ticket_code: null, ticket_sig: null }));
  },

  async markPickedUp(claimId) {
    state = load();
    const c = state.claims.find((x) => x.id === claimId);
    if (!c) throw new Error('Unknown ticket');
    if (c.status === 'picked_up') throw new Error('Already picked up');
    if (c.status !== 'won') throw new Error('Ticket is not valid');
    c.status = 'picked_up';
    c.picked_up_at = new Date().toISOString();
    emit('claim', c);
  },

  async closePost(postId) {
    state = load();
    const p = state.posts.find((x) => x.id === postId);
    if (!p) return;
    p.status = 'closed';
    emit('post', p);
  },

  async getImpactStats() {
    state = load();
    const active = state.posts.filter((p) => p.status === 'lottery' || p.status === 'open');
    return {
      mealsRescued: state.claims.filter((c) => c.status === 'picked_up').length,
      activePosts: active.length,
      clubsActive: new Set(active.map((p) => p.org_name)).size,
    };
  },

  async listRecentPickups(limit = 10) {
    state = load();
    return state.claims
      .filter((c) => c.status === 'picked_up' && c.picked_up_at && c.post_id !== 'history')
      .sort((a, b) => Date.parse(b.picked_up_at!) - Date.parse(a.picked_up_at!))
      .slice(0, limit)
      .map((c) => ({
        display_name: c.display_name,
        org_name: state.posts.find((p) => p.id === c.post_id)?.org_name ?? '',
        picked_up_at: c.picked_up_at!,
      }));
  },

  subscribePosts(onChange) {
    const l: Listener = (kind, row) => kind === 'post' && onChange({ ...(row as Post) });
    listeners.add(l);
    return () => listeners.delete(l);
  },

  subscribeClaimsForPost(postId, onChange) {
    const l: Listener = (kind, row) =>
      kind === 'claim' && (row as Claim).post_id === postId && onChange({ ...(row as Claim), ticket_code: null, ticket_sig: null });
    listeners.add(l);
    return () => listeners.delete(l);
  },

  subscribeMyClaims(onChange) {
    const me = getDeviceId();
    const l: Listener = (kind, row) =>
      kind === 'claim' && (row as Claim).device_id === me && onChange(withQr(row as Claim));
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

/** Reset mock data to the seed (useful for demos). */
export function resetMockData() {
  state = seed();
  save();
}
