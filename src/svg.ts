// One frame as SVG: a dark ground and a <text> per lit cell in a monospace
// face. For the README, and for anyone who wants a still.

import type { Cell } from './braille'
import { rgbToHex } from './color'

export function frameToSvg(cells: Cell[], cols: number, rows: number, bg = '#0d1117', cellW = 9.6, cellH = 20): string {
  const w = +(cols * cellW).toFixed(1)
  const h = +(rows * cellH).toFixed(1)
  const lines: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
    `<rect width="${w}" height="${h}" fill="${bg}"/>`,
    `<g font-family="'JetBrains Mono','Fira Code','SF Mono',Menlo,monospace" font-size="${cellH * 0.8}" dominant-baseline="hanging">`,
  ]
  let lit = 0
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = cells[r * cols + c]
      if (!cell.rgb) continue
      lit++
      lines.push(`<text x="${(c * cellW).toFixed(1)}" y="${(r * cellH + cellH * 0.1).toFixed(1)}" fill="${rgbToHex(cell.rgb)}">${cell.ch}</text>`)
    }
  }
  lines.push('</g>', '</svg>')
  return lines.join('\n') + (lit === 0 ? '\n<!-- empty frame -->' : '\n')
}
