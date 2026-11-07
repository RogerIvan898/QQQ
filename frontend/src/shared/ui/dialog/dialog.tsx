import React from 'react';
import { createPortal } from 'react-dom';

import { useLingui } from '@lingui/react/macro';
import { X } from 'lucide-react';

import { cn } from 'shared/utils/cn';

import styles from './dialog.module.css';

interface Props {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  leading?: React.ReactNode;
  titleAddon?: React.ReactNode;
  variant?: 'center' | 'bottom';
}

/** Must match the exit animations in dialog.module.css. */
const EXIT_MS = 200;
/** Dragging a bottom sheet down this far (px) dismisses it on release. */
const SWIPE_CLOSE_PX = 90;

export const Dialog = ({
  open,
  onClose,
  title,
  leading,
  titleAddon,
  variant = 'center',
  children,
}: React.PropsWithChildren<Props>) => {
  const { t } = useLingui();
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  // Stay mounted while the exit animation plays after `open` turns false.
  const [rendered, setRendered] = React.useState(open);
  const [closing, setClosing] = React.useState(false);
  const [dragY, setDragY] = React.useState(0);
  const dragStart = React.useRef<number | null>(null);

  if (open && !rendered) {
    setRendered(true);
    setClosing(false);
  }

  if (!open && rendered && !closing) {
    setClosing(true);
  }

  React.useEffect(() => {
    if (!closing) {
      return;
    }

    const timer = window.setTimeout(() => {
      setRendered(false);
      setClosing(false);
      setDragY(0);
    }, EXIT_MS);

    return () => window.clearTimeout(timer);
  }, [closing]);

  const close = React.useEffectEvent(onClose);

  React.useEffect(() => {
    if (!open) {
      return;
    }

    panelRef.current?.focus({ preventScroll: true });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
      }
    };

    document.addEventListener('keydown', onKeyDown);

    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  if (!rendered) {
    return null;
  }

  // Swipe-down to dismiss, from the grab handle or the header only, so
  // scrolling the body never drags the sheet.
  const onDragStart = (event: React.PointerEvent) => {
    if (variant !== 'bottom') {
      return;
    }

    // Capture lazily (in move), so a plain tap on a header button still clicks.
    dragStart.current = event.clientY;
  };

  const onDragMove = (event: React.PointerEvent) => {
    if (dragStart.current === null) {
      return;
    }

    const delta = event.clientY - dragStart.current;

    if (delta > 4 && !event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }

    setDragY(Math.max(0, delta));
  };

  const onDragEnd = () => {
    if (dragStart.current === null) {
      return;
    }

    dragStart.current = null;

    if (dragY > SWIPE_CLOSE_PX) {
      onClose();
    } else {
      setDragY(0);
    }
  };

  const dragHandlers = {
    onPointerDown: onDragStart,
    onPointerMove: onDragMove,
    onPointerUp: onDragEnd,
    onPointerCancel: onDragEnd,
  };

  return createPortal(
    <div
      className={cn(styles.overlay, closing && styles.overlayClosing)}
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panelRef}
        className={cn(
          styles.panel,
          styles[variant],
          closing && styles.panelClosing,
          dragY > 0 && styles.dragging
        )}
        style={dragY > 0 ? { transform: `translateY(${dragY}px)` } : undefined}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        tabIndex={-1}
        onClick={e => e.stopPropagation()}
      >
        {variant === 'bottom' && (
          <div className={styles.grabber} aria-hidden="true" {...dragHandlers}>
            <span className={styles.grabberBar} />
          </div>
        )}

        <header className={styles.header} {...dragHandlers}>
          {leading ?? <div className={styles.headerSide} />}

          <div className={styles.titleGroup}>
            {title != null && <h2 className={styles.title}>{title}</h2>}
            {titleAddon}
          </div>

          <div className={styles.headerSide}>
            <button
              type="button"
              className={styles.iconBtn}
              onClick={onClose}
              onPointerDown={e => e.stopPropagation()}
              aria-label={t`Close`}
            >
              <X size={18} />
            </button>
          </div>
        </header>

        <div className={styles.body}>{children}</div>
      </div>
    </div>,
    document.body
  );
};
