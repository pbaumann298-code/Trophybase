import { useCallback, useEffect, useMemo, useRef } from 'react';

const SWIPE_MIN_DISTANCE = 60;
/** Horizontale Strecke muss die vertikale deutlich schlagen, sonst bleibt es normales Scrollen. */
const SWIPE_AXIS_RATIO = 1.5;
const SWIPE_MAX_DURATION = 1000;

const TEXT_ENTRY_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);
const EMBEDDED_CONTENT_TAGS = new Set(['IFRAME', 'VIDEO', 'AUDIO', 'CANVAS']);

function isHorizontallyScrollable(element) {
  if (element.scrollWidth <= element.clientWidth + 1) return false;
  const { overflowX } = window.getComputedStyle(element);
  return overflowX === 'auto' || overflowX === 'scroll';
}

/**
 * Tote Zone: Karussells, Tabellen, Videoplayer und Eingabefelder behalten ihre
 * eigene Wischgeste. Läuft vom Ziel bis zur Wurzel des Guide-Bereichs.
 */
function isSwipeDeadZone(target, root) {
  for (let node = target; node instanceof HTMLElement; node = node.parentElement) {
    if (TEXT_ENTRY_TAGS.has(node.tagName)) return true;
    if (EMBEDDED_CONTENT_TAGS.has(node.tagName)) return true;
    if (node.isContentEditable) return true;
    if (node.dataset.noSwipe !== undefined) return true;
    if (isHorizontallyScrollable(node)) return true;
    if (node === root) break;
  }
  return false;
}

function blocksTabShortcut(element) {
  if (!(element instanceof HTMLElement)) return false;
  if (TEXT_ENTRY_TAGS.has(element.tagName)) return true;
  if (EMBEDDED_CONTENT_TAGS.has(element.tagName)) return true;
  if (element.isContentEditable) return true;
  if (element.getAttribute('role') === 'textbox') return true;
  // Pfeiltasten scrollen hier den Container – die gehören nicht uns.
  for (let node = element; node instanceof HTMLElement; node = node.parentElement) {
    if (isHorizontallyScrollable(node)) return true;
  }
  return false;
}

function hasOpenDialog() {
  return Boolean(document.querySelector('dialog[open], [role="dialog"], [role="alertdialog"]'));
}

/**
 * Reiter-Navigation per Wischgeste (mobil), Pfeiltasten (Desktop) und über die
 * zurückgegebenen Callbacks für On-Screen-Buttons.
 *
 * @param {object}   options
 * @param {string[]} options.tabs         sichtbare Reiter-IDs in Anzeigereihenfolge
 * @param {string}   options.activeTab
 * @param {(tabId: string) => void} options.onTabChange
 * @param {object}   options.containerRef Wurzel für die Wischerkennung
 * @param {boolean}  [options.enabled]
 */
export function useTabNavigation({
  tabs,
  activeTab,
  onTabChange,
  containerRef,
  enabled = true,
}) {
  const activeIndex = tabs.indexOf(activeTab);
  const canGoPrev = activeIndex > 0;
  const canGoNext = activeIndex >= 0 && activeIndex < tabs.length - 1;

  // Listener werden einmal registriert und lesen den aktuellen Stand aus der Ref.
  const stateRef = useRef({ tabs, activeIndex, onTabChange });

  useEffect(() => {
    stateRef.current = { tabs, activeIndex, onTabChange };
  }, [tabs, activeIndex, onTabChange]);

  const shiftTab = useCallback((offset) => {
    const { tabs: currentTabs, activeIndex: index, onTabChange: change } = stateRef.current;
    if (index < 0) return false;
    const nextIndex = Math.min(Math.max(index + offset, 0), currentTabs.length - 1);
    if (nextIndex === index) return false;
    change(currentTabs[nextIndex]);
    return true;
  }, []);

  const goToPrevTab = useCallback(() => shiftTab(-1), [shiftTab]);
  const goToNextTab = useCallback(() => shiftTab(1), [shiftTab]);

  useEffect(() => {
    if (!enabled) return undefined;

    const root = containerRef?.current;
    if (!root) return undefined;

    let start = null;

    const onTouchStart = (event) => {
      if (event.touches.length !== 1) {
        start = null;
        return;
      }
      const touch = event.touches[0];
      if (isSwipeDeadZone(event.target, root)) {
        start = null;
        return;
      }
      start = { x: touch.clientX, y: touch.clientY, time: Date.now() };
    };

    const onTouchEnd = (event) => {
      const origin = start;
      start = null;
      if (!origin || event.changedTouches.length !== 1) return;

      const touch = event.changedTouches[0];
      const deltaX = touch.clientX - origin.x;
      const deltaY = touch.clientY - origin.y;

      if (Date.now() - origin.time > SWIPE_MAX_DURATION) return;
      if (Math.abs(deltaX) < SWIPE_MIN_DISTANCE) return;
      if (Math.abs(deltaX) <= Math.abs(deltaY) * SWIPE_AXIS_RATIO) return;

      if (deltaX < 0) shiftTab(1);
      else shiftTab(-1);
    };

    const onTouchCancel = () => {
      start = null;
    };

    // Passiv: wir unterbinden nie das native Scrollen.
    const options = { passive: true };
    root.addEventListener('touchstart', onTouchStart, options);
    root.addEventListener('touchend', onTouchEnd, options);
    root.addEventListener('touchcancel', onTouchCancel, options);

    return () => {
      root.removeEventListener('touchstart', onTouchStart, options);
      root.removeEventListener('touchend', onTouchEnd, options);
      root.removeEventListener('touchcancel', onTouchCancel, options);
    };
  }, [enabled, containerRef, shiftTab]);

  useEffect(() => {
    if (!enabled) return undefined;

    const onKeyDown = (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      if (event.defaultPrevented || event.repeat) return;
      if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
      if (blocksTabShortcut(document.activeElement)) return;
      if (hasOpenDialog()) return;

      const switched = shiftTab(event.key === 'ArrowRight' ? 1 : -1);
      if (switched) event.preventDefault();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled, shiftTab]);

  return useMemo(
    () => ({ goToPrevTab, goToNextTab, canGoPrev, canGoNext }),
    [goToPrevTab, goToNextTab, canGoPrev, canGoNext],
  );
}
