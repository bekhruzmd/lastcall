// Shared API (CONTRACT §9). UI code imports only from here.
// Uses Supabase when configured; otherwise an in-memory mock that syncs across tabs.

import { TICKET_PUBLIC_KEY, USE_MOCK } from './constants';
import type {
  Claim,
  ClaimResult,
  ImpactStats,
  NewPostInput,
  Post,
  Profile,
  VerifyResult,
} from './types';
import { mockApi, mockTicketPublicKey } from './mockApi';
import { supabaseApi } from './supabaseApi';
import { verifyTicket } from './ticket';

export interface Api {
  getOrCreateProfile(displayName?: string): Promise<Profile | null>;
  updateProfile(patch: Partial<Pick<Profile, 'display_name' | 'diet_prefs' | 'priority'>>): Promise<Profile>;
  createPost(input: NewPostInput): Promise<Post>;
  getPost(postId: string): Promise<Post | null>;
  listActivePosts(): Promise<Post[]>;
  claim(postId: string): Promise<ClaimResult>;
  resolveLotteryIfDue(postId: string): Promise<void>;
  getClaim(claimId: string): Promise<Claim | null>;
  getMyClaimForPost(postId: string): Promise<Claim | null>;
  /** Officer side: any claim by id, without ticket secrets. */
  getPublicClaim(claimId: string): Promise<Claim | null>;
  /** Officer side: manual fallback — find a won claim on this post by its 6-char code. */
  findClaimByCode(postId: string, code: string): Promise<Claim | null>;
  listClaimsForPost(postId: string): Promise<Claim[]>;
  markPickedUp(claimId: string): Promise<void>;
  closePost(postId: string): Promise<void>;
  getImpactStats(): Promise<ImpactStats>;
  /** Recent pickups for the board ticker, newest first. */
  listRecentPickups(limit?: number): Promise<{ display_name: string; org_name: string; picked_up_at: string }[]>;

  // Realtime (CONTRACT §8). Each returns an unsubscribe function.
  subscribePosts(onChange: (post: Post) => void): () => void;
  subscribeClaimsForPost(postId: string, onChange: (claim: Claim) => void): () => void;
  subscribeMyClaims(onChange: (claim: Claim) => void): () => void;
}

const hasSupabaseEnv = Boolean(
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY,
);

export const api: Api = USE_MOCK || !hasSupabaseEnv ? mockApi : supabaseApi;

export const usingMock = api === mockApi;

/** Verify a scanned QR offline with the active public key (CONTRACT §7). */
export async function verifyScannedTicket(qr: string): Promise<VerifyResult> {
  const key = usingMock ? await mockTicketPublicKey() : TICKET_PUBLIC_KEY;
  return verifyTicket(qr, key);
}
