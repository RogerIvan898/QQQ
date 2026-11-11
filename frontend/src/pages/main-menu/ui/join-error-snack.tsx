import React from 'react';

import { useLingui } from '@lingui/react/macro';
import { useUnit } from 'effector-react';
import { WifiOff } from 'lucide-react';

import { $joinFailure, useJoinRoom } from 'features/join-room';
import { Snackbar } from 'shared/ui/snackbar';

export const JoinErrorSnack = () => {
  const { t } = useLingui();
  const joinFailure = useUnit($joinFailure);
  const { joinRoom } = useJoinRoom();
  const [seenFailure, setSeenFailure] = React.useState(joinFailure?.count ?? 0);
  const [open, setOpen] = React.useState(false);

  if (joinFailure && joinFailure.count !== seenFailure) {
    setSeenFailure(joinFailure.count);
    setOpen(true);
  }

  return (
    <Snackbar
      open={open}
      onClose={() => setOpen(false)}
      tone="warning"
      showId={joinFailure?.count ?? 0}
      icon={<WifiOff size={18} />}
      message={t`Couldn't join the table`}
      actionLabel={t`Retry`}
      onAction={() => {
        setOpen(false);

        if (joinFailure) {
          void joinRoom(joinFailure.roomId);
        }
      }}
    />
  );
};
