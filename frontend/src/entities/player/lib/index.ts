import {
  PlayerAction,
  PlayerStatus,
  SeatBadgeKind,
  type BlindRole,
  type Player,
  type PlayerActionType,
  type PlayerStatusType,
  type SeatActionBadge,
  type SeatDirection,
} from '../model';

const STATUSES_IN_HAND = new Set<PlayerStatusType>([
  PlayerStatus.IN_GAME,
  PlayerStatus.RAISE,
  PlayerStatus.ALL_IN,
]);

export const shouldShowHoleCards = ({
  hand,
  status,
  currentPlayer,
  reveal,
}: {
  hand: Player['hand'];
  status: PlayerStatusType;
  currentPlayer: boolean;
  reveal: boolean;
}) => {
  if (reveal && hand) {
    return true;
  }

  return STATUSES_IN_HAND.has(status) && Boolean(hand || !currentPlayer);
};

export const resolveSeatActionBadge = (
  lastAction: PlayerActionType | null,
  status: PlayerStatusType,
  blindRole?: BlindRole | null
): SeatActionBadge | null => {
  if (status === PlayerStatus.ALL_IN) {
    return SeatBadgeKind.ALL_IN;
  }

  if (status === PlayerStatus.FOLDED) {
    return PlayerAction.FOLD;
  }

  if (lastAction) {
    return lastAction;
  }

  if (blindRole === 'sb') {
    return SeatBadgeKind.SB;
  }

  if (blindRole === 'bb') {
    return SeatBadgeKind.BB;
  }

  return null;
};

export const isStatusBadge = (badge: SeatActionBadge) =>
  badge === SeatBadgeKind.ALL_IN || badge === PlayerAction.FOLD;

export const isBlindBadge = (badge: SeatActionBadge) =>
  badge === SeatBadgeKind.SB || badge === SeatBadgeKind.BB;

const DEALER_OFFSET_RAD = (35 * Math.PI) / 180;
const DEALER_OFFSET_COS = Math.cos(DEALER_OFFSET_RAD);
const DEALER_OFFSET_SIN = Math.sin(DEALER_OFFSET_RAD);

const rotate = (
  { x, y }: SeatDirection,
  cos: number,
  sin: number
): SeatDirection => ({
  x: x * cos - y * sin,
  y: x * sin + y * cos,
});

export const getDealerDirection = (towardCenter: SeatDirection) => {
  const clockwise = rotate(towardCenter, DEALER_OFFSET_COS, DEALER_OFFSET_SIN);
  const counterClockwise = rotate(
    towardCenter,
    DEALER_OFFSET_COS,
    -DEALER_OFFSET_SIN
  );

  return counterClockwise.y < clockwise.y - 1e-6 ? counterClockwise : clockwise;
};

export const findPlayerById = (
  players: Record<string | number, Player>,
  id: string | null
) => (id ? Object.values(players).find(player => player.id === id) : undefined);

export const getHandKey = (hand: Player['hand']) =>
  hand && hand.length >= 2
    ? `${hand[0].rank}-${hand[0].suit}|${hand[1].rank}-${hand[1].suit}`
    : null;
