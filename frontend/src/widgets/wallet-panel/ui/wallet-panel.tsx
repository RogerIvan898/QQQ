import React from 'react';

import { useLingui } from '@lingui/react/macro';
import { useUnit } from 'effector-react';
import { ArrowDownLeft, ArrowUpRight, Wallet } from 'lucide-react';

import { walletModel } from 'entities/wallet';
import { useMediaQuery } from 'shared/hooks/use-media-query';
import { $tonWallet, getTonConnectUI } from 'shared/lib/ton-connect';
import { Dialog } from 'shared/ui/dialog';
import { Logo } from 'shared/ui/logo';
import { cn } from 'shared/utils/cn';
import { formatBalance, truncateMiddle } from 'shared/utils/format';

import { TransactionsList } from './transactions-list';
import styles from './wallet-panel.module.css';

// Matches the Dialog's bottom-sheet breakpoint.
const MOBILE_QUERY = '(max-width: 600px)';

/** Where the TON Connect UI renders its modal. */
const TON_CONNECT_ROOT = '#tc-widget-root';
/** Clicks here are not "outside" the popover. */
const KEEP_OPEN_SELECTOR = `[role="dialog"], ${TON_CONNECT_ROOT}`;

interface Props {
  open: boolean;
  onClose: () => void;
  onDeposit: () => void;
  onWithdraw: () => void;
  /** Wallet button: clicks on it are not "outside" (it toggles the panel). */
  anchorRef: React.RefObject<HTMLElement | null>;
  /** A deposit/withdraw form is open on top: keep the panel while it is. */
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
            <Logo size={26} className={styles.balanceLogo} />
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

/**
 * My Wallet: balance, deposit/withdraw and the only place with the
 * transaction history. Popover on desktop/tablet, bottom sheet on phones.
 */
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
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const [items, loading, reset] = useUnit([
    walletModel.$transactions,
    walletModel.$isLoadingPage,
    walletModel.transactionsReset,
  ]);

  // First open loads the newest page; later opens keep what is loaded.
  React.useEffect(() => {
    if (open && items.length === 0 && !loading) {
      reset();
    }
    // Only on opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Desktop popover: close on outside click and Escape.
  React.useEffect(() => {
    if (!open || isMobile || suspended) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;

      if (
        panelRef.current?.contains(target) ||
        anchorRef.current?.contains(target) ||
        // Dialogs opened from the panel (transaction details) live in portals,
        // and the TON Connect modal renders into its own root.
        (target instanceof Element && target.closest(KEEP_OPEN_SELECTOR))
      ) {
        return;
      }

      onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      // Escape inside the TON Connect modal closes that modal, not the panel.
      if (
        event.target instanceof Element &&
        event.target.closest(TON_CONNECT_ROOT)
      ) {
        return;
      }

      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, isMobile, suspended, onClose, anchorRef]);

  if (!open) {
    return null;
  }

  if (isMobile) {
    return (
      <Dialog open variant="bottom" onClose={onClose} title={t`My Wallet`}>
        <WalletContent onDeposit={onDeposit} onWithdraw={onWithdraw} />
      </Dialog>
    );
  }

  return (
    <div
      ref={panelRef}
      className={styles.popover}
      role="dialog"
      aria-label={t`My Wallet`}
    >
      <h2 className={styles.title}>{t`My Wallet`}</h2>
      <WalletContent onDeposit={onDeposit} onWithdraw={onWithdraw} />
    </div>
  );
};
