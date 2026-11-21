// Audio notification utility for lastcall student feed.
// Uses Web Audio API so it requires zero external audio assets and works fully offline.

const MUTE_KEY = 'lb.muted';

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  return audioCtx;
}

export function unlockAudio(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {
      /* ignore interaction restriction */
    });
  }
}

if (typeof window !== 'undefined') {
  const handleInteraction = () => {
    unlockAudio();
  };
  window.addEventListener('pointerdown', handleInteraction, { passive: true });
  window.addEventListener('keydown', handleInteraction, { passive: true });
}

export function isMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch {
    /* ignore storage errors */
  }
}

/**
 * Plays a warm, distinct two-tone chime (C5 -> E5 -> G5) to announce a new food post.
 * Gracefully silent if muted or if browser blocks autoplay.
 */
export function playNewPostChime(): void {
  if (isMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    void ctx.resume();
  }
  if (ctx.state !== 'running') return;

  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    // Arpeggio chime: C5 (523Hz) -> G5 (784Hz)
    osc.frequency.setValueAtTime(523.25, now);
    osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.12);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.2, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.6);
  } catch {
    /* ignore audio playback errors */
  }
}
