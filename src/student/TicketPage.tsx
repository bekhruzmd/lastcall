import { ArrowLeft, Check, Maximize2, Sun, Ticket, TriangleAlert, WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { api } from '../shared/api';
import { loadTicketData, saveTicketCache } from './ticketData';
import type { Claim, Post } from '../shared/types';
import StudentHeader from './StudentHeader';
import './student.css';

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
  const [retry, setRetry] = useState(0);
  const [qrError, setQrError] = useState(false);

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
    let latestPost: Post | null = null;

    async function loadTicket() {
      if (!claimId) {
        if (mounted) {
          setError('No ticket ID provided.');
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const data = await loadTicketData(claimId);
        if (!mounted) return;
        latestPost = data.post;
        setClaim(data.claim);
        setPost(data.post);
        setIsOfflineMode(data.offline);
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : 'Could not load ticket.');
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadTicket();

    // Subscribe to ticket updates (e.g. marked picked_up by officer)
    const unsubscribe = api.subscribeMyClaims((updatedClaim) => {
      if (updatedClaim.id === claimId && mounted) {
        setClaim(updatedClaim);
        saveTicketCache(claimId, updatedClaim, latestPost);
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [claimId, retry]);

  // Generate QR Code data URL whenever claim QR string is available
  useEffect(() => {
    const qrString = claim?.qr;
    if (!qrString) return;

    let active = true;
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
        if (active) {
          setQrDataUrl(url);
          setQrError(false);
        }
      })
      .catch(() => {
        if (active) {
          setQrDataUrl(null);
          setQrError(true);
        }
      });

    return () => {
      active = false;
    };
  }, [claim?.qr, retry]);

  // Close fullscreen QR on Escape key
  useEffect(() => {
    if (!isFullscreenQr) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFullscreenQr(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isFullscreenQr]);

  const countdown = formatExpiryCountdown(post?.expires_at, nowMs);
  const activeQrDataUrl = claim?.qr ? qrDataUrl : null;
  const canShowTicket = claim?.status === 'won' && !countdown.isExpired;
  const ticketMessage = claim?.status === 'picked_up' ? 'Already picked up'
    : countdown.isExpired || claim?.status === 'expired' ? 'Ticket expired'
    : claim?.status === 'pending' ? 'Waiting for the draw'
    : claim?.status === 'lost' ? 'Not selected this time'
    : qrError ? 'Could not display the QR. Try refreshing your ticket.'
    : 'Your ticket is not ready yet. Try refreshing.';

  return (
    <div className="student-shell">
      <StudentHeader />

      <main id="main-content" className="student-content">
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
              <button className="btn-primary" onClick={() => setRetry(value => value + 1)}>Retry loading ticket</button>
              <Link to="/" className="ticket-back-btn">Back to the feed</Link>
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
                    {canShowTicket && activeQrDataUrl ? (
                      <img
                        src={activeQrDataUrl}
                        alt={`QR code for ticket verification: ${claim.ticket_code || 'Claim'}`}
                      />
                    ) : (
                      <div className="ticket-qr-placeholder" role="status">{ticketMessage}</div>
                    )}
                  </div>

                  <span className="ticket-code-label">Pickup code</span>
                  <div className="ticket-code-display" aria-label={`Code: ${claim.ticket_code}`}>
                    {canShowTicket ? claim.ticket_code ?? '------' : '------'}
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsFullscreenQr(true)}
                    className="ticket-enlarge-btn"
                    disabled={!canShowTicket || !activeQrDataUrl}
                  >
                    <Maximize2 size={16} aria-hidden="true" /> Enlarge QR for scanning
                  </button>
                  {canShowTicket && (!claim.qr || qrError) && <button type="button" className="ticket-enlarge-btn" onClick={() => setRetry(value => value + 1)}>Refresh ticket</button>}
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
                  ) : claim.status === 'pending' || claim.status === 'lost' ? (
                    <div className="ticket-status-bar" role="status"><span>{ticketMessage}</span></div>
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
              {isFullscreenQr && canShowTicket && activeQrDataUrl && (
                <div
                  className="fullscreen-qr-overlay"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Enlarged QR code for pickup scanning"
                  onClick={() => setIsFullscreenQr(false)}
                >
                  <div className="fullscreen-qr-card" onClick={(e) => e.stopPropagation()}>
                    <h2 className="fullscreen-qr-title">
                      {post?.title || 'Leftover Bulls Ticket'}
                    </h2>
                    <img
                      src={activeQrDataUrl}
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
