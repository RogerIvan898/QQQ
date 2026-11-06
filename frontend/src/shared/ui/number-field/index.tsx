import type React from 'react';

import { sanitizeNumber } from 'shared/utils/format';

interface Props extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'onChange' | 'value'
> {
  value: string;
  onChange: (value: string) => void;
  maxDecimals?: number;
}

export const NumberField = ({
  value,
  onChange,
  maxDecimals = 2,
  inputMode = 'decimal',
  ...props
}: Props) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange(sanitizeNumber(e.target.value, maxDecimals));

  return (
    <input
      {...props}
      value={value}
      onChange={handleChange}
      inputMode={inputMode}
    />
  );
};
