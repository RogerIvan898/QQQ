import type { Card } from '../model';

const RED = '#e8262e';
const BLACK = '#16181d';

/** Suit outlines drawn in a 100×100 box. */
const SuitShape = ({ suit }: { suit: Card['suit'] }) => {
  switch (suit) {
    case 'hearts':
      return (
        <path d="M50 94C17 68 2 51 2 31 2 15 14 4 28.5 4 38.5 4 46 9.5 50 18 54 9.5 61.5 4 71.5 4 86 4 98 15 98 31 98 51 83 68 50 94Z" />
      );
    case 'diamonds':
      return <path d="M50 2 90 50 50 98 10 50Z" />;
    case 'spades':
      return (
        <path d="M50 2C32 25 4 40 4 63 4 77 15 85 27 85 35 85 41 81 45.5 75 44.5 85 40 93 31 98H69C60 93 55.5 85 54.5 75 59 81 65 85 73 85 85 85 96 77 96 63 96 40 68 25 50 2Z" />
      );
    case 'clubs':
      return (
        <>
          <circle cx="50" cy="27" r="21" />
          <circle cx="26" cy="58" r="21" />
          <circle cx="74" cy="58" r="21" />
          <path d="M45.5 52C45.5 76 41 90 31 98H69C59 90 54.5 76 54.5 52Z" />
        </>
      );
  }
};

interface Props {
  card: Card;
}

/**
 * Card face: rank and small suit in the top-left corner, one large suit in
 * the bottom-right. Fills its parent (64×92 card proportions).
 */
export const CardFace = ({ card }: Props) => {
  const red = card.suit === 'hearts' || card.suit === 'diamonds';
  const isTen = card.rank === '10';

  return (
    <svg
      viewBox="0 0 64 92"
      width="100%"
      height="100%"
      fill={red ? RED : BLACK}
      aria-hidden="true"
      focusable="false"
      style={{ display: 'block' }}
    >
      <text
        x={isTen ? 3 : 5.5}
        y={23}
        fontFamily="'Arial Black', 'Helvetica Neue', Arial, sans-serif"
        fontWeight={900}
        fontSize={isTen ? 19 : 23}
        letterSpacing={isTen ? -1.5 : 0}
      >
        {card.rank}
      </text>
      <g transform="translate(5 27) scale(0.15)">
        <SuitShape suit={card.suit} />
      </g>
      <g transform="translate(25 51) scale(0.36)">
        <SuitShape suit={card.suit} />
      </g>
    </svg>
  );
};
