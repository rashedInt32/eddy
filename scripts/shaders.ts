// Bake one Ghostty custom shader per palette from the template, with the
// palette's OKLab ramp as a 16-entry constant. The top of the ramp is left
// off (t <= 0.8): the heading white is for text, not for a background.
import { Gradient } from '../src/color'
import { PALETTES, PALETTE_NAMES } from '../src/palettes'

const TUNING = { alpha: '0.13', speed: '0.035', scale: '2.2', top: 0.8 }

const templateFile = Bun.file(new URL('./shader-template.glsl', import.meta.url))

export async function bake(name: keyof typeof PALETTES): Promise<string> {
  const template = await templateFile.text()
  const g = new Gradient(PALETTES[name].stops, 64)
  const rows: string[] = []
  for (let i = 0; i < 16; i++) {
    const [r, gg, b] = g.at((i / 15) * TUNING.top)
    const f = (v: number) => (v / 255).toFixed(4)
    rows.push(`  vec3(${f(r)}, ${f(gg)}, ${f(b)})${i < 15 ? ',' : ''}`)
  }
  return template
    .replace('__PALETTE__', name)
    .replace('__RAMP__', rows.join('\n'))
    .replace('__ALPHA__', TUNING.alpha)
    .replace('__SPEED__', TUNING.speed)
    .replace('__SCALE__', TUNING.scale)
}

if (import.meta.main) {
  for (const name of PALETTE_NAMES) {
    await Bun.write(`shaders/eddy-${name}.glsl`, await bake(name))
    console.log(`shaders/eddy-${name}.glsl`)
  }
}
