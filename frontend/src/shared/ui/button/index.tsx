import React from 'react';

import { cn } from 'shared/utils/cn';

import styles from './button.module.css';
import type { ButtonColor } from './types';

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  color?: ButtonColor;
  text?: string;
  isActive?: boolean;
  singleLine?: boolean;
}

export const Button = ({
  color = 'primary',
  text,
  className,
  disabled,
  isActive = false,
  singleLine = false,
  ...props
}: Props) => {
  return (
    <button
      {...props}
      type="button"
      className={cn(
        styles.button,
        styles[color],
        isActive && styles.active,
        className
      )}
      disabled={disabled}
    >
      {text ? (
        <span className={cn(styles.label, singleLine && styles.singleLine)}>
          {text}
        </span>
      ) : null}
    </button>
  );
};
