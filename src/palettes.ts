// Each ramp runs dark to bright: the palette's card tint, its rule grey, then
// its secondary, its lead, and its heading white. The hexes are glass's
// (~/Documents/codes/packages/glass/hooks/palette.ts); the ramps are eddy's.

export type PaletteName =
  | 'lagoon' | 'iris' | 'tarnish' | 'overprint' | 'ironbow'
  | 'tidepool' | 'water' | 'crimson' | 'tangerine' | 'prism'

export type Ramp = {
  /** dark to bright */
  stops: readonly string[]
  /** the caption colour: the palette's faint step */
  faint: string
}

export const PALETTES: Record<PaletteName, Ramp> = {
  lagoon: { stops: ['#12292c', '#3a5c5e', '#70d5ed', '#40e5e5', '#f2eee3'], faint: '#547275' },
  iris: { stops: ['#202436', '#4c5169', '#63ccc0', '#92a2ff', '#e2e4ef'], faint: '#64687b' },
  tarnish: { stops: ['#1b2827', '#405853', '#6fcabf', '#e9934c', '#e5ddd0'], faint: '#5d6d69' },
  overprint: { stops: ['#241b45', '#4a4f7a', '#5ec8e5', '#ff48b0', '#ffe800'], faint: '#5e6390' },
  ironbow: { stops: ['#282136', '#584b6f', '#b093e5', '#e45cbe', '#fe8c2c', '#f9d544', '#faf5e6'], faint: '#6d6382' },
  tidepool: { stops: ['#0e2a3a', '#48708c', '#7bc0ae', '#6cc0e5', '#d2bdff', '#c5d8e6'], faint: '#48708c' },
  water: { stops: ['#0e2a3a', '#5a5870', '#009a8b', '#3bb8d8', '#00a2ce', '#e7e7ee'], faint: '#6e6c82' },
  crimson: { stops: ['#301a34', '#664468', '#ab7bf0', '#f43a6b', '#ffb3c8', '#f6eaf1'], faint: '#7a6679' },
  tangerine: { stops: ['#0e2a3a', '#5a5870', '#3bb8d8', '#00a2ce', '#ff9248', '#ecd06f'], faint: '#6e6c82' },
  prism: { stops: ['#0e2a3a', '#565656', '#43b581', '#4d96ff', '#8c6ff0', '#ffffff'], faint: '#6c6c6c' },
}

export const PALETTE_NAMES = Object.keys(PALETTES) as PaletteName[]

export function isPaletteName(s: string): s is PaletteName {
  return s in PALETTES
}
