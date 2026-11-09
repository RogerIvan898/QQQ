import React from 'react';

import { useLingui } from '@lingui/react/macro';
import { Link } from '@tanstack/react-router';
import { useUnit } from 'effector-react';
import { ChevronDown, History, Settings } from 'lucide-react';

import { $currentLocale } from 'shared/lib/i18n';
import { $tonWallet } from 'shared/lib/ton-connect';
import { GramBadge } from 'shared/ui/gram';
import { cn } from 'shared/utils/cn';
import { formatBalance, getInitialLetter } from 'shared/utils/format';
import { SettingsDialog } from 'widgets/settings';

import styles from './header.module.css';
import { Nickname } from './nickname';

interface Props {
  userName: string;

  onRename: (nickname: string) => void;

  balance: number | null;
  avatarUrl?: string;
  isWalletOpen: boolean;
  onWalletClick: () => void;
  walletButtonRef: React.RefObject<HTMLButtonElement | null>;

  walletPanel?: React.ReactNode;
}

export const Header = ({
  userName,
  onRename,
  balance,
  avatarUrl,
  isWalletOpen,
  onWalletClick,
  walletButtonRef,
  walletPanel,
}: Props) => {
  const { t, i18n } = useLingui();
  const [isSettingsOpened, setIsSettingsOpened] = React.useState(false);
  const locale = useUnit($currentLocale);
  const wallet = useUnit($tonWallet);
  const walletAddress = wallet?.address;
  const formattedBalance =
    balance === null ? '—' : formatBalance(balance, i18n.locale);

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
          <Nickname name={userName} onSave={onRename} />
        </div>
      </div>

      <div className={styles.headerRight}>
        <div className={styles.walletAnchor}>
          <button
            ref={walletButtonRef}
            type="button"
            className={cn(styles.walletBtn, isWalletOpen && styles.walletOpen)}
            onClick={onWalletClick}
            aria-haspopup="dialog"
            aria-expanded={isWalletOpen}
            aria-label={t`My Wallet`}
          >
            <GramBadge className={styles.tonIcon} />
            <span className={styles.balanceValue}>{formattedBalance}</span>
            <ChevronDown size={16} className={styles.walletChevron} />
          </button>
          {walletPanel}
        </div>
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

      <SettingsDialog
        open={isSettingsOpened}
        onClose={() => setIsSettingsOpened(false)}
      />
    </header>
  );
};
