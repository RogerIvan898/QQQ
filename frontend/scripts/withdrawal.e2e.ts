import assert from 'node:assert/strict';
import type { Page } from 'playwright';

export const checkWithdrawalRetry = async (page: Page) => {
  const address = '0:' + 'a'.repeat(64);
  const keys: string[] = [];
  const release = Promise.withResolvers<void>();

  await page.route('**/api/wallet/balance', route =>
    route.fulfill({ json: { available: 20 } })
  );
  await page.route('**/api/wallet/transactions*', route =>
    route.fulfill({ json: { items: [], nextCursor: null } })
  );
  await page.route('**/api/wallet/withdraw', async route => {
    keys.push((await route.request().headerValue('Idempotency-Key')) ?? '');
    if (keys.length === 1) {
      await release.promise;
      return route.abort();
    }

    return route.fulfill({
      json: {
        id: 'tx-1',
        type: 'withdrawal',
        status: 'pending',
        address,
        amount: 2,
        createdAt: new Date().toISOString(),
      },
    });
  });

  const openForm = () =>
    page.getByRole('button', { name: 'Withdraw', exact: true }).click();
  const fill = async () => {
    await page.getByRole('tab', { name: 'Address' }).click();
    await page.getByRole('textbox', { name: 'TON address' }).fill(address);
    await page.getByLabel('Amount', { exact: true }).fill('2');
  };

  await page.evaluate(() => window.__TSR_ROUTER__!.navigate({ to: '/' }));
  await page.getByRole('button', { name: 'My Wallet' }).click();
  await openForm();
  await fill();

  const submit = page.getByRole('button', {
    name: 'Withdraw 2 TON',
    exact: true,
  });
  try {
    await Promise.all([
      page.waitForRequest('**/api/wallet/withdraw'),
      submit.click(),
    ]);
    await page.keyboard.press('Escape');
    await openForm();
    await fill();
    assert.ok(
      await page.getByRole('button', { name: 'Sending…' }).isDisabled()
    );
    assert.equal(keys.length, 1);
  } finally {
    release.resolve();
  }

  await submit.click();
  await page
    .getByRole('dialog', { name: 'Withdraw TON' })
    .waitFor({ state: 'hidden' });
  assert.ok(keys[0]);
  assert.deepEqual(keys, [keys[0], keys[0]]);

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  assert.equal(
    await page.evaluate(() =>
      localStorage.getItem('poker:withdraw-address:100')
    ),
    address
  );
  await page.route('**/api/auth/login', route =>
    route.fulfill({ json: { user: { id: '101' } } })
  );
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'My Wallet' }).click();
  await openForm();
  await page.getByRole('tab', { name: 'Address' }).click();
  assert.equal(
    await page.getByRole('textbox', { name: 'TON address' }).inputValue(),
    ''
  );

  console.log(
    'Passed withdrawal remount, idempotent retry and saved address isolation.'
  );

  await page.setViewportSize({ width: 450, height: 810 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'My Wallet' }).click();
  const wallet = page.getByRole('dialog', { name: 'My Wallet' });
  const withdrawButton = wallet.getByRole('button', {
    name: 'Withdraw',
    exact: true,
  });
  await withdrawButton.click();
  const withdrawal = page.getByRole('dialog', { name: 'Withdraw TON' });
  await withdrawal.waitFor();
  for (let tab = 0; tab < 8; tab += 1) {
    await page.keyboard.press('Tab');
    assert.ok(
      await withdrawal.evaluate(panel => panel.contains(document.activeElement))
    );
  }
  await page.keyboard.press('Escape');
  await withdrawal.waitFor({ state: 'hidden' });
  await wallet.waitFor();
  assert.ok(
    await withdrawButton.evaluate(button => button === document.activeElement)
  );

  await page.route('**/api/auth/login', route =>
    route.fulfill({ status: 401, json: { error: 'test_auth_rejected' } })
  );
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'My Wallet' }).click();
  await wallet.getByRole('button', { name: 'Deposit', exact: true }).click();
  const deposit = page.getByRole('dialog', { name: 'Deposit TON' });
  await deposit.getByText("Couldn't sign in").waitFor();
  assert.ok(await deposit.getByRole('button', { name: 'Retry' }).isEnabled());
  console.log(
    'Passed mobile dialog keyboard handling and deposit auth failure.'
  );
};
