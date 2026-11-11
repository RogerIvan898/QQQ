const CATEGORY_SHIFT = 20;
const RANK_BITS = 4;
const SLOT_COUNT = 5;
const RANK_MASK_SIZE = 1 << 13;

const HandCategory = {
  HighCard: 0,
  Pair: 1,
  TwoPair: 2,
  Trips: 3,
  Straight: 4,
  Flush: 5,
  FullHouse: 6,
  Quads: 7,
  StraightFlush: 8,
} as const;

const StateIndex = {
  AtLeastOne: 4,
  AtLeastTwo: 5,
  AtLeastThree: 6,
  AtLeastFour: 7,
} as const;

const POPCOUNT = new Uint8Array(RANK_MASK_SIZE);

const STRAIGHT_HIGH_RANK = new Int8Array(RANK_MASK_SIZE);

for (let rankMask = 0; rankMask < RANK_MASK_SIZE; rankMask += 1) {
  POPCOUNT[rankMask] = (rankMask & 1) + POPCOUNT[rankMask >> 1];

  const withLowAce = (rankMask << 1) | ((rankMask >> 12) & 1);
  let highRank = -1;

  for (let topRank = 12; topRank >= 3; topRank -= 1) {
    const run = 0b11111 << (topRank - 3);

    if ((withLowAce & run) === run) {
      highRank = topRank;
      break;
    }
  }

  STRAIGHT_HIGH_RANK[rankMask] = highRank;
}

const highestRank = (rankMask: number) => 31 - Math.clz32(rankMask);

const withCategory = (category: number, slots: number) =>
  (category << CATEGORY_SHIFT) | slots;

const appendKickers = (
  slots: number,
  filledSlots: number,
  rankMask: number,
  count: number
) => {
  let packed = slots;
  let remaining = rankMask;
  let appended = 0;

  while (appended < count && remaining !== 0) {
    const rank = highestRank(remaining);

    packed = (packed << RANK_BITS) | rank;
    remaining ^= 1 << rank;
    appended += 1;
  }

  return packed << (RANK_BITS * (SLOT_COUNT - filledSlots - appended));
};

export const scoreHandState = (
  clubs: number,
  diamonds: number,
  hearts: number,
  spades: number,
  atLeastOne: number,
  atLeastTwo: number,
  atLeastThree: number,
  atLeastFour: number
) => {
  const flushRanks =
    POPCOUNT[clubs] >= 5
      ? clubs
      : POPCOUNT[diamonds] >= 5
        ? diamonds
        : POPCOUNT[hearts] >= 5
          ? hearts
          : POPCOUNT[spades] >= 5
            ? spades
            : 0;

  if (flushRanks !== 0) {
    const straightFlushHigh = STRAIGHT_HIGH_RANK[flushRanks];

    if (straightFlushHigh >= 0) {
      return withCategory(HandCategory.StraightFlush, straightFlushHigh << 16);
    }
  }

  if (atLeastFour !== 0) {
    const quadsRank = highestRank(atLeastFour);

    return withCategory(
      HandCategory.Quads,
      appendKickers(quadsRank, 1, atLeastOne & ~(1 << quadsRank), 1)
    );
  }

  const tripsRanks = atLeastThree & ~atLeastFour;
  const pairRanks = atLeastTwo & ~atLeastThree;

  if (tripsRanks !== 0) {
    const tripsRank = highestRank(tripsRanks);
    const fillRanks = (tripsRanks & ~(1 << tripsRank)) | pairRanks;

    if (fillRanks !== 0) {
      return withCategory(
        HandCategory.FullHouse,
        ((tripsRank << RANK_BITS) | highestRank(fillRanks)) << 12
      );
    }
  }

  if (flushRanks !== 0) {
    return withCategory(HandCategory.Flush, appendKickers(0, 0, flushRanks, 5));
  }

  const straightHigh = STRAIGHT_HIGH_RANK[atLeastOne];

  if (straightHigh >= 0) {
    return withCategory(HandCategory.Straight, straightHigh << 16);
  }

  if (tripsRanks !== 0) {
    const tripsRank = highestRank(tripsRanks);

    return withCategory(
      HandCategory.Trips,
      appendKickers(tripsRank, 1, atLeastOne & ~(1 << tripsRank), 2)
    );
  }

  if (pairRanks !== 0) {
    const topPair = highestRank(pairRanks);
    const lowerPairs = pairRanks & ~(1 << topPair);

    if (lowerPairs !== 0) {
      const secondPair = highestRank(lowerPairs);

      return withCategory(
        HandCategory.TwoPair,
        appendKickers(
          (topPair << RANK_BITS) | secondPair,
          2,
          atLeastOne & ~((1 << topPair) | (1 << secondPair)),
          1
        )
      );
    }

    return withCategory(
      HandCategory.Pair,
      appendKickers(topPair, 1, atLeastOne & ~(1 << topPair), 3)
    );
  }

  return withCategory(
    HandCategory.HighCard,
    appendKickers(0, 0, atLeastOne, 5)
  );
};

export type HandState = Int32Array;

export const createHandState = (): HandState => new Int32Array(8);

export const addCardToState = (
  source: HandState,
  target: HandState,
  card: number
) => {
  const rankBit = 1 << (card >> 2);
  const atLeastOne = source[StateIndex.AtLeastOne];
  const atLeastTwo = source[StateIndex.AtLeastTwo];
  const atLeastThree = source[StateIndex.AtLeastThree];

  target[0] = source[0];
  target[1] = source[1];
  target[2] = source[2];
  target[3] = source[3];
  target[card & 3] |= rankBit;
  target[StateIndex.AtLeastFour] =
    source[StateIndex.AtLeastFour] | (atLeastThree & rankBit);
  target[StateIndex.AtLeastThree] = atLeastThree | (atLeastTwo & rankBit);
  target[StateIndex.AtLeastTwo] = atLeastTwo | (atLeastOne & rankBit);
  target[StateIndex.AtLeastOne] = atLeastOne | rankBit;
};

export const scoreBoardWithHoleCards = (
  boardState: HandState,
  firstCard: number,
  secondCard: number
) => {
  let clubs = boardState[0];
  let diamonds = boardState[1];
  let hearts = boardState[2];
  let spades = boardState[3];
  let atLeastOne = boardState[StateIndex.AtLeastOne];
  let atLeastTwo = boardState[StateIndex.AtLeastTwo];
  let atLeastThree = boardState[StateIndex.AtLeastThree];
  let atLeastFour = boardState[StateIndex.AtLeastFour];

  let rankBit = 1 << (firstCard >> 2);
  let suit = firstCard & 3;

  if (suit === 0) clubs |= rankBit;
  else if (suit === 1) diamonds |= rankBit;
  else if (suit === 2) hearts |= rankBit;
  else spades |= rankBit;
  atLeastFour |= atLeastThree & rankBit;
  atLeastThree |= atLeastTwo & rankBit;
  atLeastTwo |= atLeastOne & rankBit;
  atLeastOne |= rankBit;

  rankBit = 1 << (secondCard >> 2);
  suit = secondCard & 3;

  if (suit === 0) clubs |= rankBit;
  else if (suit === 1) diamonds |= rankBit;
  else if (suit === 2) hearts |= rankBit;
  else spades |= rankBit;
  atLeastFour |= atLeastThree & rankBit;
  atLeastThree |= atLeastTwo & rankBit;
  atLeastTwo |= atLeastOne & rankBit;
  atLeastOne |= rankBit;

  return scoreHandState(
    clubs,
    diamonds,
    hearts,
    spades,
    atLeastOne,
    atLeastTwo,
    atLeastThree,
    atLeastFour
  );
};

const scratchState = createHandState();

export const evaluateHand = (cards: ArrayLike<number>) => {
  scratchState.fill(0);

  for (let index = 0; index < cards.length; index += 1) {
    addCardToState(scratchState, scratchState, cards[index]);
  }

  return scoreHandState(
    scratchState[0],
    scratchState[1],
    scratchState[2],
    scratchState[3],
    scratchState[4],
    scratchState[5],
    scratchState[6],
    scratchState[7]
  );
};
