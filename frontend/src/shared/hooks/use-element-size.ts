import React from 'react';

export interface ElementSize {
  width: number;
  height: number;
}

export const useElementSize = (element: HTMLElement | null) => {
  const [size, setSize] = React.useState<ElementSize | null>(null);

  React.useLayoutEffect(() => {
    if (!element) {
      setSize(null);
      return;
    }

    const update = () => {
      const { width, height } = element.getBoundingClientRect();

      setSize(prev =>
        prev && prev.width === width && prev.height === height
          ? prev
          : { width, height }
      );
    };

    update();

    const observer = new ResizeObserver(update);
    observer.observe(element);

    return () => observer.disconnect();
  }, [element]);

  return size;
};
