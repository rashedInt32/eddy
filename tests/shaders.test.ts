import { test, expect } from 'bun:test'
import { bake } from '../scripts/shaders'
import { PALETTE_NAMES } from '../src/palettes'

test('every palette bakes a shader with a full 16-step ramp and no placeholders left', async () => {
  for (const name of PALETTE_NAMES) {
    const glsl = await bake(name)
    expect(glsl).not.toMatch(/__[A-Z]+__/)
    const sparks = name === 'prism' ? 8 : 1
    expect((glsl.match(/^\s+vec3\(/gm) ?? []).length).toBe(16 + sparks)
    expect(glsl).toContain(`const int SPARK_COUNT = ${name === 'prism' ? 8 : 0};`)
    expect(glsl).toContain('void mainImage(out vec4 fragColor, in vec2 fragCoord)')
    expect(glsl).toContain('iBackgroundColor')
    expect(glsl).toContain(`the ${name} ramp`)
    // the ramp climbs: the last stop is brighter than the first
    const ramp = glsl.slice(glsl.indexOf('RAMP[16]'))
    const rows = [...ramp.matchAll(/vec3\(([\d.]+), ([\d.]+), ([\d.]+)\)/g)].map(m => +m[1] + +m[2] + +m[3])
    expect(rows[15]).toBeGreaterThan(rows[0])
  }
})
