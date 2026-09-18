import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

/** Inhalte wachsen nach dem Mount noch (Bilder, Akkordeons) – Ziel ein paar Frames halten. */
const RESTORE_FRAMES = 12;
const ANCHOR_GAP = 8;

function stickyHeaderOffset() {
  const header = document.querySelector('.site-header');
  if (!header) return 0;
  const { position } = window.getComputedStyle(header);
  if (position !== 'sticky' && position !== 'fixed') return 0;
  return header.getBoundingClientRect().height;
}

function maxScrollTop() {
  return Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
}

function anchorScrollTop(anchor) {
  if (!anchor) return 0;
  const top = anchor.getBoundingClientRect().top + window.scrollY;
  return Math.max(0, top - stickyHeaderOffset() - ANCHOR_GAP);
}

/**
 * Merkt sich die Scroll-Position je Reiter und stellt sie beim Zurückwechseln wieder her.
 * Nötig, weil inaktive Reiter komplett unmounted werden – der Browser kann hier nichts behalten.
 * Noch nicht besuchte Reiter starten am Anker (der Reiter-Leiste).
 *
 * @param {object}  options
 * @param {string}  options.activeTab
 * @param {object}  options.anchorRef  Element, an dem unbesuchte Reiter ausgerichtet werden
 * @param {any}     [options.resetKey] Wechsel löscht das Gedächtnis (z. B. anderes Spiel)
 * @param {boolean} [options.enabled]
 */
export function useTabScrollMemory({ activeTab, anchorRef, resetKey, enabled = true }) {
  const positionsRef = useRef(new Map());
  const activeTabRef = useRef(activeTab);
  const resetKeyRef = useRef(resetKey);
  const restoringRef = useRef(false);

  /** Vor dem Reiterwechsel aufrufen: nach dem Re-Render ist scrollY ggf. schon gekappt. */
  const rememberScroll = useCallback(() => {
    positionsRef.current.set(activeTabRef.current, window.scrollY);
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;

    let frame = 0;
    const onScroll = () => {
      if (restoringRef.current || frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        if (restoringRef.current) return;
        positionsRef.current.set(activeTabRef.current, window.scrollY);
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
    };
  }, [enabled]);

  useLayoutEffect(() => {
    const previousTab = activeTabRef.current;
    const previousKey = resetKeyRef.current;
    activeTabRef.current = activeTab;
    resetKeyRef.current = resetKey;

    if (previousKey !== resetKey) {
      // Anderes Spiel: altes Gedächtnis verwerfen und diesen Wechsel nicht anfassen.
      positionsRef.current.clear();
      return undefined;
    }
    if (!enabled || previousTab === activeTab) return undefined;

    const stored = positionsRef.current.get(activeTab);
    const hasStored = typeof stored === 'number';

    let frames = 0;
    let rafId = 0;
    let cancelled = false;

    const stop = () => {
      cancelled = true;
      restoringRef.current = false;
      if (rafId) window.cancelAnimationFrame(rafId);
      window.removeEventListener('wheel', stop);
      window.removeEventListener('touchstart', stop);
      window.removeEventListener('keydown', stop);
    };

    const step = () => {
      if (cancelled) return;

      const target = hasStored ? stored : anchorScrollTop(anchorRef?.current);
      const clamped = Math.min(target, maxScrollTop());
      if (Math.abs(window.scrollY - clamped) > 1) {
        window.scrollTo({ top: clamped, left: 0, behavior: 'instant' });
      }

      frames += 1;
      const reachedTarget = clamped >= target - 1;
      if (frames < RESTORE_FRAMES && !reachedTarget) {
        rafId = window.requestAnimationFrame(step);
        return;
      }
      stop();
    };

    restoringRef.current = true;
    // Nutzereingabe gewinnt immer gegen eine noch laufende Wiederherstellung.
    window.addEventListener('wheel', stop, { passive: true, once: true });
    window.addEventListener('touchstart', stop, { passive: true, once: true });
    window.addEventListener('keydown', stop, { once: true });
    step();

    return stop;
  }, [activeTab, resetKey, anchorRef, enabled]);

  return rememberScroll;
}
