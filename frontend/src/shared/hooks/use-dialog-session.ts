import { useState } from 'react';

import { usePresence } from './use-presence';

// Keep the closing form visible for its exit animation, but give every
// opening fresh state, including a reopening before the animation finishes.
export const useDialogSession = (open: boolean) => {
  const { mounted } = usePresence(open);
  const [session, setSession] = useState({ open, id: 0 });

  if (session.open !== open) {
    setSession({ open, id: session.id + (open ? 1 : 0) });
  }

  return { mounted, key: session.id };
};
