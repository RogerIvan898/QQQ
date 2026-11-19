import React from 'react';
import { createPortal } from 'react-dom';

import { useLingui } from '@lingui/react/macro';
import { X } from 'lucide-react';

import { useMediaQuery } from 'shared/hooks/use-media-query';
import { usePresence } from 'shared/hooks/use-presence';
import { useSwipeToClose } from 'shared/hooks/use-swipe-to-close';
import { cn } from 'shared/utils/cn';

import styles from './dialog.module.css';

const openPanels: HTMLDivElement[] = [];
const TABBABLE =
  'a[href], button, input, select, textarea, [tabindex], [contenteditable="true"]';

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

  const isPhone = useMediaQuery('(max-width: 600px)');
  const isSheet = variant === 'bottom' && isPhone;
  const swipe = useSwipeToClose(onClose, isSheet);
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
    const panel = panelRef.current;
    if (!open || !panel) return;

    const previousFocus = document.activeElement;
    const previousPanel = openPanels.at(-1);
    if (previousPanel) previousPanel.inert = true;
    openPanels.push(panel);
    panel.focus({ preventScroll: true });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || openPanels.at(-1) !== panel) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        close();

        return;
      }

      if (event.key !== 'Tab') return;

      const tabbable = Array.from(
        panel.querySelectorAll<HTMLElement>(TABBABLE)
      ).filter(
        element =>
          element.tabIndex >= 0 &&
          !element.matches(':disabled') &&
          !element.closest('[inert]') &&
          element.getClientRects().length > 0 &&
          getComputedStyle(element).visibility === 'visible'
      );
      const active = document.activeElement;
      const first = tabbable[0];
      const last = tabbable.at(-1);
      const focusInside =
        active instanceof HTMLElement && tabbable.includes(active);
      if (
        first &&
        last &&
        focusInside &&
        (event.shiftKey ? active !== first : active !== last)
      )
        return;

      event.preventDefault();
      (event.shiftKey ? (last ?? panel) : (first ?? panel)).focus({
        preventScroll: true,
      });
    };

    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);

      const wasTop = openPanels.at(-1) === panel;
      openPanels.splice(openPanels.indexOf(panel), 1);
      if (!wasTop) return;

      const nextPanel = openPanels.at(-1);
      if (nextPanel) nextPanel.inert = false;
      if (
        previousFocus instanceof HTMLElement &&
        previousFocus.isConnected &&
        (!nextPanel || nextPanel.contains(previousFocus))
      ) {
        previousFocus.focus({ preventScroll: true });
      } else {
        nextPanel?.focus({ preventScroll: true });
      }
    };
  }, [open, rendered]);

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
        aria-modal={open ? true : undefined}
        inert={!open}
        aria-label={typeof title === 'string' ? title : undefined}
        tabIndex={-1}
        onClick={e => e.stopPropagation()}
      >
        {isSheet && (
          <div className={styles.grabber} aria-hidden="true" {...dragHandlers}>
            <span className={styles.grabberBar} />
          </div>
        )}

        <header
          className={styles.header}
          {...(isSheet ? dragHandlers : undefined)}
        >
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
