import { parseNumericInput } from 'shared/utils/format';

export const parseInput = (value: string) => parseNumericInput(value) ?? 0;
