import type { ReactNode } from 'react';

import { cn } from 'shared/utils/cn';

import styles from './badge.module.css';
import type { BadgeVariant } from './types';

interface Props {
  variant: BadgeVariant;
  children: ReactNode;
  className?: string;
}

export const Badge = ({ variant, children, className }: Props) => (
  <span className={cn(styles.badge, styles[variant], className)}>
    {children}
  </span>
);
