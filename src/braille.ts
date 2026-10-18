// Pack an intensity grid in dot space into braille cells. Each cell is two
// dots wide and four tall; its colour is the brightest dot in it.

import type { Gradient, Rgb } from './color'

/** dot (dx, dy) within a cell to its braille bit, per U+2800's layout */
const BITS = [
  [0x01, 0x08],
  [0x02, 0x10],
  [0x04, 0x20],
  [0x40, 0x80],
]

export type Cell = { ch: string; rgb: Rgb | null }

/** a dot below this does not light; the grid is in [0, 1] */
export const THRESHOLD = 0.06

export function brailleChar(bits: number): string {
  return String.fromCodePoint(0x2800 + (bits & 0xff))
}

export function packCells(
  grid: Float32Array,
  dotsWide: number,
  dotsHigh: number,
  gradient: Gradient,
  out: Cell[] = [],
): Cell[] {
  const cols = dotsWide >> 1
  const rows = dotsHigh >> 2
  out.length = cols * rows
  let n = 0
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let bits = 0
      let peak = 0
      for (let dy = 0; dy < 4; dy++) {
        const row = (r * 4 + dy) * dotsWide + c * 2
        for (let dx = 0; dx < 2; dx++) {
          const v = grid[row + dx]
          if (v > THRESHOLD) {
            bits |= BITS[dy][dx]
            if (v > peak) peak = v
          }
        }
      }
      const cell = out[n] ?? (out[n] = { ch: ' ', rgb: null })
      if (bits === 0) { cell.ch = ' '; cell.rgb = null }
      else { cell.ch = brailleChar(bits); cell.rgb = gradient.at(peak) }
      n++
    }
  }
  return out
}
