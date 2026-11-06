import { Address } from '@ton/core';

export const isValidTonAddress = (value: string): boolean => {
  try {
    Address.parse(value.trim());
    return true;
  } catch {
    return false;
  }
};
