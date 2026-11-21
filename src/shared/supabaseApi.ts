// Supabase-backed implementation of the shared API (CONTRACT §9).
// All writes go through SQL functions; ticket signing goes through the
// sign-ticket Edge Function.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Api } from './api';
import { lotterySeconds } from './constants';
import { getDeviceId } from './identity';
import { buildQr } from './ticket';
import type { Claim, ClaimResult, ImpactStats, Post, Profile } from './types';

let client: SupabaseClient | null = null;
function db(): SupabaseClient {
  if (!client) {
    client = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);
  }
  return client;
}

function fail(error: { message: string } | null): asserts error is null {
  if (error) throw new Error(error.message);
}

const CLAIM_COLUMNS = 'id, post_id, device_id, display_name, status, created_at, picked_up_at';

function toClaim(row: Record<string, unknown>): Claim {
  return {
    id: row.id as string,
    post_id: row.post_id as string,
    device_id: row.device_id as string,
    display_name: row.display_name as string,
    status: row.status as Claim['status'],
    created_at: row.created_at as string,
    picked_up_at: (row.picked_up_at as string | null) ?? null,
    ticket_code: null,
    ticket_sig: null,
  };
}

interface FullClaimRow {
  id: string;
  post_id: string;
  device_id: string;
  display_name: string;
  status: Claim['status'];
  created_at: string;
  picked_up_at: string | null;
  ticket_code: string | null;
  ticket_sig: string | null;
  expires_at: string;
}

/** Fetch own claim; if it is won but unsigned, ask the Edge Function to sign it. */
async function loadOwnClaim(claimId: string): Promise<Claim | null> {
  const deviceId = getDeviceId();
  const { data, error } = await db().rpc('get_claim', { p_claim_id: claimId, p_device_id: deviceId });
  fail(error);
  let row = (data as FullClaimRow[] | null)?.[0];
  if (!row) return null;

  if ((row.status === 'won' || row.status === 'picked_up') && !row.ticket_sig) {
    const res = await db().functions.invoke('sign-ticket', {
      body: { claim_id: claimId, device_id: deviceId },
    });
    if (!res.error && res.data) {
      row = { ...row, ticket_code: res.data.ticket_code, ticket_sig: res.data.ticket_sig };
    }
  }

  const claim: Claim = {
    id: row.id,
    post_id: row.post_id,
    device_id: row.device_id,
    display_name: row.display_name,
    status: row.status,
    created_at: row.created_at,
    picked_up_at: row.picked_up_at,
    ticket_code: row.ticket_code,
    ticket_sig: row.ticket_sig,
  };
  if (row.ticket_code && row.ticket_sig) {
    claim.qr = buildQr(
      { c: row.id, p: row.post_id, k: row.ticket_code, e: Math.floor(Date.parse(row.expires_at) / 1000) },
      row.ticket_sig,
    );
  }
  return claim;
}

function claimError(message: string): ClaimResult {
  if (message.includes('ALREADY_CLAIMED'))
    return { ok: false, reason: 'already_claimed', message: 'You already claimed this one.' };
  if (message.includes('NONE_LEFT')) return { ok: false, reason: 'none_left', message: 'None left — sorry!' };
  if (message.includes('POST_CLOSED'))
    return { ok: false, reason: 'post_closed', message: 'This post is no longer active.' };
  return { ok: false, reason: 'error', message: 'Something went wrong. Try again.' };
}

function pickupError(message: string): string {
  if (message.includes('WRONG_POST')) return 'Ticket is for a different post';
  if (message.includes('ALREADY_PICKED_UP')) return 'Already picked up';
  if (message.includes('NOT_VALID')) return 'Ticket is not valid';
  return message;
}

export const supabaseApi: Api = {
  async getOrCreateProfile(displayName) {
    const deviceId = getDeviceId();
    const { data, error } = await db().rpc('get_profile', { p_device_id: deviceId });
    fail(error);
    const existing = (data as Profile[] | null)?.[0];
    if (existing) return existing;
    if (!displayName) return null;
    const created = await db().rpc('upsert_profile', { p_device_id: deviceId, p_display_name: displayName });
    fail(created.error);
    return created.data as Profile;
  },

  async updateProfile(patch) {
    const deviceId = getDeviceId();
    const current = await this.getOrCreateProfile();
    if (!current) throw new Error('No profile yet');
    const { data, error } = await db().rpc('upsert_profile', {
      p_device_id: deviceId,
      p_display_name: patch.display_name ?? current.display_name,
      p_diet_prefs: patch.diet_prefs ?? null,
      p_priority: patch.priority ?? null,
    });
    fail(error);
    return data as Profile;
  },

  async createPost(input) {
    const { data, error } = await db().rpc('create_post', {
      p_org_name: input.org_name,
      p_title: input.title,
      p_building: input.building,
      p_room: input.room,
      p_portions: input.portions_total,
      p_diet_tags: input.diet_tags,
      p_duration_min: input.duration_min,
      p_poster_device_id: getDeviceId(),
      p_lottery_seconds: lotterySeconds(),
      p_photo_url: input.photo_url ?? null,
    });
    fail(error);
    return data as Post;
  },

  async getPost(postId) {
    const { data, error } = await db().from('posts').select('*').eq('id', postId).maybeSingle();
    fail(error);
    return (data as Post | null) ?? null;
  },

  async listActivePosts() {
    await db().rpc('expire_due_posts');
    const { data, error } = await db()
      .from('posts')
      .select('*')
      .in('status', ['lottery', 'open'])
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });
    fail(error);
    return (data as Post[]) ?? [];
  },

  async claim(postId) {
    const { data, error } = await db().rpc('claim', { p_post_id: postId, p_device_id: getDeviceId() });
    if (error) return claimError(error.message);
    const row = (data as Record<string, unknown>[])[0];
    const claim = row.status === 'won' ? await loadOwnClaim(row.id as string) : toClaim(row);
    return { ok: true, claim: claim ?? toClaim(row) };
  },

  async resolveLotteryIfDue(postId) {
    const { error } = await db().rpc('resolve_lottery', { p_post_id: postId });
    fail(error);
  },

  getClaim: loadOwnClaim,

  async getMyClaimForPost(postId) {
    const { data, error } = await db()
      .from('claims')
      .select('id')
      .eq('post_id', postId)
      .eq('device_id', getDeviceId())
      .maybeSingle();
    fail(error);
    return data ? loadOwnClaim(data.id as string) : null;
  },

  async listClaimsForPost(postId) {
    const { data, error } = await db()
      .from('claims')
      .select(CLAIM_COLUMNS)
      .eq('post_id', postId)
      .order('created_at');
    fail(error);
    return (data ?? []).map(toClaim);
  },

  async markPickedUp(claimId) {
    const { data: c, error: e1 } = await db().from('claims').select('post_id').eq('id', claimId).maybeSingle();
    fail(e1);
    if (!c) throw new Error('Unknown ticket');
    const { error } = await db().rpc('mark_picked_up', { p_claim_id: claimId, p_post_id: c.post_id });
    if (error) throw new Error(pickupError(error.message));
  },

  async closePost(postId) {
    const { error } = await db().rpc('close_post', { p_post_id: postId });
    fail(error);
  },

  async getImpactStats() {
    const { data, error } = await db().rpc('impact_stats');
    fail(error);
    return data as ImpactStats;
  },

  async listRecentPickups(limit = 10) {
    const { data, error } = await db().rpc('recent_pickups', { p_limit: limit });
    fail(error);
    return data ?? [];
  },

  subscribePosts(onChange) {
    const ch = db()
      .channel('posts-' + crypto.randomUUID())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, (p) => {
        if (p.new && 'id' in p.new) onChange(p.new as Post);
      })
      .subscribe();
    return () => void db().removeChannel(ch);
  },

  subscribeClaimsForPost(postId, onChange) {
    const ch = db()
      .channel('claims-' + postId + '-' + crypto.randomUUID())
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'claims', filter: `post_id=eq.${postId}` },
        (p) => {
          if (p.new && 'id' in p.new) onChange(toClaim(p.new));
        },
      )
      .subscribe();
    return () => void db().removeChannel(ch);
  },

  subscribeMyClaims(onChange) {
    const me = getDeviceId();
    const ch = db()
      .channel('my-claims-' + crypto.randomUUID())
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'claims', filter: `device_id=eq.${me}` },
        async (p) => {
          if (!p.new || !('id' in p.new)) return;
          const full = await loadOwnClaim(p.new.id as string);
          onChange(full ?? toClaim(p.new));
        },
      )
      .subscribe();
    return () => void db().removeChannel(ch);
  },
};
