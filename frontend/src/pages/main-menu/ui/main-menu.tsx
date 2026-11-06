import React from 'react';

import { useLingui } from '@lingui/react/macro';
import { useRouter } from '@tanstack/react-router';
import { Coins, Swords } from 'lucide-react';

import { RoomCard } from 'entities/room';
import { JoinRoomButton } from 'features/join-room';
import { cn } from 'shared/utils/cn';

import {
  filterRooms,
  ROOM_FILTERS,
  ROOMS,
  roomFilterLabel,
  type RoomFilter,
} from '../model';

import { Header } from './header';
import styles from './main-menu.module.css';

const loadDepositDialog = () => import('widgets/deposit-dialog');
const loadWithdrawModal = () => import('widgets/withdraw');

const DepositDialog = React.lazy(() =>
  loadDepositDialog().then(module => ({ default: module.DepositDialog }))
);
const WithdrawModal = React.lazy(() =>
  loadWithdrawModal().then(module => ({ default: module.WithdrawModal }))
);

const prefetchWalletDialogs = () => {
  // Prefetch is best-effort; React.lazy retries the import on open.
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
      <div className={styles.tabsScroll}>
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
  const { i18n, t } = useLingui();
  const [roomFilter, setRoomFilter] = React.useState<RoomFilter>('all');
  const [isDepositOpen, setIsDepositOpen] = React.useState(false);
  const [isWithdrawOpen, setIsWithdrawOpen] = React.useState(false);
  const mockUser = { firstName: 'User', balance: 42.5 };
  const visibleRooms = filterRooms(ROOMS, roomFilter);
  const router = useRouter();

  React.useEffect(() => {
    const prefetch = () => {
      prefetchWalletDialogs();
      // The game route is code-split; without this, the first "Play" shows
      // the router's generic loader while its chunk downloads.
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
            userName={mockUser.firstName}
            balance={mockUser.balance}
            onDepositClick={() => setIsDepositOpen(true)}
            onWithdrawClick={() => setIsWithdrawOpen(true)}
          />

          <main className={styles.contentArea}>
            <div className={styles.stickyHeader}>
              <Filters active={roomFilter} onChange={setRoomFilter} />
            </div>

            <div className={styles.roomScroll}>
              {DevServerSwitch ? (
                <React.Suspense fallback={null}>
                  <DevServerSwitch />
                </React.Suspense>
              ) : null}
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>{t`Available tables`}</h2>
              </div>
              <div className={styles.roomGrid}>
                {visibleRooms.map(room => {
                  const shortfall = Math.max(0, room.minBuy - mockUser.balance);

                  return (
                    <RoomCard
                      key={room.id}
                      shortfall={shortfall}
                      room={{
                        name: i18n._(room.name),
                        mode: room.mode,
                        blinds: room.blinds,
                        players: room.players,
                        max: room.max,
                        minBuy: room.minBuy,
                      }}
                      action={
                        <JoinRoomButton
                          roomId={String(room.id)}
                          isFull={room.players >= room.max}
                          onTopUp={
                            shortfall > 0
                              ? () => setIsDepositOpen(true)
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

        <React.Suspense fallback={null}>
          {isDepositOpen && (
            <DepositDialog
              open
              onClose={() => setIsDepositOpen(false)}
              depositAddress="UQA-hgA0arLRETGFy5ccxv11acPYBUpU49X8RyqfIju3tGci"
              memo="1049285"
            />
          )}

          {isWithdrawOpen && (
            <WithdrawModal
              open
              onClose={() => setIsWithdrawOpen(false)}
              balance={mockUser.balance}
              onSubmit={payload => {
                console.log('Withdraw request', payload);
              }}
            />
          )}
        </React.Suspense>
      </div>
    </div>
  );
};
