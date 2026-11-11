import { useLingui } from '@lingui/react/macro';
import { LogOut } from 'lucide-react';

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
      variant="bottom"
      title={t`Leave table?`}
    >
      <div className={styles.body}>
        <p className={styles.text}>
          {t`If you are in a hand, your cards will be folded.`}
        </p>
        <div className={styles.actions}>
          <button type="button" className={styles.stay} onClick={onStay}>
            {t`Stay`}
          </button>
          <button type="button" className={styles.leave} onClick={onLeave}>
            <LogOut size={17} strokeWidth={2.25} />
            {t`Leave`}
          </button>
        </div>
      </div>
    </Dialog>
  );
};
