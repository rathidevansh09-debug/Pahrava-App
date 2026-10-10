// Floor plans transcribed from Ar. Vinita Agrawal (Jhunjhunwala)'s layout drawings.
// Coordinates are in drawing units (pixels of the PDF render); only proportions matter.
import type { FloorPlan } from './types';

export interface PlanStallSpec {
  n: string;
  type: string; // key into the venue's stall types (seed.ts)
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  corner?: boolean;
}

export interface PlanSpec {
  plan: FloorPlan;
  stalls: PlanStallSpec[];
}

type Row = [n: number | string, type: string, x1: number, y1: number, x2: number, y2: number, corner?: boolean];
const toSpecs = (rows: Row[]): PlanStallSpec[] => rows.map(([n, type, x1, y1, x2, y2, corner]) => ({ n: String(n), type, x1, y1, x2, y2, corner }));

/** Stalls laid side by side along x, starting at x0, each `w` wide. */
function strip(numbers: number[], type: string, x0: number, w: number, y1: number, y2: number, corners: number[] = []): Row[] {
  return numbers.map((n, i) => [n, type, x0 + i * w, y1, x0 + (i + 1) * w, y2, corners.includes(n)]);
}

/** Stalls stacked along y. `edges` are the y boundaries (length = numbers + 1). */
function column(numbers: number[], types: string[], x1: number, x2: number, edges: number[]): Row[] {
  return numbers.map((n, i) => [n, types[i], x1, edges[i], x2, edges[i + 1]]);
}

// ---------------------------------------------------------------------------
// Lakshika Banquets, Nashik — main hall (48 stalls)
// red = Premium 3×2 · purple = 3×2 regular · green = 2×2 regular
// ---------------------------------------------------------------------------
const R = 'red';
const P = 'purple';
const G = 'green';

export const LAKSHIKA_MAIN: PlanSpec = {
  plan: {
    viewBox: [118, 58, 645, 1062],
    features: [
      { kind: 'hall', x: 133, y: 68, w: 615, h: 982 },
      { kind: 'room', x: 133, y: 75, w: 57, h: 50, label: 'trial' },
      { kind: 'stage', x: 349, y: 140, w: 194, h: 57 },
      { kind: 'stage', x: 397, y: 900, w: 193, h: 52 },
      { kind: 'passage', x: 280, y: 290, x2: 280, y2: 860, note: '2.67 m' },
      { kind: 'passage', x: 493, y: 230, x2: 493, y2: 890, note: '2.50 m' },
      { kind: 'passage', x: 703, y: 470, x2: 703, y2: 730, note: '1.50 m' },
      { kind: 'exit', x: 313, y: 1050, dir: 'down' },
      { kind: 'entry', x: 445, y: 1080, dir: 'up' },
      { kind: 'label', x: 445, y: 1108, label: 'lobby' },
      { kind: 'label', x: 205, y: 1075, label: 'stairs' },
      { kind: 'label', x: 660, y: 1075, label: 'stairs' },
    ],
  },
  stalls: toSpecs([
    // Behind the top stage
    ...strip([12, 11], P, 349, 97, 75, 140),
    ...strip([10, 9], P, 548, 97, 75, 140),
    // Left wall
    [39, G, 148, 211, 213, 273],
    ...column([40, 41, 42, 43, 44, 45, 46, 47, 48], [R, P, P, G, G, G, P, P, P], 172, 238, [275, 370, 467, 563, 627, 690, 753, 850, 945, 1042]),
    // Centre-left block
    ...column([31, 32, 33, 34, 35, 36, 37, 38], [R, P, P, G, G, P, P, R], 323, 388, [255, 352, 448, 545, 608, 672, 768, 862, 960]),
    ...column([30, 29, 28, 27, 26, 25, 24, 23, 22], [R, P, G, G, G, G, G, G, G], 388, 453, [255, 352, 448, 512, 577, 640, 703, 767, 830, 893]),
    // Centre-right block
    ...column([13, 14, 15, 16, 17, 18, 19, 20, 21], [R, P, G, G, G, G, G, G, G], 533, 598, [255, 352, 448, 512, 577, 640, 703, 767, 830, 893]),
    ...column([8, 7, 6, 5, 4, 3, 2, 1], [R, R, R, G, G, R, R, R], 598, 663, [255, 352, 448, 545, 608, 672, 768, 862, 960]),
  ]),
};

// ---------------------------------------------------------------------------
// Agrasen Bhavan, Malegaon — first floor
// AC Hall: green = Premium 3×2, pink = Normal 2×2 (stalls 1–26)
// Outside: purple = Outside 3×2 (1–28), top row 29–37 = Food stalls
// Corners (+₹500) are the row ends; staff can change them in Edit layout.
// ---------------------------------------------------------------------------
const AP = 'ac32';
const AN = 'ac22';

export const AGRASEN_AC: PlanSpec = {
  plan: {
    viewBox: [786, 238, 404, 274],
    features: [
      { kind: 'hall', x: 835, y: 250, w: 345, h: 250 },
      { kind: 'stage', x: 1112, y: 333, w: 64, h: 80, note: '3.60 × 4.50 m' },
      { kind: 'passage', x: 850, y: 314, x2: 1170, y2: 314, note: '2.54 m' },
      { kind: 'passage', x: 850, y: 436, x2: 1100, y2: 436, note: '2.54 m' },
      { kind: 'entry', x: 800, y: 357, dir: 'right' },
      { kind: 'exit', x: 835, y: 392, dir: 'left' },
    ],
  },
  stalls: toSpecs([
    ...strip([1, 2, 3], AP, 838, 53, 253, 290, [1]),
    ...strip([4, 5, 6, 7, 8], AN, 997, 35.8, 253, 290, [8]),
    ...strip([13, 12], AP, 872, 53, 337, 375, [13]),
    ...strip([11, 10, 9], AN, 978, 36, 337, 375, [9]),
    ...strip([14, 15], AP, 872, 53, 375, 412, [14]),
    ...strip([16, 17, 18], AN, 978, 36, 375, 412, [18]),
    ...strip([26, 25, 24], AP, 838, 53, 458, 497, [26]),
    ...strip([23, 22, 21, 20, 19], AN, 997, 35.8, 458, 497, [19]),
  ]),
};

const O = 'out32';
const F = 'food';
const OW = 53.2;

export const AGRASEN_OUTSIDE: PlanSpec = {
  plan: {
    viewBox: [200, 255, 615, 335],
    features: [
      { kind: 'hall', x: 218, y: 278, w: 547, h: 242 },
      { kind: 'passage', x: 290, y: 343, x2: 755, y2: 343, note: '2.58 m' },
      { kind: 'passage', x: 290, y: 457, x2: 755, y2: 457, note: '2.58 m' },
      { kind: 'passage', x: 270, y: 330, x2: 270, y2: 460, note: '1.72 m' },
      { kind: 'exit', x: 765, y: 355, dir: 'right' },
      { kind: 'entry', x: 800, y: 393, dir: 'left' },
      { kind: 'stairs', x: 432, y: 522, w: 88, h: 50 },
      { kind: 'stairs', x: 222, y: 260, w: 30, h: 18 },
    ],
  },
  stalls: toSpecs([
    ...strip([29, 30, 31, 32, 33, 34, 35, 36, 37], F, 285, OW, 283, 318),
    ...strip([28, 27, 26, 25, 24, 23, 22, 21], O, 285, OW, 364, 399, [28, 21]),
    ...strip([13, 14, 15, 16, 17, 18, 19, 20], O, 285, OW, 399, 434, [13, 20]),
    ...strip([9, 8, 7, 6, 5, 4, 3, 2, 1], O, 285, OW, 480, 516, [9, 1]),
    [12, O, 220, 320, 255, 370, true],
    [11, O, 220, 370, 255, 420],
    [10, O, 220, 420, 255, 470, true],
  ]),
};
