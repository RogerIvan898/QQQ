import React from 'react';

import { useLingui } from '@lingui/react/macro';
import { Link } from '@tanstack/react-router';
import { useUnit } from 'effector-react';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  History,
  Settings,
} from 'lucide-react';

import { $currentLocale } from 'shared/lib/i18n';
import { $tonWallet } from 'shared/lib/ton-connect';
import { Logo } from 'shared/ui/logo';
import { cn } from 'shared/utils/cn';
import { formatBalance, getInitialLetter } from 'shared/utils/format';
import { SettingsDialog } from 'widgets/settings';

import styles from './header.module.css';

interface Props {
  userName: string;
  balance?: number;
  avatarUrl?: string;
  onDepositClick?: () => void;
  onWithdrawClick?: () => void;
  onSettingsClick?: () => void;
}

export const Header = ({
  userName,
  balance = 0,
  avatarUrl,
  onDepositClick,
  onWithdrawClick,
}: Props) => {
  const { t, i18n } = useLingui();
  const [isSettingsOpened, setIsSettingsOpened] = React.useState(false);
  const locale = useUnit($currentLocale);
  const wallet = useUnit($tonWallet);
  const walletAddress = wallet?.address;
  const formattedBalance = formatBalance(balance, i18n.locale);

  return (
    <header className={styles.header} lang={locale ?? undefined}>
      <div className={styles.headerLeft}>
        <button
          type="button"
          className={styles.avatarPlaceholder}
          disabled={Boolean(wallet)}
          aria-label={wallet ? t`Wallet connected` : t`Connect wallet`}
          title={walletAddress ?? t`Connect wallet`}
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt={userName} className={styles.avatarImg} />
          ) : (
            getInitialLetter(userName, '?')
          )}
        </button>

        <div className={styles.userInfo}>
          <span className={styles.userName}>{userName}</span>

          <div className={styles.balanceRow}>
            <div className={styles.balanceBadge}>
              <Logo className={styles.tonIcon} />
              <span className={styles.balanceValue}>{formattedBalance}</span>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.headerRight}>
        <Link
          to="/history"
          className={styles.historyBtn}
          aria-label={t`History`}
          title={t`History`}
        >
          <History size={26} />
        </Link>

        <button
          type="button"
          className={styles.settingsBtn}
          onClick={() => setIsSettingsOpened(true)}
          aria-label={t`Settings`}
          title={t`Settings`}
        >
          <Settings size={28} />
        </button>
      </div>

      <div className={styles.walletActions}>
        <button
          type="button"
          className={cn(styles.actionBtn, styles.depositBtn)}
          onClick={onDepositClick}
        >
          <ArrowDownToLine size={16} strokeWidth={2.5} />
          {t`Deposit`}
        </button>

        <button
          type="button"
          className={cn(styles.actionBtn, styles.withdrawBtn)}
          onClick={onWithdrawClick}
        >
          <ArrowUpFromLine size={16} strokeWidth={2.5} />
          {t`Withdraw`}
        </button>
      </div>

      <SettingsDialog
        open={isSettingsOpened}
        onClose={() => setIsSettingsOpened(false)}
      />
    </header>
  );
};
