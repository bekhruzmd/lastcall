import { useState } from 'react';
import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

/** Re-mounts its children on every route change so each page plays the enter animation. */
export function PageTransition({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <div key={pathname} className="page-enter">
      {children}
    </div>
  );
}

/**
 * A number that cross-fades when its value changes, rising for increases and
 * falling for decreases. The first render does not animate.
 */
export function NumberChange({ value, className }: { value: number; className?: string }) {
  const [prev, setPrev] = useState(value);
  const [dir, setDir] = useState<'up' | 'down' | null>(null);
  if (value !== prev) {
    setDir(value > prev ? 'up' : 'down');
    setPrev(value);
  }
  const classes = ['num', 'num-change', dir ? `num-change-${dir}` : '', className ?? '']
    .filter(Boolean)
    .join(' ');
  return (
    <span key={value} className={classes}>
      {value}
    </span>
  );
}

/** Two icons in one slot; the visible one cross-fades with scale and blur. */
export function IconSwap({ showSecond, first, second }: { showSecond: boolean; first: ReactNode; second: ReactNode }) {
  return (
    <span className="icon-swap" data-second={showSecond ? 'true' : 'false'} aria-hidden="true">
      <span className="icon-swap-item icon-swap-first">{first}</span>
      <span className="icon-swap-item icon-swap-second">{second}</span>
    </span>
  );
}

/** Check mark that fades in, settles its rotation and draws its stroke. */
export function SuccessCheck({ size = 20 }: { size?: number }) {
  return (
    <svg
      className="success-check"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle className="success-check-ring" cx="12" cy="12" r="10" />
      <path className="success-check-path" d="M7.5 12.5l3 3 6-6.5" pathLength={1} />
    </svg>
  );
}
