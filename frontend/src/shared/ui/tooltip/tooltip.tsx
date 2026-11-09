import type { ReactNode } from 'react';

import { cn } from 'shared/utils/cn';

import styles from './tooltip.module.css';

interface Props {
  label: ReactNode;
  align?: 'center' | 'start' | 'end';
  className?: string;
  children: ReactNode;
}

export const Tooltip = ({
  label,
  align = 'center',
  className,
  children,
}: Props) => (
  <span className={cn(styles.anchor, className)}>
    {children}
    <span className={cn(styles.bubble, styles[align])} aria-hidden="true">
      {label}
    </span>
  </span>
);
