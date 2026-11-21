import { ArrowLeft, Check, Maximize2, Sun, Ticket, TriangleAlert, WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { api } from '../shared/api';
import type { Claim, Post } from '../shared/types';
import StudentHeader from './StudentHeader';
import './student.css';

interface CachedTicket {
  claim: Claim;
  post: Post | null;
  savedAt: number;
}

function getCacheKey(claimId: string): string {
  return `lb.ticket.${claimId}`;
}

function saveTicketCache(claimId: string, claim: Claim, post: Post | null) {
  try {
    const data: CachedTicket = { claim, post, savedAt: Date.now() };
    localStorage.setItem(getCacheKey(claimId), JSON.stringify(data));
  } catch {
    /* ignore storage errors */
  }
}

function loadTicketCache(claimId: string): CachedTicket | null {
  try {
    const raw = localStorage.getItem(getCacheKey(claimId));
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore storage errors */
  }
  return null;
}

function formatExpiryCountdown(targetIso?: string | null, nowMs: number = Date.now()): {
  text: string;
  isExpired: boolean;
} {
  if (!targetIso) return { text: '--:--', isExpired: false };
  const diffMs = Date.parse(targetIso) - nowMs;
  if (diffMs <= 0) return { text: 'Expired', isExpired: true };
  const totalSec = Math.floor(diffMs / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  const padSec = secs < 10 ? `0${secs}` : `${secs}`;
  if (mins >= 60) {
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    return { text: `${hours}h ${remMins}m remaining`, isExpired: false };
  }
  return { text: `${mins}:${padSec} remaining`, isExpired: false };
}

export default function TicketPage() {
  const { claimId } = useParams<{ claimId: string }>();

  const [claim, setClaim] = useState<Claim | null>(null);
  const [post, setPost] = useState<Post | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreenQr, setIsFullscreenQr] = useState(false);

  const [nowMs, setNowMs] = useState(() => Date.now());

  // Clock tick every second for expiry countdown
  useEffect(() => {
    const interval = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch Claim & Post
  useEffect(() => {
    let mounted = true;

    async function loadTicket() {
      if (!claimId) {
        if (mounted) {
          setError('No ticket ID provided.');
          setLoading(false);
        }
        return;
      }

      try {
        // First check online API
        let fetchedClaim: Claim | null = null;
        try {
          fetchedClaim = await api.getClaim(claimId);
        } catch {
          // Fall through to offline cache
        }

        if (fetchedClaim) {
          if (!mounted) return;
          setClaim(fetchedClaim);
          setIsOfflineMode(false);

          let fetchedPost: Post | null = null;
          try {
            fetchedPost = await api.getPost(fetchedClaim.post_id);
            if (mounted) setPost(fetchedPost);
          } catch {
            /* post fetch error ignored */
          }

          saveTicketCache(claimId, fetchedClaim, fetchedPost);
        } else {
          // Attempt loading from offline cache
          const cached = loadTicketCache(claimId);
          if (cached && mounted) {
            setClaim(cached.claim);
            setPost(cached.post);
            setIsOfflineMode(true);
          } else if (mounted) {
            setError('Ticket not found. Check your connection or claim list.');
          }
        }
      } catch (err) {
        // Fallback to cache if available
        const cached = loadTicketCache(claimId);
        if (cached && mounted) {
          setClaim(cached.claim);
          setPost(cached.post);
          setIsOfflineMode(true);
        } else if (mounted) {
          setError(err instanceof Error ? err.message : 'Could not load ticket.');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadTicket();

    // Subscribe to ticket updates (e.g. marked picked_up by officer)
    const unsubscribe = api.subscribeMyClaims((updatedClaim) => {
      if (updatedClaim.id === claimId && mounted) {
        setClaim(updatedClaim);
        saveTicketCache(claimId, updatedClaim, post);
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [claimId, post]);

  // Generate QR Code data URL whenever claim QR string is available
  useEffect(() => {
    let active = true;
    const qrString = claim?.qr;

    if (!qrString) {
      return;
    }

    QRCode.toDataURL(qrString, {
      errorCorrectionLevel: 'M',
      margin: 2,
      scale: 8,
      color: {
        dark: '#1b1b1b',
        light: '#ffffff',
      },
    })
      .then((url) => {
        if (active) setQrDataUrl(url);
      })
      .catch((err) => {
        console.error('Failed to generate QR code:', err);
      });

    return () => {
      active = false;
    };
  }, [claim?.qr]);

  const countdown = formatExpiryCountdown(post?.expires_at, nowMs);

  return (
    <div className="student-shell">
      <StudentHeader />

      <main className="student-content">
        <div className="ticket-container">
          <div className="ticket-back-nav">
            <Link to="/" className="ticket-back-btn">
              <ArrowLeft size={18} aria-hidden="true" />
              <span>Food feed</span>
            </Link>
            {isOfflineMode && (
              <span className="ticket-offline-note">
                <WifiOff size={14} aria-hidden="true" /> Offline · saved ticket
              </span>
            )}
          </div>

          {loading ? (
            <div className="feed-loading" role="status">
              Loading your ticket…
            </div>
          ) : error || !claim ? (
            <div className="empty-feed">
              <span className="empty-icon" aria-hidden="true">
                <Ticket size={24} />
              </span>
              <h2 className="empty-title">Ticket not available</h2>
              <p className="empty-desc">{error || 'This ticket could not be found.'}</p>
              <Link to="/" className="btn-primary">
                Back to the feed
              </Link>
            </div>
          ) : (
            <>
              {/* Ticket Pass Container */}
              <div className="ticket-pass" aria-label="Digital food pickup ticket">
                {/* Header */}
                <div className="ticket-pass-header">
                  {post?.org_name && <span className="ticket-org-badge">{post.org_name}</span>}
                  <h1 className="ticket-pass-title">{post?.title || 'Food Pickup Ticket'}</h1>
                </div>

                {/* QR Section */}
                <div className="ticket-qr-section">
                  <div className="ticket-qr-frame">
                    {qrDataUrl ? (
                      <img
                        src={qrDataUrl}
                        alt={`QR code for ticket verification: ${claim.ticket_code || 'Claim'}`}
                      />
                    ) : (
                      <div className="ticket-qr-placeholder">Generating QR…</div>
                    )}
                  </div>

                  <span className="ticket-code-label">Pickup code</span>
                  <div className="ticket-code-display" aria-label={`Code: ${claim.ticket_code}`}>
                    {claim.ticket_code ?? '------'}
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsFullscreenQr(true)}
                    className="ticket-enlarge-btn"
                  >
                    <Maximize2 size={16} aria-hidden="true" /> Enlarge QR for scanning
                  </button>
                </div>

                {/* Ticket Cutout Divider */}
                <div className="ticket-divider" aria-hidden="true">
                  <div className="ticket-cutout-left" />
                  <div className="ticket-cutout-right" />
                </div>

                {/* Details Section */}
                <div className="ticket-details-section">
                  <div className="ticket-info-grid">
                    <div className="ticket-info-card">
                      <span className="ticket-info-title">Pickup Location</span>
                      <span className="ticket-info-value">
                        {post?.building || 'Campus building'}
                        {post?.room ? ` · Room ${post.room}` : ''}
                      </span>
                    </div>

                    <div className="ticket-info-card">
                      <span className="ticket-info-title">Valid for</span>
                      <span className={`ticket-info-value${countdown.isExpired ? ' expired' : ''}`}>
                        {countdown.text}
                      </span>
                    </div>
                  </div>

                  {/* Status Bar */}
                  {claim.status === 'picked_up' ? (
                    <div className="ticket-status-bar picked_up">
                      <Check size={18} aria-hidden="true" />
                      <span>Picked up</span>
                      {claim.picked_up_at && (
                        <span className="num">
                          · {new Date(claim.picked_up_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                  ) : countdown.isExpired || claim.status === 'expired' ? (
                    <div className="ticket-status-bar expired">
                      <TriangleAlert size={18} aria-hidden="true" />
                      <span>Ticket expired</span>
                    </div>
                  ) : (
                    <div className="ticket-status-bar won">
                      <span>Ready for pickup · show this screen to the host</span>
                    </div>
                  )}

                  {/* Brightness Tip */}
                  <div className="ticket-brightness-tip">
                    <span aria-hidden="true">
                      <Sun size={18} />
                    </span>
                    <div>
                      Turn your screen brightness all the way up so the host's scanner reads your QR instantly.
                      This ticket works offline once loaded.
                    </div>
                  </div>
                </div>
              </div>

              {/* Fullscreen QR Modal */}
              {isFullscreenQr && qrDataUrl && (
                <div
                  className="fullscreen-qr-overlay"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Enlarged QR code for pickup scanning"
                >
                  <div className="fullscreen-qr-card">
                    <h2 className="fullscreen-qr-title">
                      {post?.title || 'Leftover Bulls Ticket'}
                    </h2>
                    <img
                      src={qrDataUrl}
                      alt="Full screen QR code"
                      className="fullscreen-qr-img"
                    />
                    <div className="ticket-code-display">{claim.ticket_code ?? ''}</div>
                    <span className="fullscreen-qr-where">
                      {post?.building} · Room {post?.room}
                    </span>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => setIsFullscreenQr(false)}
                    >
                      Close
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
