import React from 'react';

import { useUnit } from 'effector-react';

import { roomsRequested } from 'entities/room';
import { sessionModel } from 'entities/session';
import { walletModel } from 'entities/wallet';
import { JoinRoomButton } from 'features/join-room';
import { $mockServerEnabled } from 'features/mock-server/model';
import { MOCK_SERVER_AVAILABLE } from 'shared/config/mock';
import {
  MENU_HEADER_BG,
  setTelegramHeaderColor,
} from 'shared/config/telegram-webapp';
import { getTelegramUser } from 'shared/lib/telegram';
import { WalletPanel } from 'widgets/wallet-panel';

import type { RoomFilter } from '../model';

import { DepositEntry } from './deposit-entry';
import { Header } from './header';
import { JoinErrorSnack } from './join-error-snack';
import styles from './main-menu.module.css';
import { RoomList } from './room-list';
import { loadWithdrawModal, useIdlePrefetch } from './use-idle-prefetch';
import { useSaveAddressOffer, useShortfallSnack } from './use-menu-snacks';

const WithdrawModal = React.lazy(() =>
  loadWithdrawModal().then(module => ({ default: module.WithdrawModal }))
);

const DevServerSwitch = MOCK_SERVER_AVAILABLE
  ? React.lazy(() =>
      import('features/mock-server').then(module => ({
        default: module.ServerModeSwitch,
      }))
    )
  : null;

export const MenuPage = () => {
  const mockEnabled = useUnit($mockServerEnabled);
  const [roomFilter, setRoomFilter] = React.useState<RoomFilter>('all');
  const [isDepositOpen, setIsDepositOpen] = React.useState(false);
  const [isWithdrawOpen, setIsWithdrawOpen] = React.useState(false);
  const [isWalletOpen, setIsWalletOpen] = React.useState(false);
  const walletButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const [balance, requestBalance, refreshWallet, requestRooms] = useUnit([
    walletModel.$balance,
    walletModel.balanceRequested,
    walletModel.walletRefreshRequested,
    roomsRequested,
  ]);
  const closeWallet = React.useCallback(() => setIsWalletOpen(false), []);
  const [telegramUser] = React.useState(getTelegramUser);
  const nickname = useUnit(sessionModel.$nickname);

  const shortfall = useShortfallSnack(() => setIsDepositOpen(true));
  const saveOffer = useSaveAddressOffer();

  useIdlePrefetch();

  React.useEffect(() => {
    setTelegramHeaderColor(MENU_HEADER_BG);

    return () => setTelegramHeaderColor();
  }, []);

  React.useEffect(() => {
    requestRooms();
    requestBalance();
  }, [requestRooms, requestBalance]);

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
                onDeposit={() => setIsDepositOpen(true)}
                onWithdraw={() => setIsWithdrawOpen(true)}
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
              {import.meta.env.DEV && mockEnabled ? (
                <div className={styles.devTable}>
                  <span>All-in test · 9 players (mock)</span>
                  <JoinRoomButton roomId="allin" isFull={false} />
                </div>
              ) : null}

              <RoomList
                filter={roomFilter}
                onFilterChange={setRoomFilter}
                balance={balance}
                onShortfall={shortfall.show}
              />

              <div className={styles.bottomSpacer} />
            </div>
          </main>
        </div>

        {shortfall.snack}
        <JoinErrorSnack />
        {saveOffer.snack}

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
                  saveOffer.offer(address);
                }
              }}
            />
          )}
        </React.Suspense>
      </div>
    </div>
  );
};
