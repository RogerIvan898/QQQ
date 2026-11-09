import React from 'react';

import { useLingui } from '@lingui/react/macro';
import { useUnit } from 'effector-react';
import { ArrowDownLeft, ArrowUpRight, Wallet } from 'lucide-react';

import { walletModel } from 'entities/wallet';
import { useDismiss } from 'shared/hooks/use-dismiss';
import { useMediaQuery } from 'shared/hooks/use-media-query';
import { usePresence } from 'shared/hooks/use-presence';
import { $tonWallet, getTonConnectUI } from 'shared/lib/ton-connect';
import { Dialog } from 'shared/ui/dialog';
import { GramBadge } from 'shared/ui/gram';
import { cn } from 'shared/utils/cn';
import { formatBalance, truncateMiddle } from 'shared/utils/format';

import { TransactionsList } from './transactions-list';
import styles from './wallet-panel.module.css';

const MOBILE_QUERY = '(max-width: 600px)';

const TON_CONNECT_ROOT = '#tc-widget-root';

const KEEP_OPEN_SELECTOR = `[role="dialog"], ${TON_CONNECT_ROOT}`;

interface Props {
  open: boolean;
  onClose: () => void;
  onDeposit: () => void;
  onWithdraw: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  suspended?: boolean;
}

const WalletContent = ({
  onDeposit,
  onWithdraw,
}: Pick<Props, 'onDeposit' | 'onWithdraw'>) => {
  const { i18n, t } = useLingui();
  const [balance, wallet] = useUnit([walletModel.$balance, $tonWallet]);
  const address = wallet?.friendlyAddress ?? wallet?.address;

  const connect = () => {
    void getTonConnectUI()
      .then(ui => ui.openModal())
      .catch(() => undefined);
  };

  return (
    <div className={styles.content}>
      <div className={styles.walletStatus}>
        <Wallet
          size={16}
          className={cn(styles.statusIcon, address && styles.statusConnected)}
        />
        {address ? (
          <span>
            {t`Wallet connected`}{' '}
            <span className={styles.address}>{truncateMiddle(address, 4)}</span>
          </span>
        ) : (
          <>
            <span>{t`Wallet not connected`}</span>
            <button type="button" className={styles.linkBtn} onClick={connect}>
              {t`Connect`}
            </button>
          </>
        )}
      </div>

      <div className={styles.walletCard}>
        <div className={styles.balanceBlock}>
          <span className={styles.balanceLabel}>{t`Available balance`}</span>
          <span className={styles.balance}>
            <GramBadge size={26} className={styles.balanceLogo} />
            {balance === null ? '—' : formatBalance(balance, i18n.locale)}
            <span className={styles.currency}>TON</span>
          </span>
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className={cn(styles.actionBtn, styles.depositBtn)}
            onClick={onDeposit}
          >
            <ArrowDownLeft size={18} strokeWidth={2.5} />
            {t`Deposit`}
          </button>
          <button
            type="button"
            className={cn(styles.actionBtn, styles.withdrawBtn)}
            onClick={onWithdraw}
          >
            <ArrowUpRight size={18} strokeWidth={2.5} />
            {t`Withdraw`}
          </button>
        </div>
      </div>

      <section className={styles.transactions}>
        <h3 className={styles.sectionTitle}>{t`Transactions`}</h3>
        <TransactionsList />
      </section>
    </div>
  );
};

export const WalletPanel = ({
  open,
  onClose,
  onDeposit,
  onWithdraw,
  anchorRef,
  suspended = false,
}: Props) => {
  const { t } = useLingui();
  const isMobile = useMediaQuery(MOBILE_QUERY);
  const presence = usePresence(open && !isMobile);
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const [items, loading, reset] = useUnit([
    walletModel.$transactions,
    walletModel.$isLoadingPage,
    walletModel.transactionsReset,
  ]);

  const loadFirstPage = React.useEffectEvent(() => {
    if (items.length === 0 && !loading) {
      reset();
    }
  });

  React.useEffect(() => {
    if (open) {
      loadFirstPage();
    }
  }, [open]);

  useDismiss({
    enabled: open && !isMobile && !suspended,
    insideRefs: [panelRef, anchorRef],
    keepOpenSelector: KEEP_OPEN_SELECTOR,
    ignoreEscapeSelector: TON_CONNECT_ROOT,
    onDismiss: onClose,
  });

  if (isMobile) {
    return (
      <Dialog
        open={open}
        variant="bottom"
        onClose={onClose}
        title={t`My Wallet`}
      >
        <WalletContent onDeposit={onDeposit} onWithdraw={onWithdraw} />
      </Dialog>
    );
  }

  if (!presence.mounted) {
    return null;
  }

  return (
    <div
      ref={panelRef}
      className={cn(styles.popover, presence.closing && styles.popoverClosing)}
      role="dialog"
      aria-label={t`My Wallet`}
    >
      <h2 className={styles.title}>{t`My Wallet`}</h2>
      <WalletContent onDeposit={onDeposit} onWithdraw={onWithdraw} />
    </div>
  );
};
