import { useEffect, useRef, type RefObject } from 'react';

/** Keep keyboard focus inside the active overlay and return it when the overlay closes. */
export function useDialog<T extends HTMLElement>(onClose: () => void, returnFocusRef?: RefObject<HTMLElement | null>, modal = true) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    if (modal) document.body.style.overflow = 'hidden';
    const focusable = () => Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])') ?? []);
    const panel = ref.current;
    const marker = '[data-dialog-initial-focus]';
    const initialFocus = panel?.matches(marker) ? panel : panel?.querySelector<HTMLElement>(marker) ?? focusable()[0];
    initialFocus?.focus({ preventScroll: true });
    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented || (!modal && !panel?.contains(document.activeElement))) return;
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
      if (!modal || event.key !== 'Tab') return;
      const items = focusable();
      if (!items.length) { event.preventDefault(); return; }
      const first = items[0]; const last = items[items.length - 1];
      const active = document.activeElement;
      const focusOutsideControls = !items.some(item => item === active);
      if (event.shiftKey && (active === first || focusOutsideControls)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (active === last || focusOutsideControls)) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
      if (modal) document.body.style.overflow = previousOverflow;
      if (!modal && document.activeElement !== document.body && !panel?.contains(document.activeElement)) return;
      const returnFocus = returnFocusRef?.current;
      (returnFocus?.isConnected ? returnFocus : previousFocus)?.focus({ preventScroll: true });
    };
  }, [modal, onClose, returnFocusRef]);
  return ref;
}
