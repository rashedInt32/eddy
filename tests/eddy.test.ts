import { test, expect } from 'bun:test'
import { simplex3, rng } from '../src/noise'
import { Gradient, hexToRgb, rgbToHex, rgbToLab, labToRgb } from '../src/color'
import { PALETTES, PALETTE_NAMES } from '../src/palettes'
import { Field } from '../src/field'
import { packCells, brailleChar, THRESHOLD } from '../src/braille'
import { renderFrame, stripAnsi } from '../src/term'
import { frameToSvg } from '../src/svg'
import { parseArgs, still } from '../src/main'

test('a seed replays the same noise, and it stays inside [-1, 1]', () => {
  const a = simplex3(7), b = simplex3(7), c = simplex3(8)
  let differs = false
  for (let i = 0; i < 2000; i++) {
    const x = i * 0.37, y = i * 0.11, z = i * 0.05
    const v = a(x, y, z)
    expect(v).toBe(b(x, y, z))
    expect(Math.abs(v)).toBeLessThanOrEqual(1)
    if (v !== c(x, y, z)) differs = true
  }
  expect(differs).toBe(true)
  const r = rng(1)
  for (let i = 0; i < 100; i++) { const v = r(); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1) }
})

test('hex round-trips through OKLab within a step', () => {
  for (const hex of ['#000000', '#ffffff', '#40e5e5', '#f43a6b', '#12292c', '#e9934c']) {
    const back = labToRgb(rgbToLab(hexToRgb(hex)))
    const want = hexToRgb(hex)
    for (let i = 0; i < 3; i++) expect(Math.abs(back[i] - want[i])).toBeLessThan(1)
  }
  expect(rgbToHex(hexToRgb('#AbCdEf'))).toBe('#abcdef')
  expect(() => hexToRgb('#abc')).toThrow()
})

test('a gradient starts and ends on its stops and never clips mid-way', () => {
  for (const name of PALETTE_NAMES) {
    const { stops } = PALETTES[name]
    const g = new Gradient(stops, 64)
    expect(rgbToHex(g.at(0))).toBe(stops[0])
    expect(rgbToHex(g.at(1))).toBe(stops[stops.length - 1])
    for (const [r, gg, b] of g.stops) for (const v of [r, gg, b]) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(255) }
  }
})

test('the field keeps every particle on the grid and leaves trails that fade', () => {
  const f = new Field({ width: 160, height: 96, seed: 3, density: 6, scale: 0.012, speed: 1.1, decay: 0.9, drift: 0.003 })
  expect(f.count).toBe(Math.round((160 * 96 * 6) / 1000))
  for (let i = 0; i < 60; i++) f.tick()
  let lit = 0, peak = 0
  for (const v of f.grid) { if (v > THRESHOLD) lit++; if (v > peak) peak = v; expect(v).toBeLessThanOrEqual(1) }
  expect(lit).toBeGreaterThan(f.count)
  expect(peak).toBeGreaterThan(0.9)
  const before = lit
  // with the decay alone (no deposits) the trails would vanish; with
  // deposits they stay roughly steady rather than filling the screen
  for (let i = 0; i < 60; i++) f.tick()
  let after = 0
  for (const v of f.grid) if (v > THRESHOLD) after++
  expect(after).toBeLessThan(160 * 96 * 0.5)
  expect(Math.abs(after - before) / before).toBeLessThan(0.6)
})

test('braille bits follow U+2800 and a cell takes its brightest dot', () => {
  expect(brailleChar(0)).toBe('⠀')
  expect(brailleChar(0x01 | 0x08)).toBe('⠉') // top row, both dots
  expect(brailleChar(0x40 | 0x80)).toBe('⣀') // bottom row, both dots
  const grid = new Float32Array(2 * 4)
  grid[0] = 0.2       // (0,0) dim
  grid[1 * 2 + 1] = 1 // (1,1) full
  const g = new Gradient(['#000000', '#ffffff'], 64)
  const [cell] = packCells(grid, 2, 4, g)
  expect(cell.ch).toBe(brailleChar(0x01 | 0x10))
  expect(rgbToHex(cell.rgb!)).toBe('#ffffff')
  const [blank] = packCells(new Float32Array(8), 2, 4, g)
  expect(blank.ch).toBe(' ')
  expect(blank.rgb).toBeNull()
})

test('a frame is exactly rows x cols glyphs once the codes are stripped', () => {
  const a = parseArgs(['--seed', '5', '--once', '150', '-p', 'iris'])
  if (a === 'help' || a === 'list') throw new Error('unexpected')
  const frame = still(a, { cols: 40, rows: 12 })
  const text = stripAnsi(renderFrame(frame.cells, 40, 12))
  const lines = text.split('\r\n')
  expect(lines.length).toBe(12)
  for (const line of lines) expect([...line].length).toBe(40)
  expect(text).toMatch(/[⠁-⣿]/)
  const svg = frameToSvg(frame.cells, 40, 12)
  expect(svg).toContain('<svg')
  expect((svg.match(/<text/g) ?? []).length).toBe(frame.cells.filter(c => c.rgb).length)
})

test('args: defaults, palette validation, bare --once', () => {
  const a = parseArgs([])
  if (a === 'help' || a === 'list') throw new Error('unexpected')
  expect(a.palette).toBe('lagoon')
  expect(a.once).toBeNull()
  const b = parseArgs(['--once', '--svg', 'x.svg'])
  if (b === 'help' || b === 'list') throw new Error('unexpected')
  expect(b.once).toBe(200)
  expect(b.svg).toBe('x.svg')
  expect(parseArgs(['--help'])).toBe('help')
  expect(parseArgs(['--list'])).toBe('list')
  expect(() => parseArgs(['-p', 'neon'])).toThrow(/unknown palette/)
  expect(() => parseArgs(['--fps'])).toThrow(/needs a number/)
  expect(() => parseArgs(['--wat'])).toThrow(/unknown option/)
})
