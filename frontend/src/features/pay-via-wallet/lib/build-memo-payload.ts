type BeginCell = (typeof import('@ton/core'))['beginCell'];

export const buildMemoPayload = (memo: string, beginCell: BeginCell) =>
  beginCell()
    .storeUint(0, 32)
    .storeStringTail(memo)
    .endCell()
    .toBoc()
    .toString('base64');
