import React from 'react';

import { cn } from 'shared/utils/cn';

import styles from './alert.module.css';

interface Props {
  variant?: 'info' | 'warning' | 'error' | 'success';
  title?: string;
}

export const Alert = ({
  variant = 'info',
  title,
  children,
}: React.PropsWithChildren<Props>) => {
  return (
    <div className={cn(styles.alert, styles[variant])}>
      {title && <strong>{title}</strong>}
      <span>{children}</span>
    </div>
  );
};
