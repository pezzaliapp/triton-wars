/**
 * Tiny focus-trap helper for modals. Captures the previously-focused
 * element, redirects Tab navigation to stay inside the container, and
 * restores focus when released.
 */

const FOCUSABLE = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export interface FocusTrap {
  release: () => void;
}

export function trapFocus(container: HTMLElement, onEscape?: () => void): FocusTrap {
  const previouslyFocused = (document.activeElement as HTMLElement | null) ?? null;
  const focusables = (): HTMLElement[] =>
    Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => el.offsetParent !== null || el === document.activeElement,
    );

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && onEscape) {
      e.preventDefault();
      onEscape();
      return;
    }
    if (e.key !== 'Tab') return;
    const items = focusables();
    if (items.length === 0) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  document.addEventListener('keydown', onKey);

  // Focus the first focusable element after a tick so the modal is rendered.
  window.setTimeout(() => {
    const first = focusables()[0];
    first?.focus();
  }, 0);

  return {
    release() {
      document.removeEventListener('keydown', onKey);
      previouslyFocused?.focus?.();
    },
  };
}
