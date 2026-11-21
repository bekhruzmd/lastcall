// Generates the Ed25519 ticket keypair.
// Usage: node supabase/keygen.mjs
// Then:  npx supabase secrets set TICKET_PRIVATE_KEY=<private>
//        put <public> in .env.local as VITE_TICKET_PUBLIC_KEY
import * as ed from '@noble/ed25519';

const b64url = (b) => Buffer.from(b).toString('base64url');
const secret = ed.utils.randomSecretKey();
const pub = await ed.getPublicKeyAsync(secret);
console.log('TICKET_PRIVATE_KEY=' + b64url(secret));
console.log('VITE_TICKET_PUBLIC_KEY=' + b64url(pub));
