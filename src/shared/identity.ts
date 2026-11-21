// Device identity (CONTRACT §3). No real login: a UUID in localStorage.

const KEY = 'lb.device_id';
let memoryId: string | null = null;

export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    if (!memoryId) memoryId = crypto.randomUUID();
    return memoryId;
  }
}

/** SHA-256 hex of the device id — the only form of it the public claims table exposes. */
export async function getDeviceHash(): Promise<string> {
  const bytes = new TextEncoder().encode(getDeviceId());
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
