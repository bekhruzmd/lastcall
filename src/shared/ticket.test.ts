import * as ed from '@noble/ed25519';
import { describe, expect, it } from 'vitest';
import { drawWinners } from './lottery';
import { b64urlDecode, b64urlEncode, buildQr, signPayload, verifyTicket } from './ticket';

const secret = ed.utils.randomSecretKey();
const pub = b64urlEncode(await ed.getPublicKeyAsync(secret));
const now = Math.floor(Date.now() / 1000);
const payload = { c: 'claim-1', p: 'post-1', k: 'K7P2QX', e: now + 600 };
const qr = buildQr(payload, await signPayload(payload, secret));

describe('verifyTicket', () => {
  it('accepts a valid ticket', async () => {
    const r = await verifyTicket(qr, pub);
    expect(r).toMatchObject({ valid: true, claimId: 'claim-1', postId: 'post-1', code: 'K7P2QX' });
  });

  it('rejects a tampered payload', async () => {
    const [, , sig] = qr.split('.');
    const forged = b64urlEncode(new TextEncoder().encode(JSON.stringify({ ...payload, p: 'post-2' })));
    const r = await verifyTicket(`LB1.${forged}.${sig}`, pub);
    expect(r.valid).toBe(false);
    expect(r.reason).toBe('bad_signature');
  });

  it('rejects a tampered signature', async () => {
    const [, body, sig] = qr.split('.');
    const bytes = b64urlDecode(sig);
    bytes[0] ^= 0xff;
    const r = await verifyTicket(`LB1.${body}.${b64urlEncode(bytes)}`, pub);
    expect(r.valid).toBe(false);
    expect(r.reason).toBe('bad_signature');
  });

  it('rejects an expired ticket', async () => {
    const r = await verifyTicket(qr, pub, now + 601);
    expect(r.valid).toBe(false);
    expect(r.reason).toBe('expired');
  });

  it('rejects garbage', async () => {
    expect((await verifyTicket('hello', pub)).reason).toBe('malformed');
  });
});

describe('drawWinners', () => {
  it('never picks more winners than portions, and never twice', () => {
    const entrants = Array.from({ length: 10 }, (_, i) => ({ id: `d${i}`, winsLast7Days: i % 3, priority: false }));
    const w = drawWinners(entrants, 4);
    expect(w).toHaveLength(4);
    expect(new Set(w).size).toBe(4);
  });

  it('favours people with fewer recent wins', () => {
    let fresh = 0;
    for (let i = 0; i < 2000; i++) {
      const [w] = drawWinners(
        [
          { id: 'fresh', winsLast7Days: 0, priority: false },
          { id: 'regular', winsLast7Days: 3, priority: false },
        ],
        1,
      );
      if (w === 'fresh') fresh++;
    }
    expect(fresh / 2000).toBeGreaterThan(0.72); // expected 0.8
  });
});
