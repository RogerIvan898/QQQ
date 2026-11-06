import { writeFileSync } from 'node:fs';

import { messages } from '../src/locales/en/messages.ts';

const ids = Object.keys(messages)
  .sort()
  .map(id => JSON.stringify(id))
  .join('\n    | ');

const source = `import '@lingui/core';

declare module '@lingui/core' {
  interface Register {
    messageIds:
      | ${ids};
  }
}
`;

writeFileSync(
  new URL('../src/shared/lib/i18n/register.d.ts', import.meta.url),
  source
);
