import React from 'react';

import { useLingui } from '@lingui/react/macro';
import { useRouter } from '@tanstack/react-router';
import { useUnit } from 'effector-react';
import { BookmarkPlus, Coins, Swords, Wallet } from 'lucide-react';

import { $rooms, $roomsStatus, RoomCard, roomsRequested } from 'entities/room';
import { sessionModel } from 'entities/session';
import { walletModel } from 'entities/wallet';
import { JoinRoomButton } from 'features/join-room';
import { getTelegramUser } from 'shared/lib/telegram';
import { Preloader } from 'shared/ui/preloader';
import { Snackbar } from 'shared/ui/snackbar';
import { cn } from 'shared/utils/cn';
import { formatBalance, truncateMiddle } from 'shared/utils/format';
import { WalletPanel } from 'widgets/wallet-panel';

import {
  filterRooms,
  ROOM_FILTERS,
  roomFilterLabel,
  type RoomFilter,
} from '../model';

import { DepositEntry } from './deposit-entry';
import { Header } from './header';
import styles from './main-menu.module.css';

const loadDepositDialog = () => import('widgets/deposit-dialog');
const loadWithdrawModal = () => import('widgets/withdraw');

const WithdrawModal = React.lazy(() =>
  loadWithdrawModal().then(module => ({ default: module.WithdrawModal }))
);

const prefetchWalletDialogs = () => {
  loadDepositDialog().catch(() => {});
  loadWithdrawModal().catch(() => {});
};

const DevServerSwitch = import.meta.env.DEV
  ? React.lazy(() =>
      import('features/mock-server').then(module => ({
        default: module.ServerModeSwitch,
      }))
    )
  : null;

interface FiltersProps {
  active: RoomFilter;
  onChange: (filter: RoomFilter) => void;
}

const FILTER_ICONS = {
  cash: Coins,
  'heads-up': Swords,
} as const;

const Filters = ({ active, onChange }: FiltersProps) => {
  const { i18n } = useLingui();

  return (
    <div className={styles.tabsContainer}>
      <div
        className={styles.tabsScroll}
        style={
          {
            '--tab-index': Math.max(0, ROOM_FILTERS.indexOf(active)),
            '--tab-count': ROOM_FILTERS.length,
          } as React.CSSProperties
        }
      >
        <span className={styles.tabIndicator} aria-hidden="true" />
        {ROOM_FILTERS.map(filter => {
          const Icon = filter === 'all' ? null : FILTER_ICONS[filter];

          return (
            <button
              key={filter}
              type="button"
              onClick={() => onChange(filter)}
              className={cn(
                styles.tabItem,
                active === filter && styles.activeTab
              )}
            >
              {Icon ? <Icon size={15} strokeWidth={2.25} /> : null}
              {i18n._(roomFilterLabel(filter))}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export const MenuPage = () => {
  const { t, i18n } = useLingui();
  const [snackOpen, setSnackOpen] = React.useState(false);
  const [snackMissing, setSnackMissing] = React.useState(0);
  const [saveOpen, setSaveOpen] = React.useState(false);
  const [saveCandidate, setSaveCandidate] = React.useState('');
  const [saveId, setSaveId] = React.useState(0);
  const [savedAddress, saveAddress] = useUnit([
    walletModel.$savedWithdrawAddress,
    walletModel.withdrawAddressSaved,
  ]);
  const [snackId, setSnackId] = React.useState(0);
  const [roomFilter, setRoomFilter] = React.useState<RoomFilter>('all');
  const [isDepositOpen, setIsDepositOpen] = React.useState(false);
  const [isWithdrawOpen, setIsWithdrawOpen] = React.useState(false);
  const [isWalletOpen, setIsWalletOpen] = React.useState(false);
  const walletButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const [balance, requestBalance, refreshWallet] = useUnit([
    walletModel.$balance,
    walletModel.balanceRequested,
    walletModel.walletRefreshRequested,
  ]);
  const closeWallet = React.useCallback(() => setIsWalletOpen(false), []);
  const [telegramUser] = React.useState(getTelegramUser);

  const nickname = useUnit(sessionModel.$nickname);
  const [rooms, roomsStatus, requestRooms] = useUnit([
    $rooms,
    $roomsStatus,
    roomsRequested,
  ]);

  React.useEffect(() => {
    requestRooms();
  }, [requestRooms]);

  const visibleRooms = filterRooms(rooms, roomFilter);

  const showShortfall = (missing: number) => {
    setSnackMissing(missing);
    setSnackId(id => id + 1);
    setSnackOpen(true);
  };

  const openTopUp = () => {
    setSnackOpen(false);
    setIsDepositOpen(true);
  };

  const offerSaveAddress = (address: string) => {
    if (address === savedAddress) {
      return;
    }

    setSaveCandidate(address);
    setSaveId(id => id + 1);
    setSaveOpen(true);
  };

  const shortAddress = truncateMiddle(saveCandidate, 4);

  const missingLabel = `${formatBalance(snackMissing, i18n.locale)} TON`;
  const router = useRouter();

  React.useEffect(() => {
    requestBalance();
  }, [requestBalance]);

  React.useEffect(() => {
    const prefetch = () => {
      prefetchWalletDialogs();
      walletModel.depositAddressRequested();

      router
        .loadRouteChunk(router.routesById['/game/$roomId'])
        ?.catch(() => undefined);
    };

    if (typeof window.requestIdleCallback !== 'function') {
      const timer = window.setTimeout(prefetch, 1500);

      return () => window.clearTimeout(timer);
    }

    const handle = window.requestIdleCallback(prefetch);

    return () => window.cancelIdleCallback(handle);
  }, [router]);

  return (
    <div className={styles.page}>
      <div className={styles.appLayout}>
        <div className={styles.mainContainer}>
          <Header
            userName={nickname ?? telegramUser?.name ?? 'User'}
            onRename={sessionModel.saveNickname}
            avatarUrl={telegramUser?.photoUrl}
            balance={balance}
            isWalletOpen={isWalletOpen}
            onWalletClick={() => setIsWalletOpen(open => !open)}
            walletButtonRef={walletButtonRef}
            walletPanel={
              <WalletPanel
                open={isWalletOpen}
                onClose={closeWallet}
                anchorRef={walletButtonRef}
                suspended={isDepositOpen || isWithdrawOpen}
                onDeposit={() => {
                  setIsWalletOpen(false);
                  setIsDepositOpen(true);
                }}
                onWithdraw={() => {
                  setIsWalletOpen(false);
                  setIsWithdrawOpen(true);
                }}
              />
            }
          />

          <main className={styles.contentArea}>
            <div className={styles.roomScroll}>
              {DevServerSwitch ? (
                <React.Suspense fallback={null}>
                  <DevServerSwitch />
                </React.Suspense>
              ) : null}
              {import.meta.env.DEV ? (
                <div className={styles.devTable}>
                  <span>All-in test · 9 players (mock)</span>
                  <JoinRoomButton roomId="allin" isFull={false} />
                </div>
              ) : null}
              <div className={styles.listBar}>
                <div className={styles.sectionHeader}>
                  <h2 className={styles.sectionTitle}>{t`Available tables`}</h2>
                  {visibleRooms.length > 0 ? (
                    <span className={styles.sectionCount}>
                      {visibleRooms.length}
                    </span>
                  ) : null}
                </div>
                <Filters active={roomFilter} onChange={setRoomFilter} />
              </div>
              {roomsStatus === 'failed' ? (
                <div className={styles.roomsState} role="alert">
                  <span>{t`Couldn't load tables`}</span>
                  <button
                    type="button"
                    className={styles.roomsRetry}
                    onClick={() => requestRooms()}
                  >
                    {t`Retry`}
                  </button>
                </div>
              ) : rooms.length === 0 && roomsStatus !== 'ready' ? (
                <div className={styles.roomsState} role="status">
                  <Preloader label={t`Loading tables…`} />
                </div>
              ) : visibleRooms.length === 0 ? (
                <div className={styles.roomsState}>{t`No tables here yet`}</div>
              ) : null}
              <div className={styles.roomGrid}>
                <div className={styles.roomHead} aria-hidden="true">
                  <span>{t`Table`}</span>
                  <span>{t`Blinds`}</span>
                  <span>{t`Buy-in`}</span>
                  <span>{t`Players`}</span>
                  <span />
                </div>
                {visibleRooms.map((room, index) => {
                  const shortfall =
                    balance === null ? 0 : Math.max(0, room.minBuy - balance);

                  return (
                    <RoomCard
                      key={room.id}
                      index={index}
                      room={{
                        name: room.name,
                        game: room.game,
                        mode: room.mode,
                        blinds: room.blinds,
                        players: room.players,
                        max: room.max,
                        minBuy: room.minBuy,
                        maxBuy: room.maxBuy,
                      }}
                      action={
                        <JoinRoomButton
                          roomId={String(room.id)}
                          isFull={room.players >= room.max}
                          onBlocked={
                            shortfall > 0
                              ? () => showShortfall(shortfall)
                              : undefined
                          }
                        />
                      }
                    />
                  );
                })}
              </div>

              <div className={styles.bottomSpacer} />
            </div>
          </main>
        </div>

        <Snackbar
          open={snackOpen}
          onClose={() => setSnackOpen(false)}
          tone="warning"
          showId={snackId}
          icon={<Wallet size={18} />}
          message={
            <>
              {t`Not enough balance.`} <b>{t`Top up ${missingLabel}`}</b>
            </>
          }
          actionLabel={t`Top up`}
          onAction={openTopUp}
        />

        <Snackbar
          open={saveOpen}
          onClose={() => setSaveOpen(false)}
          showId={saveId}
          durationMs={8000}
          icon={<BookmarkPlus size={18} />}
          message={t`Save ${shortAddress} for next withdrawals?`}
          actionLabel={t`Save`}
          onAction={() => {
            saveAddress(saveCandidate);
            setSaveOpen(false);
          }}
        />

        <React.Suspense fallback={null}>
          {isDepositOpen && (
            <DepositEntry
              onClose={() => setIsDepositOpen(false)}
              onSuccess={() => {
                setIsDepositOpen(false);
                setIsWalletOpen(false);
                refreshWallet();
              }}
            />
          )}

          {isWithdrawOpen && (
            <WithdrawModal
              open
              onClose={() => setIsWithdrawOpen(false)}
              balance={balance ?? 0}
              onSubmit={async ({ address, amount, destination }) => {
                await walletModel.withdrawFx({ address, amount });
                setIsWalletOpen(false);

                if (destination === 'address') {
                  offerSaveAddress(address);
                }
              }}
            />
          )}
        </React.Suspense>
      </div>
    </div>
  );
};
