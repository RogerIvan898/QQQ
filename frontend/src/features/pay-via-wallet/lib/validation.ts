type Address = (typeof import('@ton/core'))['Address'];

export const isValidAmount = (amount: number) =>
  Number.isFinite(amount) && amount > 0;

export const isValidAddress = (Address: Address, address: string): boolean => {
  const trimmed = address.trim();

  return Address.isFriendly(trimmed) || Address.isRaw(trimmed);
};
