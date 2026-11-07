import React from 'react';

interface Options {
  /** Listen only while true (the popover is open). */
  enabled: boolean;
  /** Clicks inside these elements don't dismiss (the panel, its anchor). */
  insideRefs: React.RefObject<Element | null>[];
  /** Clicks inside elements matching this selector don't dismiss either
   *  (portaled dialogs, third-party modals, a toggle button). */
  keepOpenSelector?: string;
  /** Escape pressed inside elements matching this selector is theirs. */
  ignoreEscapeSelector?: string;
  onDismiss: () => void;
}

/** Closes a non-modal popover on an outside pointer-down or on Escape. */
export const useDismiss = ({
  enabled,
  insideRefs,
  keepOpenSelector,
  ignoreEscapeSelector,
  onDismiss,
}: Options) => {
  const dismiss = React.useEffectEvent(onDismiss);
  const isInside = React.useEffectEvent((target: EventTarget | null) => {
    if (!(target instanceof Node)) {
      return false;
    }

    return (
      insideRefs.some(ref => ref.current?.contains(target)) ||
      Boolean(
        keepOpenSelector &&
        target instanceof Element &&
        target.closest(keepOpenSelector)
      )
    );
  });

  React.useEffect(() => {
    if (!enabled) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      if (!isInside(event.target)) {
        dismiss();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      if (
        ignoreEscapeSelector &&
        event.target instanceof Element &&
        event.target.closest(ignoreEscapeSelector)
      ) {
        return;
      }

      dismiss();
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [enabled, ignoreEscapeSelector]);
};
