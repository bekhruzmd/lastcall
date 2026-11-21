import { api } from '../shared/api';

export interface QueuedPickup {
  claimId: string;
  postId: string;
  code: string;
  name: string;
  issue?: string;
}
const KEY = 'lb.officer.pickups.v1';
let memory: QueuedPickup[] = [];
let storageAvailable = true;

export function readQueue(): QueuedPickup[] {
  if (!storageAvailable) return memory;
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    if (Array.isArray(value)) memory = value.filter((p): p is QueuedPickup => p && typeof p.claimId === 'string' && typeof p.postId === 'string' && typeof p.code === 'string' && typeof p.name === 'string' && (p.issue === undefined || typeof p.issue === 'string'));
  } catch { storageAvailable = false; }
  return memory;
}

function saveQueue(next: QueuedPickup[]): boolean {
  memory = next;
  try { localStorage.setItem(KEY, JSON.stringify(memory)); return true; }
  catch { storageAvailable = false; return false; }
}

export function queuePickup(pickup: QueuedPickup): boolean {
  return saveQueue([...readQueue().filter(p => p.claimId !== pickup.claimId), pickup]);
}

let syncing: Promise<void> | null = null;
export function syncPickups(): Promise<void> {
  if (syncing) return syncing;
  syncing = (async () => {
    for (const pickup of [...readQueue()]) {
      if (!navigator.onLine) break;
      try {
        const claim = (await api.listClaimsForPost(pickup.postId)).find(c => c.id === pickup.claimId);
        if (!claim || claim.post_id !== pickup.postId) throw new Error('Ticket no longer found. Keep this record for review.');
        if (claim.status === 'expired') throw new Error('Ticket expired before sync. Keep this pickup record for review.');
        if (claim.status !== 'won' && claim.status !== 'picked_up') throw new Error('Ticket is no longer eligible. Keep this pickup record for review.');
        if (claim.status !== 'picked_up') await api.markPickedUp(pickup.claimId);
        saveQueue(readQueue().filter(p => p.claimId !== pickup.claimId));
      } catch (error) {
        // Keep the record and explain why it has not reached the server.
        const issue = error instanceof Error ? error.message : 'Could not sync. Try again when connected.';
        saveQueue(readQueue().map(p => p.claimId === pickup.claimId ? { ...p, issue } : p));
      }
    }
  })().finally(() => { syncing = null; });
  return syncing;
}
