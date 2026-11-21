// Signed tickets (CONTRACT §7). Verification works fully offline.
//
// QR content: LB1.<base64url(payload)>.<base64url(signature)>
// Payload:    {"c":"<claim_id>","p":"<post_id>","k":"<ticket_code>","e":<expires unix s>}

import * as ed from '@noble/ed25519';
import type { VerifyResult } from './types';

export interface TicketPayload {
  c: string;
  p: string;
  k: string;
  e: number;
}

export function b64urlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlDecode(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Compact JSON with keys in the contract's fixed order. */
export function payloadBytes(p: TicketPayload): Uint8Array {
  const json = JSON.stringify({ c: p.c, p: p.p, k: p.k, e: p.e });
  return new TextEncoder().encode(json);
}

export function buildQr(p: TicketPayload, signatureB64url: string): string {
  return `LB1.${b64urlEncode(payloadBytes(p))}.${signatureB64url}`;
}

export async function signPayload(p: TicketPayload, secretKey: Uint8Array): Promise<string> {
  const sig = await ed.signAsync(payloadBytes(p), secretKey);
  return b64urlEncode(sig);
}

// Ticket codes: 6 chars from A–Z0–9 without 0/O/1/I.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function randomTicketCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

/**
 * Verify a scanned QR string against a base64url Ed25519 public key.
 * Checks format, signature and expiry. The caller checks the post id.
 */
export async function verifyTicket(
  qr: string,
  publicKeyB64url: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<VerifyResult> {
  const parts = qr.trim().split('.');
  if (parts.length !== 3 || parts[0] !== 'LB1') return { valid: false, reason: 'malformed' };

  let payload: TicketPayload;
  let msg: Uint8Array;
  let sig: Uint8Array;
  try {
    msg = b64urlDecode(parts[1]);
    sig = b64urlDecode(parts[2]);
    payload = JSON.parse(new TextDecoder().decode(msg));
    if (
      typeof payload.c !== 'string' || payload.c.length === 0 ||
      typeof payload.p !== 'string' || payload.p.length === 0 ||
      typeof payload.k !== 'string' || !/^[A-HJ-NP-Z2-9]{6}$/.test(payload.k) ||
      !Number.isSafeInteger(payload.e) || payload.e <= 0
    ) {
      return { valid: false, reason: 'malformed' };
    }
  } catch {
    return { valid: false, reason: 'malformed' };
  }

  let ok = false;
  try {
    ok = await ed.verifyAsync(sig, msg, b64urlDecode(publicKeyB64url));
  } catch {
    ok = false;
  }
  const base = { claimId: payload.c, postId: payload.p, code: payload.k, expiresAt: payload.e };
  if (!ok) return { valid: false, reason: 'bad_signature', ...base };
  if (nowSeconds >= payload.e) return { valid: false, reason: 'expired', ...base };
  return { valid: true, ...base };
}
