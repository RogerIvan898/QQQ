import type { SeatDirection } from 'entities/player';

export interface SeatLayout {
  seat: number;
  towardCenter: SeatDirection;
  x: number;
  y: number;
}

interface TableSize {
  width: number;
  height: number;
}

const COMPACT_TABLE_WIDTH = 380;

const ELLIPSE_SCALE = {
  compact: { x: 0.54, y: 0.52 },
  regular: { x: 0.54, y: 0.48 },
};

const FULL_TURN_DEG = 360;

export const computeSeats = (
  seats: number[],
  viewerSeat: number | null,
  table: TableSize
): SeatLayout[] => {
  const count = seats.length;

  if (!count) return [];

  const scale =
    table.width < COMPACT_TABLE_WIDTH
      ? ELLIPSE_SCALE.compact
      : ELLIPSE_SCALE.regular;
  const centerX = table.width / 2;
  const centerY = table.height / 2;
  const radiusX = table.width * scale.x;
  const radiusY = table.height * scale.y;
  const referenceSeat = viewerSeat ?? seats[0];
  // Include the reference seat so a viewer seated outside the occupied range
  // (e.g. a spectator on a high empty seat) still wraps correctly.
  const seatSpan = Math.max(referenceSeat, ...seats) + 1;
  const distanceFromReference = (seat: number) =>
    (((seat - referenceSeat) % seatSpan) + seatSpan) % seatSpan;
  const orderedSeats = [...seats].sort(
    (a, b) => distanceFromReference(a) - distanceFromReference(b)
  );

  return seats.map(seat => {
    const position = orderedSeats.indexOf(seat);
    const angleDeg = (position / count) * FULL_TURN_DEG;
    const angleRad = (angleDeg * Math.PI) / 180;

    const x = centerX - Math.sin(angleRad) * radiusX;
    const y = centerY + Math.cos(angleRad) * radiusY;
    const distance = Math.hypot(centerX - x, centerY - y) || 1;

    return {
      seat,
      towardCenter: {
        x: (centerX - x) / distance,
        y: (centerY - y) / distance,
      },
      x,
      y,
    };
  });
};
