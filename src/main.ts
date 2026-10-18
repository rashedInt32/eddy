import { Field, DEFAULTS } from './field'
import { Gradient, hexToRgb } from './color'
import { PALETTES, PALETTE_NAMES, isPaletteName, type PaletteName } from './palettes'
import { packCells, type Cell } from './braille'
import { renderFrame, ALT_ON, ALT_OFF, CURSOR_HIDE, CURSOR_SHOW, CLEAR, HOME, RESET, stripAnsi } from './term'
import { frameToSvg } from './svg'

const HELP = `eddy: a flow field for the terminal, in the glass palettes

usage: eddy [options]

  -p, --palette <name>   ${PALETTE_NAMES.join(', ')} (default lagoon)
  -c, --cycle <seconds>  move to the next palette every N seconds
  -s, --seed <n>         replay a field (default: random)
  -d, --density <n>      particles per thousand dots (default ${DEFAULTS.density})
  -f, --fps <n>          frames per second (default 30)
      --speed <n>        dots per tick (default ${DEFAULTS.speed})
      --scale <n>        noise scale; smaller is broader (default ${DEFAULTS.scale})
      --decay <n>        trail survival per tick, 0..1 (default ${DEFAULTS.decay})
      --no-caption       never show the palette name
      --once [ticks]     print one frame after N ticks (default 200) and exit
      --svg <path>       with --once: write that frame as SVG instead
      --list             list palettes
  -h, --help

keys: q / esc quit   space pause   n / p or arrows palette   + / - density   r reseed
`

type Args = {
  palette: PaletteName
  cycle: number
  seed: number
  density: number
  fps: number
  speed: number
  scale: number
  decay: number
  caption: boolean
  once: number | null
  svg: string | null
}

export function parseArgs(argv: string[]): Args | 'help' | 'list' {
  const a: Args = {
    palette: 'lagoon', cycle: 0, seed: (Math.random() * 2 ** 31) | 0,
    density: DEFAULTS.density, fps: 30, speed: DEFAULTS.speed, scale: DEFAULTS.scale,
    decay: DEFAULTS.decay, caption: true, once: null, svg: null,
  }
  const num = (v: string | undefined, name: string) => {
    const n = Number(v)
    if (v === undefined || Number.isNaN(n)) throw new Error(`${name} needs a number`)
    return n
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const next = () => argv[++i]
    switch (arg) {
      case '-h': case '--help': return 'help'
      case '--list': return 'list'
      case '-p': case '--palette': {
        const v = next()
        if (!v || !isPaletteName(v)) throw new Error(`unknown palette: ${v}. one of ${PALETTE_NAMES.join(', ')}`)
        a.palette = v; break
      }
      case '-c': case '--cycle': a.cycle = num(next(), arg); break
      case '-s': case '--seed': a.seed = num(next(), arg) | 0; break
      case '-d': case '--density': a.density = num(next(), arg); break
      case '-f': case '--fps': a.fps = num(next(), arg); break
      case '--speed': a.speed = num(next(), arg); break
      case '--scale': a.scale = num(next(), arg); break
      case '--decay': a.decay = num(next(), arg); break
      case '--no-caption': a.caption = false; break
      case '--once': {
        const peek = argv[i + 1]
        a.once = peek !== undefined && /^\d+$/.test(peek) ? Number(next()) : 200
        break
      }
      case '--svg': a.svg = next() ?? null; if (!a.svg) throw new Error('--svg needs a path'); break
      default: throw new Error(`unknown option: ${arg}`)
    }
  }
  return a
}

type Size = { cols: number; rows: number }

function size(): Size {
  return { cols: process.stdout.columns || 80, rows: process.stdout.rows || 24 }
}

function makeField(a: Args, s: Size): Field {
  return new Field({
    width: s.cols * 2, height: s.rows * 4, seed: a.seed,
    density: a.density, scale: a.scale, speed: a.speed, decay: a.decay, drift: DEFAULTS.drift,
  })
}

const gradients = new Map<PaletteName, Gradient>()
function gradientFor(name: PaletteName): Gradient {
  let g = gradients.get(name)
  if (!g) { g = new Gradient(PALETTES[name].stops); gradients.set(name, g) }
  return g
}

/** render one still: for --once and tests */
export function still(a: Args, s: Size): { cells: Cell[]; cols: number; rows: number } {
  const field = makeField(a, s)
  for (let i = 0; i < (a.once ?? 200); i++) field.tick()
  const cells = packCells(field.grid, field.width, field.height, gradientFor(a.palette))
  return { cells, cols: s.cols, rows: s.rows }
}

export function run(a: Args): void {
  const out = process.stdout
  const stdin = process.stdin
  let s = size()
  let field = makeField(a, s)
  let palette = a.palette
  let paused = false
  let cells: Cell[] = []
  let captionUntil = a.caption ? Date.now() + 1800 : 0
  let lastCycle = Date.now()
  let seed = a.seed

  const captionRgb = () => hexToRgb(PALETTES[palette].faint)

  const setPalette = (name: PaletteName) => {
    palette = name
    if (a.caption) captionUntil = Date.now() + 1800
  }
  const step = (d: number) => {
    const i = PALETTE_NAMES.indexOf(palette)
    setPalette(PALETTE_NAMES[(i + d + PALETTE_NAMES.length) % PALETTE_NAMES.length])
  }
  const rebuild = () => {
    field = new Field({ ...field.opts, width: s.cols * 2, height: s.rows * 4, seed, density: a.density })
    out.write(CLEAR)
  }

  const quit = () => {
    clearInterval(timer)
    if (stdin.isTTY) stdin.setRawMode(false)
    stdin.pause()
    out.write(RESET + CURSOR_SHOW + ALT_OFF)
    process.exit(0)
  }

  out.write(ALT_ON + CURSOR_HIDE + CLEAR + HOME)
  if (stdin.isTTY) stdin.setRawMode(true)
  stdin.resume()
  stdin.setEncoding('utf8')
  stdin.on('data', (key: string) => {
    switch (key) {
      case 'q': case '\x1b': case '\x03': case '\x04': quit(); break
      case ' ': paused = !paused; break
      case 'n': case '\x1b[C': case '\x1b[B': step(1); break
      case 'p': case '\x1b[D': case '\x1b[A': step(-1); break
      case '+': case '=': a.density = Math.min(40, a.density + 1); rebuild(); break
      case '-': case '_': a.density = Math.max(1, a.density - 1); rebuild(); break
      case 'r': seed = (Math.random() * 2 ** 31) | 0; rebuild(); break
    }
  })
  out.on('resize', () => { s = size(); rebuild() })
  process.on('SIGTERM', quit)
  process.on('SIGINT', quit)

  const timer = setInterval(() => {
    const now = Date.now()
    if (a.cycle > 0 && now - lastCycle >= a.cycle * 1000) { lastCycle = now; step(1) }
    if (!paused) field.tick()
    cells = packCells(field.grid, field.width, field.height, gradientFor(palette), cells)
    const caption = now < captionUntil ? { text: `${palette} `, rgb: captionRgb() } : null
    out.write(renderFrame(cells, s.cols, s.rows, caption))
  }, Math.max(8, Math.round(1000 / a.fps)))
}

if (import.meta.main) {
  let parsed: ReturnType<typeof parseArgs>
  try {
    parsed = parseArgs(process.argv.slice(2))
  } catch (e) {
    console.error(String(e instanceof Error ? e.message : e))
    console.error(HELP)
    process.exit(2)
  }
  if (parsed === 'help') { process.stdout.write(HELP); process.exit(0) }
  if (parsed === 'list') { process.stdout.write(PALETTE_NAMES.join('\n') + '\n'); process.exit(0) }
  if (parsed.once !== null) {
    const frame = still(parsed, size())
    if (parsed.svg) {
      Bun.write(parsed.svg, frameToSvg(frame.cells, frame.cols, frame.rows)).then(() => process.exit(0))
    } else {
      process.stdout.write(renderFrame(frame.cells, frame.cols, frame.rows) + '\n')
    }
  } else if (!process.stdout.isTTY) {
    console.error('eddy draws to a terminal; try --once to print a frame, or --svg to write one')
    process.exit(1)
  } else {
    run(parsed)
  }
}

export { stripAnsi }
