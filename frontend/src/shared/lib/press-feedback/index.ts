const PRESSABLE =
  'button:not(:disabled), [role="button"]:not([aria-disabled="true"]), a[href]';

const SPRING =
  'linear(0, 0.009, 0.035 2.1%, 0.141, 0.281 6.7%, 0.723 12.9%, 0.938 16.7%, 1.017, 1.077, 1.121, 1.149 24.3%, 1.159, 1.163, 1.161, 1.154 29.9%, 1.129 32.8%, 1.051 39.6%, 1.017 43.1%, 0.991, 0.977 51%, 0.974 53.8%, 0.975 57.1%, 0.997 69.8%, 1.003 76.9%, 1.004 83.8%, 1)';

const pressedScale = (el: HTMLElement) => {
  const { width } = el.getBoundingClientRect();

  if (width > 280) {
    return 0.99;
  }

  return width > 120 ? 0.98 : 0.96;
};

let active: { el: HTMLElement; scale: number; anim: Animation } | null = null;

const release = () => {
  if (!active) {
    return;
  }

  const { el, scale, anim } = active;

  active = null;
  anim.cancel();
  requestAnimationFrame(() => {
    el.animate([{ scale: String(scale) }, { scale: '1' }], {
      duration: 420,
      easing: SPRING,
    });
  });
};

const press = (event: PointerEvent) => {
  if (event.button !== 0 || !(event.target instanceof Element)) {
    return;
  }

  const el = event.target.closest<HTMLElement>(PRESSABLE);

  if (!el || el.closest('[data-no-press]')) {
    return;
  }

  release();

  const scale = pressedScale(el);
  const anim = el.animate([{ scale: '1' }, { scale: String(scale) }], {
    duration: 110,
    easing: 'cubic-bezier(0.2, 0, 0, 1)',
    fill: 'forwards',
  });

  active = { el, scale, anim };
  if (event.pointerType === 'mouse') {
    el.addEventListener('pointerleave', release, { once: true });
  }
};

export const initPressFeedback = () => {
  if (typeof window === 'undefined' || !('animate' in Element.prototype)) {
    return;
  }

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  document.addEventListener(
    'pointerdown',
    event => {
      if (!reduced.matches) {
        press(event);
      }
    },
    { capture: true, passive: true }
  );

  for (const type of ['pointerup', 'pointercancel', 'blur'] as const) {
    window.addEventListener(type, release, { capture: true, passive: true });
  }

  document.addEventListener('visibilitychange', release);
};
