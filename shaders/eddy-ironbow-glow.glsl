// eddy: a slow curl-noise flow field behind the terminal, for Ghostty's
// custom-shader. Generated from the ironbow (glow-only) ramp by scripts/shaders.ts;
// edit scripts/shader-template.glsl, not this file.
//
// Only pixels that still show the terminal's background colour are tinted,
// so glyphs are left exactly as rendered. Alpha is passed through untouched.

// the palette ramp, dark to bright, sampled in OKLab (eddy's src/color.ts)
const vec3 RAMP[16] = vec3[16](
  vec3(0.1569, 0.1294, 0.2118),
  vec3(0.2078, 0.1725, 0.2745),
  vec3(0.2784, 0.2353, 0.3569),
  vec3(0.3373, 0.2863, 0.4235),
  vec3(0.4235, 0.3569, 0.5412),
  vec3(0.5529, 0.4667, 0.7137),
  vec3(0.6549, 0.5490, 0.8510),
  vec3(0.7569, 0.5255, 0.8549),
  vec3(0.8157, 0.4667, 0.8118),
  vec3(0.8706, 0.4000, 0.7686),
  vec3(0.9137, 0.4196, 0.6471),
  vec3(0.9451, 0.4745, 0.5176),
  vec3(0.9725, 0.5216, 0.3529),
  vec3(0.9961, 0.6078, 0.1922),
  vec3(0.9922, 0.6902, 0.2157),
  vec3(0.9882, 0.7686, 0.2431)
);

// glow colours: when there are any, each glowing dot draws one at random
// for that breath, so neighbours glow in different hues (prism). Empty for
// a palette whose glows stay in its own ramp.
const int SPARK_COUNT = 0;
const vec3 SPARKS[1] = vec3[1](
  vec3(0.0000, 0.0000, 0.0000)
);

const float ALPHA = 0.3;   // opacity of a lit dot over the background
const float SPEED = 0.06;   // field drift, in field units per second
const float SCALE = 2.2;   // eddies per screen height, roughly
const float PITCH = 170.0;   // dot rows per screen height: the lattice the dots sit on
const float DOT   = 0.19;        // dot radius as a fraction of the pitch
const float SPARSE = 0.55; // 0..1, how much of each filament is left unlit
const float REST  = 0.0;   // brightness of a resting dot, 0 hides the lattice and leaves only the glows
const float SHARE = 0.8;  // 0..1, the share of dots that ever glow
const int   STEPS = 6;           // advection steps behind each dot

// iq's 2D gradient noise with analytic derivatives: x is the value, yz the gradient
vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

vec3 noised(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  vec2 du = 30.0 * f * f * (f * (f - 2.0) + 1.0);
  vec2 ga = hash2(i + vec2(0.0, 0.0));
  vec2 gb = hash2(i + vec2(1.0, 0.0));
  vec2 gc = hash2(i + vec2(0.0, 1.0));
  vec2 gd = hash2(i + vec2(1.0, 1.0));
  float va = dot(ga, f - vec2(0.0, 0.0));
  float vb = dot(gb, f - vec2(1.0, 0.0));
  float vc = dot(gc, f - vec2(0.0, 1.0));
  float vd = dot(gd, f - vec2(1.0, 1.0));
  float v = va + u.x * (vb - va) + u.y * (vc - va) + u.x * u.y * (va - vb - vc + vd);
  vec2 g = ga + u.x * (gb - ga) + u.y * (gc - ga) + u.x * u.y * (ga - gb - gc + gd)
    + du * (u.yx * (va - vb - vc + vd) + vec2(vb, vc) - va);
  return vec3(v, g);
}

// the curl of a two-octave potential: divergence-free, so the dye swirls
// in eddies and never gathers into sinks
vec2 curl(vec2 p, float t) {
  vec3 a = noised(p + vec2(t * 0.7, t * 0.3));
  vec3 b = noised(p * 2.3 + vec2(-t * 0.5, t * 0.9) + 11.0);
  vec2 g = a.yz + 0.5 * 2.3 * b.yz;
  return vec2(g.y, -g.x);
}

// what the flow carries: a field of small blobs; its zero crossings
// become the filaments the dots trace
float dye(vec2 p, float t) {
  return noised(p * 4.5 + vec2(t * 0.2, -t * 0.15) + 5.0).x;
}

vec3 ramp(float x) {
  float s = clamp(x, 0.0, 1.0) * 15.0;
  int i = int(floor(s));
  int j = min(i + 1, 15);
  return mix(RAMP[i], RAMP[j], fract(s));
}

// sRGB transfer, both ways. Ghostty hands the shader its texture in the
// configured blending space: sRGB under `alpha-blending = native`, linear
// under `linear` and `linear-corrected`. iBackgroundColor is always plain
// sRGB, so the space is detected per pixel below rather than assumed.
vec3 toLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}
vec3 toSrgb(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  vec4 term = texture(iChannel0, uv);
  vec3 bg = iBackgroundColor;
  vec3 bgLin = toLinear(bg);

  // which space is the texture in? the plain background matches one of them
  // (premultiplied by background-opacity or not); glyphs match neither and
  // are passed through either way
  float dS = min(distance(term.rgb, bg), distance(term.rgb, bg * term.a));
  float dL = min(distance(term.rgb, bgLin), distance(term.rgb, bgLin * term.a));
  bool linearTex = dL < dS;

  // compare in sRGB so the glyph tolerance means the same in both modes
  vec3 rgbS = linearTex ? toSrgb(term.rgb) : term.rgb;
  float d = min(distance(rgbS, bg), distance(rgbS, bg * term.a));
  float isBg = 1.0 - smoothstep(0.01, 0.04, d);
  if (isBg <= 0.0) { fragColor = term; return; }

  // dots on a lattice, as the braille version draws them: the field is
  // sampled once per lattice point, and the pixel lights only inside a
  // small disc around it
  float pitch = max(3.0, iResolution.y / PITCH);
  vec2 cell = floor(fragCoord / pitch);
  vec2 centre = (cell + 0.5) * pitch;
  float r = length(fragCoord - centre) / pitch;
  float disc = 1.0 - smoothstep(DOT - 0.05, DOT + 0.05, r);
  if (disc <= 0.0) { fragColor = term; return; }

  vec2 p = (centre - 0.5 * iResolution.xy) / iResolution.y * SCALE;
  float t = iTime * SPEED;

  // walk back along the flow from the dot and gather dye
  float acc = 0.0, w = 0.0;
  vec2 q = p;
  for (int i = 0; i < STEPS; i++) {
    float wi = 1.0 - float(i) / float(STEPS);
    acc += dye(q, t) * wi;
    w += wi;
    q -= curl(q, t) * 0.04;
  }
  float v = acc / w;

  // a dot lights where the dye crosses zero; a stable per-dot draw thins
  // the filaments into broken dotted lines rather than solid ones
  float ridge = smoothstep(0.55, 1.0, 1.0 - abs(v) * 5.0);
  float draw = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
  float draw2 = fract(sin(dot(cell, vec2(39.3468, 11.135))) * 24634.6345);
  float lit = ridge * smoothstep(SPARSE - 0.15, SPARSE + 0.15, draw + ridge * 0.25);

  // life: every dot breathes slowly on its own phase, and for a moment at
  // the top of each breath a few of them glow
  float phase = iTime * (0.4 + 0.6 * draw2) + draw * 6.2831;
  float breath = 0.5 + 0.5 * sin(phase);
  float glow = smoothstep(0.9, 1.0, breath) * step(1.0 - SHARE, draw2);
  float level = REST * (0.5 + 0.5 * breath);
  float intensity = lit * disc * (level + 1.2 * glow);

  // muted: the ramp's lower middle; a glowing dot climbs a little higher
  vec3 col = ramp(0.25 + 0.25 * ridge + 0.3 * glow);
  if (SPARK_COUNT > 0) {
    // a fresh colour each breath: hash the dot with its breath count
    float cycle = floor((phase + 1.5708) / 6.2831);
    float pick = fract(sin(dot(vec3(cell, cycle), vec3(7.13, 157.31, 113.5))) * 53758.5453);
    vec3 spark = SPARKS[int(pick * float(SPARK_COUNT)) % SPARK_COUNT];
    col = mix(ramp(0.2 + 0.2 * ridge), spark, glow);
  }
  vec3 outS = mix(rgbS, col, clamp(isBg * ALPHA * intensity, 0.0, 1.0));
  fragColor = vec4(linearTex ? toLinear(outS) : outS, term.a);
}
