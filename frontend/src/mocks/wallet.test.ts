import { setupServer } from 'msw/node';
import assert from 'node:assert/strict';

import { walletHandlers } from './wallet';

const api = 'http://wallet.test/wallet';
const server = setupServer(...walletHandlers);

const submit = (id: string, amount: number) =>
  fetch(`${api}/withdraw`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': id },
    body: JSON.stringify({ address: '0:' + 'a'.repeat(64), amount }),
  });

const balance = async () => {
  const response = await fetch(`${api}/balance`);
  const payload = (await response.json()) as { available: number };

  return payload.available;
};

server.listen({ onUnhandledRequest: 'error' });

try {
  const before = await balance();
  const [first, retry] = await Promise.all([
    submit('same', 2),
    submit('same', 2),
  ]);
  assert.equal(first.status, 200);
  assert.equal(retry.status, 200);
  assert.deepEqual(await first.json(), await retry.json());
  assert.equal((await submit('same', 3)).status, 409);
  assert.equal(await balance(), before - 2);
  assert.equal((await submit('new', 2)).status, 200);
  assert.equal(await balance(), before - 4);
} finally {
  server.close();
}
