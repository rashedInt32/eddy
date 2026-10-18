// ANSI output: one string per frame, written in a single call so the
// terminal never shows half a frame. A colour code is emitted only when the
// colour changes along a row.

import type { Cell } from './braille'
import type { Rgb } from './color'

export const ESC = '\x1b'
export const ALT_ON = `${ESC}[?1049h`
export const ALT_OFF = `${ESC}[?1049l`
export const CURSOR_HIDE = `${ESC}[?25l`
export const CURSOR_SHOW = `${ESC}[?25h`
export const CLEAR = `${ESC}[2J`
export const HOME = `${ESC}[H`
export const RESET = `${ESC}[0m`

export const fg = ([r, g, b]: Rgb) => `${ESC}[38;2;${r};${g};${b}m`

export type Caption = { text: string; rgb: Rgb } | null

/** rows x cols cells to one frame string; the caption sits bottom-right */
export function renderFrame(cells: Cell[], cols: number, rows: number, caption: Caption = null): string {
  let out = HOME
  let last: Rgb | null = null
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = cells[r * cols + c]
      if (cell.rgb && cell.rgb !== last) {
        out += fg(cell.rgb)
        last = cell.rgb
      }
      out += cell.ch
    }
    if (r < rows - 1) out += '\r\n'
  }
  if (caption && caption.text.length < cols) {
    const col = cols - caption.text.length + 1 // 1-indexed
    out += `${ESC}[${rows};${col}H${fg(caption.rgb)}${caption.text}`
  }
  return out + RESET
}

/** strip SGR and cursor codes, for tests and plain dumps */
export function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
}
