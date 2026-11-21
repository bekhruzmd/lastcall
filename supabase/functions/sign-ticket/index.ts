// Edge Function: sign-ticket (CONTRACT §7)
// POST { claim_id, device_id } -> { ticket_code, ticket_sig, expires_at }
// Re-checks that the claim is `won` and belongs to the device, then signs
// {"c","p","k","e"} with Ed25519. Idempotent: returns the stored ticket if one exists.
//
// Secrets: TICKET_PRIVATE_KEY (base64url, 32 bytes). SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY are provided by the platform.

import { createClient } from 'npm:@supabase/supabase-js@2.119.2';
import * as ed from 'npm:@noble/ed25519@3.2.0';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function b64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  let claimId: string, deviceId: string;
  try {
    ({ claim_id: claimId, device_id: deviceId } = await req.json());
    if (!claimId || !deviceId) throw new Error();
  } catch {
    return json({ error: 'claim_id and device_id required' }, 400);
  }

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: claim } = await db
    .from('claims')
    .select('id, post_id, device_id, status, posts(expires_at)')
    .eq('id', claimId)
    .maybeSingle();
  if (!claim || claim.device_id !== deviceId) return json({ error: 'not found' }, 404);
  if (claim.status !== 'won' && claim.status !== 'picked_up') return json({ error: 'not won' }, 409);

  const { data: existing } = await db
    .from('ticket_secrets')
    .select('ticket_code, ticket_sig')
    .eq('claim_id', claimId)
    .maybeSingle();
  // deno-lint-ignore no-explicit-any
  const expiresAt = (claim as any).posts.expires_at as string;
  if (existing) return json({ ...existing, expires_at: expiresAt });

  const code = randomCode();
  const payload = JSON.stringify({
    c: claim.id,
    p: claim.post_id,
    k: code,
    e: Math.floor(Date.parse(expiresAt) / 1000),
  });
  const sig = b64url(
    await ed.signAsync(new TextEncoder().encode(payload), fromB64url(Deno.env.get('TICKET_PRIVATE_KEY')!)),
  );

  // On a race, the first insert wins and we return that one.
  await db.from('ticket_secrets').insert({ claim_id: claimId, ticket_code: code, ticket_sig: sig });
  const { data: stored } = await db
    .from('ticket_secrets')
    .select('ticket_code, ticket_sig')
    .eq('claim_id', claimId)
    .single();
  return json({ ...stored, expires_at: expiresAt });
});
