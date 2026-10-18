// sRGB <-> OKLab, and a gradient that interpolates in OKLab so a cyan-to-pink
// ramp does not dip through mud the way a hex lerp does.

export type Rgb = readonly [number, number, number]
export type Lab = readonly [number, number, number]

export function hexToRgb(hex: string): Rgb {
  const h = hex.replace('#', '')
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error(`not a six-digit hex: ${hex}`)
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

export function rgbToHex([r, g, b]: Rgb): string {
  const c = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

const toLinear = (c: number) => {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}
const fromLinear = (v: number) => {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055
  return c * 255
}

export function rgbToLab([r, g, b]: Rgb): Lab {
  const lr = toLinear(r), lg = toLinear(g), lb = toLinear(b)
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

export function labToRgb([L, a, b]: Lab): Rgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ]
}

/**
 * A gradient sampled into `steps` RGB stops, evenly spaced in OKLab between
 * the given hex colours. `at(t)` for t in [0, 1] returns the nearest stop,
 * so a frame never allocates.
 */
export class Gradient {
  readonly stops: Rgb[]
  constructor(hexes: readonly string[], steps = 64) {
    if (hexes.length < 2) throw new Error('a gradient needs two colours')
    const labs = hexes.map(h => rgbToLab(hexToRgb(h)))
    this.stops = []
    for (let i = 0; i < steps; i++) {
      const t = (i / (steps - 1)) * (labs.length - 1)
      const k = Math.min(labs.length - 2, Math.floor(t))
      const f = t - k
      const A = labs[k], B = labs[k + 1]
      const lab: Lab = [A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f, A[2] + (B[2] - A[2]) * f]
      const [r, g, b] = labToRgb(lab)
      this.stops.push([Math.round(Math.min(255, Math.max(0, r))), Math.round(Math.min(255, Math.max(0, g))), Math.round(Math.min(255, Math.max(0, b)))])
    }
  }
  at(t: number): Rgb {
    const i = Math.round(Math.min(1, Math.max(0, t)) * (this.stops.length - 1))
    return this.stops[i]
  }
}
