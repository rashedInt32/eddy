// Bake one Ghostty custom shader per palette from the template, with the
// palette's OKLab ramp as a 16-entry constant. The top of the ramp is left
// off (t <= 0.8): the heading white is for text, not for a background.
import { Gradient, hexToRgb } from '../src/color'
import { PALETTES, PALETTE_NAMES, type PaletteName } from '../src/palettes'

// glow colours drawn at random per dot per breath; only prism has them, its
// starship set, so the field sparkles in mixed hues over a grey-blue rest
const SPARKS: Partial<Record<PaletteName, string[]>> = {
  prism: ['#4d96ff', '#43b581', '#ff6b6b', '#e28f2a', '#8c6ff0', '#32ff7e', '#fff200', '#4eb4d3'],
}

const TUNING = { alpha: '0.3', speed: '0.06', scale: '2.2', pitch: '170.0', sparse: '0.55', top: 0.8 }

// two looks per palette, chosen in Ghostty by file name: `eddy-<palette>.glsl`
// keeps a dim lattice of resting dots with glows on top; `eddy-<palette>-glow.glsl`
// hides the lattice and shows only the glows
export const LOOKS = {
  '': { rest: '1.0', share: '0.5' },
  '-glow': { rest: '0.0', share: '0.8' },
} as const
export type Look = keyof typeof LOOKS

const templateFile = Bun.file(new URL('./shader-template.glsl', import.meta.url))

export async function bake(name: keyof typeof PALETTES, look: Look = ''): Promise<string> {
  const template = await templateFile.text()
  const g = new Gradient(PALETTES[name].stops, 64)
  const rows: string[] = []
  for (let i = 0; i < 16; i++) {
    const [r, gg, b] = g.at((i / 15) * TUNING.top)
    const f = (v: number) => (v / 255).toFixed(4)
    rows.push(`  vec3(${f(r)}, ${f(gg)}, ${f(b)})${i < 15 ? ',' : ''}`)
  }
  const sparks = SPARKS[name] ?? []
  const sparkRows = (sparks.length ? sparks : ['#000000']).map((h, i, arr) => {
    const [r, gg, b] = hexToRgb(h)
    const f = (v: number) => (v / 255).toFixed(4)
    return `  vec3(${f(r)}, ${f(gg)}, ${f(b)})${i < arr.length - 1 ? ',' : ''}`
  })
  return template
    .replace('__PALETTE__', name + (look ? ' (glow-only)' : ''))
    .replace('__SPARK_COUNT__', String(sparks.length))
    .replace(/__SPARK_SIZE__/g, String(Math.max(1, sparks.length)))
    .replace('__SPARKS__', sparkRows.join('\n'))
    .replace('__RAMP__', rows.join('\n'))
    .replace('__ALPHA__', TUNING.alpha)
    .replace('__SPEED__', TUNING.speed)
    .replace('__SCALE__', TUNING.scale)
    .replace('__PITCH__', TUNING.pitch)
    .replace('__SPARSE__', TUNING.sparse)
    .replace('__REST__', LOOKS[look].rest)
    .replace('__SHARE__', LOOKS[look].share)
}

if (import.meta.main) {
  for (const name of PALETTE_NAMES) {
    for (const look of Object.keys(LOOKS) as Look[]) {
      await Bun.write(`shaders/eddy-${name}${look}.glsl`, await bake(name, look))
      console.log(`shaders/eddy-${name}${look}.glsl`)
    }
  }
}
