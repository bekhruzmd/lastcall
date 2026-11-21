import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import type { FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import QrScanner from 'qr-scanner';
import { api, verifyScannedTicket } from '../shared/api';
import { getDeviceHash } from '../shared/identity';
import type { Claim, Post } from '../shared/types';
import { queuePickup, readQueue, syncPickups } from './pickupQueue';
import './officer.css';

const labels: Record<Claim['status'], string> = { pending: 'In the draw', won: 'On the way', lost: 'Not selected', picked_up: 'Picked up', expired: 'Expired' };
function message(error: unknown) { return error instanceof Error ? error.message : 'Something went wrong. Please try again.'; }
function connectionFailed(error: unknown) { return !navigator.onLine || /failed to fetch|network|load failed|offline/i.test(message(error)); }
type Result = { ok: boolean; title: string; detail: string };

export default function OfficerPage() {
  const { postId = '' } = useParams();
  const [post, setPost] = useState<Post | null>(null);
  const [myHash, setMyHash] = useState<string | null>(null);
  useEffect(() => { void getDeviceHash().then(setMyHash); }, []);
  const [claims, setClaims] = useState<Claim[]>([]);
  const claimsRef = useRef<Claim[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  const [online, setOnline] = useState(navigator.onLine);
  const [queued, setQueued] = useState(readQueue().length);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const scanLock = useRef(false);
  const accepted = useRef(new Set<string>());
  const [camera, setCamera] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [code, setCode] = useState('');
  const [closing, setClosing] = useState(false);
  const [boardQr, setBoardQr] = useState('');
  const video = useRef<HTMLVideoElement>(null);
  const boardUrl = `${window.location.origin}/board${window.location.search}`;

  const saveClaims = useCallback((next: Claim[]) => {
    claimsRef.current = next;
    setClaims(next);
    // Cache only fields the officer uses; never persist a profile or priority flag.
    try { localStorage.setItem(`lb.officer.claims.${postId}`, JSON.stringify(next.map(c => ({ ...c, device_id: '', ticket_code: null, ticket_sig: null, qr: undefined })))); } catch { /* Offline cache is optional. */ }
  }, [postId]);

  const refresh = useCallback(async () => {
    const [nextPost, nextClaims] = await Promise.all([api.getPost(postId), api.listClaimsForPost(postId)]);
    setPost(nextPost);
    saveClaims(nextClaims);
    setLoaded(true);
    setError('');
  }, [postId, saveClaims]);

  useEffect(() => {
    let active = true;
    try {
      const cached: Claim[] = JSON.parse(localStorage.getItem(`lb.officer.claims.${postId}`) ?? '[]');
      if (Array.isArray(cached)) { claimsRef.current = cached; setClaims(cached); }
    } catch { /* Start without cached names. */ }
    void refresh().catch(e => { if (active) { setError(message(e)); setLoaded(true); } });
    const stopPosts = api.subscribePosts(p => { if (p.id === postId) setPost(p); });
    const stopClaims = api.subscribeClaimsForPost(postId, claim => {
      saveClaims([...claimsRef.current.filter(c => c.id !== claim.id), claim]);
    });
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    async function retry() {
      setOnline(navigator.onLine);
      await syncPickups();
      if (active) {
        setQueued(readQueue().length);
        if (navigator.onLine) void refresh().catch(e => setError(message(e)));
      }
    }
    void retry();
    const poll = window.setInterval(() => void retry(), 10000);
    window.addEventListener('online', retry);
    window.addEventListener('offline', retry);
    return () => { active = false; stopPosts(); stopClaims(); window.clearInterval(tick); window.clearInterval(poll); window.removeEventListener('online', retry); window.removeEventListener('offline', retry); };
  }, [postId, refresh, saveClaims]);

  useEffect(() => {
    if (post?.status !== 'lottery' || now < Date.parse(post.lottery_ends_at) || !online) return;
    void api.resolveLotteryIfDue(postId).then(refresh).catch(e => setError(message(e)));
  }, [now, online, post, postId, refresh]);

  useEffect(() => {
    let active = true;
    void QRCode.toDataURL(boardUrl, { width: 220, margin: 2, color: { dark: '#0b5d3b', light: '#ffffff' } }).then(url => { if (active) setBoardQr(url); }).catch(() => {});
    return () => { active = false; };
  }, [boardUrl]);

  async function acceptTicket(qr: string) {
    if (scanLock.current) return;
    scanLock.current = true;
    setBusy(true);
    try {
      const verified = await verifyScannedTicket(qr);
      if (!verified.valid || !verified.claimId || !verified.code) throw new Error(verified.reason === 'expired' ? 'Ticket expired' : 'Invalid ticket');
      if (verified.postId !== postId) throw new Error('Wrong post — this ticket is for other leftovers');
      if (accepted.current.has(verified.claimId) || readQueue().some(p => p.claimId === verified.claimId)) throw new Error('Already picked up');
      let claim = claimsRef.current.find(c => c.id === verified.claimId);
      let offlinePickup = !navigator.onLine;
      if (navigator.onLine) {
        try {
          const fresh = (await api.listClaimsForPost(postId)).find(c => c.id === verified.claimId);
          if (!fresh) throw new Error('Invalid ticket');
          claim = fresh;
        } catch (e) {
          if (connectionFailed(e)) offlinePickup = true;
          else throw e;
        }
      }
      if (claim && (claim.post_id !== postId || (claim.ticket_code !== null && claim.ticket_code !== verified.code))) throw new Error('Invalid ticket');
      if (claim?.status === 'picked_up') throw new Error('Already picked up');
      if (claim && claim.status !== 'won') throw new Error(claim.status === 'expired' ? 'Ticket expired' : 'Invalid ticket');
      const name = claim?.display_name || 'Ticket holder';
      const pickup = { claimId: verified.claimId, postId, code: verified.code, name };
      let detail = 'Pickup recorded. Thank you!';
      if (!offlinePickup) {
        try { await api.markPickedUp(verified.claimId); }
        catch (e) {
          if (connectionFailed(e)) offlinePickup = true;
          else throw e;
        }
      }
      if (offlinePickup) {
        const persisted = queuePickup(pickup);
        setQueued(readQueue().length);
        detail = persisted ? 'Verified offline. Pickup saved; it will sync when connected. Offline checks cannot see pickups on other devices.' : 'Verified offline. Keep this page open: storage is unavailable, so the pickup is saved only for this session.';
      }
      accepted.current.add(verified.claimId);
      if (claim) saveClaims([...claimsRef.current.filter(c => c.id !== claim.id), { ...claim, status: 'picked_up' }]);
      setCamera(false);
      setResult({ ok: true, title: `${name} — ticket ${verified.code}`, detail });
    } catch (e) {
      setCamera(false);
      setResult({ ok: false, title: message(e), detail: 'No pickup recorded. Check the student’s ticket and try again.' });
    } finally { setBusy(false); }
  }
  const scanHandler = useRef(acceptTicket);
  scanHandler.current = acceptTicket;

  useEffect(() => {
    // Load the decoder while connected so starting the scanner offline can work.
    void QrScanner.createQrEngine().then(engine => {
      if (engine instanceof Worker) engine.terminate();
    }).catch(() => { /* Camera fallback remains available. */ });
  }, []);

  useEffect(() => {
    if (!camera || !video.current) return;
    if (!window.isSecureContext) { setCameraError('Camera needs HTTPS. Use the 6-character code below.'); return; }
    let active = true;
    const scanner = new QrScanner(video.current, scan => void scanHandler.current(scan.data), { preferredCamera: 'environment', returnDetailedScanResult: true, highlightScanRegion: true, maxScansPerSecond: 4 });
    void scanner.start().catch(() => { if (active) setCameraError('Camera unavailable. Allow camera access, or use the code below.'); });
    return () => { active = false; scanner.destroy(); };
  }, [camera]);

  async function manual(event: FormEvent) {
    event.preventDefault();
    if (busy || scanLock.current) return;
    scanLock.current = true;
    setCamera(false);
    setBusy(true);
    try {
      // Codes are checked on the server, so the manual fallback needs a connection.
      if (!navigator.onLine) throw new Error('Codes need a connection. Scan the QR instead — it works offline.');
      if (!post || Date.now() >= Date.parse(post.expires_at)) throw new Error('Ticket expired');
      const typed = code.trim().toUpperCase();
      const claim = await api.findClaimByCode(postId, typed);
      if (!claim) throw new Error('Invalid code for this post');
      if (claim.post_id !== postId) throw new Error('Wrong post — this ticket is for other leftovers');
      if (claim.status === 'picked_up' || accepted.current.has(claim.id) || readQueue().some(p => p.claimId === claim.id)) throw new Error('Already picked up');
      if (claim.status !== 'won') throw new Error(claim.status === 'expired' ? 'Ticket expired' : 'Invalid ticket');
      if (Date.now() >= Date.parse(post.expires_at)) throw new Error('Ticket expired');
      await api.markPickedUp(claim.id);
      accepted.current.add(claim.id);
      saveClaims([...claimsRef.current.filter(c => c.id !== claim.id), { ...claim, status: 'picked_up' }]);
      setCode('');
      setResult({ ok: true, title: `${claim.display_name} — ticket ${typed}`, detail: 'Pickup recorded. Thank you!' });
    } catch (e) { setResult({ ok: false, title: message(e), detail: 'No pickup recorded. Try scanning the QR instead.' }); }
    finally { setBusy(false); }
  }

  async function close() {
    if (!window.confirm('Close this post to new claims? Existing tickets can still be scanned.')) return;
    setClosing(true);
    try { await api.closePost(postId); await refresh(); } catch (e) { setError(message(e)); }
    finally { setClosing(false); }
  }

  if (result) return <main className={`officer-result ${result.ok ? 'officer-result-good' : 'officer-result-bad'}`}><div role="status"><span className="officer-result-icon" aria-hidden="true">{result.ok ? <Check size={44} strokeWidth={2.5} /> : <X size={44} strokeWidth={2.5} />}</span><h1><span className="sr-only">{result.ok ? 'Valid: ' : 'Rejected: '}</span>{result.title}</h1><p>{result.detail}</p><button autoFocus onClick={() => { setResult(null); setCode(''); scanLock.current = false; }}>Check next ticket</button></div></main>;
  if (!loaded) return <main className="officer-page"><p role="status">Opening your post…</p></main>;
  if (!post) return <main className="officer-page"><h1>{error ? 'Could not load your post' : 'Post not found'}</h1>{error && <p role="alert">{error}</p>}<button onClick={() => void refresh().catch(e => setError(message(e)))}>Try again</button><p><Link to="/post">Post leftovers</Link></p></main>;
  if (myHash === null) return <main className="officer-page"><p>Loading…</p></main>;
  if (post.poster_hash !== myHash) return <main className="officer-page"><h1>Officer access</h1><p>Open this page on the device that posted these leftovers.</p><Link to="/">Back to the feed</Link></main>;
  const seconds = Math.max(0, Math.ceil((Date.parse(post.lottery_ends_at) - now) / 1000));
  const expired = now >= Date.parse(post.expires_at);
  return <main className="officer-page">
    <nav className="officer-nav"><Link to="/">Leftover Bulls</Link><Link to="/post">New post</Link></nav>
    <h1>{post.title}</h1><p className="officer-intro">{post.org_name} · {post.building} · {post.room}</p>
    {!online && <p className="officer-notice" role="status">Offline. Signed QR tickets still work on this device.</p>}
    {queued > 0 && <p className="officer-notice" role="status">{queued} pickup{queued === 1 ? '' : 's'} waiting to sync. Keep this device handy.<button onClick={() => void syncPickups().then(() => setQueued(readQueue().length))}>Retry sync</button></p>}
    {error && <p className="officer-error" role="alert">{error}</p>}
    <section className="officer-summary" aria-label="Post status"><div><strong>{post.portions_left}</strong><span>portions unclaimed</span></div><div><strong>{post.status === 'lottery' && !expired ? `${seconds}s` : expired ? 'Expired' : post.status === 'closed' ? 'Closed' : 'Open'}</strong><span>{post.status === 'lottery' && !expired ? 'until the fair-share draw' : 'for new claims'}</span></div></section>
    <section className="officer-section"><h2>Check a ticket</h2><button className="officer-primary" disabled={busy} onClick={() => { setCameraError(''); setCamera(c => !c); }}>{camera ? 'Stop camera' : 'Scan ticket QR'}</button>
      {camera && <div className="officer-camera"><video ref={video} muted playsInline aria-label="Ticket scanner camera" /><p>Hold the student’s QR inside the frame.</p></div>}
      {cameraError && <p role="alert" className="officer-error">{cameraError}</p>}
      <form className="officer-code" onSubmit={manual}><label>Or enter the 6-character code<input aria-label="6-character ticket code" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={6} pattern="[A-HJ-NP-Z2-9]{6}" placeholder="K7P2QX" value={code} onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ''))} required /></label><button disabled={busy || code.length !== 6}>{busy ? 'Checking…' : 'Check code'}</button></form>
    </section>
    <section className="officer-section"><h2>Claimants <span className="officer-muted">({claims.length})</span></h2>{claims.length === 0 ? <p>No claims yet. Your post is live on the feed.</p> : <ul className="officer-claims">{claims.map(claim => <li key={claim.id}><span>{claim.display_name}</span><span className={`officer-status officer-status-${claim.status}`}>{labels[claim.status]}</span></li>)}</ul>}</section>
    <section className="officer-section officer-board"><div><h2>Put the impact on screen</h2><p>Open the campus board on a shared screen.</p><a href={boardUrl} target="_blank" rel="noreferrer">Open impact board</a><p className="officer-board-url">{boardUrl}</p></div>{boardQr && <img src={boardQr} width={180} height={180} alt="QR code linking to the campus impact board" />}</section>
    <button className="officer-close" disabled={closing || post.status === 'closed' || expired} onClick={() => void close()}>{closing ? 'Closing…' : post.status === 'closed' || expired ? 'Post closed' : 'Close early'}</button>
  </main>;
}
