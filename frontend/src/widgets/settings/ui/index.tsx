import { useState } from 'react';

import { useLingui } from '@lingui/react/macro';
import { useUnit } from 'effector-react';
import {
  Check,
  Copy,
  Loader2,
  RefreshCw,
  Coins,
  Volume2,
  VolumeX,
  Wallet,
} from 'lucide-react';

import { $soundEnabled, setSoundEnabled } from 'shared/lib/audio';
import { useCopyToClipboard } from 'shared/lib/clipboard';
import { $amountsInBb, setAmountsInBb } from 'shared/lib/display-settings';
import {
  changeLocale,
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
  const [soundEnabled, toggleSound] = useUnit([$soundEnabled, setSoundEnabled]);
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
      // тут лучше показать toast/inline-error, если есть общий механизм
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
          <button
            type="button"
            role="switch"
            aria-checked={soundEnabled}
            className={styles.soundRow}
            onClick={() => toggleSound(!soundEnabled)}
          >
            <span className={styles.soundIcon} aria-hidden="true">
              {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </span>

            <span className={styles.soundText}>
              {soundEnabled ? t`Sound on` : t`Sound off`}
            </span>

            <span
              className={cn(
                styles.switchTrack,
                soundEnabled && styles.switchTrackOn
              )}
              aria-hidden="true"
            >
              <span className={styles.switchThumb} />
            </span>
          </button>
        </Setting>

        <Setting label={t`Display`}>
          <button
            type="button"
            role="switch"
            aria-checked={amountsInBb}
            className={styles.soundRow}
            onClick={() => toggleAmountsInBb(!amountsInBb)}
          >
            <span className={styles.soundIcon} aria-hidden="true">
              <Coins size={18} />
            </span>

            <span className={styles.soundText}>{t`Display amounts in BB`}</span>

            <span
              className={cn(
                styles.switchTrack,
                amountsInBb && styles.switchTrackOn
              )}
              aria-hidden="true"
            >
              <span className={styles.switchThumb} />
            </span>
          </button>
        </Setting>

        <Setting label={t`Wallet`}>
          {walletAddress ? (
            <div className={styles.walletCard}>
              <div className={styles.walletMeta}>
                <span className={styles.walletBadge}>{t`Connected`}</span>

                <span className={styles.walletAddress} title={walletAddress}>
                  {truncateMiddle(walletAddress)}
                </span>
              </div>

              <div className={styles.walletActions}>
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

                <button
                  type="button"
                  className={cn(styles.iconBtn, styles.actionBtn)}
                  onClick={() => void runWalletAction('disconnect')}
                  disabled={walletPending}
                  aria-label={t`Change wallet`}
                  title={t`Change wallet`}
                >
                  <RefreshCw
                    size={15}
                    className={cn(walletAction === 'disconnect' && styles.spin)}
                  />
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
