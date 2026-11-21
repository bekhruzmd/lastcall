import { useLayoutEffect, useRef } from 'react';

// The student header re-mounts on each page, so the pill remembers where it was.
let lastPill: { left: number; width: number } | null = null;

/** Sliding pill behind the active tab of a segmented nav. */
export function useSlidingPill<T extends HTMLElement>(activeSelector: string, deps: unknown[]) {
  const navRef = useRef<T>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  // Read once per mount so a repeated effect run (StrictMode) still slides from the old tab.
  const fromRef = useRef(lastPill);

  useLayoutEffect(() => {
    const nav = navRef.current;
    const pill = pillRef.current;
    if (!nav || !pill) return;

    const place = (animate: boolean) => {
      const active = nav.querySelector<HTMLElement>(activeSelector);
      if (!active) {
        pill.style.opacity = '0';
        lastPill = null;
        fromRef.current = null;
        return;
      }
      const target = { left: active.offsetLeft, width: active.offsetWidth };
      const from = animate ? fromRef.current : null;

      pill.style.transition = 'none';
      pill.style.opacity = '1';
      const start = from ?? target;
      pill.style.transform = `translateX(${start.left}px)`;
      pill.style.width = `${start.width}px`;

      if (from && (from.left !== target.left || from.width !== target.width)) {
        void pill.offsetWidth; // commit the start position before transitioning
        pill.style.transition = '';
        pill.style.transform = `translateX(${target.left}px)`;
        pill.style.width = `${target.width}px`;
      } else {
        void pill.offsetWidth;
        pill.style.transition = '';
      }
      lastPill = target;
    };

    place(true);
    const onResize = () => place(false);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { navRef, pillRef };
}
