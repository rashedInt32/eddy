// One SVG still per palette, for the README. Same seed and tick count so
// the gallery compares colour, not chance.
import { PALETTE_NAMES } from '../src/palettes'
import { parseArgs, still } from '../src/main'
import { frameToSvg } from '../src/svg'

const SEED = 42, TICKS = 240, COLS = 96, ROWS = 28
for (const name of PALETTE_NAMES) {
  const a = parseArgs(['-p', name, '--seed', String(SEED), '--once', String(TICKS)])
  if (a === 'help' || a === 'list') throw new Error('unexpected')
  const f = still(a, { cols: COLS, rows: ROWS })
  await Bun.write(`shots/${name}.svg`, frameToSvg(f.cells, f.cols, f.rows))
  console.log(`shots/${name}.svg`)
}
