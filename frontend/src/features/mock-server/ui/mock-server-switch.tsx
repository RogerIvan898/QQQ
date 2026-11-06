import { useState } from 'react';

import { useUnit } from 'effector-react';

import { Switch } from 'shared/ui/switch';

import { $mockServerEnabled, setMockServerEnabled } from '../model';

import styles from './mock-server.module.css';

export const ServerModeSwitch = () => {
  const enabled = useUnit($mockServerEnabled);
  const [pending, setPending] = useState(false);

  const toggle = async () => {
    setPending(true);
    try {
      await setMockServerEnabled(!enabled);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className={styles.switch}>
      <span className={styles.title}>Mock server</span>
      <Switch
        checked={enabled}
        disabled={pending}
        label="Toggle mock server"
        onChange={() => void toggle()}
      />
    </div>
  );
};
