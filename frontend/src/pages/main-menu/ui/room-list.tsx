import { useLingui } from '@lingui/react/macro';
import { useUnit } from 'effector-react';

import { $rooms, $roomsStatus, RoomCard, roomsRequested } from 'entities/room';
import { JoinRoomButton } from 'features/join-room';
import { Preloader } from 'shared/ui/preloader';

import { filterRooms, type RoomFilter } from '../model';

import styles from './main-menu.module.css';
import { Filters } from './room-filters';

interface Props {
  filter: RoomFilter;
  onFilterChange: (filter: RoomFilter) => void;
  balance: number | null;
  onShortfall: (missing: number) => void;
}

export const RoomList = ({
  filter,
  onFilterChange,
  balance,
  onShortfall,
}: Props) => {
  const { t } = useLingui();
  const [rooms, status, requestRooms] = useUnit([
    $rooms,
    $roomsStatus,
    roomsRequested,
  ]);
  const visibleRooms = filterRooms(rooms, filter);

  return (
    <>
      <div className={styles.listBar}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>{t`Available tables`}</h2>
          {visibleRooms.length > 0 ? (
            <span className={styles.sectionCount}>{visibleRooms.length}</span>
          ) : null}
        </div>
        <Filters active={filter} onChange={onFilterChange} />
      </div>

      {status === 'failed' ? (
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
      ) : rooms.length === 0 && status !== 'ready' ? (
        <div className={styles.roomsState} role="status">
          <Preloader inline label={t`Loading tables…`} />
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
              room={room}
              action={
                <JoinRoomButton
                  roomId={String(room.id)}
                  isFull={room.players >= room.max}
                  onBlocked={
                    shortfall > 0 ? () => onShortfall(shortfall) : undefined
                  }
                />
              }
            />
          );
        })}
      </div>
    </>
  );
};
