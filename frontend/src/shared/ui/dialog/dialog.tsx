import React from 'react';
import { createPortal } from 'react-dom';

import { useLingui } from '@lingui/react/macro';
import { X } from 'lucide-react';

import { usePresence } from 'shared/hooks/use-presence';
import { useSwipeToClose } from 'shared/hooks/use-swipe-to-close';
import { cn } from 'shared/utils/cn';

import styles from './dialog.module.css';

interface Props {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  leading?: React.ReactNode;
  titleAddon?: React.ReactNode;
  variant?: 'center' | 'bottom';
  skipEnter?: boolean;
}

export const Dialog = ({
  open,
  onClose,
  title,
  leading,
  titleAddon,
  variant = 'center',
  skipEnter = false,
  children,
}: React.PropsWithChildren<Props>) => {
  const { t } = useLingui();
  const panelRef = React.useRef<HTMLDivElement | null>(null);

  const { mounted: rendered, closing } = usePresence(open);

  const swipe = useSwipeToClose(onClose, variant === 'bottom');
  const dragY = swipe.offset;
  const dragHandlers = swipe.handlers;
  const resetSwipe = React.useEffectEvent(() => swipe.reset());

  React.useEffect(() => {
    if (!rendered) {
      resetSwipe();
    }
  }, [rendered]);

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

  return createPortal(
    <div
      className={cn(
        styles.overlay,
        skipEnter && styles.noEnter,
        closing && styles.overlayClosing
      )}
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panelRef}
        className={cn(
          styles.panel,
          styles[variant],
          skipEnter && styles.noEnter,
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
