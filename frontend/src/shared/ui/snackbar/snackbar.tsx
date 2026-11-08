import React from 'react';
import { createPortal } from 'react-dom';

import { useLingui } from '@lingui/react/macro';
import { X } from 'lucide-react';

import { usePresence } from 'shared/hooks/use-presence';
import { cn } from 'shared/utils/cn';

import styles from './snackbar.module.css';

interface Props {
  open: boolean;
  onClose: () => void;
  message: React.ReactNode;
  icon?: React.ReactNode;
  actionLabel?: React.ReactNode;
  onAction?: () => void;
  durationMs?: number;
  tone?: 'default' | 'warning';
  showId?: number;
}

export const Snackbar = ({
  open,
  onClose,
  message,
  icon,
  actionLabel,
  onAction,
  durationMs = 5000,
  tone = 'default',
  showId = 0,
}: Props) => {
  const { t } = useLingui();
  const { mounted, closing } = usePresence(open, 200);
  const [paused, setPaused] = React.useState(false);
  const boxRef = React.useRef<HTMLDivElement | null>(null);
  const lastShowId = React.useRef(showId);
  const wasVisible = React.useRef(false);

  React.useEffect(() => {
    const repeated = lastShowId.current !== showId && wasVisible.current;

    lastShowId.current = showId;
    wasVisible.current = open;

    if (!repeated || tone !== 'warning' || !boxRef.current) {
      return;
    }

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    boxRef.current.animate(
      [
        { transform: 'translateX(0)' },
        { transform: 'translateX(-8px)' },
        { transform: 'translateX(7px)' },
        { transform: 'translateX(-5px)' },
        { transform: 'translateX(3px)' },
        { transform: 'translateX(0)' },
      ],
      { duration: 380, easing: 'ease-out' }
    );
  }, [showId, tone, open]);
  const close = React.useEffectEvent(onClose);

  React.useEffect(() => {
    if (!open || paused) {
      return;
    }

    const timer = window.setTimeout(() => close(), durationMs);

    return () => window.clearTimeout(timer);
  }, [open, paused, durationMs, showId]);

  if (!mounted) {
    return null;
  }

  return createPortal(
    <div className={styles.viewport}>
      <div
        ref={boxRef}
        className={cn(
          styles.snackbar,
          tone === 'warning' && styles.warning,
          closing && styles.closing
        )}
        role="status"
        aria-live="polite"
        onPointerEnter={() => setPaused(true)}
        onPointerLeave={() => setPaused(false)}
      >
        {icon ? <span className={styles.icon}>{icon}</span> : null}
        <span className={styles.message}>{message}</span>
        {actionLabel && onAction ? (
          <button type="button" className={styles.action} onClick={onAction}>
            {actionLabel}
          </button>
        ) : null}
        <button
          type="button"
          className={styles.close}
          onClick={onClose}
          aria-label={t`Close`}
        >
          <X size={16} />
        </button>
        {!paused && !closing ? (
          <span
            key={showId}
            className={styles.timer}
            style={{ animationDuration: `${durationMs}ms` }}
            aria-hidden="true"
          />
        ) : null}
      </div>
    </div>,
    document.body
  );
};
