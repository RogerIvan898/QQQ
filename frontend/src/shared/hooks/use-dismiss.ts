import React from 'react';

interface Options {
  enabled: boolean;

  insideRefs: React.RefObject<Element | null>[];

  keepOpenSelector?: string;

  ignoreEscapeSelector?: string;
  onDismiss: () => void;
}

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
