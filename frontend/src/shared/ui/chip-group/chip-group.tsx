import React from 'react';

import { useLingui } from '@lingui/react/macro';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { cn } from 'shared/utils/cn';

import styles from './chip-group.module.css';

export interface ChipItem<T extends string> {
  id: T;
  label: React.ReactNode;
}

interface Props<T extends string> {
  items: readonly ChipItem<T>[];
  value: T;
  onChange: (id: T) => void;
  /** Accessible name of the group, e.g. "Period". */
  label?: string;
  className?: string;
}

/** How far one arrow press scrolls, as a share of the visible width. */
const PAGE_SHARE = 0.7;
/** Ignore sub-pixel leftovers when deciding whether an edge is reached. */
const EDGE_EPSILON = 2;

/**
 * A single-choice row of chips. When they don't fit it scrolls sideways,
 * and arrows appear on whichever side still has hidden chips.
 */
export const ChipGroup = <T extends string>({
  items,
  value,
  onChange,
  label,
  className,
}: Props<T>) => {
  const { t } = useLingui();
  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const [canLeft, setCanLeft] = React.useState(false);
  const [canRight, setCanRight] = React.useState(false);

  const updateEdges = React.useCallback(() => {
    const track = trackRef.current;

    if (!track) {
      return;
    }

    const maxScroll = track.scrollWidth - track.clientWidth;

    setCanLeft(track.scrollLeft > EDGE_EPSILON);
    setCanRight(track.scrollLeft < maxScroll - EDGE_EPSILON);
  }, []);

  React.useEffect(() => {
    const track = trackRef.current;

    if (!track) {
      return;
    }

    updateEdges();

    const observer = new ResizeObserver(updateEdges);

    observer.observe(track);
    track.addEventListener('scroll', updateEdges, { passive: true });

    return () => {
      observer.disconnect();
      track.removeEventListener('scroll', updateEdges);
    };
  }, [updateEdges, items.length]);

  // Keep the selected chip in view (e.g. picked from the far end).
  React.useEffect(() => {
    const chip = trackRef.current?.querySelector<HTMLElement>(
      '[aria-selected="true"]'
    );

    chip?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [value]);

  const page = (direction: -1 | 1) => {
    const track = trackRef.current;

    track?.scrollBy({
      left: direction * track.clientWidth * PAGE_SHARE,
      behavior: 'smooth',
    });
  };

  return (
    <div className={cn(styles.root, className)}>
      {canLeft && (
        <button
          type="button"
          className={cn(styles.arrow, styles.arrowLeft)}
          onClick={() => page(-1)}
          aria-label={t`Scroll left`}
        >
          <ChevronLeft size={20} strokeWidth={2.5} />
        </button>
      )}

      <div
        ref={trackRef}
        className={styles.track}
        role="tablist"
        aria-label={label}
      >
        {items.map(item => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={item.id === value}
            className={cn(styles.chip, item.id === value && styles.chipActive)}
            onClick={() => onChange(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {canRight && (
        <button
          type="button"
          className={cn(styles.arrow, styles.arrowRight)}
          onClick={() => page(1)}
          aria-label={t`Scroll right`}
        >
          <ChevronRight size={20} strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
};
