/**
 * Bottom-sheet drawer (Apple Maps style).
 *
 * Three discrete states on mobile — `collapsed` shows just the always-on
 * summary row (~140px), `mid` opens to ~50dvh, `expanded` to ~80dvh. The
 * user toggles via tap on the grip or via vertical drag.
 *
 * On desktop (≥1280px) the same DOM is repositioned by CSS as an
 * anchored side panel; the state attribute is then irrelevant — the
 * panel is always fully visible. We still update the data-state for
 * consistency, in case a future style needs it, but no transform.
 *
 * The component does NOT take focus and does NOT trap focus when
 * expanded. Modal flows still go through `.screen` overlays.
 */

export type SheetState = 'collapsed' | 'mid' | 'expanded';

export interface BottomSheetOptions {
  /** Always-visible content row shown in every state. Typically the
   * current-unit chip + Ruota/Conferma buttons. */
  summary: HTMLElement;
  /** Body shown when the sheet is mid or expanded. Tray fleet grid +
   * collapsible legend + collapsible log live here. */
  body: HTMLElement;
  initialState?: SheetState;
  onStateChange?: (state: SheetState) => void;
}

export interface BottomSheet {
  el: HTMLElement;
  setState: (state: SheetState) => void;
  getState: () => SheetState;
  destroy: () => void;
}

const DRAG_THRESHOLD_PX = 6;

export function createBottomSheet(opts: BottomSheetOptions): BottomSheet {
  const root = document.createElement('section');
  root.className = 'bottom-sheet';
  root.setAttribute('aria-label', 'Pannello flotta');
  root.dataset.state = opts.initialState ?? 'mid';

  const grip = document.createElement('button');
  grip.type = 'button';
  grip.className = 'bottom-sheet-grip';
  grip.setAttribute('aria-label', 'Espandi o riduci il pannello');
  grip.innerHTML = '<span class="bottom-sheet-grip-bar" aria-hidden="true"></span>';

  const summary = document.createElement('div');
  summary.className = 'bottom-sheet-summary';
  summary.appendChild(opts.summary);

  const body = document.createElement('div');
  body.className = 'bottom-sheet-body';
  body.appendChild(opts.body);

  root.appendChild(grip);
  root.appendChild(summary);
  root.appendChild(body);

  const setState = (next: SheetState): void => {
    if (root.dataset.state === next) return;
    root.dataset.state = next;
    document.body.dataset.sheetState = next;
    opts.onStateChange?.(next);
  };
  // Sync the body attribute so other UI (layer picker) can react via CSS.
  document.body.dataset.sheetState = root.dataset.state ?? 'mid';

  // ---- tap on grip cycles state -------------------------------------------
  // Cycle: collapsed → mid → expanded → collapsed. Skip on drag (handled by
  // the drag controller, which calls setState directly to a snapped value).
  let tapDownY: number | null = null;
  let dragMoved = false;
  grip.addEventListener('pointerdown', (e: PointerEvent) => {
    tapDownY = e.clientY;
    dragMoved = false;
  });
  grip.addEventListener('pointermove', (e: PointerEvent) => {
    if (tapDownY === null) return;
    if (Math.abs(e.clientY - tapDownY) > DRAG_THRESHOLD_PX) dragMoved = true;
  });
  grip.addEventListener('pointerup', () => {
    if (!dragMoved) {
      const order: SheetState[] = ['collapsed', 'mid', 'expanded'];
      const cur = (root.dataset.state as SheetState) ?? 'mid';
      const idx = order.indexOf(cur);
      const next = order[(idx + 1) % order.length]!;
      setState(next);
    }
    tapDownY = null;
    dragMoved = false;
  });

  // ---- vertical drag snaps to nearest state -------------------------------
  // Drag math is in viewport-percentage units (delta-y / window.innerHeight
  // mapped to a sheet height fraction). The actual pixel translate during
  // drag is applied via CSS variable so we don't fight the transition.
  let dragStartY = 0;
  let dragStartState: SheetState = 'mid';
  let isDragging = false;

  const onDragStart = (e: PointerEvent): void => {
    if (!matchesMobileLayout()) return;
    if (e.button !== undefined && e.button !== 0) return;
    isDragging = true;
    dragStartY = e.clientY;
    dragStartState = (root.dataset.state as SheetState) ?? 'mid';
    root.classList.add('is-dragging');
    if (e.pointerType !== 'touch' && grip.setPointerCapture) {
      try {
        grip.setPointerCapture(e.pointerId);
      } catch {
        // non-fatal
      }
    }
  };
  const onDragMove = (e: PointerEvent): void => {
    if (!isDragging) return;
    const deltaY = e.clientY - dragStartY;
    // translate in pixels relative to the start state's translate baseline.
    // We compute via CSS var: --sheet-drag = current pixel offset (positive
    // = sheet pulled DOWN i.e. translateY is added).
    root.style.setProperty('--sheet-drag-px', `${deltaY}px`);
  };
  const onDragEnd = (e: PointerEvent): void => {
    if (!isDragging) return;
    isDragging = false;
    root.classList.remove('is-dragging');
    root.style.removeProperty('--sheet-drag-px');
    if (grip.hasPointerCapture?.(e.pointerId)) {
      try {
        grip.releasePointerCapture(e.pointerId);
      } catch {
        // non-fatal
      }
    }
    const deltaY = e.clientY - dragStartY;
    if (Math.abs(deltaY) < 24) {
      // tiny move — keep state, the grip's tap handler will cycle if no drag
      return;
    }
    setState(snapFromDelta(dragStartState, deltaY));
  };

  grip.addEventListener('pointerdown', onDragStart, { passive: true });
  grip.addEventListener('pointermove', onDragMove, { passive: true });
  grip.addEventListener('pointerup', onDragEnd);
  grip.addEventListener('pointercancel', onDragEnd);

  const destroy = (): void => {
    delete document.body.dataset.sheetState;
    root.remove();
  };

  return {
    el: root,
    setState,
    getState: () => (root.dataset.state as SheetState) ?? 'mid',
    destroy,
  };
}

function matchesMobileLayout(): boolean {
  return window.matchMedia('(max-width: 1279px)').matches;
}

/** Snap rules: positive deltaY (drag down) → less expanded; negative → more. */
function snapFromDelta(start: SheetState, deltaY: number): SheetState {
  const order: SheetState[] = ['collapsed', 'mid', 'expanded'];
  const startIdx = order.indexOf(start);
  // Roughly one snap per 80px of drag. Negative deltaY moves toward
  // 'expanded' (higher index); positive toward 'collapsed' (lower index).
  const steps = Math.round(-deltaY / 80);
  const targetIdx = Math.max(0, Math.min(order.length - 1, startIdx + steps));
  return order[targetIdx]!;
}
