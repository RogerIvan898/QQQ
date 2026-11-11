import { useEffect, useState } from 'react';

import { useLingui } from '@lingui/react/macro';
import { useUnit } from 'effector-react';
import {
  Check,
  Copy,
  Loader2,
  Coins,
  Palette,
  Volume2,
  VolumeX,
  Wallet,
} from 'lucide-react';

import { $soundEnabled, setSoundEnabled } from 'shared/lib/audio';
import { useCopyToClipboard } from 'shared/lib/clipboard';
import {
  $amountsInBb,
  $fourColorDeck,
  setAmountsInBb,
  setFourColorDeck,
} from 'shared/lib/display-settings';
import {
  changeLocale,
  preloadOtherLocales,
  LOCALES,
  supportedLocales,
  $currentLocale,
} from 'shared/lib/i18n';
import { $tonWallet, getTonConnectUI } from 'shared/lib/ton-connect';
import { Dialog } from 'shared/ui/dialog';
import { cn } from 'shared/utils/cn';
import { truncateMiddle } from 'shared/utils/format';

import { Setting } from './setting';
import styles from './settings-dialog.module.css';
import { ToggleRow } from './toggle-row';

const COPIED_RESET_MS = 1500;

interface Props {
  open: boolean;
  onClose: () => void;
}

type WalletAction = 'connect' | 'disconnect';

export const SettingsDialog = ({ open, onClose }: Props) => {
  const { t } = useLingui();
  const walletAddress = useUnit($tonWallet)?.friendlyAddress ?? '';
  const [currentLocale, setLocale] = useUnit([$currentLocale, changeLocale]);

  useEffect(() => {
    if (open) {
      preloadOtherLocales(currentLocale);
    }
  }, [open, currentLocale]);
  const [soundEnabled, toggleSound] = useUnit([$soundEnabled, setSoundEnabled]);
  const [fourColor, toggleFourColor] = useUnit([
    $fourColorDeck,
    setFourColorDeck,
  ]);
  const [amountsInBb, toggleAmountsInBb] = useUnit([
    $amountsInBb,
    setAmountsInBb,
  ]);

  const [walletAction, setWalletAction] = useState<WalletAction | null>(null);
  const [copyPending, setCopyPending] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  const { copied: isCopied, copy } = useCopyToClipboard(COPIED_RESET_MS);
  const walletPending = walletAction !== null;

  const runWalletAction = async (action: WalletAction) => {
    if (walletPending) return;

    setWalletAction(action);
    try {
      const tonConnectUI = await getTonConnectUI();

      if (action === 'connect') await tonConnectUI.openModal();
      else await tonConnectUI.disconnect();
    } catch {
      void 0;
    } finally {
      setWalletAction(null);
    }
  };

  const copyAddress = async () => {
    if (!walletAddress || copyPending) return;

    setCopyPending(true);
    setCopyFailed(false);

    try {
      await copy(walletAddress);
    } catch {
      setCopyFailed(true);
    } finally {
      setCopyPending(false);
    }
  };

  const liveMessage = isCopied
    ? t`Copied`
    : copyFailed
      ? t`Failed to copy address`
      : '';

  return (
    <Dialog open={open} title={t`Settings`} onClose={onClose}>
      <div className={styles.sections}>
        <Setting label={t`Language`}>
          <div className={styles.langRow} role="group" aria-label={t`Language`}>
            {supportedLocales.map(locale => (
              <button
                key={locale}
                type="button"
                aria-pressed={currentLocale === locale}
                className={styles.langBtn}
                onClick={() => setLocale(locale)}
              >
                {LOCALES[locale]}
              </button>
            ))}
          </div>
        </Setting>

        <Setting label={t`Sound`}>
          <ToggleRow
            icon={soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
            label={soundEnabled ? t`Sound on` : t`Sound off`}
            checked={soundEnabled}
            onChange={toggleSound}
          />
        </Setting>

        <Setting label={t`Display`}>
          <ToggleRow
            icon={<Coins size={18} />}
            label={t`Display amounts in BB`}
            checked={amountsInBb}
            onChange={toggleAmountsInBb}
          />
          <ToggleRow
            icon={<Palette size={18} />}
            label={t`Four-color deck`}
            checked={fourColor}
            onChange={toggleFourColor}
          />
        </Setting>

        <Setting label={t`Wallet`}>
          {walletAddress ? (
            <div className={styles.walletCard}>
              <div className={styles.walletRow}>
                <span className={styles.walletIcon} aria-hidden="true">
                  <Wallet size={18} />
                </span>

                <span className={styles.walletInfo}>
                  <span className={styles.walletStatus}>{t`Connected`}</span>
                  <span className={styles.walletAddress} title={walletAddress}>
                    {truncateMiddle(walletAddress, 6)}
                  </span>
                </span>

                <button
                  type="button"
                  className={cn(styles.iconBtn, styles.actionBtn)}
                  onClick={() => void copyAddress()}
                  disabled={copyPending}
                  aria-label={isCopied ? t`Copied` : t`Copy address`}
                  title={isCopied ? t`Copied` : t`Copy address`}
                >
                  {copyPending ? (
                    <Loader2 size={15} className={styles.spin} />
                  ) : isCopied ? (
                    <Check size={15} />
                  ) : (
                    <Copy size={15} />
                  )}
                </button>
              </div>

              <button
                type="button"
                className={styles.disconnectBtn}
                onClick={() => void runWalletAction('disconnect')}
                disabled={walletPending}
              >
                {walletAction === 'disconnect' ? (
                  <>
                    <Loader2 size={16} className={styles.spin} />
                    {t`Disconnecting…`}
                  </>
                ) : (
                  t`Disconnect wallet`
                )}
              </button>

              <span
                className={styles.visuallyHidden}
                role="status"
                aria-live="polite"
              >
                {liveMessage}
              </span>
            </div>
          ) : (
            <button
              type="button"
              className={styles.connectBtn}
              onClick={() => void runWalletAction('connect')}
              disabled={walletPending}
            >
              {walletAction === 'connect' ? (
                <Loader2 size={16} className={styles.spin} />
              ) : (
                <Wallet size={16} />
              )}
              {walletAction === 'connect' ? t`Connecting…` : t`Connect wallet`}
            </button>
          )}
        </Setting>
      </div>
    </Dialog>
  );
};
