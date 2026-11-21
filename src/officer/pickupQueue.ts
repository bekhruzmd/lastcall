import { api } from '../shared/api';

export interface QueuedPickup { claimId: string; postId: string; code: string; name: string }
const KEY = 'lb.officer.pickups.v1';
let memory: QueuedPickup[] = [];
let storageAvailable = true;

export function readQueue(): QueuedPickup[] {
  if (!storageAvailable) return memory;
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    if (Array.isArray(value)) memory = value.filter((p): p is QueuedPickup => p && typeof p.claimId === 'string' && typeof p.postId === 'string' && typeof p.code === 'string' && typeof p.name === 'string');
  } catch { storageAvailable = false; }
  return memory;
}

export function queuePickup(pickup: QueuedPickup): boolean {
  memory = [...readQueue().filter(p => p.claimId !== pickup.claimId), pickup];
  try { localStorage.setItem(KEY, JSON.stringify(memory)); return true; } catch { storageAvailable = false; return false; }
}

let syncing: Promise<void> | null = null;
export function syncPickups(): Promise<void> {
  if (syncing) return syncing;
  syncing = (async () => {
    for (const pickup of [...readQueue()]) {
      if (!navigator.onLine) break;
      try {
        const claim = (await api.listClaimsForPost(pickup.postId)).find(c => c.id === pickup.claimId);
        if (!claim || claim.post_id !== pickup.postId) throw new Error('Queued ticket could not be found.');
        if (claim.status !== 'picked_up') await api.markPickedUp(pickup.claimId);
        memory = readQueue().filter(p => p.claimId !== pickup.claimId);
        try { localStorage.setItem(KEY, JSON.stringify(memory)); } catch { storageAvailable = false; }
      } catch { /* Retain failures for retry; never silently discard a pickup. */ }
    }
  })().finally(() => { syncing = null; });
  return syncing;
}
