import { api } from '../shared/api';
import type { Claim, Post } from '../shared/types';

interface CachedTicket { claim: Claim; post: Post | null; savedAt: number }

function readCache(claimId: string): CachedTicket | null {
  try {
    const raw = localStorage.getItem(`lb.ticket.${claimId}`);
    if (!raw) return null;
    const value = JSON.parse(raw) as CachedTicket;
    if (!value?.claim || value.claim.id !== claimId || typeof value.claim.post_id !== 'string') return null;
    if (value.post && value.post.id !== value.claim.post_id) return null;
    return value;
  } catch { return null; }
}

export function saveTicketCache(claimId: string, claim: Claim, post: Post | null) {
  try {
    const cachedPost = readCache(claimId)?.post;
    const matchingPost = post ?? (cachedPost?.id === claim.post_id ? cachedPost : null);
    localStorage.setItem(`lb.ticket.${claimId}`, JSON.stringify({ claim, post: matchingPost, savedAt: Date.now() }));
  } catch { /* The visible ticket still works when storage is unavailable. */ }
}

export async function loadTicketData(claimId: string): Promise<{ claim: Claim; post: Post | null; offline: boolean }> {
  const cached = readCache(claimId);
  let claim: Claim | null;
  try {
    claim = await api.getClaim(claimId);
  } catch (error) {
    if (cached) return { claim: cached.claim, post: cached.post, offline: true };
    throw error;
  }
  if (!claim) throw new Error('Ticket not found. Return to the feed to check your claim.');
  let post: Post | null;
  let offline = false;
  try { post = await api.getPost(claim.post_id); }
  catch {
    post = cached?.post?.id === claim.post_id ? cached.post : null;
    offline = true;
  }
  saveTicketCache(claimId, claim, post);
  return { claim, post, offline };
}
