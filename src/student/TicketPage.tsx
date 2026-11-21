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
              <span>← Back to food feed</span>
            </Link>
            {isOfflineMode && (
              <span
                style={{
                  fontSize: '0.78rem',
                  background: '#fef3c7',
                  color: '#92400e',
                  padding: '4px 8px',
                  borderRadius: 6,
                  fontWeight: 600,
                }}
              >
                Offline mode (cached ticket)
              </span>
            )}
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px 16px', color: '#666' }}>
              Loading your verified ticket...
            </div>
          ) : error || !claim ? (
            <div className="empty-feed">
              <span className="empty-icon" aria-hidden="true">
                🎫
              </span>
              <h2 className="empty-title">Ticket Not Available</h2>
              <p className="empty-desc">{error || 'This ticket could not be found.'}</p>
              <Link to="/" className="btn-primary" style={{ textDecoration: 'none' }}>
                Go to Feed
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
                      <div
                        style={{
                          width: 210,
                          height: 210,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: '#f3f4f6',
                          color: '#666',
                        }}
                      >
                        Generating QR...
                      </div>
                    )}
                  </div>

                  <span className="ticket-code-label">Verification Code</span>
                  <div className="ticket-code-display" aria-label={`Code: ${claim.ticket_code}`}>
                    {claim.ticket_code ?? '------'}
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsFullscreenQr(true)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--green)',
                      fontSize: '0.85rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      padding: '6px 12px',
                      textDecoration: 'underline',
                    }}
                  >
                    🔍 Enlarge QR for scanning
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
                      <span className="ticket-info-title">Valid Until</span>
                      <span
                        className="ticket-info-value"
                        style={{ color: countdown.isExpired ? 'var(--red)' : 'var(--ink)' }}
                      >
                        {countdown.text}
                      </span>
                    </div>
                  </div>

                  {/* Status Bar */}
                  {claim.status === 'picked_up' ? (
                    <div className="ticket-status-bar picked_up">
                      <span>✓ Food Picked Up</span>
                      {claim.picked_up_at && (
                        <span style={{ fontSize: '0.8rem', opacity: 0.9 }}>
                          · {new Date(claim.picked_up_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                  ) : countdown.isExpired || claim.status === 'expired' ? (
                    <div className="ticket-status-bar expired">
                      <span>⚠️ Ticket Expired</span>
                    </div>
                  ) : (
                    <div className="ticket-status-bar won">
                      <span>Ready for Pickup · Show this screen to host</span>
                    </div>
                  )}

                  {/* Brightness Tip */}
                  <div className="ticket-brightness-tip">
                    <span style={{ fontSize: '1.2rem' }} aria-hidden="true">
                      ☀️
                    </span>
                    <div>
                      <strong>Full brightness recommended:</strong> Turn your screen brightness all the
                      way up so the organizer's scanner can read your QR instantly. Works fully offline once loaded.
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
                    <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>
                      {post?.title || 'Leftover Bulls Ticket'}
                    </h2>
                    <img
                      src={qrDataUrl}
                      alt="Full screen QR code"
                      style={{
                        width: 'min(75vw, 320px)',
                        height: 'min(75vw, 320px)',
                        border: '3px solid #000000',
                        padding: 12,
                        background: '#ffffff',
                        borderRadius: 16,
                      }}
                    />
                    <div
                      style={{
                        fontFamily: 'monospace',
                        fontSize: '2rem',
                        fontWeight: 900,
                        letterSpacing: '0.25em',
                      }}
                    >
                      {claim.ticket_code ? claim.ticket_code.split('').join(' ') : ''}
                    </div>
                    <span style={{ fontSize: '0.9rem', color: '#666' }}>
                      {post?.building} · Room {post?.room}
                    </span>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => setIsFullscreenQr(false)}
                      style={{ marginTop: 12, minWidth: 160 }}
                    >
                      Close Fullscreen
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
