// The flow field: particles pushed by a slowly turning noise field, leaving
// trails in an intensity grid that fades every tick. The grid is in dot
// space (two dots per column, four per row), not cell space.

import { simplex3, rng, type Noise3 } from './noise'

export type FieldOptions = {
  /** dots across and down */
  width: number
  height: number
  seed: number
  /** particles per thousand dots */
  density: number
  /** noise scale: smaller is broader, slower curves */
  scale: number
  /** dots per tick at full speed */
  speed: number
  /** how much of a trail survives a tick, 0..1 */
  decay: number
  /** how fast the field itself turns over time */
  drift: number
}

export const DEFAULTS: Omit<FieldOptions, 'width' | 'height' | 'seed'> = {
  density: 6,
  scale: 0.012,
  speed: 1.1,
  decay: 0.93,
  drift: 0.0035,
}

export class Field {
  readonly width: number
  readonly height: number
  readonly grid: Float32Array
  private xs: Float32Array
  private ys: Float32Array
  private ages: Uint16Array
  private lives: Uint16Array
  private noise: Noise3
  private random: () => number
  private t = 0
  readonly opts: FieldOptions

  constructor(opts: FieldOptions) {
    this.opts = opts
    this.width = opts.width
    this.height = opts.height
    this.grid = new Float32Array(opts.width * opts.height)
    this.noise = simplex3(opts.seed)
    this.random = rng(opts.seed ^ 0x9e3779b9)
    const count = Math.max(1, Math.round((opts.width * opts.height * opts.density) / 1000))
    this.xs = new Float32Array(count)
    this.ys = new Float32Array(count)
    this.ages = new Uint16Array(count)
    this.lives = new Uint16Array(count)
    for (let i = 0; i < count; i++) this.spawn(i, true)
  }

  get count(): number { return this.xs.length }

  private spawn(i: number, scatterAge = false): void {
    this.xs[i] = this.random() * this.width
    this.ys[i] = this.random() * this.height
    this.lives[i] = 120 + Math.floor(this.random() * 240)
    this.ages[i] = scatterAge ? Math.floor(this.random() * this.lives[i]) : 0
  }

  /** advance one tick: fade the grid, move every particle, deposit its head */
  tick(): void {
    const { grid, width, height } = this
    const { decay, scale, speed, drift } = this.opts
    for (let i = 0; i < grid.length; i++) grid[i] *= decay
    this.t += drift
    const e = 0.75 // finite-difference step, in dots
    for (let i = 0; i < this.xs.length; i++) {
      const x = this.xs[i], y = this.ys[i]
      // curl of the noise: a divergence-free flow, so particles swirl in
      // eddies instead of piling into sinks. Two octaves: the broad
      // current and a little turbulence on top.
      const n = (px: number, py: number) =>
        this.noise(px * scale, py * scale, this.t)
        + this.noise(px * scale * 3.1 + 17, py * scale * 3.1 + 9, this.t * 1.7) * 0.3
      const dx = (n(x + e, y) - n(x - e, y)) / (2 * e)
      const dy = (n(x, y + e) - n(x, y - e)) / (2 * e)
      let vx = dy, vy = -dx
      const mag = Math.hypot(vx, vy) || 1e-6
      // normalised direction, with the quiet centre of an eddy moving slower
      const m = 0.35 + 0.65 * Math.min(1, mag / (scale * 2.5))
      vx = (vx / mag) * speed * m
      vy = (vy / mag) * speed * m
      // a particle eases in and out over its life so heads do not pop
      const life = this.lives[i]
      const age = this.ages[i]
      const fade = Math.min(1, age / 12, (life - age) / 24)
      const nx = x + vx
      const ny = y + vy
      this.ages[i] = age + 1
      if (age >= life || nx < 0 || ny < 0 || nx >= width || ny >= height) {
        this.spawn(i)
        continue
      }
      this.xs[i] = nx
      this.ys[i] = ny
      const gi = (ny | 0) * width + (nx | 0)
      if (fade > grid[gi]) grid[gi] = fade
    }
  }
}
