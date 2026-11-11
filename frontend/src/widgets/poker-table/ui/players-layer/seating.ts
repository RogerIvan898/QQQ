import type { SeatDirection } from 'entities/player';

export interface SeatLayout {
  seat: number;
  towardCenter: SeatDirection;
  fx: number;
  fy: number;
}

export interface TableShape {
  compact: boolean;
  ratio: number;
}

export const COMPACT_TABLE_WIDTH = 380;

const ELLIPSE_SCALE = {
  compact: { x: 0.54, y: 0.57 },
  regular: { x: 0.58, y: 0.54 },
};

const FULL_TURN_DEG = 360;

export const computeSeats = (
  seats: number[],
  viewerSeat: number | null,
  shape: TableShape
): SeatLayout[] => {
  const count = seats.length;

  if (!count) return [];

  const scale = shape.compact ? ELLIPSE_SCALE.compact : ELLIPSE_SCALE.regular;
  const width = 1;
  const height = shape.ratio;
  const centerX = width / 2;
  const centerY = height / 2;
  const radiusX = width * scale.x;
  const radiusY = height * scale.y;
  const referenceSeat = viewerSeat ?? seats[0];

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
      fx: x / width,
      fy: y / height,
    };
  });
};
