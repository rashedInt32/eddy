// A browser stand-in for Ghostty: draws a fake terminal (night-owl ground,
// some text) into a texture, runs a baked shader over it with the Shadertoy
// uniforms Ghostty provides, and reports how many glyph pixels changed.
//   bun scripts/preview.ts            then open http://localhost:8765/?p=lagoon
import { bake, LOOKS, type Look } from './shaders'
import { PALETTE_NAMES, isPaletteName } from '../src/palettes'

const PORT = 8765

const page = (name: string, glsl: string, linear: boolean) => `<!doctype html>
<meta charset="utf-8"><title>eddy preview: ${name}${linear ? ' (linear texture)' : ''}</title>
<style>html,body{margin:0;background:#000;height:100%}canvas{display:block;width:100vw;height:100vh}#r{position:fixed;left:8px;bottom:8px;color:#fff;font:12px monospace;background:#0008;padding:4px 8px}</style>
<canvas id="c"></canvas><canvas id="c2" style="display:none;position:fixed;inset:0"></canvas><div id="r">…</div>
<script id="frag" type="x-shader">${glsl.replace(/<\/script/g, '<\\/script')}</script>
<script>
const BG = [0x01/255, 0x16/255, 0x27/255]
const LINEAR = ${linear ? 'true' : 'false'}
const toSrgb = v => { v /= 255; return 255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1/2.4) - 0.055) }
const W = 1280, H = 720
const c = document.getElementById('c'); c.width = W; c.height = H
const gl = c.getContext('webgl2', { preserveDrawingBuffer: true })
// fake terminal
const t = document.createElement('canvas'); t.width = W; t.height = H
const g = t.getContext('2d')
g.fillStyle = '#011627'; g.fillRect(0, 0, W, H)
g.font = '15px Menlo, monospace'
const lines = [
  ['#d6deeb', '  ◆ you'], ['#d6deeb', '  fix the caption so it sits one column further right'], ['', ''],
  ['#40e5e5', '  ● Claude'], ['#d6deeb', '  The caption column was zero-indexed; the cursor move is one-indexed.'],
  ['#9cce8b', '  src/term.ts:37  const col = cols - caption.text.length + 1'], ['', ''],
  ['#7e989c', '  Bash  bun test'], ['#d6deeb', '  7 pass  0 fail'], ['', ''],
  ['#d6deeb', '  > '],
]
lines.forEach(([col, s], i) => { if (!s) return; g.fillStyle = col; g.fillText(s, 20, 40 + i * 22) })
const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex)
gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
gl.texImage2D(gl.TEXTURE_2D, 0, LINEAR ? gl.SRGB8_ALPHA8 : gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, t)
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
const vs = '#version 300 es\\nvoid main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.0-1.0,0,1);}'
const fs = '#version 300 es\\nprecision highp float;uniform sampler2D iChannel0;uniform vec3 iResolution;uniform float iTime;uniform vec3 iBackgroundColor;uniform int iFocus;out vec4 outColor;\\n'
  + document.getElementById('frag').textContent + '\\nvoid main(){mainImage(outColor,gl_FragCoord.xy);}'
function sh(type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s }
const prog = gl.createProgram()
try { gl.attachShader(prog, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(prog) }
catch (e) { document.getElementById('r').textContent = 'COMPILE ERROR: ' + e.message; throw e }
gl.useProgram(prog)
gl.uniform3f(gl.getUniformLocation(prog, 'iResolution'), W, H, 1)
gl.uniform3f(gl.getUniformLocation(prog, 'iBackgroundColor'), ...BG)
gl.uniform1i(gl.getUniformLocation(prog, 'iFocus'), 1)
gl.uniform1i(gl.getUniformLocation(prog, 'iChannel0'), 0)
const uTime = gl.getUniformLocation(prog, 'iTime')
let fbo = null
if (LINEAR) {
  // Ghostty's linear mode: render to a float target so the readback keeps the
  // dark end of the linear range, then encode to sRGB for display and checks
  if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('no float colour buffers')
  const ft = gl.createTexture(); gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, ft)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, W, H, 0, gl.RGBA, gl.HALF_FLOAT, null)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
  fbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, ft, 0)
  gl.activeTexture(gl.TEXTURE0)
}
const src = g.getImageData(0, 0, W, H).data
let frame = 0
function draw(now) {
  gl.uniform1f(uTime, now / 1000 + 40)
  gl.drawArrays(gl.TRIANGLES, 0, 3)
  if (frame++ === 5) check()
  requestAnimationFrame(draw)
}
function check() {
  let out
  if (LINEAR) {
    const f = new Float32Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.FLOAT, f)
    out = new Uint8Array(W * H * 4)
    for (let i = 0; i < f.length; i += 4) { for (let k = 0; k < 3; k++) out[i + k] = Math.round(toSrgb(f[i + k] * 255)); out[i + 3] = 255 }
    // show the encoded result
    const c2 = document.getElementById('c2'); c2.width = W; c2.height = H
    const img = c2.getContext('2d').createImageData(W, H)
    for (let y = 0; y < H; y++) img.data.set(out.subarray(((H - 1 - y) * W) * 4, ((H - y) * W) * 4), y * W * 4)
    c2.getContext('2d').putImageData(img, 0, 0); c2.style.display = 'block'; c.style.display = 'none'
  } else {
    out = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, out)
  }
  let glyph = 0, glyphChanged = 0, bg = 0, bgTinted = 0, maxDelta = 0
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const si = (y * W + x) * 4, oi = ((H - 1 - y) * W + x) * 4
    const isBg = src[si] === 0x01 && src[si + 1] === 0x16 && src[si + 2] === 0x27
    const d = Math.max(Math.abs(src[si] - out[oi]), Math.abs(src[si + 1] - out[oi + 1]), Math.abs(src[si + 2] - out[oi + 2]))
    if (isBg) { bg++; if (d > 0) { bgTinted++; if (d > maxDelta) maxDelta = d } }
    else { glyph++; if (d > 1) glyphChanged++ }
  }
  const r = { palette: '${name}', linearTexture: LINEAR, glyphPixels: glyph, glyphChanged, bgPixels: bg, bgTinted, bgTintedPct: +(100 * bgTinted / bg).toFixed(1), maxBgDelta: maxDelta }
  window.__eddy = r
  document.getElementById('r').textContent = JSON.stringify(r)
}
requestAnimationFrame(draw)
</script>`

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url)
    const p = url.searchParams.get('p') ?? 'lagoon'
    if (!isPaletteName(p)) return new Response(`unknown palette; one of ${PALETTE_NAMES.join(', ')}`, { status: 400 })
    const look = (url.searchParams.get('look') ?? '') as Look
    if (!(look in LOOKS)) return new Response('look is one of: lattice (default) or glow', { status: 400 })
    return new Response(page(p, await bake(p, look), url.searchParams.get('linear') === '1'), { headers: { 'content-type': 'text/html; charset=utf-8' } })
  },
})
console.log(`eddy preview on http://localhost:${PORT}/?p=lagoon`)
