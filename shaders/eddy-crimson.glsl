// eddy: a slow curl-noise flow field behind the terminal, for Ghostty's
// custom-shader. Generated from the crimson ramp by scripts/shaders.ts;
// edit scripts/shader-template.glsl, not this file.
//
// Only pixels that still show the terminal's background colour are tinted,
// so glyphs are left exactly as rendered. Alpha is passed through untouched.

// the palette ramp, dark to bright, sampled in OKLab (eddy's src/color.ts)
const vec3 RAMP[16] = vec3[16](
  vec3(0.1882, 0.1020, 0.2039),
  vec3(0.2353, 0.1373, 0.2510),
  vec3(0.3020, 0.1922, 0.3137),
  vec3(0.3529, 0.2314, 0.3647),
  vec3(0.4078, 0.2745, 0.4235),
  vec3(0.4902, 0.3412, 0.5843),
  vec3(0.5569, 0.3922, 0.7137),
  vec3(0.6431, 0.4627, 0.8863),
  vec3(0.7176, 0.4627, 0.8706),
  vec3(0.7882, 0.4235, 0.7490),
  vec3(0.8784, 0.3490, 0.5843),
  vec3(0.9412, 0.2588, 0.4549),
  vec3(0.9725, 0.3373, 0.4824),
  vec3(0.9882, 0.4902, 0.5961),
  vec3(0.9961, 0.5922, 0.6824),
  vec3(1.0000, 0.6902, 0.7725)
);

const float ALPHA = 0.13;   // peak opacity of the field over the background
const float SPEED = 0.035;   // field drift, in field units per second
const float SCALE = 2.2;   // eddies per screen height, roughly
const int   STEPS = 8;           // advection steps behind each pixel

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
// become the filaments
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

  vec2 p = (fragCoord - 0.5 * iResolution.xy) / iResolution.y * SCALE;
  float t = iTime * SPEED;

  // walk back along the flow and gather dye: streaks that follow the current
  float acc = 0.0, w = 0.0;
  vec2 q = p;
  for (int i = 0; i < STEPS; i++) {
    float wi = 1.0 - float(i) / float(STEPS);
    acc += dye(q, t) * wi;
    w += wi;
    q -= curl(q, t) * 0.04;
  }
  float v = acc / w;

  // thin filaments where the dye crosses zero, over a very faint wash so
  // the ground is not dead flat between them
  float ridge = smoothstep(0.6, 1.0, 1.0 - abs(v) * 5.0);
  float wash = smoothstep(-0.3, 0.6, v) * 0.12;
  float intensity = clamp(ridge * 0.9 + wash, 0.0, 1.0);

  // blend in sRGB so ALPHA means the same thing on screen in both modes,
  // then hand the result back in the texture's own space
  vec3 col = ramp(intensity);
  vec3 outS = mix(rgbS, col, isBg * ALPHA * intensity);
  fragColor = vec4(linearTex ? toLinear(outS) : outS, term.a);
}
