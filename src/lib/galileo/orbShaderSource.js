/**
 * orbShaderSource — the GLSL that draws Galileo.
 *
 * VISUAL LANGUAGE (reference-locked): a near-black smoked-glass sphere whose
 * silhouette is made of light, with 2–4 flowing luminous membranes that wrap the
 * circumference, pass slightly behind it, and occasionally sweep across the face.
 * No grid, no nodes, no network, no centre symbol. The centre stays dark.
 *
 * HOW IT MOVES (this is where "alive" comes from — never from rotating the ball):
 *
 *   · the membranes are deformed by a NON-PERIODIC 3D noise field sampled on three
 *     DIFFERENT clocks (`uFlow` the travel, `uField` a slower independent
 *     deformation, `uFlow2` a second membrane family), so they bend, drift,
 *     stretch, thin out and re-form instead of turning;
 *   · one membrane wanders vertically on its own clock (`uMigr`);
 *   · the perimeter carries TWO narrow highlights travelling on separate clocks
 *     in opposite directions, each warped by a slow angular modulation so their
 *     speed is non-uniform — they bunch, stretch, taper to nothing and re-form
 *     elsewhere;
 *   · a noise gate lets whole regions of the limb brighten and recede;
 *   · the whole field breathes (`uBreath`) — a little brighter and a little more
 *     concentrated, ~1.5% larger, every 5–7s.
 *
 * The single discovery event is drawn as one sentence: the membranes converge
 * (`uConv`), the planes align (`uOrg`), one region brightens (`uFocus`), one wave
 * travels the circumference (`uWave`), and one thin ring leaves the limb and
 * fades (`uPulse`).
 *
 * Every pixel is computed per device pixel (the backing store is CSS size × DPR)
 * and the limb width is expressed in device pixels (`uRatio`), so the edge stays
 * crisp at any size and while moving. Only the outermost atmosphere is soft. A
 * 1/255 dither removes gradient banding.
 *
 * Uniforms are presentation parameters only: sizes, eased motion values and event
 * clocks. Nothing about a business can be expressed through them.
 */

export const ORB_VERTEX = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

export const ORB_FRAGMENT = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2 uRes;
uniform float uRadius;
uniform float uRatio;
uniform float uFlow;
uniform float uFlow2;
uniform float uField;
uniform float uMigr;
uniform float uEdge;
uniform float uTime;
uniform float uFold;
uniform float uMicro;
uniform float uSweep;
uniform float uInward;
uniform float uTravel;
uniform float uBright;
uniform float uCount;
uniform float uCoh;
uniform float uConv;
uniform float uOrg;
uniform float uFocus;
uniform float uWave;
uniform float uPulse;
uniform float uReveal;
uniform float uStrand;
uniform float uBreath;
uniform float uStruct;
uniform float uDetail;
uniform float uMinW;
uniform float uInt;
uniform float uIntF;
uniform float uInner;

const float PI = 3.14159265;
const float TAU = 6.2831853;
// The dark core — the graphite sphere at Galileo's centre. The interior draws
// behind and in front of it, never through it.
const float CORE_R = 0.62;

float hash3(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.11, 0.17, 0.13));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float vnoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash3(i), hash3(i + vec3(1.0, 0.0, 0.0)), f.x),
        mix(hash3(i + vec3(0.0, 1.0, 0.0)), hash3(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(hash3(i + vec3(0.0, 0.0, 1.0)), hash3(i + vec3(1.0, 0.0, 1.0)), f.x),
        mix(hash3(i + vec3(0.0, 1.0, 1.0)), hash3(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z);
}

// The plane each membrane lies in. Near the view axis = hugging the limb;
// tilted away = crossing the face. Convergence draws every plane together;
// organisation aligns them for a moment and then releases them again.
vec3 ribbonNormal(float fi) {
  float seed = fi * 2.399 + 0.7;
  float sgn = mod(fi, 2.0) < 0.5 ? 1.0 : -1.0;

  // Each FAMILY travels on its own clock — the first on uFlow, the second on
  // uFlow2 — and then reorients on the slower field clock, so the membranes
  // neither sweep around together nor swing back and forth together.
  float travelClock = mix(uFlow, uFlow2, step(0.5, mod(fi, 2.0)));
  float phi = seed * 2.1 + travelClock * sgn * (0.55 + 0.21 * fi)
    + (vnoise(vec3(fi * 5.1, uFlow * 0.11, 1.7)) - 0.5) * 1.4
    + (vnoise(vec3(fi * 2.7, uField * 0.34, 9.1)) - 0.5) * 0.95;
  float tilt = 0.32 + fi * 0.31 + (vnoise(vec3(fi * 3.3, uFlow * 0.09, 5.3)) - 0.5) * 0.35
    + (vnoise(vec3(fi * 1.9, uField * 0.24, 3.7)) - 0.5) * 0.3;
  tilt += uInward * 0.32;
  if (fi > 1.5 && fi < 2.5) {
    tilt += uSweep * smoothstep(0.4, 0.9, vnoise(vec3(7.0, uFlow * 0.23, 2.0))) * 0.9;
  }
  float target = 2.35 + fi * 0.14;
  float d = mod(phi - target + PI, TAU) - PI;
  phi = target + d * (1.0 - uConv);
  phi = mix(phi, target, uOrg * 0.45);
  tilt = mix(tilt, 0.44 + fi * 0.05, uConv);
  tilt = mix(tilt, 0.42 + fi * 0.06, uOrg * 0.5);
  return vec3(sin(tilt) * cos(phi), sin(tilt) * sin(phi), cos(tilt));
}

// One luminous membrane sampled at a point on the sphere.
float ribbonAt(vec3 P, vec3 n, float fi, float microFade) {
  float seed = fi * 2.399 + 0.7;

  // Three deformation octaves, on two unrelated clocks. The first two ride the
  // membrane's own travel; the third keeps bending and relaxing on the slow field
  // clock, so the ribbon is always still changing shape after the rest has moved.
  float clock = mix(uFlow, uFlow2, step(0.5, mod(fi, 2.0)));
  vec3 q = P * 1.55 + vec3(seed, clock * 0.6, -clock * 0.21 + uField * 0.7);
  float def = (vnoise(q) - 0.5) * uFold + (vnoise(q * 2.3 + 3.1) - 0.5) * uFold * 0.4;
  def += (vnoise(vec3(P.xy * 1.1 + fi * 2.0, uField * 1.5)) - 0.5) * uFold * 0.55;
  // A FOURTH OCTAVE on the perimeter's own clock — a rate nothing else in the
  // field shares. The ribbon therefore keeps reshaping on a rhythm of its own
  // while it travels: its curvature is never a frozen shape being carried round
  // the sphere, and no two membranes deform together.
  def += (vnoise(vec3(P.xy * 2.7 + seed * 1.7, uEdge * 1.1 + fi * 3.3)) - 0.5) * uFold * 0.6;

  float offset = (fract(seed * 0.618) - 0.5) * 0.2 * (1.0 - uConv);
  float s = dot(P, n) - offset + def;

  // ONE MEMBRANE MIGRATES VERTICALLY, on its own clock. The weight is hashed per
  // membrane (the membrane seeds differ by a fixed step, so a linear function of
  // them would give every membrane almost the same offset and slide the whole
  // field together). The field therefore never drifts as a whole.
  float migrW = hash3(vec3(fi * 7.13 + 0.5, 1.7, 3.1)) - 0.5;
  s += uMigr * migrW * 1.1 * (1.0 - uConv);

  vec3 a = normalize(cross(n, vec3(0.31, 0.95, 0.0)));
  vec3 b = cross(n, a);
  vec2 ab = vec2(dot(P, a), dot(P, b));
  vec2 u = ab / (length(ab) + 0.0001);
  float m = vnoise(vec3(u * 1.25 + seed, clock * 0.27 + seed));
  float mask = smoothstep(0.3, 0.72, m);
  float w = (0.026 + 0.07 * smoothstep(0.3, 0.92, m)) * (0.8 + 0.4 * fract(seed * 1.3));
  // SMALL SIZES SIMPLIFY, THEY DO NOT FAINT. No luminous feature is ever allowed
  // to fall below a pixel — a sub-pixel filament is not a quiet ribbon, it is a
  // rumour of one. uMinW is 0 at the arrival's scale: an exact no-op there.
  w = max(w, uMinW / uRadius);

  float f = s / w;
  float core = exp(-f * f);
  float veil = exp(-f * f * 0.07) * 0.26;
  float lip = 0.72 + 0.48 * (f / (1.0 + abs(f)));
  float strands = 0.5 + 0.5 * sin(s * uStrand + def * 23.0 + seed * 11.0);
  float micro = 1.0 + uMicro * microFade * (strands * strands * 0.95 - 0.32);
  float body = (core * lip * micro + veil) * mask;

  // NEW STRUCTURE — finer ribbons appear gradually while Galileo is learning.
  // Continuous, thin and restrained: structure, not particles.
  float fine = 0.0;
  if (uStruct > 0.02) {
    float g = s / (w * 0.34);
    fine = exp(-g * g) * mask * uStruct * 0.42 * uDetail;
  }
  return body + fine;
}

// ── THE INTERIOR: INTELLIGENCE MOVING INSIDE HIM ──────────────────────────
// The shell above is Galileo's SURFACE. What follows is the volume INSIDE it: a
// few thin, faint, translucent currents crossing the sphere — through the centre,
// in front of and behind one another, occasionally intersecting.
//
// EVERY CURRENT IS GENUINELY 3D. It is the line where two drifting planes meet,
// so its distance from this pixel's VIEW RAY — and the depth at which the two come
// closest — are solved analytically, never sampled. That is where the depth comes
// from: a current in front of the dark core is crisp and brighter, one on the far
// side is wider, dimmer and partially EATEN BY THE CORE, so currents visibly
// travel behind the core and emerge on the other side of it.
//
// NEGATIVE SPACE IS PRESERVED BY CONSTRUCTION. A current is thin, masked along its
// own length so segments arrive and leave, and the interior fades out well before
// the limb. Nothing fills the centre: at one moment it can be almost empty, then a
// current crosses it and is gone again. It is a whisper of light over graphite, at
// a small fraction of the shell's luminance — never a glowing ball.
float interiorField(vec2 p, float r, float z, float guard) {
  // An answer relaxes the interior and lets it drift outward again.
  float waveOut = uWave > 0.0 ? min(1.0, uWave / 1.1) : 0.0;
  // How many currents this state can justify — never a constant. An idle Galileo
  // carries one or two; an analyzing one is richer and more interconnected.
  float icnt = mix(1.6, 3.0, smoothstep(0.22, 0.52, uInner));
  icnt = min(icnt, mix(1.8, 3.0, uDetail));
  float coreExit = sqrt(max(0.0, CORE_R * CORE_R - r * r));
  float acc = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float wgt = clamp(icnt - fi, 0.0, 1.0);
    if (wgt <= 0.0) continue;
    float seed = fi * 2.77 + 1.3;
    float sgn = mod(fi, 2.0) < 0.5 ? 1.0 : -1.0;
    // Each current drifts on a hashed fraction of the interior clocks, so no two
    // structures inside Galileo ever move as one object.
    float uIn = uInt * (0.86 + 0.28 * fract(seed * 0.71));
    float fIn = uIntF * (0.84 + 0.32 * fract(seed * 1.31));
    float ax = 0.62 + fi * 0.29 + (vnoise(vec3(fi * 3.9, uIn * 0.12, 2.7)) - 0.5) * 0.95;
    float ay = seed + sgn * (0.42 + 0.13 * fi) * uIn * 0.55
      + (vnoise(vec3(fi * 2.3, fIn * 0.17, 6.9)) - 0.5) * 1.15;
    vec3 dir = vec3(sin(ax) * cos(ay), sin(ax) * sin(ay), cos(ax));
    vec3 up = abs(dir.y) < 0.86 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    vec3 n1 = normalize(cross(dir, up));
    vec3 n2 = cross(dir, n1);
    // Where the current rides through the volume. Discovery (uConv) draws it
    // through the centre; an answer (uWave) lets it disperse outward again.
    float spread = (1.0 - 0.72 * uConv) * (1.0 + 0.8 * waveOut);
    float o1 = (vnoise(vec3(fi * 5.1, uIn * 0.13, 3.9)) - 0.5) * 1.15 * spread;
    float o2 = (vnoise(vec3(fi * 4.3, fIn * 0.11, 8.3)) - 0.5) * 1.15 * spread;
    // Closest approach between this pixel's view ray and the current.
    float A1 = n1.x * p.x + n1.y * p.y - o1;
    float A2 = n2.x * p.x + n2.y * p.y - o2;
    float den = n1.z * n1.z + n2.z * n2.z;
    float tc = clamp(-((A1 * n1.z + A2 * n2.z) / max(den, 0.02)), -z, z);
    float d1 = A1 + n1.z * tc;
    float d2 = A2 + n2.z * tc;
    float dist = sqrt(d1 * d1 + d2 * d2);
    // DEPTH: softer and wider behind the centre, crisp and brighter in front.
    float soft = 1.0 + 1.1 * max(-tc, 0.0);
    float w = (0.020 + 0.014 * fract(seed * 1.7)) * soft;
    w = max(w, uMinW / uRadius);
    float f = dist / w;
    float cur = exp(-f * f) + exp(-f * f * 0.06) * 0.22;
    // OCCLUSION: whatever lies on the far side of the graphite core is hidden.
    float behind = step(r, CORE_R) * smoothstep(coreExit + 0.06, coreExit - 0.06, tc);
    // The current's own light varies along its length — it arrives, crosses and
    // leaves — and its depth decides how much of it we see. Nothing is filled in.
    vec3 Q = vec3(p, tc) - d1 * n1 - d2 * n2;
    float along = smoothstep(0.30, 0.80, vnoise(Q * 2.1 + vec3(seed * 3.1, seed * 1.7 + uIntF * 0.21, seed)));
    float depthGain = mix(0.5, 1.3, smoothstep(-z, z, tc));
    acc += wgt * cur * (1.0 - 0.94 * behind) * along * depthGain * (0.85 + 0.3 * fract(seed * 0.53));
  }
  return acc * guard * 0.42;
}

void main() {
  vec2 p = (gl_FragCoord.xy - uRes * 0.5) / uRadius;
  float r = length(p);
  if (r > 1.25) { gl_FragColor = vec4(0.0); return; }

  vec2 dir = p / max(r, 0.0001);
  float px = 1.0 / uRadius;
  float z = sqrt(max(0.0, 1.0 - r * r));
  float ang = atan(p.y, p.x);

  // Emergence: one arc of the limb first, then a second region, then the body.
  float da0 = abs(mod(ang - 2.2 + PI, TAU) - PI);
  float open = (1.0 - smoothstep(uReveal * 3.5, uReveal * 3.5 + 0.7, da0)) * smoothstep(0.0, 0.12, uReveal);
  float ribbonReveal = smoothstep(0.25, 0.8, uReveal);
  float bodyReveal = smoothstep(0.4, 1.0, uReveal);

  // How many membranes THIS SIZE can resolve. uDetail is 1 at the arrival's
  // scale, where the cap equals the loop's own bound and nothing changes; a small
  // Galileo shows one or two ribbons instead of three or four cramped together.
  float cnt = min(uCount, mix(2.0, 4.0, uDetail)) - (1.0 - uCoh) * 0.5;
  vec3 Pf = vec3(p, z);
  vec3 Pb = vec3(p, -z);
  vec3 Pl = vec3(dir, 0.0);
  float microFade = smoothstep(0.15, 0.5, z);
  float front = 0.0;
  float back = 0.0;
  float limb = 0.0;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float wgt = clamp(cnt - fi, 0.0, 1.0);
    if (wgt <= 0.0) continue;
    wgt *= mix(0.4 + 0.9 * fract(fi * 7.31 + 0.37), 1.0, uCoh);
    vec3 n = ribbonNormal(fi);
    if (r < 1.0) {
      front += wgt * ribbonAt(Pf, n, fi, microFade);
      back += wgt * ribbonAt(Pb, n, fi, microFade * 0.5);
    }
    if (r > 0.9) limb += wgt * ribbonAt(Pl, n, fi, 0.0);
  }

  // Light gathers where the membrane is seen edge-on; the face stays dark.
  float limbGain = 0.34 + 0.66 * (0.24 / (0.24 + z));
  float centerDim = mix(0.14, 1.0, smoothstep(0.93, 0.38, z));
  centerDim = mix(centerDim, 1.0, uSweep * 0.55);
  // The MOVING energy is ~15% more luminous than before; the smoked-glass body
  // below is untouched, which is what keeps the interior dark graphite and the
  // travelling light readable against it.
  float F = front * limbGain * centerDim * uBright * ribbonReveal * 1.95;
  float B = back * (0.5 + 0.5 * (1.0 - z)) * uBright * ribbonReveal * 1.3;
  float Lm = limb * uBright * ribbonReveal * 1.12;

  // ── THE PERIMETER: LIQUID LIGHT, NOT A ROTATING SHELL ────────────────────
  // Two narrow highlights on separate clocks, travelling in opposite directions,
  // each warped by a slow angular modulation so their speed is non-uniform: they
  // bunch, stretch, taper away and re-form elsewhere. Independent noise gates let
  // whole regions of the limb brighten and recede.
  float warp = 0.26 * sin(ang * 3.0 + uEdge * 1.6) + 0.15 * sin(ang * 5.0 - uField * 2.1);
  float bandA = pow(0.5 + 0.5 * sin(ang * 2.0 - uFlow * 6.0 + 1.3), 14.0);
  float bandB = pow(0.5 + 0.5 * sin(ang * 3.0 + uEdge * 3.2 + warp), 10.0);
  float gateA = 0.25 + 0.95 * smoothstep(0.2, 0.86, vnoise(vec3(dir * 2.1, uFlow * 0.17)));
  float gateB = 0.2 + 1.0 * smoothstep(0.28, 0.9, vnoise(vec3(dir * 3.3 + 7.0, uEdge * 0.19)));
  float trav = (bandA * gateA + bandB * gateB * 0.85) * uTravel;

  float rimMod = smoothstep(0.3, 0.85, vnoise(vec3(dir * 1.6 + 2.0, uFlow * 0.2)));
  float wave = 0.0;
  if (uWave >= 0.0 && uWave < 2.6) {
    float wa = 2.35 + uWave * 2.4;
    float dw = abs(mod(ang - wa + PI, TAU) - PI);
    wave = exp(-dw * dw / 0.07) * smoothstep(0.0, 0.3, uWave) * smoothstep(2.6, 1.5, uWave);
  }
  // One region of the limb becomes brighter, once, during a discovery.
  float fa = abs(mod(ang - 2.35 + PI, TAU) - PI);
  float focus = uFocus * exp(-fa * fa / 0.42);

  // Breathing: as Galileo swells it concentrates its edge light rather than
  // simply getting brighter (uBreath −0.5 … +0.5 around its resting value).
  float breathUp = (uBreath - 0.5) * 2.0;
  float rimL = (0.05 + 0.32 * rimMod * rimMod + 1.45 * Lm + trav * 1.15 + wave * 1.7 + focus * 0.85) * open;
  rimL *= 1.0 + 0.14 * breathUp;

  float d = (r - 1.0) * uRadius;
  float lw = 0.7 * uRatio * (1.0 - 0.16 * breathUp);
  float rimLine = exp(-d * d / (lw * lw));
  float innerLift = exp(-max(-d, 0.0) / (3.0 * uRatio)) * step(d, 0.0) * 0.16;
  float outerLift = exp(-max(d, 0.0) / (2.4 * uRatio)) * step(0.0, d) * 0.3;
  float rim = rimL * (rimLine + innerLift + outerLift);

  // Smoked-glass body.
  float bodyA = clamp((1.0 - r) * uRadius + 0.5, 0.0, 1.0) * bodyReveal;
  vec3 body = vec3(0.02, 0.022, 0.03);
  body += vec3(0.045, 0.043, 0.046) * pow(1.0 - z, 2.4);
  vec2 hl = p - vec2(-0.34, 0.38);
  body += vec3(0.022, 0.022, 0.027) * exp(-dot(hl, hl) * 3.2);

  vec3 champ = vec3(0.94, 0.8, 0.55);
  vec3 gold = vec3(0.84, 0.66, 0.4);
  vec3 ivory = vec3(1.0, 0.97, 0.91);

  // ── THE INTERIOR ─────────────────────────────────────────────────────────
  // Faint translucent champagne moving through the volume, added to the frame
  // only inside the sphere and only well before the limb, so it can never touch
  // the silhouette, the crisp edge or the outer atmosphere.
  float IV = 0.0;
  if (r < 1.0 && uInner > 0.02) {
    float guard = (1.0 - smoothstep(0.70, 0.94, r)) * smoothstep(0.45, 1.0, uReveal);
    if (guard > 0.001) IV = interiorField(p, r, z, guard) * uInner;
  }
  // Discovery: one brighter current through the centre, toward the region that is
  // about to light up — then the existing pulse ring completes the sentence.
  float inFocus = uFocus * exp(-fa * fa / 0.5) * exp(-r * r / 0.30);

  vec3 col = body * bodyA;
  col += F * mix(gold, champ, clamp(F, 0.0, 1.0)) + ivory * max(F - 0.7, 0.0) * 0.8;
  col += B * gold * 0.3;
  col += rim * mix(champ, ivory, clamp(rimL - 0.45, 0.0, 1.0));
  col += IV * 0.9 * mix(gold, champ, 0.72);
  col += (IV * 0.5 + inFocus * uInner * 0.5) * ivory * 0.55;

  // The one discovery illumination: a thin ring that leaves and fades.
  if (uPulse >= 0.0 && uPulse < 3.2) {
    float pr = 1.0 + uPulse * 0.13;
    float pd = (r - pr) * uRadius;
    float pw = 2.2 * uRatio;
    float penv = smoothstep(0.0, 0.18, uPulse) * exp(-uPulse * 1.7) * smoothstep(1.26, 1.16, pr);
    col += champ * penv * exp(-pd * pd / (pw * pw)) * 0.62;
    col += champ * penv * 0.028 * bodyA;
  }

  // Restrained atmosphere with a whisper of blue-black; zero before the edge.
  if (r > 1.0) {
    float atm = 0.05 * exp(-(r - 1.0) * 7.0) * smoothstep(1.24, 1.02, r) * bodyReveal;
    col += mix(vec3(0.3, 0.34, 0.45), champ, 0.55) * atm;
  }

  col = vec3(1.0) - exp(-col * 1.3);
  col += (hash3(vec3(gl_FragCoord.xy, uTime)) - 0.5) / 255.0;
  col = max(col, vec3(0.0));
  float a = max(bodyA, clamp(max(col.r, max(col.g, col.b)) * 1.1, 0.0, 1.0));
  gl_FragColor = vec4(min(col, vec3(a)), a);
}
`;