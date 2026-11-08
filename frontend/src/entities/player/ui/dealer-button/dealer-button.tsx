import { useLayoutEffect, useRef } from 'react';

import { cn } from 'shared/utils/cn';

import styles from './dealer-button.module.css';

interface Props {
  className?: string;
  compact?: boolean;
}

type Point = { x: number; y: number };

const HANDOFF_WINDOW_MS = 600;
const SLIDE_MS = 750;
const ARC_STEPS = 16;

let lastSpot: (Point & { at: number }) | null = null;

const freshSpot = () =>
  lastSpot && performance.now() - lastSpot.at < HANDOFF_WINDOW_MS
    ? lastSpot
    : null;

const arcKeyframes = (from: Point, to: Point): Keyframe[] => {
  const table = document
    .querySelector('[data-table-surface]')
    ?.getBoundingClientRect();

  if (!table || table.width === 0 || table.height === 0) {
    return [
      { transform: `translate(${from.x - to.x}px, ${from.y - to.y}px)` },
      { transform: 'translate(0, 0)' },
    ];
  }

  const cx = table.left + table.width / 2;
  const cy = table.top + table.height / 2;
  const rx = table.width / 2;
  const ry = table.height / 2;

  const polar = (p: Point) => {
    const nx = (p.x - cx) / rx;
    const ny = (p.y - cy) / ry;

    return { angle: Math.atan2(ny, nx), radius: Math.hypot(nx, ny) };
  };

  const start = polar(from);
  const end = polar(to);
  let delta = end.angle - start.angle;

  if (delta > Math.PI) {
    delta -= 2 * Math.PI;
  } else if (delta < -Math.PI) {
    delta += 2 * Math.PI;
  }

  return Array.from({ length: ARC_STEPS + 1 }, (_, i) => {
    const t = i / ARC_STEPS;
    const angle = start.angle + delta * t;
    const radius = start.radius + (end.radius - start.radius) * t;
    const x = cx + Math.cos(angle) * radius * rx;
    const y = cy + Math.sin(angle) * radius * ry;

    return { transform: `translate(${x - to.x}px, ${y - to.y}px)` };
  });
};

export const DealerButton = ({ className, compact = false }: Props) => {
  const ref = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const element = ref.current;

    if (!compact || !element) {
      return;
    }

    const from = freshSpot();
    const box = element.getBoundingClientRect();
    const reduce = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;

    if (from && !reduce) {
      element.firstElementChild
        ?.getAnimations()
        .forEach(animation => animation.cancel());

      const to = { x: box.left + box.width / 2, y: box.top + box.height / 2 };

      element.animate(arcKeyframes(from, to), {
        duration: SLIDE_MS,
        easing: 'cubic-bezier(0.45, 0, 0.2, 1)',
      });
    }

    lastSpot = null;

    return () => {
      const rect = element.getBoundingClientRect();

      if (rect.width > 0) {
        lastSpot = {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
          at: performance.now(),
        };
      }
    };
  }, [compact]);

  return (
    <div ref={ref} className={styles.mover}>
      <div
        className={cn(
          styles.dealerButton,
          compact && styles.compact,
          className
        )}
      >
        <span className={styles.letter}>D</span>
      </div>
    </div>
  );
};
