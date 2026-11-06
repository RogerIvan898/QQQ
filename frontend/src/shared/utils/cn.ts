export function cn(
  ...args: (string | number | boolean | undefined | null)[]
): string {
  let result = '';

  for (const value of args) {
    if (!value) continue;

    if (result) result += ' ';

    result += value;
  }

  return result;
}
