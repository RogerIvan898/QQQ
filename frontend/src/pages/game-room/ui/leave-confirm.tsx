import { useLingui } from '@lingui/react/macro';
import { DoorOpen } from 'lucide-react';

import { Dialog } from 'shared/ui/dialog';

import styles from './leave-confirm.module.css';

interface Props {
  open: boolean;
  onStay: () => void;
  onLeave: () => void;
}

export const LeaveConfirm = ({ open, onStay, onLeave }: Props) => {
  const { t } = useLingui();

  return (
    <Dialog
      open={open}
      onClose={onStay}
      title={t`Leave table?`}
      hideHeader
      className={styles.panel}
    >
      <div className={styles.body}>
        <span className={styles.icon} aria-hidden="true">
          <DoorOpen size={26} strokeWidth={2} />
        </span>
        <h2 className={styles.title}>{t`Leave table?`}</h2>
        <p className={styles.text}>
          {t`If you are in a hand, your cards will be folded.`}
        </p>
        <div className={styles.actions}>
          <button type="button" className={styles.stay} onClick={onStay}>
            {t`Stay`}
          </button>
          <button type="button" className={styles.leave} onClick={onLeave}>
            {t`Leave table`}
          </button>
        </div>
      </div>
    </Dialog>
  );
};
